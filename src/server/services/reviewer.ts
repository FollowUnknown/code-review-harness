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

/** Check if a dimension is security-sensitive and requires stricter scoring. */
function isSecurityDimension(dim: string): boolean {
  return dim.includes("输入验证") || dim.includes("密钥") || dim.includes("安全");
}

/** Compute whether a review passes based on scores and issues. */
function computePassed(scores: ReviewScore[], issues: ReviewIssue[]): boolean {
  return (
    scores.every((s) => s.score >= PASS_THRESHOLD.minAllScores) &&
    scores.filter((s) => isSecurityDimension(s.dimension)).every((s) => s.score >= PASS_THRESHOLD.minSecurityScore) &&
    issues.filter((i) => i.severity === "CRITICAL").length <= PASS_THRESHOLD.maxCriticalIssues &&
    issues.filter((i) => i.severity === "HIGH").length <= PASS_THRESHOLD.maxHighIssues
  );
}

export function mergeReports(reports: ReviewReport[], dimensions?: readonly string[]): ReviewReport {
  if (reports.length === 0) {
    const dims = dimensions ?? REVIEW_DIMENSIONS;
    return {
      contractTitle: "Code Review",
      timestamp: new Date().toISOString(),
      passed: false,
      scores: dims.map((d) => ({ dimension: d, score: 3, comment: "无评审结果" })),
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

  // Use dimensions from reports if not explicitly provided
  const dims = dimensions ?? [...dimensionScores.keys()];
  const scores: ReviewScore[] = dims.map((dim) => {
    const entry = dimensionScores.get(dim);
    const avg = entry ? Math.round(entry.total / entry.count) : 3;
    const comment = entry?.comments.join("; ") || "未评分";
    return { dimension: dim, score: avg, comment };
  });

  // Merge issues: concatenate
  const issues: ReviewIssue[] = reports.flatMap((r) => r.issues);

  const passed = computePassed(scores, issues);

  return {
    contractTitle: "Code Review",
    timestamp: new Date().toISOString(),
    passed,
    scores,
    issues,
    summary: reports.map((r) => r.summary).join("\n\n"),
  };
}

/**
 * Sanitize JSON text by escaping literal control characters inside string values.
 * LLMs sometimes emit literal \n, \t, etc. inside JSON strings instead of escaped versions.
 */
function sanitizeJsonString(text: string): string {
  let result = "";
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\\' && inString) {
      result += ch;
      if (i + 1 < text.length) result += text[++i];
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      result += ch;
      continue;
    }
    if (inString) {
      if (ch === '\n') { result += '\\n'; continue; }
      if (ch === '\r') { result += '\\r'; continue; }
      if (ch === '\t') { result += '\\t'; continue; }
      if (ch.charCodeAt(0) < 0x20) continue; // strip other control chars
    }
    result += ch;
  }
  return result;
}

/**
 * Close open strings and brace/bracket structures in truncated JSON.
 */
function closeOpenStructures(text: string): string {
  let inString = false;
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\\' && inString) { i++; continue; }
    if (ch === '"') inString = !inString;
    if (!inString) {
      if (ch === '{' || ch === '[') depth++;
      if (ch === '}' || ch === ']') depth--;
    }
  }
  let result = text;
  if (inString) result += '"';
  while (depth-- > 0) result += '}';
  return result;
}

export function parseReviewResponse(text: string, fallbackDimensions?: readonly string[]): ReviewReport {
  const fallbackDims = fallbackDimensions ?? REVIEW_DIMENSIONS;
  const fallbackReport = (): ReviewReport => ({
    contractTitle: "Review",
    timestamp: new Date().toISOString(),
    passed: false,
    scores: fallbackDims.map((d) => ({ dimension: d, score: 3, comment: "无法解析评分" })),
    issues: [{ severity: "HIGH", message: "AI 返回格式异常，无法解析评审结果", file: "" }],
    summary: "评审结果解析失败",
  });

  // Strip markdown code fences if present
  const stripped = text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();

  const jsonMatch = stripped.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      try {
        let recovered = sanitizeJsonString(jsonMatch[0]);
        try {
          parsed = JSON.parse(recovered);
        } catch {
          recovered = closeOpenStructures(recovered);
          parsed = JSON.parse(recovered);
        }
      } catch {
        // JSON parse failed — try markdown fallback below
        parsed = null as unknown as Record<string, unknown>;
      }
    }

    if (parsed) {
      const scores: ReviewScore[] = (parsed.scores as ReviewScore[]) || [];
      const issues: ReviewIssue[] = (parsed.issues as ReviewIssue[]) || [];

      if (scores.length > 0) {
        const passed = computePassed(scores, issues);

        return {
          contractTitle: "Code Review",
          timestamp: new Date().toISOString(),
          passed,
          scores,
          issues,
          summary: (parsed.summary as string) || "",
        };
      }
    }
  }

  // Fallback: parse markdown-formatted review when JSON is not available
  const mdReport = parseMarkdownReview(stripped, fallbackDims);
  if (mdReport.scores.length > 0 || mdReport.issues.length > 0) {
    return mdReport;
  }

  return fallbackReport();
}

/**
 * Parse a markdown-formatted LLM review response when JSON parsing fails.
 * Extracts scores from patterns like "维度名：N 分" or "维度名 - N/5",
 * and issues from patterns like "[CRITICAL] message" or "严重级别: HIGH".
 */
function parseMarkdownReview(text: string, dimensions: readonly string[]): ReviewReport {
  const scores: ReviewScore[] = [];
  const issues: ReviewIssue[] = [];

  // Extract scores: look for "维度名：N 分" or "维度名：N 分" or "维度名 - N"
  const allDims = [...dimensions];
  // Also try to find dimensions mentioned in the text that aren't in the provided list
  const dimScoreRegex = /(?:#{2,4}\s*\d+\.?\s*)?([^：:\n]{2,30})(?:：|:)\s*(\d)\s*分?/g;
  let match: RegExpExecArray | null;
  const seenDims = new Set<string>();

  while ((match = dimScoreRegex.exec(text)) !== null) {
    const dimName = match[1].trim();
    const score = parseInt(match[2], 10);
    if (score >= 1 && score <= 5 && dimName.length >= 2) {
      // Try to match against known dimensions
      const matched = allDims.find((d) =>
        d === dimName || d.includes(dimName) || dimName.includes(d)
      );
      const dimension = matched || dimName;
      if (!seenDims.has(dimension)) {
        seenDims.add(dimension);
        scores.push({ dimension, score, comment: "" });
      }
    }
  }

  // Extract issues: look for [CRITICAL/HIGH/MEDIUM/LOW] or **[CRITICAL]** patterns
  const issueRegex = /\*{0,2}\[(CRITICAL|HIGH|MEDIUM|LOW)\]\*{0,2}[:：]?\s*(.{5,200}?)(?=\n\n|\n\*{0,2}\[|$)/gi;
  while ((match = issueRegex.exec(text)) !== null) {
    const severity = match[1].toUpperCase() as ReviewIssue["severity"];
    const message = match[2].trim().replace(/\n/g, " ").replace(/\*{2}/g, "");
    if (message.length > 0) {
      // Try to extract file name
      const fileMatch = message.match(/(?:文件|File)[：:]\s*`?([^`\n,]+)`?/i);
      const suggestionMatch = message.match(/(?:修复建议|建议)[：:]\s*(.{10,100})/i);
      issues.push({
        severity,
        message: message.slice(0, 300),
        file: fileMatch?.[1]?.trim() || "",
        suggestion: suggestionMatch?.[1]?.trim() || "",
      });
    }
  }

  // Extract summary: first paragraph or section after "总体评价" or "总结"
  const summaryMatch = text.match(/(?:总体评价|总结|Summary)[：:]*\s*\n([\s\S]{20,300}?)(?=\n---|\n#{1,4}\s|$)/i);
  const summary = summaryMatch?.[1]?.trim() || text.slice(0, 200).trim();

  const passed = computePassed(scores, issues);

  return {
    contractTitle: "Code Review",
    timestamp: new Date().toISOString(),
    passed,
    scores,
    issues,
    summary,
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
