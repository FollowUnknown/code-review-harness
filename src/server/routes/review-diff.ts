import { Router, Request, Response } from "express";
import { randomUUID } from "crypto";
import { classify } from "../services/classifier";
import { parseReviewResponse, mergeReports } from "../services/reviewer";
import { callLLM, getLLMConfig } from "../llm";
import { getReviewPrompt, getReviewUserPrompt } from "../llm/prompts/review";
import { getDimensionsForProject } from "../services/dimensions";
import { saveReviewRecord, computeReviewStats } from "../services/review-store";
import { saveLLMLog } from "../services/llm-logger";
import { parseDiffToGitLabDiffs } from "../services/local-scan/git-diff";
import type { DiffReviewRequest } from "../../shared/types";

const router = Router();

router.post("/diff", async (req: Request, res: Response) => {
  const { project, diffText }: DiffReviewRequest = req.body;

  if (!diffText) {
    res.status(400).json({ error: "diffText is required" });
    return;
  }

  const llmConfig = getLLMConfig();
  if (!llmConfig.apiKey) {
    res.status(500).json({ error: "LLM API key not configured" });
    return;
  }

  try {
    const parsedDiffs = parseDiffToGitLabDiffs(diffText);

    // Filter excluded files (v1.3.5)
    const excludedFiles: string[] = req.body.excludedFiles || [];
    const diffs = excludedFiles.length > 0
      ? parsedDiffs.filter((d: { new_path: string }) => !excludedFiles.includes(d.new_path))
      : parsedDiffs;

    if (diffs.length === 0) {
      res.json({ success: true, data: { message: "No changes found in diff" } });
      return;
    }

    const { summary: classification, batchDiffs } = classify(diffs);
    const batchLevels = classification.batches.map((b) => b.level);
    const dimensions = getDimensionsForProject(project || "default");
    const reviewId = `R-${randomUUID().slice(0, 8)}`;

    const batchReports = [];
    for (let i = 0; i < batchDiffs.length; i++) {
      const diffContent = batchDiffs[i]
        .map((d: { old_path: string; new_path: string; diff: string }) => `--- ${d.old_path}\n+++ ${d.new_path}\n${d.diff}`)
        .join("\n\n");

      const systemPrompt = getReviewPrompt({
        dimensions,
        batchIndex: i,
        totalBatches: batchDiffs.length,
        riskLevel: batchLevels[i],
        requirement: "",
        knowledge: "",
      });

      const userMessage = `${getReviewUserPrompt()}${diffContent}`;
      const startTime = Date.now();
      const result = await callLLM(systemPrompt, userMessage, llmConfig);
      const durationMs = Date.now() - startTime;

      batchReports.push(parseReviewResponse(result.text));

      saveLLMLog({
        id: `LOG-${randomUUID().slice(0, 8)}`,
        review_id: reviewId,
        batch_index: i,
        risk_level: batchLevels[i],
        system_prompt: systemPrompt,
        user_message: userMessage,
        response_text: result.text,
        duration_ms: durationMs,
        input_tokens: result.usage?.inputTokens ?? null,
        output_tokens: result.usage?.outputTokens ?? null,
        provider: llmConfig.provider,
        model: llmConfig.model,
      });
    }

    const report = mergeReports(batchReports);
    const stats = computeReviewStats(report);

    saveReviewRecord({
      id: reviewId,
      mr_url: `diff://${reviewId}`,
      project: project || "diff-upload",
      author: null,
      status: "completed",
      report_json: JSON.stringify(report),
      classification_json: JSON.stringify(classification),
      requirement_json: null,
      mr_meta_json: JSON.stringify({ type: "diff-upload", fileCount: diffs.length }),
      reviewed_commit_sha: null,
      passed: report.passed,
      avg_score: stats.avgScore,
      issue_count: stats.issueCount,
      critical_count: stats.criticalCount,
      created_by: (req as Request & { user?: { id: string } }).user?.id || null,
    });

    res.json({ success: true, data: { reviewId, report, classification } });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Review failed",
    });
  }
});

export default router;
