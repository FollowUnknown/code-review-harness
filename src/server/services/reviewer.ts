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
  if (!jsonMatch) {
    return fallbackReport();
  }

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

// ---- Review Consistency ----

export interface ConsistencyResult {
  scoreVariance: number;      // Average variance of dimension scores across reviews
  rankCorrelation: number;    // Spearman-like rank correlation (0-1)
  issueOverlap: number;       // Jaccard similarity of issue sets
  overall: number;            // Weighted average consistency score (0-1)
}

function rankScores(scores: ReviewScore[]): number[] {
  const sorted = [...scores].sort((a, b) => b.score - a.score);
  const ranks = new Map<string, number>();
  sorted.forEach((s, i) => ranks.set(s.dimension, i + 1));
  return scores.map((s) => ranks.get(s.dimension) || 0);
}

function computeRankCorrelation(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  const n = a.length;
  const meanA = a.reduce((sum, v) => sum + v, 0) / n;
  const meanB = b.reduce((sum, v) => sum + v, 0) / n;

  let num = 0;
  let denA = 0;
  let denB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }
  const denom = Math.sqrt(denA * denB);
  return denom === 0 ? 1 : num / denom;
}

function issueFingerprint(issue: ReviewIssue): string {
  return `${issue.severity}|${issue.file}|${issue.message.slice(0, 50)}`;
}

function computeIssueOverlap(a: ReviewIssue[], b: ReviewIssue[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const setA = new Set(a.map(issueFingerprint));
  const setB = new Set(b.map(issueFingerprint));
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}

export function computeReviewConsistency(reports: ReviewReport[]): ConsistencyResult {
  if (reports.length < 2) {
    return { scoreVariance: 0, rankCorrelation: 1, issueOverlap: 1, overall: 1 };
  }

  // Score variance: average variance per dimension across reviews
  const dimensionScores = new Map<string, number[]>();
  for (const report of reports) {
    for (const s of report.scores) {
      const arr = dimensionScores.get(s.dimension) || [];
      arr.push(s.score);
      dimensionScores.set(s.dimension, arr);
    }
  }

  let totalVariance = 0;
  let dimensionCount = 0;
  for (const scores of dimensionScores.values()) {
    if (scores.length >= 2) {
      const mean = scores.reduce((sum, v) => sum + v, 0) / scores.length;
      const variance = scores.reduce((sum, v) => sum + (v - mean) ** 2, 0) / scores.length;
      totalVariance += variance;
      dimensionCount++;
    }
  }
  const avgVariance = dimensionCount > 0 ? totalVariance / dimensionCount : 0;
  // Convert variance (0=perfect, 4=worst) to 0-1 score
  const scoreVarianceScore = Math.max(0, 1 - avgVariance / 4);

  // Rank correlation: average pairwise correlation between reports
  let totalRankCorr = 0;
  let pairCount = 0;
  for (let i = 0; i < reports.length; i++) {
    for (let j = i + 1; j < reports.length; j++) {
      const ranksI = rankScores(reports[i].scores);
      const ranksJ = rankScores(reports[j].scores);
      totalRankCorr += computeRankCorrelation(ranksI, ranksJ);
      pairCount++;
    }
  }
  const rankCorrelation = pairCount > 0 ? totalRankCorr / pairCount : 1;

  // Issue overlap: average pairwise Jaccard similarity
  let totalOverlap = 0;
  pairCount = 0;
  for (let i = 0; i < reports.length; i++) {
    for (let j = i + 1; j < reports.length; j++) {
      totalOverlap += computeIssueOverlap(reports[i].issues, reports[j].issues);
      pairCount++;
    }
  }
  const issueOverlap = pairCount > 0 ? totalOverlap / pairCount : 1;

  // Overall: weighted average
  const overall = scoreVarianceScore * 0.4 + rankCorrelation * 0.35 + issueOverlap * 0.25;

  return {
    scoreVariance: avgVariance,
    rankCorrelation,
    issueOverlap,
    overall,
  };
}
