import { Router, Request, Response } from "express";
import { randomUUID } from "crypto";
import { parseMRUrl, fetchMRMeta, fetchMRDiffs } from "../services/gitlab";
import { classify } from "../services/classifier";
import { understandRequirement } from "../services/requirement";
import { getKnowledgeForReview, extractLearnings, suggestDispositions, trackKnowledgeHits, determineAdoptedKnowledge } from "../services/knowledge";
import { parseReviewResponse, mergeReports } from "../services/reviewer";
import { buildRequirementPrompt } from "../services/requirement";
import { buildKnowledgePrompt } from "../services/knowledge";
import { callLLM, getLLMConfig, validateLLMKey } from "../llm";
import { getReviewPrompt, getReviewUserPrompt } from "../llm/prompts/review";
import { getDimensionsForProject } from "../services/dimensions";
import { inferTechStack } from "../services/techstack";
import { ReviewRequest, ReviewResponse } from "../../shared/types";
import type { SSEBatchResult } from "../../shared/types";
import { saveReviewRecord, computeReviewStats } from "../services/review-store";
import { saveLLMLog } from "../services/llm-logger";
import { createSSEHelpers } from "../services/sse-helper";
import { isPauseRequested, clearPause, removeJob } from "../services/review-pause-controller";
import { createCheckpoint, updateCheckpoint, completeCheckpoint, abandonCheckpoint, findCheckpointById } from "../services/review-checkpoint-store";

const router = Router();

// SSE-based review endpoint
router.post("/review", async (req: Request, res: Response) => {
  const { mrUrl, gitlabHost, gitlabToken, lanhuUrl, checkpointId: resumeCheckpointId }: ReviewRequest = req.body;

  // Validate before setting SSE headers so JSON error responses work correctly
  if (!mrUrl) {
    res.status(400).json({ error: "mrUrl is required" });
    return;
  }

  // v1.4.4: if resuming from checkpoint, validate early
  if (resumeCheckpointId) {
    const cp = findCheckpointById(resumeCheckpointId);
    if (!cp) {
      res.status(404).json({ error: "Checkpoint not found" });
      return;
    }
    if (cp.status !== "paused" && cp.status !== "interrupted") {
      res.status(400).json({ error: `Checkpoint status is "${cp.status}", expected "paused" or "interrupted"` });
      return;
    }
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

  const { sendSSE, nextStep, completeStep, getStep, sendEvent } = createSSEHelpers(res);

  // v1.4.4: abort detection — 60s timeout auto-abandons checkpoint
  let aborted = false;
  let checkpointId: string | null = null;
  let abortTimeout: ReturnType<typeof setTimeout> | null = null;
  const reviewId = `R-${randomUUID().slice(0, 8)}`;

  // G1: Validate LLM key early
  const keyError = await validateLLMKey(llmConfig);
  if (keyError) {
    sendSSE({ step: 0, status: "error", label: keyError });
    res.end();
    return;
  }

  // G2: Global SSE timeout
  const timeoutMinutes = parseInt(process.env.REVIEW_TIMEOUT_MINUTES || "30", 10);
  const globalTimeout = setTimeout(() => {
    if (aborted) return;
    aborted = true;
    sendSSE({ step: 0, status: "error", label: `评审超时（${timeoutMinutes}分钟），请检查 LLM 配置后重试` });
    if (checkpointId) updateCheckpoint(checkpointId, { status: "interrupted" });
    res.end();
  }, timeoutMinutes * 60_000);

  res.on("close", () => {
    clearTimeout(globalTimeout);
    abortTimeout = setTimeout(() => {
      if (checkpointId) {
        updateCheckpoint(checkpointId, { status: "interrupted" });
      }
      aborted = true;
    }, 60_000);
  });

  try {
    // Step 1: Parse URL & connect GitLab
    nextStep("Connecting GitLab", `Parsing MR URL...`);
    const parsed = parseMRUrl(mrUrl);
    const host = gitlabHost || parsed.host;
    const token = gitlabToken || process.env.GITLAB_TOKEN;

    if (!token) {
      sendSSE({ step: getStep(), status: "error", label: "GitLab token required" });
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
    const techStack = inferTechStack(diffs.map((d: { new_path: string }) => d.new_path));
    const dimensions = getDimensionsForProject(parsed.projectPath, techStack);

    // Step 3: Classify files
    nextStep("Classifying files", `Analyzing risk levels...`);
    const { summary: classification, batchDiffs } = classify(diffs);
    const batchLevels = classification.batches.map((b) => b.level);
    const levelCounts = Object.entries(classification.stats.byLevel)
      .filter(([, c]) => c > 0)
      .map(([l, c]) => `${l}(${c})`)
      .join(" ");
    completeStep(`S/A/B/C: ${levelCounts}, skipped: ${classification.stats.skipped}`);

    // v1.4.4: emit review_start early so client sees progress ASAP
    const totalBatches = batchDiffs.length;
    const totalFiles = diffs.length;
    sendEvent("review_start", {
      reviewType: "mr",
      totalBatches,
      totalFiles,
      jobId: reviewId,
    });

    // Step 4: Understand requirement
    nextStep("Understanding requirement", `Analyzing MR context...`);
    const requirement = await understandRequirement(mr, diffs, lanhuUrl);
    completeStep(`${requirement.type} · ${requirement.module}`);

    // Step 5: Load knowledge
    nextStep("Loading knowledge base", `Searching for relevant entries...`);
    const knowledge = getKnowledgeForReview(project, requirement.module, undefined, techStack);
    completeStep(`${knowledge.length} entries loaded`);

    // Step 6+: Review batches
    let report;
    let tokenUsage: { inputTokens: number; outputTokens: number } | undefined;
    let batchDetails: Array<{ files: number; tokens: { inputTokens: number; outputTokens: number } }> | undefined;

    const mrMeta = mr as unknown as Record<string, unknown>;
    let startBatch = 0;

    // v1.4.4: resume from checkpoint — pre-load completed batches, skip to breakpoint
    if (resumeCheckpointId) {
      const cp = findCheckpointById(resumeCheckpointId)!;
      updateCheckpoint(cp.id, { status: "running" });
      startBatch = cp.currentBatch;
      checkpointId = cp.id;
      sendEvent("resumed", {
        checkpointId: cp.id,
        remainingBatches: totalBatches - startBatch,
      });
    } else {
      // v1.4.4: create initial checkpoint for pause/resume
      checkpointId = createCheckpoint({
        reviewType: "mr",
        projectId: project,
        sourceBranch: mrMeta.source_branch as string | undefined,
        targetBranch: mrMeta.target_branch as string | undefined,
        totalBatches,
        totalFiles,
        currentBatch: 0,
        reviewedCount: 0,
        jobId: reviewId,
        createdBy: (req as Request & { user?: { id: string } }).user?.id,
      }).id;
    }

    if (totalBatches === 0) {
      if (checkpointId) completeCheckpoint(checkpointId);
      sendSSE({ step: getStep() + 1, status: "done", label: "No files to review", detail: "All files skipped" });
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

      const batchReports: any[] = resumeCheckpointId
        ? (JSON.parse(findCheckpointById(resumeCheckpointId)!.batchResults || "[]") as any[]).map((r: any) => ({ issues: r.issues, scores: r.scores }))
        : [];
      const _batchDetails: Array<{ files: number; tokens: { inputTokens: number; outputTokens: number } }> = [];
      let totalInput = 0;
      let totalOutput = 0;
      const failedBatches: number[] = [];

      for (let i = startBatch; i < batchDiffs.length; i++) {
        if (aborted) break;

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

        let result;
        try {
          result = await callLLM(systemPrompt, userMessage, llmConfig);
        } catch (llmErr) {
          const errMsg = llmErr instanceof Error ? llmErr.message : "LLM call failed";
          console.error(`[Review ${reviewId}] Batch ${i + 1}/${totalBatches} failed: ${errMsg}`);
          failedBatches.push(i);
          sendSSE({ step: getStep(), status: "error", label: `Batch ${i + 1} failed: ${errMsg.slice(0, 100)}` });
          continue; // skip this batch, proceed with remaining
        }

        const durationMs = Date.now() - startTime;

        const parsed = parseReviewResponse(result.text);
        batchReports.push(parsed);

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

        sendSSE({
          step: getStep(),
          status: "done",
          label: "",
          detail: tokenDetail,
          progress: Math.round(((i + 1) / totalBatches) * 100),
        });

        // v1.4.4: emit batch_result for incremental rendering
        const batchResult: SSEBatchResult = {
          batchIndex: i,
          files: batchDiffs[i].map((d: { new_path: string }) => d.new_path),
          issues: parsed.issues,
          scores: parsed.scores,
          progress: {
            completedBatches: i + 1,
            totalBatches,
            reviewedFiles: batchDiffs.slice(0, i + 1).reduce((sum: number, b: unknown[]) => sum + b.length, 0),
            totalFiles,
          },
        };
        sendEvent("batch_result", batchResult);

        // v1.4.4: incremental checkpoint save per batch (failure recovery)
        {
          const reviewedCount = batchDiffs.slice(0, i + 1).reduce((sum: number, b: unknown[]) => sum + b.length, 0);
          updateCheckpoint(checkpointId, {
            currentBatch: i + 1,
            reviewedCount,
            batchResults: JSON.stringify(
              batchReports.map((r, bi) => ({
                batchIndex: bi,
                files: batchDiffs[bi]?.map((d: { new_path: string }) => d.new_path) ?? [],
                issues: r.issues,
                scores: r.scores,
              }))
            ),
          });
        }

        // v1.4.4: check pause request between batches
        if (isPauseRequested(reviewId)) {
          clearPause(reviewId);
          const reviewedCount = batchDiffs.slice(0, i + 1).reduce((sum: number, b: unknown[]) => sum + b.length, 0);
          updateCheckpoint(checkpointId, {
            status: "paused",
            currentBatch: i + 1,
            reviewedCount,
            batchResults: JSON.stringify(
              batchReports.map((r, bi) => ({
                batchIndex: bi,
                files: batchDiffs[bi]?.map((d: { new_path: string }) => d.new_path) ?? [],
                issues: r.issues,
                scores: r.scores,
              }))
            ),
          });
          sendEvent("paused", {
            checkpointId,
            progress: {
              completedBatches: i + 1,
              totalBatches,
              reviewedFiles: reviewedCount,
              totalFiles,
            },
          });
          if (abortTimeout) clearTimeout(abortTimeout);
          clearTimeout(globalTimeout);
          res.end();
          return;
        }
      }

      // Merge reports
      nextStep("Merging results", `${batchReports.length}/${totalBatches} batches succeeded`);
      report = mergeReports(batchReports, dimensions);
      if (failedBatches.length > 0) {
        report.summary = (report.summary || "") + `\n\n⚠ 注意：${failedBatches.length}/${totalBatches} 个批次评审失败（batch ${failedBatches.map(b => b + 1).join(", ")}），部分文件未被评审。`;
      }
      completeStep();

      if (totalInput > 0) {
        tokenUsage = { inputTokens: totalInput, outputTokens: totalOutput };
        batchDetails = _batchDetails;
      }
    }

    // Save review record
    const stats = computeReviewStats(report);

    // Extract head_sha from MR meta if available
    const headSha = mrMeta.diff_refs
      ? (mrMeta.diff_refs as Record<string, unknown>)?.head_sha as string | undefined
      : undefined;

    saveReviewRecord({
      id: reviewId,
      mr_url: mrUrl,
      project,
      product_line_id: null,
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

    sendSSE({ step: getStep() + 1, status: "done", label: "COMPLETE", detail: JSON.stringify(response) });
    completeCheckpoint(checkpointId);
    clearTimeout(globalTimeout);
    if (abortTimeout) clearTimeout(abortTimeout);
    res.end();
  } catch (err) {
    clearTimeout(globalTimeout);
    if (abortTimeout) clearTimeout(abortTimeout);
    if (checkpointId) updateCheckpoint(checkpointId, { status: "interrupted" });
    removeJob(reviewId);
    const message = err instanceof Error ? err.message : "Review failed";
    // Sanitize: avoid leaking internal details to client
    const safeMessage = message.includes("ENOTFOUND") || message.includes("ECONNREFUSED")
      ? "Failed to connect to external service"
      : message.length > 200 ? message.slice(0, 200) + "..." : message;
    sendSSE({ step: getStep(), status: "error", label: safeMessage });
    res.end();
  }
});

export default router;
