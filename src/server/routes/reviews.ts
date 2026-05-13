import { Router, Request, Response } from "express";
import { randomUUID } from "crypto";
import { findReviewById, listReviews, deleteReview, updateReview, saveReviewRecord, computeReviewStats } from "../services/review-store";
import { getLogsByReviewId, getLogById } from "../services/llm-logger";
import { getLLMConfig } from "../llm";
import { callLLM } from "../llm";
import { getReviewPrompt, getReviewUserPrompt } from "../llm/prompts/review";
import { parseMRUrl, fetchMRMeta, fetchMRDiffs, fetchMRHeadSha, fetchCompareDiffs } from "../services/gitlab";
import { classify } from "../services/classifier";
import { understandRequirement } from "../services/requirement";
import { getKnowledgeForReview, extractLearnings, suggestDispositions, trackKnowledgeHits, determineAdoptedKnowledge, getKnowledgeUsedByReview, getKnowledgeProducedByReview } from "../services/knowledge";
import { getRepoMapping } from "../config/repo-mapping";
import { buildRequirementPrompt } from "../services/requirement";
import { buildKnowledgePrompt } from "../services/knowledge";
import { parseReviewResponse, mergeReports } from "../services/reviewer";
import { saveLLMLog } from "../services/llm-logger";
import { getDimensionsForProject } from "../services/dimensions";
import { inferTechStack } from "../services/techstack";
import { getDb } from "../db";
import { listSubReports } from "../services/review-sub-report-store";
import { listCheckpoints } from "../services/review-checkpoint-store";
import type { ReviewResponse, ReviewFilter, ContinueReviewRequest, KnowledgeDisposition } from "../../shared/types";

const router = Router();

// GET / — List reviews with pagination and filtering
router.get("/", (req: Request, res: Response) => {
  const filter: ReviewFilter = {
    project: req.query.project as string | undefined,
    product_line_id: req.query.product_line_id as string | undefined,
    createdBy: req.query.createdBy as string | undefined,
    status: req.query.status as ReviewFilter["status"],
    page: Math.max(1, parseInt(req.query.page as string) || 1),
    pageSize: Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 20)),
  };
  const result = listReviews(filter);

  // v1.4.6: enrich requirement reviews with sub_report stats
  for (const item of result.items) {
    if (item.mr_url.startsWith("requirement://")) {
      const subs = listSubReports(item.id);
      item.subReportStats = {
        completed: subs.filter((s) => s.status === "completed").length,
        total: subs.length,
        failed: subs.filter((s) => s.status === "failed").length,
      };
    }
  }

  res.json(result);
});

// GET /:id — Review detail
router.get("/:id", (req: Request<{ id: string }>, res: Response) => {
  const record = findReviewById(req.params.id);
  if (!record) {
    res.status(404).json({ error: "Review not found" });
    return;
  }

  // Aggregate token usage from LLM logs
  const logs = getLogsByReviewId(req.params.id);
  let tokenUsage: { inputTokens: number; outputTokens: number } | undefined;
  if (logs.length > 0) {
    const totals = logs.reduce(
      (acc, log) => ({
        inputTokens: acc.inputTokens + (log.input_tokens ?? 0),
        outputTokens: acc.outputTokens + (log.output_tokens ?? 0),
      }),
      { inputTokens: 0, outputTokens: 0 },
    );
    tokenUsage = totals;
  }

  const response: ReviewResponse = {
    reviewId: record.id,
    mr: record.mr_meta_json ? JSON.parse(record.mr_meta_json) : {} as ReviewResponse["mr"],
    diffs: [],
    report: JSON.parse(record.report_json),
    ...(record.classification_json ? { classification: JSON.parse(record.classification_json) } : {}),
    ...(record.requirement_json ? { requirement: JSON.parse(record.requirement_json) } : {}),
    ...(tokenUsage ? { tokenUsage } : {}),
  };

  // Knowledge data
  const knowledgeUsed = getKnowledgeUsedByReview(req.params.id);
  const knowledgeProduced = getKnowledgeProducedByReview(req.params.id);
  const knowledgeDispositions = record.knowledge_dispositions_json
    ? JSON.parse(record.knowledge_dispositions_json) as KnowledgeDisposition[]
    : undefined;

  if (knowledgeUsed.length > 0) {
    response.knowledgeUsed = knowledgeUsed.map((e) => ({
      id: e.id, type: e.type, title: e.title, severity: e.severity ?? null, status: e.status, project: e.project,
    }));
  }
  if (knowledgeProduced.length > 0) {
    response.knowledgeProduced = knowledgeProduced.map((e) => ({
      id: e.id, type: e.type, title: e.title, severity: e.severity ?? null, status: e.status, project: e.project,
    }));
  }
  if (knowledgeDispositions) {
    response.knowledgeDispositions = knowledgeDispositions;
  }

  res.json({ record, response });
});

// GET /:id/checkpoint — Find associated checkpoint for pause/resume (v1.4.6)
router.get("/:id/checkpoint", (req: Request<{ id: string }>, res: Response) => {
  const record = findReviewById(req.params.id);
  if (!record) {
    res.status(404).json({ error: "Review not found" });
    return;
  }
  // Find paused/interrupted checkpoints for requirement reviews matching this reviewId
  const checkpoints = listCheckpoints({ reviewType: "requirement" }).filter(
    (cp) => (cp.status === "paused" || cp.status === "interrupted")
      && (cp.accumulatedStats.includes(req.params.id)
        // Fallback: match by project_id when accumulatedStats is empty (early failure)
        || (cp.projectId === record.product_line_id && cp.accumulatedStats === "{}"))
  );
  res.json(checkpoints.length > 0 ? checkpoints[0] : null);
});

// GET /:id/sub-reports — Sub-reports for requirement review (v1.4.6)
router.get("/:id/sub-reports", (req: Request<{ id: string }>, res: Response) => {
  const record = findReviewById(req.params.id);
  if (!record) {
    res.status(404).json({ error: "Review not found" });
    return;
  }
  const subs = listSubReports(req.params.id);
  res.json(subs);
});

// DELETE /:id — Delete review (owner or admin only)
router.delete("/:id", (req: Request<{ id: string }> & { user?: { id: string; role: string } }, res: Response) => {
  const record = findReviewById(req.params.id);
  if (!record) {
    res.status(404).json({ error: "Review not found" });
    return;
  }
  if (record.created_by !== req.user?.id && req.user?.role !== "admin") {
    res.status(403).json({ error: "Not authorized" });
    return;
  }
  deleteReview(req.params.id);
  res.json({ success: true });
});

// GET /:id/logs — LLM logs for a review
router.get("/:id/logs", (req: Request<{ id: string }>, res: Response) => {
  const logs = getLogsByReviewId(req.params.id);
  res.json(logs);
});

// GET /:id/logs/:logId — Single LLM log detail
router.get("/:id/logs/:logId", (req: Request<{ id: string; logId: string }>, res: Response) => {
  const log = getLogById(req.params.logId);
  if (!log || log.review_id !== req.params.id) {
    res.status(404).json({ error: "Log not found" });
    return;
  }
  res.json(log);
});

// POST /:id/continue — Continue review (full or incremental)
router.post("/:id/continue", async (req: Request<{ id: string }>, res: Response) => {
  const { mode } = req.body as ContinueReviewRequest;
  if (!mode || (mode !== "full" && mode !== "incremental")) {
    res.status(400).json({ error: "mode must be 'full' or 'incremental'" });
    return;
  }

  const existing = findReviewById(req.params.id);
  if (!existing) {
    res.status(404).json({ error: "Review not found" });
    return;
  }

  const llmConfig = getLLMConfig();
  if (!llmConfig.apiKey) {
    res.status(500).json({ error: "LLM API key not configured" });
    return;
  }

  const gitlabToken = req.body.gitlabToken || process.env.GITLAB_TOKEN;
  if (!gitlabToken) {
    res.status(400).json({ error: "GitLab token required" });
    return;
  }

  // Parse MR URL from existing record
  const parsed = parseMRUrl(existing.mr_url);

  // For incremental mode, check for new changes
  if (mode === "incremental") {
    if (!existing.reviewed_commit_sha) {
      res.status(400).json({ error: "No commit SHA recorded for incremental comparison. Use full mode." });
      return;
    }

    const currentSha = await fetchMRHeadSha(parsed.host, parsed.projectPath, parsed.iid, gitlabToken);
    if (!currentSha || currentSha === existing.reviewed_commit_sha) {
      res.json({ message: "No new changes since last review", hasChanges: false });
      return;
    }

    // Fetch incremental diffs
    const incrementalDiffs = await fetchCompareDiffs(
      parsed.host, parsed.projectPath, existing.reviewed_commit_sha, currentSha, gitlabToken
    );

    if (incrementalDiffs.length === 0) {
      res.json({ message: "No new changes since last review", hasChanges: false });
      return;
    }

    // Run review on incremental diffs via SSE
    await runContinueReviewSSE(res, {
      existing,
      diffs: incrementalDiffs,
      parsed,
      gitlabToken,
      llmConfig,
      newSha: currentSha,
      isIncremental: true,
      req,
    });
    return;
  }

  // Full mode — re-fetch everything
  const [mr, diffs] = await Promise.all([
    fetchMRMeta(parsed.host, parsed.projectPath, parsed.iid, gitlabToken),
    fetchMRDiffs(parsed.host, parsed.projectPath, parsed.iid, gitlabToken),
  ]);

  await runContinueReviewSSE(res, {
    existing,
    diffs,
    parsed,
    gitlabToken,
    llmConfig,
    newSha: (mr as unknown as Record<string, unknown>).diff_refs
      ? ((mr as unknown as Record<string, unknown>).diff_refs as Record<string, unknown>)?.head_sha as string | undefined
      : undefined,
    isIncremental: false,
    req,
  });
});

interface ContinueSSEContext {
  existing: NonNullable<ReturnType<typeof findReviewById>>;
  diffs: import("../../shared/types").GitLabDiff[];
  parsed: { host: string; projectPath: string; iid: number };
  gitlabToken: string;
  llmConfig: import("../../shared/types").LLMConfig;
  newSha?: string;
  isIncremental: boolean;
  req: Request;
}

async function runContinueReviewSSE(res: Response, ctx: ContinueSSEContext): Promise<void> {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  const sendSSE = (event: { step: number; status: string; label: string; detail?: string; progress?: number }) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  let step = 0;
  const nextStep = (label: string, detail?: string) => { step++; sendSSE({ step, status: "running", label, detail }); };
  const completeStep = (detail?: string) => { sendSSE({ step, status: "done", label: "", detail }); };

  try {
    const project = ctx.parsed.projectPath.split("/").pop() || ctx.parsed.projectPath;
    const techStack = inferTechStack(ctx.diffs.map((d: { new_path: string }) => d.new_path));
    const dimensions = getDimensionsForProject(ctx.parsed.projectPath, techStack);
    const { summary: classification, batchDiffs } = classify(ctx.diffs);
    const batchLevels = classification.batches.map((b) => b.level);
    const requirement = await understandRequirement(
      ctx.existing.mr_meta_json ? JSON.parse(ctx.existing.mr_meta_json) : {},
      ctx.diffs
    );
    const reviewMapping = getRepoMapping(ctx.parsed.projectPath);
    const knowledge = getKnowledgeForReview({
      project,
      module: requirement.module,
      techStack,
      productLine: reviewMapping?.productLineId ?? undefined,
    });
    const reqPrompt = requirement ? buildRequirementPrompt(requirement) : "";
    const knowledgePrompt = knowledge.length > 0 ? buildKnowledgePrompt(knowledge) : "";
    const userPromptPrefix = getReviewUserPrompt();

    const newReviewId = `R-${randomUUID().slice(0, 8)}`;
    const batchReports = [];
    const failedBatches: number[] = [];

    for (let i = 0; i < batchDiffs.length; i++) {
      const level = batchLevels[i];
      nextStep(`Reviewing batch ${i + 1}/${batchDiffs.length}`, `Level ${level} · ${ctx.llmConfig.provider}`);

      const diffText = batchDiffs[i]
        .map((d: { old_path: string; new_path: string; diff: string }) => `--- ${d.old_path}\n+++ ${d.new_path}\n${d.diff}`)
        .join("\n\n");

      const systemPrompt = getReviewPrompt({
        dimensions,
        batchIndex: i,
        totalBatches: batchDiffs.length,
        riskLevel: level,
        requirement: reqPrompt,
        knowledge: knowledgePrompt,
      });

      const userMessage = `${userPromptPrefix}${diffText}`;
      const startTime = Date.now();

      let result;
      try {
        result = await callLLM(systemPrompt, userMessage, ctx.llmConfig);
      } catch (llmErr) {
        const errMsg = llmErr instanceof Error ? llmErr.message : "LLM call failed";
        console.error(`[Review ${newReviewId}] Batch ${i + 1}/${batchDiffs.length} failed: ${errMsg}`);
        failedBatches.push(i);
        sendSSE({ step, status: "error", label: `Batch ${i + 1} failed: ${errMsg.slice(0, 100)}` });
        continue;
      }

      const durationMs = Date.now() - startTime;

      batchReports.push(parseReviewResponse(result.text));

      saveLLMLog({
        id: `LOG-${randomUUID().slice(0, 8)}`,
        review_id: newReviewId,
        batch_index: i,
        risk_level: level,
        system_prompt: systemPrompt,
        user_message: userMessage,
        response_text: result.text,
        duration_ms: durationMs,
        input_tokens: result.usage?.inputTokens ?? null,
        output_tokens: result.usage?.outputTokens ?? null,
        provider: ctx.llmConfig.provider,
        model: ctx.llmConfig.model,
      });

      const tokenDetail = result.usage
        ? `${batchDiffs[i].length} files (${result.usage.inputTokens}+${result.usage.outputTokens} tokens)`
        : `${batchDiffs[i].length} files`;
      sendSSE({ step, status: "done", label: "", detail: tokenDetail, progress: Math.round(((i + 1) / batchDiffs.length) * 100) });
    }

    const report = mergeReports(batchReports, dimensions);
    if (failedBatches.length > 0) {
      report.summary = (report.summary || "") + `\n\n⚠ 注意：${failedBatches.length}/${batchDiffs.length} 个批次评审失败（batch ${failedBatches.map(b => b + 1).join(", ")}），部分文件未被评审。`;
    }
    const stats = computeReviewStats(report);

    saveReviewRecord({
      id: newReviewId,
      mr_url: ctx.existing.mr_url,
      project,
      product_line_id: null,
      author: ctx.existing.author,
      status: "completed",
      report_json: JSON.stringify(report),
      classification_json: JSON.stringify(classification),
      requirement_json: JSON.stringify({ type: requirement.type, module: requirement.module, features: requirement.features, conflicts: requirement.conflicts, source: requirement.source }),
      mr_meta_json: ctx.existing.mr_meta_json,
      reviewed_commit_sha: ctx.newSha || null,
      passed: report.passed,
      avg_score: stats.avgScore,
      issue_count: stats.issueCount,
      critical_count: stats.criticalCount,
      created_by: (ctx.req as Request & { user?: { id: string } }).user?.id || null,
      knowledge_dispositions_json: JSON.stringify(suggestDispositions(report.issues)),
    });
    extractLearnings(report, project, newReviewId);

    if (knowledge.length > 0) {
      const adoptedIds = determineAdoptedKnowledge(report.issues, knowledge);
      trackKnowledgeHits(knowledge.map((e) => e.id), newReviewId, adoptedIds);
    }

    // Update old record status
    updateReview(ctx.existing.id, { status: "draft" });

    const response: ReviewResponse = {
      reviewId: newReviewId,
      mr: ctx.existing.mr_meta_json ? JSON.parse(ctx.existing.mr_meta_json) : {} as ReviewResponse["mr"],
      diffs: ctx.diffs,
      report,
      classification,
      requirement: { type: requirement.type, module: requirement.module, features: requirement.features, conflicts: requirement.conflicts, source: requirement.source },
    };

    sendSSE({ step: step + 1, status: "done", label: "COMPLETE", detail: JSON.stringify(response) });
    res.end();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Continue review failed";
    sendSSE({ step, status: "error", label: message });
    res.end();
  }
}

// POST /:id/knowledge-map — Submit issue disposition mapping (admin only)
router.post("/:id/knowledge-map", (req: Request<{ id: string }>, res: Response) => {
  const user = (req as Request & { user?: { role: string } }).user;
  if (user?.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  const record = findReviewById(req.params.id);
  if (!record) {
    res.status(404).json({ error: "Review not found" });
    return;
  }

  const { dispositions } = req.body as { dispositions: KnowledgeDisposition[] };
  if (!Array.isArray(dispositions)) {
    res.status(400).json({ error: "dispositions array required" });
    return;
  }

  // Validate: CRITICAL/HIGH issues cannot be SKIP without a reason
  let report: { issues: Array<{ severity: string }> } | null = null;
  try {
    report = JSON.parse(record.report_json);
  } catch { /* ignore parse error */ }

  if (report?.issues) {
    for (const disp of dispositions) {
      const issue = report.issues[disp.issueIndex];
      if (!issue) continue;
      if ((issue.severity === "CRITICAL" || issue.severity === "HIGH") && disp.disposition === "SKIP" && !disp.skipReason) {
        res.status(400).json({ error: `Issue ${disp.issueIndex} (${issue.severity}) cannot be SKIP without a reason` });
        return;
      }
    }
  }

  const db = getDb();
  db.prepare("UPDATE reviews SET knowledge_dispositions_json = ? WHERE id = ?").run(
    JSON.stringify(dispositions), req.params.id
  );
  res.json({ success: true });
});

// GET /:id/knowledge-map — Get disposition mapping
router.get("/:id/knowledge-map", (req: Request<{ id: string }>, res: Response) => {
  const record = findReviewById(req.params.id);
  if (!record) {
    res.status(404).json({ error: "Review not found" });
    return;
  }

  const db = getDb();
  const row = db.prepare("SELECT knowledge_dispositions_json FROM reviews WHERE id = ?").get(req.params.id) as { knowledge_dispositions_json: string | null };
  const dispositions = row.knowledge_dispositions_json ? JSON.parse(row.knowledge_dispositions_json) : null;
  res.json({ dispositions });
});

export default router;
