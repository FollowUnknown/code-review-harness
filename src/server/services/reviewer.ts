import { GitLabDiff, ReviewReport, ReviewScore, ReviewIssue, RiskLevel, LLMConfig } from "../../shared/types";
import { REVIEW_DIMENSIONS, PASS_THRESHOLD } from "../../shared/constants";
import { RequirementUnderstanding, buildRequirementPrompt } from "./requirement";
import { KnowledgeEntry, buildKnowledgePrompt } from "./knowledge";
import { callLLM } from "../llm";
import { getReviewPrompt, getReviewUserPrompt } from "../llm/prompts/review";

export async function reviewBatches(
  batchDiffs: GitLabDiff[][],
  batchLevels: RiskLevel[],
  llmConfig: LLMConfig,
  requirement?: RequirementUnderstanding,
  knowledgeEntries?: KnowledgeEntry[]
): Promise<ReviewReport> {
  const totalBatches = batchDiffs.length;
  const batchReports: ReviewReport[] = [];

  const reqPrompt = requirement ? buildRequirementPrompt(requirement) : "";
  const knowledgePrompt = knowledgeEntries && knowledgeEntries.length > 0
    ? buildKnowledgePrompt(knowledgeEntries)
    : "";

  for (let i = 0; i < batchDiffs.length; i++) {
    const diffs = batchDiffs[i];
    const level = batchLevels[i];
    const diffText = diffs
      .map((d) => `--- ${d.old_path}\n+++ ${d.new_path}\n${d.diff}`)
      .join("\n\n");

    const systemPrompt = getReviewPrompt({
      dimensions: REVIEW_DIMENSIONS,
      batchIndex: i,
      totalBatches,
      riskLevel: level,
      requirement: reqPrompt,
      knowledge: knowledgePrompt,
    });

    const result = await callLLM(systemPrompt, `${getReviewUserPrompt()}${diffText}`, llmConfig);
    batchReports.push(parseReviewResponse(result.text));
  }

  return mergeReports(batchReports);
}

export function mergeReports(reports: ReviewReport[]): ReviewReport {
  if (reports.length === 0) {
    return {
      contractTitle: "Code Review",
      timestamp: new Date().toISOString(),
      passed: false,
      scores: REVIEW_DIMENSIONS.map((d) => ({ dimension: d, score: 3, comment: "无评审结果" })),
      issues: [],
      summary: "无评审批次",
    };
  }

  if (reports.length === 1) return reports[0];

  // Merge scores: average per dimension
  const dimensionScores = new Map<string, { total: number; count: number; comments: string[] }>();
  for (const report of reports) {
    for (const s of report.scores) {
      const existing = dimensionScores.get(s.dimension) || { total: 0, count: 0, comments: [] };
      dimensionScores.set(s.dimension, {
        total: existing.total + s.score,
        count: existing.count + 1,
        comments: [...existing.comments, s.comment],
      });
    }
  }

  const scores: ReviewScore[] = REVIEW_DIMENSIONS.map((dim) => {
    const entry = dimensionScores.get(dim);
    const avg = entry ? Math.round(entry.total / entry.count) : 3;
    const comment = entry?.comments.join("; ") || "未评分";
    return { dimension: dim, score: avg, comment };
  });

  // Merge issues: concatenate
  const issues: ReviewIssue[] = reports.flatMap((r) => r.issues);

  // Recompute passed
  const passed =
    scores.every((s) => s.score >= PASS_THRESHOLD.minAllScores) &&
    scores
      .filter((s) => s.dimension.includes("输入验证") || s.dimension.includes("密钥"))
      .every((s) => s.score >= PASS_THRESHOLD.minSecurityScore) &&
    issues.filter((i) => i.severity === "CRITICAL").length <= PASS_THRESHOLD.maxCriticalIssues &&
    issues.filter((i) => i.severity === "HIGH").length <= PASS_THRESHOLD.maxHighIssues;

  return {
    contractTitle: "Code Review",
    timestamp: new Date().toISOString(),
    passed,
    scores,
    issues,
    summary: reports.map((r) => r.summary).join("\n\n"),
  };
}

export function parseReviewResponse(text: string): ReviewReport {
  const fallbackReport = (): ReviewReport => ({
    contractTitle: "Review",
    timestamp: new Date().toISOString(),
    passed: false,
    scores: REVIEW_DIMENSIONS.map((d) => ({ dimension: d, score: 3, comment: "无法解析评分" })),
    issues: [{ severity: "HIGH", message: "AI 返回格式异常，无法解析评审结果", file: "" }],
    summary: "评审结果解析失败",
  });

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return fallbackReport();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    return fallbackReport();
  }

  const scores: ReviewScore[] = (parsed.scores as ReviewScore[]) || [];
  const issues: ReviewIssue[] = (parsed.issues as ReviewIssue[]) || [];

  const passed =
    scores.every((s) => s.score >= PASS_THRESHOLD.minAllScores) &&
    scores
      .filter((s) => s.dimension.includes("输入验证") || s.dimension.includes("密钥"))
      .every((s) => s.score >= PASS_THRESHOLD.minSecurityScore) &&
    issues.filter((i) => i.severity === "CRITICAL").length <= PASS_THRESHOLD.maxCriticalIssues &&
    issues.filter((i) => i.severity === "HIGH").length <= PASS_THRESHOLD.maxHighIssues;

  return {
    contractTitle: "Code Review",
    timestamp: new Date().toISOString(),
    passed,
    scores,
    issues,
    summary: (parsed.summary as string) || "",
  };
}
