import { Router, Request, Response } from "express";
import { randomUUID } from "crypto";
import { getRepoMappingsByProductLine } from "../config/repo-mapping";
import { classify } from "../services/classifier";
import {
  getKnowledgeForReview,
  buildKnowledgePrompt,
  extractLearnings,
  trackKnowledgeHits,
  determineAdoptedKnowledge,
  preloadSharedKnowledge,
  getProjectKnowledge,
  suggestDispositions,
} from "../services/knowledge";
import { parseReviewResponse, mergeReports } from "../services/reviewer";
import { callLLM, getLLMConfig, validateLLMKey } from "../llm";
import { getReviewPrompt, getReviewUserPrompt } from "../llm/prompts/review";
import { getDimensionsForProject } from "../services/dimensions";
import { inferTechStack } from "../services/techstack";
import { fetchCompareDiffsForBranches } from "../services/gitlab";
import { saveReviewRecord, updateReview, computeReviewStats } from "../services/review-store";
import { createSubReport, updateSubReport, listSubReports } from "../services/review-sub-report-store";
import { saveLLMLog } from "../services/llm-logger";
import {
  buildMultiProjectScanContext,
  buildRelatedFilesPrompt,
  buildASTContextPrompt,
} from "../services/local-scan";
import { inferModuleFromPaths } from "../services/module-utils";
import { createJob, findJobById, findActiveJobByUser, updateJob } from "../services/review-job-store";
import { groupByTechStack } from "../services/techstack-grouper";
import { detectCrossStackIssues } from "../services/cross-stack-analyzer";
import { createSSEHelpers } from "../services/sse-helper";
import { isPauseRequested, clearPause, removeJob } from "../services/review-pause-controller";
import {
  createCheckpoint,
  findCheckpointById,
  updateCheckpoint,
  completeCheckpoint,
  abandonCheckpoint,
} from "../services/review-checkpoint-store";
import type {
  RequirementReviewRequest,
  RequirementReviewReport,
  TechStackGroupReport,
  ProjectScanResult,
  TechStack,
  ReviewReport,
} from "../../shared/types";
import type { SSEBatchResult } from "../../shared/types";

const router = Router();

// ---- GET /requirement/active ----

router.get("/requirement/active", (req: Request, res: Response) => {
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
    reviewType: job.reviewType,
    productLineId: job.productLineId,
  });
});

// ---- GET /requirement/gitlab-token-status ----
// v1.4.5: Must be before /:jobId to avoid being matched as a jobId

router.get("/requirement/gitlab-token-status", (_req: Request, res: Response) => {
  res.json({ configured: !!process.env.GITLAB_TOKEN });
});

// ---- GET /requirement/:jobId ----

router.get("/requirement/:jobId", (req: Request, res: Response) => {
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
    reviewType: job.reviewType,
    productLineId: job.productLineId,
  });
});

// ---- POST /requirement/preview ----

router.post("/requirement/preview", async (req: Request, res: Response) => {
  const { productLine, sourceBranch, targetBranch, gitlabToken }: RequirementReviewRequest = req.body;

  if (!productLine || !sourceBranch || !targetBranch) {
    res.status(400).json({ error: "productLine, sourceBranch, targetBranch are required" });
    return;
  }

  const mappings = getRepoMappingsByProductLine(productLine);
  if (mappings.length === 0) {
    res.status(404).json({ error: `No projects found for product line: ${productLine}` });
    return;
  }

  // v1.4.5: Resolve GitLab token — env var first, then request body
  const resolvedGitlabToken = process.env.GITLAB_TOKEN || gitlabToken || null;

  try {
    // v1.4.5: Split projects into GitLab API vs local fallback
    const gitlabProjects = mappings.filter(
      (m) => m.gitlabHost && m.gitlabProjectPath && resolvedGitlabToken
    );
    const localProjects = mappings.filter(
      (m) => !(m.gitlabHost && m.gitlabProjectPath && resolvedGitlabToken)
    );

    const previewProjects: Array<{
      project: string;
      techStack: TechStack;
      diffCount: number;
      diffChars: number;
      diffPreview: Array<{ path: string; newFile: boolean; diffChars: number }>;
    }> = [];

    // GitLab API projects — parallel fetch
    if (gitlabProjects.length > 0) {
      const gitlabResults = await Promise.allSettled(
        gitlabProjects.map(async (m) => {
          const diffs = await fetchCompareDiffsForBranches(
            m.gitlabHost!,
            m.gitlabProjectPath!,
            sourceBranch,
            targetBranch,
            resolvedGitlabToken!
          );
          return { mapping: m, diffs };
        })
      );

      for (const result of gitlabResults) {
        if (result.status === "rejected") continue;
        const { mapping, diffs } = result.value;
        if (!diffs || diffs.length === 0) continue;

        const techStack = inferTechStack(diffs.map((d) => d.new_path));
        const diffChars = diffs.reduce((sum, d) => sum + d.diff.length, 0);
        previewProjects.push({
          project: mapping.project,
          techStack,
          diffCount: diffs.length,
          diffChars,
          diffPreview: diffs.map((d) => ({
            path: d.new_path,
            newFile: d.new_file,
            diffChars: d.diff.length,
          })),
        });
      }
    }

    // Local fallback projects — use buildMultiProjectScanContext with skipHeavy for Preview speed
    if (localProjects.length > 0) {
      const projects = localProjects.map((m) => ({ project: m.project, repoPath: m.localPath }));
      const multiCtx = await buildMultiProjectScanContext(projects, targetBranch, sourceBranch, {
        skipHeavy: true,
      });

      for (const p of multiCtx.projects) {
        previewProjects.push({
          project: p.project,
          techStack: p.techStack,
          diffCount: p.diffCount,
          diffChars: p.diffChars,
          diffPreview: p.diffPreview,
        });
      }
    }

    const totalFiles = previewProjects.reduce((sum, p) => sum + p.diffCount, 0);
    const totalTokens = Math.round(
      previewProjects.reduce((sum, p) => sum + p.diffChars, 0) / 4
    );

    res.json({
      projects: previewProjects,
      totalFiles,
      totalTokens,
      projectCount: previewProjects.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// ---- POST /requirement — main SSE review endpoint ----

router.post("/requirement", async (req: Request, res: Response) => {
  const {
    productLine, sourceBranch, targetBranch,
    excludedProjects, excludedFiles,
    requirement, requirementId,
    checkpointId: resumeCheckpointId,
    gitlabToken: requestGitlabToken,
  }: RequirementReviewRequest = req.body;

  if (!productLine || !sourceBranch || !targetBranch) {
    res.status(400).json({ error: "productLine, sourceBranch, targetBranch are required" });
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
    res.status(500).json({ error: "LLM API key not configured" });
    return;
  }

  // G1: Validate LLM key before any expensive work (also covers resume path)
  const keyError = await validateLLMKey(llmConfig);
  if (keyError) {
    res.status(400).json({ error: keyError });
    return;
  }

  // G3: Clean stale running jobs before checking duplicates
  const userId = (req as Request & { user?: { id: string } }).user?.id || null;
  if (userId) {
    const activeJob = findActiveJobByUser(userId);
    if (activeJob && activeJob.status === "running") {
      // Stale running job from a previous crash — clean it up
      updateJob(activeJob.id, { status: "failed", errorMessage: "上一次评审异常中断，已自动清理" });
    }
  }

  // Prevent duplicate reviews (skip for resume — resume always creates a fresh job)
  if (userId && !resumeCheckpointId) {
    const activeJob = findActiveJobByUser(userId);
    if (activeJob && activeJob.status === "running") {
      res.status(409).json({ error: "已有评审正在进行中，请等待完成后再发起", jobId: activeJob.id });
      return;
    }
  }

  const mappings = getRepoMappingsByProductLine(productLine);
  if (mappings.length === 0) {
    res.status(404).json({ error: `No projects found for product line: ${productLine}` });
    return;
  }

  // Filter excluded projects
  const excludeSet = new Set(excludedProjects ?? []);
  const filteredMappings = mappings.filter((m) => !excludeSet.has(m.project));

  if (filteredMappings.length === 0) {
    res.status(400).json({ error: "All projects excluded" });
    return;
  }

  // Create job record
  const job = createJob({
    project: productLine,
    sourceBranch,
    targetBranch,
    excludedFilesJson: excludedFiles?.length ? JSON.stringify(excludedFiles) : null,
    createdBy: userId,
    reviewType: "requirement",
    productLineId: productLine,
  });

  // Switch to SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  // Switch to SSE
  const { sendSSE, nextStep: _sseNext, completeStep: _sseComplete, getStep, sendEvent } = createSSEHelpers(res);
  sendSSE({ step: 0, status: "done", label: "init", jobId: job.id });

  let aborted = false;
  let checkpointId: string | null = null;
  let abortTimeout: ReturnType<typeof setTimeout> | null = null;
  let reviewIdForCleanup: string | null = null;

  // G2: Global SSE timeout — prevent hanging forever on LLM/network issues
  const timeoutMinutes = parseInt(process.env.REVIEW_TIMEOUT_MINUTES || "30", 10);
  const globalTimeout = setTimeout(() => {
    if (aborted) return;
    aborted = true;
    sendSSE({ step: 0, status: "error", label: `评审超时（${timeoutMinutes}分钟），请检查 LLM 配置后重试` });
    updateJob(job.id, { status: "failed", errorMessage: `评审超时（${timeoutMinutes}分钟）` });
    if (checkpointId) updateCheckpoint(checkpointId, { status: "interrupted" });
    if (reviewIdForCleanup) updateReview(reviewIdForCleanup, { status: "interrupted" });
    res.end();
  }, timeoutMinutes * 60_000);

  res.on("close", () => {
    clearTimeout(globalTimeout);
    // Wait 60s — if resumed within window, checkpoint stays paused
    abortTimeout = setTimeout(() => {
      const currentJob = findJobById(job.id);
      if (currentJob && currentJob.status === "running") {
        aborted = true;
        updateJob(job.id, { status: "aborted", errorMessage: "Client disconnected" });
        if (checkpointId) updateCheckpoint(checkpointId, { status: "interrupted" });
        if (reviewIdForCleanup) updateReview(reviewIdForCleanup, { status: "interrupted" });
      }
    }, 60_000);
  });

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
    // Step 1: Scan all projects
    if (aborted) { res.end(); return; }
    nextStep("Loading product line", `${productLine}: ${filteredMappings.length} projects`);

    // v1.4.5: Resolve GitLab token and build config map
    const resolvedGitlabToken = process.env.GITLAB_TOKEN || requestGitlabToken || null;
    const gitlabConfigs = new Map<string, { gitlabHost: string; gitlabProjectPath: string }>();
    if (resolvedGitlabToken) {
      for (const m of filteredMappings) {
        if (m.gitlabHost && m.gitlabProjectPath) {
          gitlabConfigs.set(m.project, {
            gitlabHost: m.gitlabHost,
            gitlabProjectPath: m.gitlabProjectPath,
          });
        }
      }
    }

    const projectItems = filteredMappings.map((m) => ({ project: m.project, repoPath: m.localPath }));
    const multiCtx = await buildMultiProjectScanContext(projectItems, targetBranch, sourceBranch, {
      gitlabToken: resolvedGitlabToken ?? undefined,
      gitlabConfigs,
    });
    completeStep(`${multiCtx.projectCount} projects have changes, ${multiCtx.totalFiles} files total`);

    if (multiCtx.projectCount === 0) {
      updateJob(job.id, { status: "completed", stepsJson: JSON.stringify(accumulatedSteps) });
      sendSSE({ step: getStep() + 1, status: "done", label: "No changes", detail: "No diff found in any project" });
      res.end();
      return;
    }

    if (aborted) { res.end(); return; }

    // Step 2: Group by tech stack
    nextStep("Grouping by tech stack");
    const scanResults: ProjectScanResult[] = multiCtx.projects.map((p) => ({
      project: p.project,
      repoPath: p.repoPath,
      techStack: p.techStack,
      diffCount: p.diffCount,
      diffChars: p.diffChars,
      diffPreview: p.diffPreview,
    }));
    const techGroups = groupByTechStack(scanResults);
    const groupNames = [...techGroups.keys()].join(", ");
    completeStep(`${techGroups.size} groups: ${groupNames}`);

    // Step 3: Preload shared knowledge
    nextStep("Preloading shared knowledge");
    const techStackIds = [...techGroups.keys()].filter((t) => t !== "unknown");
    const sharedCache = preloadSharedKnowledge(productLine, techStackIds);
    completeStep(`foundation: ${sharedCache.foundation.length}, product: ${sharedCache.product.length}, integration: ${sharedCache.integration.length}`);

    // Step 4: Review per tech-stack group, per project
    // v1.4.4: resume context from checkpoint
    let resumeTechStack: string | null = null;
    let resumeProjectIndex = -1;
    let reviewId: string;

    if (resumeCheckpointId) {
      const cp = findCheckpointById(resumeCheckpointId)!;
      updateCheckpoint(cp.id, { status: "running" });
      checkpointId = cp.id;
      try {
        const stats = JSON.parse(cp.accumulatedStats || "{}");
        resumeTechStack = stats.techStack || null;
        resumeProjectIndex = typeof stats.projectIndex === "number" ? stats.projectIndex : -1;
        reviewId = stats.reviewId || `R-${randomUUID().slice(0, 8)}`;
      } catch {
        reviewId = `R-${randomUUID().slice(0, 8)}`;
      }
      reviewIdForCleanup = reviewId;
      sendEvent("resumed", {
        checkpointId: cp.id,
        remainingBatches: (cp.totalBatches || 0) - cp.currentBatch,
      });
      // v1.4.6: resume → update existing record to "reviewing"
      updateReview(reviewId, { status: "reviewing" });
    } else {
      reviewId = `R-${randomUUID().slice(0, 8)}`;
      reviewIdForCleanup = reviewId;

      checkpointId = createCheckpoint({
        reviewType: "requirement",
        projectId: productLine,
        sourceBranch,
        targetBranch,
        totalBatches: multiCtx.totalFiles,
        totalFiles: multiCtx.totalFiles,
        currentBatch: 0,
        reviewedCount: 0,
        jobId: job.id,
        createdBy: userId ?? undefined,
      }).id;

      // v1.4.6: create reviews record immediately (status: reviewing)
      saveReviewRecord({
        id: reviewId,
        mr_url: `requirement://${productLine}/${sourceBranch}..${targetBranch}`,
        project: productLine,
        product_line_id: productLine,
        author: null,
        status: "reviewing",
        report_json: JSON.stringify({
          reviewId, productLine, sourceBranch, targetBranch,
          requirement, requirementId,
          totalProjects: multiCtx.projectCount,
          totalFiles: multiCtx.totalFiles,
          totalIssues: 0, criticalCount: 0,
          overallPassed: false, overallScore: 0,
          techStackReports: [],
        }),
        classification_json: null,
        requirement_json: requirement ? JSON.stringify({ requirement, requirementId }) : null,
        mr_meta_json: JSON.stringify({
          type: "requirement", productLine,
          techStackGroups: {},
          sourceBranch, targetBranch,
        }),
        reviewed_commit_sha: null,
        passed: null,
        avg_score: null,
        issue_count: null,
        critical_count: 0,
        created_by: userId,
        knowledge_dispositions_json: JSON.stringify([]),
      });
    }

    // v1.4.6: emit review_created so frontend can navigate immediately
    sendEvent("review_created", {
      reviewId,
      reviewType: "requirement",
    });

    const techStackReports: TechStackGroupReport[] = [];
    const allProjectReports: Array<{
      project: string;
      report: ReviewReport;
      techStack: TechStack;
    }> = [];

    // v1.4.4: on resume, load completed sub-reports so skipped groups/projects contribute to final report
    let completedSubReports: Map<string, { report: ReviewReport; classification: any }> | null = null;
    if (resumeCheckpointId) {
      completedSubReports = new Map();
      const subs = listSubReports(reviewId);
      for (const sub of subs) {
        if (sub.status === "completed" && sub.report_json) {
          completedSubReports.set(sub.project, {
            report: JSON.parse(sub.report_json),
            classification: sub.classification_json ? JSON.parse(sub.classification_json) : null,
          });
        }
      }
    }

    // v1.4.4: emit review_start early so client sees progress ASAP
    sendEvent("review_start", {
      reviewType: "requirement",
      totalBatches: multiCtx.projectCount,
      totalFiles: multiCtx.totalFiles,
      jobId: job.id,
      reviewId,
    });

    for (const [techStack, groupResults] of techGroups) {
      if (aborted) break;

      // v1.4.4: skip completed techStack groups on resume — but load their results
      if (resumeTechStack && techStack !== resumeTechStack) {
        if (completedSubReports) {
          const projectReports: TechStackGroupReport["projectReports"] = [];
          for (const scanItem of groupResults) {
            const saved = completedSubReports.get(scanItem.project);
            if (saved) {
              projectReports.push({
                project: scanItem.project,
                report: saved.report,
                classification: saved.classification,
              });
              allProjectReports.push({ project: scanItem.project, report: saved.report, techStack });
            }
          }
          if (projectReports.length > 0) {
            const totalFiles = groupResults.reduce((sum, r) => sum + r.diffCount, 0);
            const allIssues = projectReports.flatMap((pr) => pr.report.issues);
            const criticalCount = allIssues.filter((i) => i.severity === "CRITICAL").length;
            let totalWeight = 0;
            let weightedScoreSum = 0;
            for (const pr of projectReports) {
              const fileCount = groupResults.find((r) => r.project === pr.project)?.diffCount ?? 1;
              const avgScore = pr.report.scores.length > 0
                ? pr.report.scores.reduce((s, sc) => s + sc.score, 0) / pr.report.scores.length
                : 3;
              totalWeight += fileCount;
              weightedScoreSum += avgScore * fileCount;
            }
            const groupScore = totalWeight > 0
              ? Math.round(weightedScoreSum / totalWeight * 10) / 10
              : 3;
            techStackReports.push({
              techStack,
              dimensionSetName: techStack === "java-backend" ? "Java 后端维度集"
                : techStack === "vue-frontend" ? "Vue 前端维度集"
                : "通用维度集",
              projectCount: groupResults.length,
              totalFiles,
              totalIssues: allIssues.length,
              criticalCount,
              groupScore,
              groupPassed: projectReports.every((pr) => pr.report.passed),
              projectReports,
            });
          }
        }
        continue;
      }

      const dimensions = getDimensionsForProject(null, techStack);
      const dimensionSetName = techStack === "java-backend" ? "Java 后端维度集"
        : techStack === "vue-frontend" ? "Vue 前端维度集"
        : "通用维度集";

      const projectReports: TechStackGroupReport["projectReports"] = [];

      for (let pi = 0; pi < groupResults.length; pi++) {
        if (aborted) break;

        // v1.4.4: skip completed projects within a techStack group on resume — load their results
        if (resumeTechStack && techStack === resumeTechStack && pi < resumeProjectIndex) {
          const saved = completedSubReports?.get(groupResults[pi].project);
          if (saved) {
            projectReports.push({
              project: groupResults[pi].project,
              report: saved.report,
              classification: saved.classification,
            });
            allProjectReports.push({ project: groupResults[pi].project, report: saved.report, techStack });
          }
          continue;
        }

        const scanItem = groupResults[pi];
        const projCtx = multiCtx.projects.find((p) => p.project === scanItem.project);
        if (!projCtx) continue;

        nextStep(
          `Reviewing [${techStack}] ${scanItem.project}`,
          `(${pi + 1}/${groupResults.length})`
        );

        // v1.4.6: create sub_report for this project
        const subReportId = createSubReport(reviewId, scanItem.project, scanItem.techStack);
        updateSubReport(subReportId, { status: "reviewing" });

        try {
          const projDiffs = excludedFiles?.length
            ? projCtx.context.diffs.filter((d) => !excludedFiles.includes(d.new_path))
            : projCtx.context.diffs;

          if (projDiffs.length === 0) {
            completeStep("Skipped (all files excluded)");
            continue;
          }

          // Classify
          const { summary: classification, batchDiffs } = classify(projDiffs);
          const batchLevels = classification.batches.map((b) => b.level);

          if (batchDiffs.length === 0) {
            completeStep("Skipped (all files low-risk)");
            continue;
          }

          // Load project-level knowledge using shared cache
          const inferredModule = inferModuleFromPaths(projDiffs.map((d) => d.new_path));
          const knowledge = getProjectKnowledge(
            {
              project: scanItem.project,
              productLine,
              techStack,
              module: inferredModule,
              changedFiles: projDiffs.map((d) => d.new_path),
            },
            sharedCache
          );

          const knowledgePrompt = knowledge.length > 0 ? buildKnowledgePrompt(knowledge) : "";
          const relatedPrompt = buildRelatedFilesPrompt(projCtx.context);
          const astPrompt = buildASTContextPrompt(projCtx.context.astChanges ?? []);
          const userPromptPrefix = getReviewUserPrompt();

          // Review batches
          const batchReports: ReviewReport[] = [];
          const isResumeProject = resumeTechStack && techStack === resumeTechStack && pi === resumeProjectIndex;
          let startBatch = 0;
          if (isResumeProject) {
            const cp = findCheckpointById(resumeCheckpointId!)!;
            startBatch = cp.currentBatch;
            const savedResults = JSON.parse(cp.batchResults || "[]") as any[];
            savedResults.forEach((r: any) => batchReports.push({ issues: r.issues, scores: r.scores } as unknown as ReviewReport));
          }
          for (let i = startBatch; i < batchDiffs.length; i++) {
            if (aborted) break;

            const level = batchLevels[i];
            const diffText = batchDiffs[i]
              .map((d) => `--- ${d.old_path}\n+++ ${d.new_path}\n${d.diff}`)
              .join("\n\n");

            const systemPrompt = getReviewPrompt({
              dimensions,
              batchIndex: i,
              totalBatches: batchDiffs.length,
              riskLevel: level,
              requirement: requirement ? `\n\n## 需求上下文\n${requirement}` : "",
              knowledge: knowledgePrompt,
            });

            const userMessage = `${userPromptPrefix}${astPrompt}${relatedPrompt}\n\n${diffText}`;
            const startTime = Date.now();
            const result = await callLLM(systemPrompt, userMessage, llmConfig);
            const durationMs = Date.now() - startTime;

            const parsed = parseReviewResponse(result.text, dimensions);
            // Tag issues with originating project
            for (const issue of parsed.issues) {
              issue.project = scanItem.project;
            }
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

            // v1.4.4: emit batch_result for incremental rendering
            sendEvent("batch_result", {
              batchIndex: i,
              files: batchDiffs[i].map((d: { new_path: string }) => d.new_path),
              issues: parsed.issues,
              scores: parsed.scores,
              progress: {
                completedBatches: i + 1,
                totalBatches: batchDiffs.length,
                reviewedFiles: batchDiffs.slice(0, i + 1).reduce((sum: number, b: unknown[]) => sum + b.length, 0),
                totalFiles: projDiffs.length,
              },
            } as SSEBatchResult);

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
                accumulatedStats: JSON.stringify({
                  reviewId,
                  techStack,
                  projectIndex: pi,
                  project: scanItem.project,
                }),
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
                accumulatedStats: JSON.stringify({
                  reviewId,
                  techStack,
                  projectIndex: pi,
                  project: scanItem.project,
                }),
              });
              updateJob(job.id, { status: "paused", stepsJson: JSON.stringify(accumulatedSteps) });
              // v1.4.6: update main record status to paused
              updateReview(reviewId, { status: "paused" });
              sendEvent("paused", {
                checkpointId,
                progress: {
                  completedBatches: i + 1,
                  totalBatches: batchDiffs.length,
                  reviewedFiles: reviewedCount,
                  totalFiles: projDiffs.length,
                },
              });
              if (abortTimeout) clearTimeout(abortTimeout);
              res.end();
              return;
            }
          }

          if (aborted) break;

          const report = mergeReports(batchReports, dimensions);
          projectReports.push({
            project: scanItem.project,
            report,
            classification,
          });
          allProjectReports.push({ project: scanItem.project, report, techStack });

          // Extract learnings per project
          extractLearnings(report, scanItem.project, reviewId);

          // Track knowledge hits
          if (knowledge.length > 0) {
            const adoptedIds = determineAdoptedKnowledge(report.issues, knowledge);
            trackKnowledgeHits(knowledge.map((e) => e.id), reviewId, adoptedIds);
          }

          completeStep(`${projDiffs.length} files reviewed, ${report.issues.length} issues`);

          // v1.4.6: update sub_report with completed result
          const projStats = computeReviewStats(report);
          updateSubReport(subReportId, {
            status: "completed",
            report_json: JSON.stringify(report),
            classification_json: JSON.stringify(classification),
            score: projStats.avgScore,
            issue_count: projStats.issueCount,
            critical_count: projStats.criticalCount,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          projectReports.push({
            project: scanItem.project,
            report: {
              contractTitle: "Code Review",
              timestamp: new Date().toISOString(),
              passed: false,
              scores: dimensions.map((d) => ({ dimension: d, score: 3, comment: "Review failed" })),
              issues: [{ severity: "HIGH", message: `评审失败: ${msg}`, file: "" }],
              summary: `评审失败: ${msg}`,
            },
            classification: {
              stats: { total: 0, byLevel: { S: 0, A: 0, B: 0, C: 0 }, skipped: 0 },
              batches: [],
              skipped: [],
            },
            error: msg,
          });
          completeStep(`Error: ${msg.slice(0, 100)}`);

          // v1.4.6: update sub_report with failed status
          updateSubReport(subReportId, {
            status: "failed",
            error_message: msg.slice(0, 500),
          });
        }
      }

      // Aggregate tech stack group report
      const totalFiles = groupResults.reduce((sum, r) => sum + r.diffCount, 0);
      const allIssues = projectReports.flatMap((pr) => pr.report.issues);
      const criticalCount = allIssues.filter((i) => i.severity === "CRITICAL").length;

      // Weighted average score by file count
      let totalWeight = 0;
      let weightedScoreSum = 0;
      for (const pr of projectReports) {
        const fileCount = groupResults.find((r) => r.project === pr.project)?.diffCount ?? 1;
        const avgScore = pr.report.scores.length > 0
          ? pr.report.scores.reduce((s, sc) => s + sc.score, 0) / pr.report.scores.length
          : 3;
        totalWeight += fileCount;
        weightedScoreSum += avgScore * fileCount;
      }
      const groupScore = totalWeight > 0
        ? Math.round(weightedScoreSum / totalWeight * 10) / 10
        : 3;

      techStackReports.push({
        techStack,
        dimensionSetName,
        projectCount: groupResults.length,
        totalFiles,
        totalIssues: allIssues.length,
        criticalCount,
        groupScore,
        groupPassed: projectReports.every((pr) => pr.report.passed),
        projectReports,
      });
    }

    if (aborted) { res.end(); return; }

    // Step 5: Build RequirementReviewReport
    nextStep("Merging reports");

    // Overall score: weighted average by project count
    const totalProjects = techStackReports.reduce((sum, r) => sum + r.projectCount, 0);
    let overallWeightedScore = 0;
    for (const tsr of techStackReports) {
      overallWeightedScore += tsr.groupScore * tsr.projectCount;
    }
    const overallScore = totalProjects > 0
      ? Math.round(overallWeightedScore / totalProjects * 10) / 10
      : 3;

    const allIssues = techStackReports.flatMap((tsr) => tsr.projectReports.flatMap((pr) => pr.report.issues));
    const totalCritical = allIssues.filter((i) => i.severity === "CRITICAL").length;
    const totalFiles = multiCtx.totalFiles;

    // Cross-stack issues: detect when both java-backend and vue-frontend groups exist
    let crossStackIssues: RequirementReviewReport["crossStackIssues"];
    const javaGroup = techStackReports.find((r) => r.techStack === "java-backend");
    const vueGroup = techStackReports.find((r) => r.techStack === "vue-frontend");
    if (javaGroup && vueGroup) {
      crossStackIssues = detectCrossStackIssues(
        javaGroup,
        vueGroup,
        sharedCache.integration
      );
    }

    const finalReport: RequirementReviewReport = {
      reviewId,
      productLine,
      sourceBranch,
      targetBranch,
      requirement,
      requirementId,
      totalProjects,
      totalFiles,
      totalIssues: allIssues.length,
      criticalCount: totalCritical,
      overallPassed: techStackReports.every((tsr) => tsr.groupPassed),
      overallScore,
      techStackReports,
      crossStackIssues,
    };

    // v1.4.6: update existing record to completed (already created at start)
    const stats = computeReviewStats({
      contractTitle: "Code Review",
      timestamp: new Date().toISOString(),
      passed: finalReport.overallPassed,
      scores: [],
      issues: allIssues,
      summary: "",
    });

    updateReview(reviewId, {
      status: "completed",
      report_json: JSON.stringify(finalReport),
      mr_meta_json: JSON.stringify({
        type: "requirement",
        productLine,
        techStackGroups: Object.fromEntries(
          techStackReports.map((tsr) => [
            tsr.techStack,
            tsr.projectReports.map((pr) => pr.project),
          ])
        ),
        sourceBranch,
        targetBranch,
      }),
      passed: finalReport.overallPassed,
      avg_score: overallScore,
      issue_count: allIssues.length,
      critical_count: totalCritical,
    });

    completeStep();

    updateJob(job.id, { status: "completed", reviewId, stepsJson: JSON.stringify(accumulatedSteps) });

    sendSSE({ step: getStep() + 1, status: "done", label: "COMPLETE", detail: JSON.stringify({ reviewId, report: finalReport }) });
    completeCheckpoint(checkpointId);
    clearTimeout(globalTimeout);
    if (abortTimeout) clearTimeout(abortTimeout);
    res.end();
  } catch (error) {
    clearTimeout(globalTimeout);
    if (abortTimeout) clearTimeout(abortTimeout);
    const message = error instanceof Error ? error.message : "Unknown error";
    const shortMessage = message.length > 200 ? message.slice(0, 200) + "..." : message;
    updateJob(job.id, { status: "failed", errorMessage: shortMessage, stepsJson: JSON.stringify(accumulatedSteps) });
    if (checkpointId) updateCheckpoint(checkpointId, { status: "interrupted" });
    if (reviewIdForCleanup) updateReview(reviewIdForCleanup, { status: "interrupted" });
    removeJob(job.id);
    sendSSE({ step: getStep(), status: "error", label: shortMessage });
    res.end();
  }
});

export default router;
