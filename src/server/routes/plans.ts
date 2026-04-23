import { Router, Request, Response } from "express";
import { randomUUID } from "crypto";
import { createPlan, findPlanById, listPlans, updatePlan, deletePlan, addPlanItems, removePlanItem, updatePlanItem, getPlanDetail } from "../services/plan-store";
import { findReviewById } from "../services/review-store";
import { computePlanSummary, exportPlanMarkdown } from "../services/exporter";
import { getLLMConfig } from "../llm";
import { callLLM } from "../llm";
import { getReviewPrompt, getReviewUserPrompt } from "../llm/prompts/review";
import { parseMRUrl, fetchMRMeta, fetchMRDiffs } from "../services/gitlab";
import { classify } from "../services/classifier";
import { understandRequirement } from "../services/requirement";
import { getKnowledgeForReview, extractLearnings } from "../services/knowledge";
import { buildRequirementPrompt } from "../services/requirement";
import { buildKnowledgePrompt } from "../services/knowledge";
import { parseReviewResponse, mergeReports } from "../services/reviewer";
import { saveReviewRecord, computeReviewStats } from "../services/review-store";
import { saveLLMLog } from "../services/llm-logger";
import { REVIEW_DIMENSIONS } from "../../shared/constants";
import type { ReviewResponse, PlanFilter, ReviewRecord } from "../../shared/types";

const router = Router();

function checkOwner(req: Request, createdBy: string): boolean {
  const user = (req as Request & { user?: { id: string; role: string } }).user;
  return user?.id === createdBy || user?.role === "admin";
}

const VALID_STATUSES = ["open", "reviewing", "archived"] as const;
const MR_URL_PATTERN = /^https?:\/\/[^/]+\/.+\/-\/merge_requests\/\d+/;

// POST / — Create plan
router.post("/", (req: Request, res: Response) => {
  const { title, description } = req.body;
  if (!title || typeof title !== "string" || title.trim().length === 0) { res.status(400).json({ error: "title is required" }); return; }
  if (title.length > 200) { res.status(400).json({ error: "title too long (max 200 chars)" }); return; }
  const userId = (req as Request & { user?: { id: string } }).user?.id;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const plan = createPlan(title.trim(), (typeof description === "string" ? description.trim() : null) || null, userId);
  res.json(plan);
});

// GET / — List plans
router.get("/", (req: Request, res: Response) => {
  const filter: PlanFilter = {
    status: req.query.status as PlanFilter["status"],
    page: Math.max(1, parseInt(req.query.page as string) || 1),
    pageSize: Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 20)),
  };
  res.json(listPlans(filter));
});

// GET /:id — Plan detail
router.get("/:id", (req: Request<{ id: string }>, res: Response) => {
  const plan = getPlanDetail(req.params.id);
  if (!plan) { res.status(404).json({ error: "Plan not found" }); return; }
  if (!checkOwner(req, plan.created_by)) { res.status(403).json({ error: "Not authorized" }); return; }
  res.json(plan);
});

// PUT /:id — Update plan
router.put("/:id", (req: Request<{ id: string }>, res: Response) => {
  const plan = findPlanById(req.params.id);
  if (!plan) { res.status(404).json({ error: "Plan not found" }); return; }
  if (!checkOwner(req, plan.created_by)) { res.status(403).json({ error: "Not authorized" }); return; }
  const { title, description, status } = req.body;
  if (status && !VALID_STATUSES.includes(status)) { res.status(400).json({ error: "Invalid status" }); return; }
  if (title !== undefined && (typeof title !== "string" || title.trim().length === 0)) { res.status(400).json({ error: "Invalid title" }); return; }
  if (title !== undefined && title.length > 200) { res.status(400).json({ error: "title too long (max 200 chars)" }); return; }
  updatePlan(req.params.id, { title: title?.trim(), description: typeof description === "string" ? description.trim() : description, status });
  res.json(getPlanDetail(req.params.id));
});

// DELETE /:id — Delete plan
router.delete("/:id", (req: Request<{ id: string }>, res: Response) => {
  const plan = findPlanById(req.params.id);
  if (!plan) { res.status(404).json({ error: "Plan not found" }); return; }
  if (!checkOwner(req, plan.created_by)) { res.status(403).json({ error: "Not authorized" }); return; }
  deletePlan(req.params.id);
  res.json({ success: true });
});

// POST /:id/items — Add MRs
router.post("/:id/items", (req: Request<{ id: string }>, res: Response) => {
  const plan = findPlanById(req.params.id);
  if (!plan) { res.status(404).json({ error: "Plan not found" }); return; }
  if (!checkOwner(req, plan.created_by)) { res.status(403).json({ error: "Not authorized" }); return; }
  if (plan.status !== "open") { res.status(400).json({ error: "Plan is not open" }); return; }
  const { mrUrls } = req.body;
  if (!Array.isArray(mrUrls) || mrUrls.length === 0) { res.status(400).json({ error: "mrUrls array required" }); return; }
  if (mrUrls.length > 100) { res.status(400).json({ error: "Too many MRs (max 100)" }); return; }
  const invalidUrls = mrUrls.filter((u: unknown) => typeof u !== "string" || !MR_URL_PATTERN.test(u));
  if (invalidUrls.length > 0) { res.status(400).json({ error: `Invalid MR URL format: ${String(invalidUrls[0]).slice(0, 80)}` }); return; }
  const items = addPlanItems(req.params.id, mrUrls);
  res.json(items);
});

// DELETE /:id/items/:itemId — Remove item
router.delete("/:id/items/:itemId", (req: Request<{ id: string; itemId: string }>, res: Response) => {
  const plan = findPlanById(req.params.id);
  if (!plan) { res.status(404).json({ error: "Plan not found" }); return; }
  if (!checkOwner(req, plan.created_by)) { res.status(403).json({ error: "Not authorized" }); return; }
  if (plan.status !== "open") { res.status(400).json({ error: "Plan is not open" }); return; }
  removePlanItem(req.params.id, req.params.itemId);
  res.json({ success: true });
});

// GET /:id/summary — Summary stats
router.get("/:id/summary", (req: Request<{ id: string }>, res: Response) => {
  const plan = getPlanDetail(req.params.id);
  if (!plan) { res.status(404).json({ error: "Plan not found" }); return; }
  if (!checkOwner(req, plan.created_by)) { res.status(403).json({ error: "Not authorized" }); return; }

  const records = new Map<string, ReviewRecord>();
  for (const item of plan.items) {
    if (item.review_id) {
      const record = findReviewById(item.review_id);
      if (record) records.set(item.review_id, record);
    }
  }
  res.json(computePlanSummary(plan, records));
});

// GET /:id/export — Export Markdown
router.get("/:id/export", (req: Request<{ id: string }>, res: Response) => {
  const plan = getPlanDetail(req.params.id);
  if (!plan) { res.status(404).json({ error: "Plan not found" }); return; }
  if (!checkOwner(req, plan.created_by)) { res.status(403).json({ error: "Not authorized" }); return; }

  try {
    const records = new Map<string, ReviewRecord>();
    for (const item of plan.items) {
      if (item.review_id) {
        const record = findReviewById(item.review_id);
        if (record) records.set(item.review_id, record);
      }
    }
    const md = exportPlanMarkdown(plan, records);
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${plan.title.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, "_")}.md"`);
    res.send(md);
  } catch (err) {
    console.error("Export error:", err);
    res.status(500).json({ error: "Export failed" });
  }
});

// POST /:id/start — Batch review (SSE)
router.post("/:id/start", async (req: Request<{ id: string }>, res: Response) => {
  const plan = getPlanDetail(req.params.id);
  if (!plan) { res.status(404).json({ error: "Plan not found" }); return; }
  if (!checkOwner(req, plan.created_by)) { res.status(403).json({ error: "Not authorized" }); return; }
  if (plan.status === "archived") { res.status(400).json({ error: "Plan is archived" }); return; }

  const llmConfig = getLLMConfig();
  if (!llmConfig.apiKey) { res.status(500).json({ error: "LLM API key not configured" }); return; }

  const gitlabToken = req.body.gitlabToken || process.env.GITLAB_TOKEN;
  if (!gitlabToken) { res.status(400).json({ error: "GitLab token required" }); return; }

  const pendingItems = plan.items.filter((i) => i.status === "pending");
  if (pendingItems.length === 0) { res.json({ message: "No pending items" }); return; }

  updatePlan(plan.id, { status: "reviewing" });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  const sendSSE = (event: Record<string, unknown>) => { res.write(`data: ${JSON.stringify(event)}\n\n`); };
  const userId = (req as Request & { user?: { id: string } }).user?.id || "";
  let step = 0;
  let aborted = false;
  res.on("close", () => { aborted = true; });

  try {
  for (let mi = 0; mi < pendingItems.length; mi++) {
    if (aborted) { break; }
    const item = pendingItems[mi];
    updatePlanItem(plan.id, item.id, { status: "reviewing" });
    step++;
    sendSSE({ step, status: "running", label: `Reviewing MR ${mi + 1}/${pendingItems.length}`, detail: item.mr_url.split("/").slice(-2).join("/") });

    try {
      const parsed = parseMRUrl(item.mr_url);
      console.log(`[Plan ${plan.id}] MR ${mi + 1}: parsed host=${parsed.host} project=${parsed.projectPath} iid=${parsed.iid}`);
      const [mr, diffs] = await Promise.all([
        fetchMRMeta(parsed.host, parsed.projectPath, parsed.iid, gitlabToken),
        fetchMRDiffs(parsed.host, parsed.projectPath, parsed.iid, gitlabToken),
      ]);
      console.log(`[Plan ${plan.id}] MR ${mi + 1}: fetched ${diffs.length} diffs`);

      const project = parsed.projectPath.split("/").pop() || parsed.projectPath;
      const { summary: classification, batchDiffs } = classify(diffs);
      console.log(`[Plan ${plan.id}] MR ${mi + 1}: classified ${classification.stats.total} files, ${batchDiffs.length} batches, aborted=${aborted}`);

      const batchLevels = classification.batches.map((b) => b.level);
      const requirement = await understandRequirement(mr, diffs);
      const knowledge = getKnowledgeForReview(project, requirement.module);
      const reqPrompt = requirement ? buildRequirementPrompt(requirement) : "";
      const knowledgePrompt = knowledge.length > 0 ? buildKnowledgePrompt(knowledge) : "";
      const userPromptPrefix = getReviewUserPrompt();

      const reviewId = `R-${randomUUID().slice(0, 8)}`;
      const batchReports = [];

      for (let i = 0; i < batchDiffs.length; i++) {
        if (aborted) { console.log(`[Plan ${plan.id}] MR ${mi + 1} batch ${i}: ABORTED, skipping LLM`); break; }
        const diffText = batchDiffs[i].map((d: { old_path: string; new_path: string; diff: string }) => `--- ${d.old_path}\n+++ ${d.new_path}\n${d.diff}`).join("\n\n");
        const systemPrompt = getReviewPrompt({ dimensions: REVIEW_DIMENSIONS, batchIndex: i, totalBatches: batchDiffs.length, riskLevel: batchLevels[i], requirement: reqPrompt, knowledge: knowledgePrompt });
        const userMessage = `${userPromptPrefix}${diffText}`;
        const startTime = Date.now();
        const result = await callLLM(systemPrompt, userMessage, llmConfig);

        batchReports.push(parseReviewResponse(result.text));
        saveLLMLog({ id: `LOG-${randomUUID().slice(0, 8)}`, review_id: reviewId, batch_index: i, risk_level: batchLevels[i], system_prompt: systemPrompt, user_message: userMessage, response_text: result.text, duration_ms: Date.now() - startTime, input_tokens: result.usage?.inputTokens ?? null, output_tokens: result.usage?.outputTokens ?? null, provider: llmConfig.provider, model: llmConfig.model });
      }

      console.log(`[Plan ${plan.id}] MR ${mi + 1}: batchReports=${batchReports.length}, batchDiffs=${batchDiffs.length}, aborted=${aborted}`);
      const report = batchDiffs.length > 0 && batchReports.length > 0
        ? mergeReports(batchReports)
        : null;

      if (!report) {
        // No batches reviewed (aborted or empty diff) — skip saving
        const reason = batchDiffs.length === 0 ? "empty diff" : aborted ? "client disconnected" : "unknown";
        console.log(`[Plan ${plan.id}] MR ${mi + 1}: no report, reason=${reason}`);
        updatePlanItem(plan.id, item.id, { status: "failed" });
        sendSSE({ step, status: "error", label: `MR ${mi + 1} failed: ${reason}` });
      } else {
        const stats = computeReviewStats(report);

        saveReviewRecord({ id: reviewId, mr_url: item.mr_url, project, author: mr.author?.name || null, status: "completed", report_json: JSON.stringify(report), classification_json: JSON.stringify(classification), requirement_json: JSON.stringify({ type: requirement.type, module: requirement.module, features: requirement.features, conflicts: requirement.conflicts, source: requirement.source }), mr_meta_json: JSON.stringify(mr), reviewed_commit_sha: null, passed: report.passed, avg_score: stats.avgScore, issue_count: stats.issueCount, critical_count: stats.criticalCount, created_by: userId });
        extractLearnings(report, project, reviewId);
        updatePlanItem(plan.id, item.id, { status: "completed", review_id: reviewId });

        sendSSE({ step, status: "done", label: "", detail: `MR ${mi + 1}/${pendingItems.length} completed: ${stats.avgScore?.toFixed(1) ?? "—"} score, ${stats.issueCount} issues`, currentMR: mi + 1, totalMRs: pendingItems.length });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Review failed";
      updatePlanItem(plan.id, item.id, { status: "failed" });
      sendSSE({ step, status: "error", label: `MR ${mi + 1} failed: ${msg.slice(0, 100)}` });
    }
  }

  if (!aborted) {
    sendSSE({ step: step + 1, status: "done", label: "COMPLETE" });
  }
  } finally {
    updatePlan(plan.id, { status: "open" });
    if (!res.writableEnded) { res.end(); }
  }
});

export default router;
