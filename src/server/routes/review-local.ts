import { Router, Request, Response } from "express";
import { randomUUID } from "crypto";
import { getRepoMapping } from "../config/repo-mapping";
import { classify } from "../services/classifier";
import { getKnowledgeForReview, buildKnowledgePrompt, extractLearnings, trackKnowledgeHits, determineAdoptedKnowledge, suggestDispositions } from "../services/knowledge";
import { parseReviewResponse, mergeReports } from "../services/reviewer";
import { callLLM, getLLMConfig } from "../llm";
import { getReviewPrompt, getReviewUserPrompt } from "../llm/prompts/review";
import { getDimensionsForProject } from "../services/dimensions";
import { saveReviewRecord, computeReviewStats } from "../services/review-store";
import { saveLLMLog } from "../services/llm-logger";
import { buildLocalScanContext, buildRelatedFilesPrompt } from "../services/local-scan";
import { inferModuleFromPaths } from "../services/module-utils";
import type { LocalReviewRequest } from "../../shared/types";

const router = Router();

interface ProgressEvent {
  step: number;
  status: "running" | "done" | "error";
  label: string;
  detail?: string;
  progress?: number;
}

function sendSSE(res: Response, event: ProgressEvent) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

router.post("/local", async (req: Request, res: Response) => {
  const { project, sourceBranch, targetBranch }: LocalReviewRequest = req.body;

  if (!project || !sourceBranch || !targetBranch) {
    res.status(400).json({ error: "project, sourceBranch, targetBranch are required" });
    return;
  }

  const llmConfig = getLLMConfig();
  if (!llmConfig.apiKey) {
    res.status(500).json({ error: "LLM API key not configured" });
    return;
  }

  const mapping = getRepoMapping(project);
  if (!mapping) {
    res.status(404).json({ error: `No repo mapping for project: ${project}. Configure in Settings.` });
    return;
  }

  // Switch to SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  let step = 0;
  const nextStep = (label: string, detail?: string) => { step++; sendSSE(res, { step, status: "running", label, detail }); };
  const completeStep = (detail?: string) => { sendSSE(res, { step, status: "done", label: "", detail }); };

  try {
    // Step 1: Scan local repo
    nextStep("Scanning local repo", `${mapping.localPath}: ${targetBranch}..${sourceBranch}`);
    const context = await buildLocalScanContext(mapping.localPath, targetBranch, sourceBranch);
    completeStep(`${context.diffs.length} files changed, ${context.relatedFiles.length} related files`);

    // Filter excluded files (v1.3.5)
    const excludedFiles: string[] = req.body.excludedFiles || [];
    const diffs = excludedFiles.length > 0
      ? context.diffs.filter((d: { new_path: string }) => !excludedFiles.includes(d.new_path))
      : context.diffs;

    if (diffs.length === 0) {
      sendSSE(res, { step: step + 1, status: "done", label: "No changes", detail: "No diff found between branches" });
      res.end();
      return;
    }

    // Step 2: Classify
    nextStep("Classifying files");
    const { summary: classification, batchDiffs } = classify(diffs);
    const batchLevels = classification.batches.map((b) => b.level);
    completeStep();

    // Step 3: Load knowledge — infer module from diff file paths
    nextStep("Loading knowledge base");
    const inferredModule = inferModuleFromPaths(diffs.map((d: { new_path: string }) => d.new_path));
    const knowledge = getKnowledgeForReview(project, inferredModule, diffs.map((d: { new_path: string }) => d.new_path));
    completeStep(`${knowledge.length} entries loaded`);

    // Step 4: Review batches
    const reviewId = `R-${randomUUID().slice(0, 8)}`;
    const dimensions = getDimensionsForProject(project);
    const knowledgePrompt = knowledge.length > 0 ? buildKnowledgePrompt(knowledge) : "";
    const relatedPrompt = buildRelatedFilesPrompt(context);
    const userPromptPrefix = getReviewUserPrompt();

    const batchReports = [];
    const totalBatches = batchDiffs.length;

    if (totalBatches === 0) {
      sendSSE(res, { step: step + 1, status: "done", label: "No files to review", detail: "All files skipped" });
      res.end();
      return;
    }

    for (let i = 0; i < totalBatches; i++) {
      const level = batchLevels[i];
      nextStep(`Reviewing batch ${i + 1}/${totalBatches}`, `Level ${level}`);

      const diffText = batchDiffs[i]
        .map((d: { old_path: string; new_path: string; diff: string }) => `--- ${d.old_path}\n+++ ${d.new_path}\n${d.diff}`)
        .join("\n\n");

      const systemPrompt = getReviewPrompt({
        dimensions,
        batchIndex: i,
        totalBatches,
        riskLevel: level,
        requirement: "",
        knowledge: knowledgePrompt,
      });

      const userMessage = `${userPromptPrefix}${relatedPrompt}\n\n${diffText}`;
      const startTime = Date.now();
      const result = await callLLM(systemPrompt, userMessage, llmConfig);
      const durationMs = Date.now() - startTime;

      batchReports.push(parseReviewResponse(result.text));

      saveLLMLog({
        id: `LOG-${randomUUID().slice(0, 8)}`,
        review_id: reviewId,
        batch_index: i,
        risk_level: level,
        system_prompt: systemPrompt,
        user_message: userMessage,
        response_text: result.text,
        duration_ms: durationMs,
        input_tokens: result.usage?.inputTokens ?? null,
        output_tokens: result.usage?.outputTokens ?? null,
        provider: llmConfig.provider,
        model: llmConfig.model,
      });

      completeStep(`${batchDiffs[i].length} files reviewed`);
    }

    const report = mergeReports(batchReports, dimensions);
    const stats = computeReviewStats(report);

    // Save
    saveReviewRecord({
      id: reviewId,
      mr_url: `local://${project}/${sourceBranch}..${targetBranch}`,
      project,
      author: null,
      status: "completed",
      report_json: JSON.stringify(report),
      classification_json: JSON.stringify(classification),
      requirement_json: null,
      mr_meta_json: JSON.stringify({ sourceBranch, targetBranch, localPath: mapping.localPath, relatedFiles: context.relatedFiles.length }),
      reviewed_commit_sha: null,
      passed: report.passed,
      avg_score: stats.avgScore,
      issue_count: stats.issueCount,
      critical_count: stats.criticalCount,
      created_by: (req as Request & { user?: { id: string } }).user?.id || null,
      knowledge_dispositions_json: JSON.stringify(suggestDispositions(report.issues)),
    });

    // Extract learnings and track knowledge hits (knowledge loop)
    extractLearnings(report, project, reviewId);

    if (knowledge.length > 0) {
      const adoptedIds = determineAdoptedKnowledge(report.issues, knowledge);
      trackKnowledgeHits(knowledge.map((e) => e.id), reviewId, adoptedIds);
    }

    const response = { reviewId, report, classification, localScan: { relatedFiles: context.relatedFiles.length, totalTokens: context.totalTokens } };
    sendSSE(res, { step: step + 1, status: "done", label: "COMPLETE", detail: JSON.stringify(response) });
    res.end();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    sendSSE(res, { step, status: "error", label: message.length > 200 ? message.slice(0, 200) + "..." : message });
    res.end();
  }
});

export default router;
