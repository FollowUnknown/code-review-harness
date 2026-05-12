import { Router, Request, Response } from "express";
import { randomUUID } from "crypto";
import { getRepoMapping } from "../config/repo-mapping";
import { classify } from "../services/classifier";
import { getKnowledgeForReview, buildKnowledgePrompt, extractLearnings, trackKnowledgeHits, determineAdoptedKnowledge, suggestDispositions } from "../services/knowledge";
import { parseReviewResponse, mergeReports } from "../services/reviewer";
import { callLLM, getLLMConfig } from "../llm";
import { getReviewPrompt, getReviewUserPrompt } from "../llm/prompts/review";
import { getDimensionsForProject } from "../services/dimensions";
import { inferTechStack } from "../services/techstack";
import { saveReviewRecord, computeReviewStats } from "../services/review-store";
import { saveLLMLog } from "../services/llm-logger";
import { buildLocalScanContext, buildRelatedFilesPrompt, buildASTContextPrompt } from "../services/local-scan";
import { inferModuleFromPaths } from "../services/module-utils";
import { createJob, findJobById, findActiveJobByUser, updateJob } from "../services/review-job-store";
import type { LocalReviewRequest } from "../../shared/types";
import type { SSEBatchResult } from "../../shared/types";
import { createSSEHelpers } from "../services/sse-helper";
import { isPauseRequested, clearPause, removeJob } from "../services/review-pause-controller";
import {
  createCheckpoint,
  findCheckpointById,
  updateCheckpoint,
  completeCheckpoint,
  abandonCheckpoint,
} from "../services/review-checkpoint-store";

const router = Router();

// GET /local/active — find running job for current user
router.get("/local/active", (req: Request, res: Response) => {
  const userId = (req as Request & { user?: { id: string } }).user?.id || null;
  if (!userId) { res.json(null); return; }

  const job = findActiveJobByUser(userId);
  if (!job) { res.json(null); return; }

  res.json({
    id: job.id,
    status: job.status,
    currentStep: job.currentStep,
    currentLabel: job.currentLabel,
    steps: job.stepsJson ? JSON.parse(job.stepsJson) : [],
    reviewId: job.reviewId,
    errorMessage: job.errorMessage,
    project: job.project,
    sourceBranch: job.sourceBranch,
    targetBranch: job.targetBranch,
  });
});

// GET /local/:jobId — poll job status
router.get("/local/:jobId", (req: Request, res: Response) => {
  const job = findJobById(req.params.jobId as string);
  if (!job) { res.status(404).json({ error: "Job not found" }); return; }

  res.json({
    id: job.id,
    status: job.status,
    currentStep: job.currentStep,
    currentLabel: job.currentLabel,
    steps: job.stepsJson ? JSON.parse(job.stepsJson) : [],
    reviewId: job.reviewId,
    errorMessage: job.errorMessage,
  });
});

// POST /local — start review with job tracking
router.post("/local", async (req: Request, res: Response) => {
  const { project, sourceBranch, targetBranch, checkpointId: resumeCheckpointId }: LocalReviewRequest = req.body;

  if (!project || !sourceBranch || !targetBranch) {
    res.status(400).json({ error: "project, sourceBranch, targetBranch are required" });
    return;
  }

  // v1.4.4: if resuming from checkpoint, validate early
  if (resumeCheckpointId) {
    const cp = findCheckpointById(resumeCheckpointId);
    if (!cp) {
      res.status(404).json({ error: "Checkpoint not found" });
      return;
    }
    if (cp.status !== "paused") {
      res.status(400).json({ error: `Checkpoint status is "${cp.status}", expected "paused"` });
      return;
    }
  }

  // Prevent duplicate reviews: check if user already has a running job
  const userId = (req as Request & { user?: { id: string } }).user?.id || null;
  if (userId && !resumeCheckpointId) {
    const activeJob = findActiveJobByUser(userId);
    if (activeJob && activeJob.status === "running") {
      res.status(409).json({ error: "已有评审正在进行中，请等待完成后再发起", jobId: activeJob.id });
      return;
    }
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

  // Create job record
  const jobUserId = (req as Request & { user?: { id: string } }).user?.id || null;
  const excludedFiles = req.body.excludedFiles || [];
  const job = createJob({
    project,
    sourceBranch,
    targetBranch,
    excludedFilesJson: excludedFiles.length > 0 ? JSON.stringify(excludedFiles) : null,
    createdBy: jobUserId,
  });

  // Switch to SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  // Send jobId as first event so client can store it for recovery
  const { sendSSE, nextStep: _sseNext, completeStep: _sseComplete, getStep, sendEvent } = createSSEHelpers(res);
  sendSSE({ step: 0, status: "done", label: "init", jobId: job.id });

  // Abort detection: SSE close doesn't mean client left (polling may continue)
  // Only mark aborted if no polling happens within 60 seconds after close
  let aborted = false;
  let sseDisconnected = false;
  let checkpointId: string | null = null;
  let abortTimeout: ReturnType<typeof setTimeout> | null = null;
  res.on("close", () => {
    sseDisconnected = true;
    // Wait 60s — if client is polling, the job status endpoint will be hit
    abortTimeout = setTimeout(() => {
      // Only abort if job is still running (polling would have seen completed)
      const currentJob = findJobById(job.id);
      if (currentJob && currentJob.status === "running") {
        aborted = true;
        updateJob(job.id, { status: "aborted", errorMessage: "Client disconnected" });
        if (checkpointId) updateCheckpoint(checkpointId, { status: "interrupted" });
      }
    }, 60_000);
  });

  // Update job to running
  updateJob(job.id, { status: "running" });

  const accumulatedSteps: string[] = [];
  const nextStep = (label: string, detail?: string) => {
    _sseNext(label, detail);
    accumulatedSteps.push(`${label}: ${detail || ""}`);
    updateJob(job.id, { currentStep: getStep(), currentLabel: label, stepsJson: JSON.stringify(accumulatedSteps) });
  };
  const completeStep = (detail?: string) => {
    _sseComplete(detail);
  };

  try {
    // Step 1: Scan local repo
    if (aborted) { res.end(); return; }
    nextStep("Scanning local repo", `${mapping.localPath}: ${targetBranch}..${sourceBranch}`);
    const context = await buildLocalScanContext(mapping.localPath, targetBranch, sourceBranch);
    completeStep(`${context.diffs.length} files changed, ${context.relatedFiles.length} related files`);

    // Filter excluded files (v1.3.5)
    const diffs = excludedFiles.length > 0
      ? context.diffs.filter((d: { new_path: string }) => !excludedFiles.includes(d.new_path))
      : context.diffs;

    if (diffs.length === 0) {
      updateJob(job.id, { status: "completed", stepsJson: JSON.stringify(accumulatedSteps) });
      sendSSE({ step: getStep() + 1, status: "done", label: "No changes", detail: "No diff found between branches" });
      res.end();
      return;
    }

    if (aborted) { res.end(); return; }

    // Step 2: Classify
    nextStep("Classifying files");
    const { summary: classification, batchDiffs } = classify(diffs);
    const batchLevels = classification.batches.map((b) => b.level);
    completeStep();

    if (aborted) { res.end(); return; }

    // v1.4.4: emit review_start early (before knowledge loading) so client sees progress ASAP
    const totalBatches = batchDiffs.length;
    sendEvent("review_start", {
      reviewType: "local",
      totalBatches,
      totalFiles: diffs.length,
      jobId: job.id,
    });

    // Step 3: Load knowledge — infer module from diff file paths
    nextStep("Loading knowledge base");
    const inferredModule = inferModuleFromPaths(diffs.map((d: { new_path: string }) => d.new_path));
    const techStack = inferTechStack(diffs.map((d: { new_path: string }) => d.new_path));
    const knowledge = getKnowledgeForReview({
      project,
      module: inferredModule,
      changedFiles: diffs.map((d: { new_path: string }) => d.new_path),
      techStack,
      productLine: mapping.productLineId ?? undefined,
    });
    completeStep(`${knowledge.length} entries loaded`);

    // Step 4: Review batches
    const reviewId = `R-${randomUUID().slice(0, 8)}`;
    const dimensions = getDimensionsForProject(project, techStack);
    const knowledgePrompt = knowledge.length > 0 ? buildKnowledgePrompt(knowledge) : "";
    const relatedPrompt = buildRelatedFilesPrompt(context);
    const astPrompt = buildASTContextPrompt(context.astChanges ?? []);
    const userPromptPrefix = getReviewUserPrompt();

    const batchReports: any[] = [];
    let startBatch = 0;

    // v1.4.4: resume from checkpoint — pre-load completed batches, skip to breakpoint
    if (resumeCheckpointId) {
      const cp = findCheckpointById(resumeCheckpointId)!;
      updateCheckpoint(cp.id, { status: "running" });
      startBatch = cp.currentBatch;
      const savedResults = JSON.parse(cp.batchResults || "[]") as any[];
      savedResults.forEach((r: any) => batchReports.push({ issues: r.issues, scores: r.scores }));
      sendEvent("resumed", {
        checkpointId: cp.id,
        remainingBatches: totalBatches - startBatch,
      });
      checkpointId = cp.id;
    } else {
      // v1.4.4: create initial checkpoint for pause/resume
      checkpointId = createCheckpoint({
        reviewType: "local",
        projectId: project,
        sourceBranch,
        targetBranch,
        totalBatches,
        totalFiles: diffs.length,
        currentBatch: 0,
        reviewedCount: 0,
        jobId: job.id,
        createdBy: userId ?? undefined,
      }).id;
    }

    if (totalBatches === 0) {
      if (!resumeCheckpointId) {
        updateJob(job.id, { status: "completed", stepsJson: JSON.stringify(accumulatedSteps) });
      }
      sendSSE({ step: getStep() + 1, status: "done", label: "No files to review", detail: "All files skipped" });
      res.end();
      return;
    }

    for (let i = startBatch; i < totalBatches; i++) {
      if (aborted) break;

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

      const userMessage = `${userPromptPrefix}${astPrompt}${relatedPrompt}\n\n${diffText}`;
      const startTime = Date.now();
      const result = await callLLM(systemPrompt, userMessage, llmConfig);
      const durationMs = Date.now() - startTime;

      const parsed = parseReviewResponse(result.text);
      batchReports.push(parsed);

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

      // v1.4.4: emit batch_result for incremental rendering
      sendEvent("batch_result", {
        batchIndex: i,
        files: batchDiffs[i].map((d: { new_path: string }) => d.new_path),
        issues: parsed.issues,
        scores: parsed.scores,
        progress: {
          completedBatches: i + 1,
          totalBatches,
          reviewedFiles: batchDiffs.slice(0, i + 1).reduce((sum: number, b: unknown[]) => sum + b.length, 0),
          totalFiles: diffs.length,
        },
      });

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
      if (isPauseRequested(job.id)) {
        clearPause(job.id);
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
        updateJob(job.id, { status: "paused", stepsJson: JSON.stringify(accumulatedSteps) });
        sendEvent("paused", {
          checkpointId,
          progress: {
            completedBatches: i + 1,
            totalBatches,
            reviewedFiles: reviewedCount,
            totalFiles: diffs.length,
          },
        });
        if (abortTimeout) clearTimeout(abortTimeout);
        res.end();
        return;
      }
    }

    if (aborted) { res.end(); return; }

    const report = mergeReports(batchReports, dimensions);
    const stats = computeReviewStats(report);

    // Save
    saveReviewRecord({
      id: reviewId,
      mr_url: `local://${project}/${sourceBranch}..${targetBranch}`,
      project,
      product_line_id: mapping.productLineId ?? null,
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
      created_by: userId,
      knowledge_dispositions_json: JSON.stringify(suggestDispositions(report.issues)),
    });

    // Extract learnings and track knowledge hits (knowledge loop)
    extractLearnings(report, project, reviewId);

    if (knowledge.length > 0) {
      const adoptedIds = determineAdoptedKnowledge(report.issues, knowledge);
      trackKnowledgeHits(knowledge.map((e) => e.id), reviewId, adoptedIds);
    }

    const response = { reviewId, report, classification, localScan: { relatedFiles: context.relatedFiles.length, totalTokens: context.totalTokens } };

    // Mark job completed with reviewId
    updateJob(job.id, { status: "completed", reviewId, stepsJson: JSON.stringify(accumulatedSteps) });

    sendSSE({ step: getStep() + 1, status: "done", label: "COMPLETE", detail: JSON.stringify(response) });
    completeCheckpoint(checkpointId);
    if (abortTimeout) clearTimeout(abortTimeout);
    res.end();
  } catch (error) {
    if (abortTimeout) clearTimeout(abortTimeout);
    const message = error instanceof Error ? error.message : "Unknown error";
    const shortMessage = message.length > 200 ? message.slice(0, 200) + "..." : message;
    updateJob(job.id, { status: "failed", errorMessage: shortMessage, stepsJson: JSON.stringify(accumulatedSteps) });
    removeJob(job.id);
    sendSSE({ step: getStep(), status: "error", label: shortMessage });
    res.end();
  }
});

export default router;
