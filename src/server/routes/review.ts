import { Router, Request, Response } from "express";
import { randomUUID } from "crypto";
import { parseMRUrl, fetchMRMeta, fetchMRDiffs } from "../services/gitlab";
import { classify } from "../services/classifier";
import { understandRequirement } from "../services/requirement";
import { getKnowledgeForReview, extractLearnings, suggestDispositions, trackKnowledgeHits, determineAdoptedKnowledge } from "../services/knowledge";
import { parseReviewResponse, mergeReports } from "../services/reviewer";
import { buildRequirementPrompt } from "../services/requirement";
import { buildKnowledgePrompt } from "../services/knowledge";
import { callLLM, getLLMConfig } from "../llm";
import { getReviewPrompt, getReviewUserPrompt } from "../llm/prompts/review";
import { getDimensionsForProject } from "../services/dimensions";
import { ReviewRequest, ReviewResponse } from "../../shared/types";
import { saveReviewRecord, computeReviewStats } from "../services/review-store";
import { saveLLMLog } from "../services/llm-logger";

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

// SSE-based review endpoint
router.post("/review", async (req: Request, res: Response) => {
  const { mrUrl, gitlabHost, gitlabToken, lanhuUrl }: ReviewRequest = req.body;

  // Validate before setting SSE headers so JSON error responses work correctly
  if (!mrUrl) {
    res.status(400).json({ error: "mrUrl is required" });
    return;
  }

  const llmConfig = getLLMConfig();
  if (!llmConfig.apiKey) {
    res.status(500).json({ error: "LLM API key not configured. Use Settings to configure." });
    return;
  }

  // All validations passed — switch to SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  let step = 0;

  const nextStep = (label: string, detail?: string) => {
    step++;
    sendSSE(res, { step, status: "running", label, detail });
  };

  const completeStep = (detail?: string) => {
    sendSSE(res, { step, status: "done", label: "", detail });
  };

  try {
    // Step 1: Parse URL & connect GitLab
    nextStep("Connecting GitLab", `Parsing MR URL...`);
    const parsed = parseMRUrl(mrUrl);
    const host = gitlabHost || parsed.host;
    const token = gitlabToken || process.env.GITLAB_TOKEN;

    if (!token) {
      sendSSE(res, { step, status: "error", label: "GitLab token required" });
      res.end();
      return;
    }
    completeStep();

    // Step 2: Fetch MR data
    nextStep("Fetching MR data", `${host}/${parsed.projectPath} !${parsed.iid}`);
    const [mr, diffs] = await Promise.all([
      fetchMRMeta(host, parsed.projectPath, parsed.iid, token),
      fetchMRDiffs(host, parsed.projectPath, parsed.iid, token),
    ]);
    completeStep(`${diffs.length} files changed`);

    const project = parsed.projectPath.split("/").pop() || parsed.projectPath;
    const dimensions = getDimensionsForProject(parsed.projectPath);

    // Step 3: Classify files
    nextStep("Classifying files", `Analyzing risk levels...`);
    const { summary: classification, batchDiffs } = classify(diffs);
    const batchLevels = classification.batches.map((b) => b.level);
    const levelCounts = Object.entries(classification.stats.byLevel)
      .filter(([, c]) => c > 0)
      .map(([l, c]) => `${l}(${c})`)
      .join(" ");
    completeStep(`S/A/B/C: ${levelCounts}, skipped: ${classification.stats.skipped}`);

    // Step 4: Understand requirement
    nextStep("Understanding requirement", `Analyzing MR context...`);
    const requirement = await understandRequirement(mr, diffs, lanhuUrl);
    completeStep(`${requirement.type} · ${requirement.module}`);

    // Step 5: Load knowledge
    nextStep("Loading knowledge base", `Searching for relevant entries...`);
    const knowledge = getKnowledgeForReview(project, requirement.module);
    completeStep(`${knowledge.length} entries loaded`);

    // Step 6+: Review batches
    const totalBatches = batchDiffs.length;
    const reviewId = `R-${randomUUID().slice(0, 8)}`;
    let report;
    let tokenUsage: { inputTokens: number; outputTokens: number } | undefined;
    let batchDetails: Array<{ files: number; tokens: { inputTokens: number; outputTokens: number } }> | undefined;

    if (totalBatches === 0) {
      sendSSE(res, { step: step + 1, status: "done", label: "No files to review", detail: "All files skipped" });
      report = {
        contractTitle: "Code Review",
        timestamp: new Date().toISOString(),
        passed: true,
        scores: [],
        issues: [],
        summary: "All files were classified as low-risk and skipped.",
      };
    } else {
      const reqPrompt = requirement ? buildRequirementPrompt(requirement) : "";
      const knowledgePrompt = knowledge.length > 0 ? buildKnowledgePrompt(knowledge) : "";
      const userPromptPrefix = getReviewUserPrompt();

      const batchReports = [];
      const _batchDetails: Array<{ files: number; tokens: { inputTokens: number; outputTokens: number } }> = [];
      let totalInput = 0;
      let totalOutput = 0;

      for (let i = 0; i < batchDiffs.length; i++) {
        const level = batchLevels[i];
        nextStep(
          `Reviewing batch ${i + 1}/${totalBatches}`,
          `Level ${level} · ${llmConfig.provider} · ${llmConfig.model}`
        );

        const diffText = batchDiffs[i]
          .map((d: { old_path: string; new_path: string; diff: string }) => `--- ${d.old_path}\n+++ ${d.new_path}\n${d.diff}`)
          .join("\n\n");

        const systemPrompt = getReviewPrompt({
          dimensions,
          batchIndex: i,
          totalBatches,
          riskLevel: level,
          requirement: reqPrompt,
          knowledge: knowledgePrompt,
        });

        const userMessage = `${userPromptPrefix}${diffText}`;
        const startTime = Date.now();
        const result = await callLLM(systemPrompt, userMessage, llmConfig);
        const durationMs = Date.now() - startTime;

        batchReports.push(parseReviewResponse(result.text));

        // Log LLM interaction
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

        if (result.usage) {
          totalInput += result.usage.inputTokens;
          totalOutput += result.usage.outputTokens;
          _batchDetails.push({ files: batchDiffs[i].length, tokens: result.usage });
        }

        const tokenDetail = result.usage
          ? `${batchDiffs[i].length} files reviewed (${result.usage.inputTokens}+${result.usage.outputTokens} tokens)`
          : `${batchDiffs[i].length} files reviewed`;

        sendSSE(res, {
          step,
          status: "done",
          label: "",
          detail: tokenDetail,
          progress: Math.round(((i + 1) / totalBatches) * 100),
        });
      }

      // Merge reports
      nextStep("Merging results", `${batchReports.length} batches`);
      report = mergeReports(batchReports, dimensions);
      completeStep();

      if (totalInput > 0) {
        tokenUsage = { inputTokens: totalInput, outputTokens: totalOutput };
        batchDetails = _batchDetails;
      }
    }

    // Save review record
    const stats = computeReviewStats(report);

    // Extract head_sha from MR meta if available
    const mrAny = mr as unknown as Record<string, unknown>;
    const headSha = mrAny.diff_refs
      ? (mrAny.diff_refs as Record<string, unknown>)?.head_sha as string | undefined
      : undefined;

    saveReviewRecord({
      id: reviewId,
      mr_url: mrUrl,
      project,
      author: mr.author?.name || null,
      status: "completed",
      report_json: JSON.stringify(report),
      classification_json: classification ? JSON.stringify(classification) : null,
      requirement_json: JSON.stringify({ type: requirement.type, module: requirement.module, features: requirement.features, conflicts: requirement.conflicts, source: requirement.source, lanhuSummary: requirement.lanhuSummary }),
      mr_meta_json: JSON.stringify(mr),
      reviewed_commit_sha: headSha || null,
      passed: report.passed,
      avg_score: stats.avgScore,
      issue_count: stats.issueCount,
      critical_count: stats.criticalCount,
      created_by: (req as Request & { user?: { id: string } }).user?.id || null,
      knowledge_dispositions_json: JSON.stringify(suggestDispositions(report.issues)),
    });
    extractLearnings(report, project, reviewId);

    // Track knowledge hits with adoption feedback
    if (knowledge.length > 0) {
      const adoptedIds = determineAdoptedKnowledge(report.issues, knowledge);
      trackKnowledgeHits(knowledge.map((e) => e.id), reviewId, adoptedIds);
    }

    // Send final result
    const response: ReviewResponse = {
      reviewId,
      mr,
      diffs,
      report,
      classification,
      requirement: {
        type: requirement.type,
        module: requirement.module,
        features: requirement.features,
        conflicts: requirement.conflicts,
        source: requirement.source,
        lanhuSummary: requirement.lanhuSummary,
      },
      ...(tokenUsage ? { tokenUsage, batchDetails } : {}),
    };

    sendSSE(res, { step: step + 1, status: "done", label: "COMPLETE", detail: JSON.stringify(response) });
    res.end();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Review failed";
    // Sanitize: avoid leaking internal details to client
    const safeMessage = message.includes("ENOTFOUND") || message.includes("ECONNREFUSED")
      ? "Failed to connect to external service"
      : message.length > 200 ? message.slice(0, 200) + "..." : message;
    sendSSE(res, { step, status: "error", label: safeMessage });
    res.end();
  }
});

export default router;
