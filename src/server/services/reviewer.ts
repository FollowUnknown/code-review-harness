import Anthropic from "@anthropic-ai/sdk";
import { GitLabDiff, ReviewReport, ReviewScore, ReviewIssue, RiskLevel } from "../../shared/types";
import { REVIEW_DIMENSIONS, PASS_THRESHOLD } from "../../shared/constants";
import { RequirementUnderstanding, buildRequirementPrompt } from "./requirement";
import { KnowledgeEntry, buildKnowledgePrompt } from "./knowledge";

function createClient(env: { authToken: string; baseUrl: string }): Anthropic {
  return new Anthropic({
    apiKey: env.authToken,
    baseURL: env.baseUrl,
  });
}

const BASE_SYSTEM_PROMPT = `你是一个专业的代码评审专家。你需要对提供的代码变更进行评审，并按照指定维度打分。

评分维度（每项 1-5 分）：
${REVIEW_DIMENSIONS.map((d, i) => `${i + 1}. ${d}`).join("\n")}

请严格按照以下 JSON 格式输出评审结果，不要输出其他内容：
{
  "scores": [
    {"dimension": "维度名", "score": 1-5, "comment": "具体说明"}
  ],
  "issues": [
    {"severity": "CRITICAL/HIGH/MEDIUM/LOW", "message": "问题描述", "file": "文件名", "line": 行号, "suggestion": "修复建议"}
  ],
  "summary": "1-2段总结"
}`;

function buildBatchPrompt(level: RiskLevel, batchIndex: number, totalBatches: number): string {
  const levelDesc: Record<RiskLevel, string> = {
    S: "高风险（S级）",
    A: "中高风险（A级）",
    B: "中低风险（B级）",
    C: "低风险（C级）",
  };
  return `${BASE_SYSTEM_PROMPT}

当前评审批次：第 ${batchIndex + 1}/${totalBatches} 批，风险等级：${levelDesc[level]}。
${level === "S" ? "这是高风险变更，请特别关注安全、业务逻辑正确性和边界情况。" : ""}
${level === "A" ? "这是中高风险变更，请重点关注核心逻辑和 API 接口的正确性。" : ""}`;
}

export async function reviewDiffs(
  diffs: GitLabDiff[],
  env: { authToken: string; baseUrl: string; model: string }
): Promise<ReviewReport> {
  const client = createClient(env);
  const diffText = diffs
    .map((d) => `--- ${d.old_path}\n+++ ${d.new_path}\n${d.diff}`)
    .join("\n\n");

  const response = await client.messages.create({
    model: env.model,
    max_tokens: 4096,
    system: BASE_SYSTEM_PROMPT,
    messages: [{ role: "user", content: `请评审以下代码变更：\n\n${diffText}` }],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  return parseReviewResponse(text);
}

export async function reviewBatches(
  batchDiffs: GitLabDiff[][],
  batchLevels: RiskLevel[],
  env: { authToken: string; baseUrl: string; model: string },
  requirement?: RequirementUnderstanding,
  knowledgeEntries?: KnowledgeEntry[]
): Promise<ReviewReport> {
  const client = createClient(env);
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

    const systemPrompt = buildBatchPrompt(level, i, totalBatches) + reqPrompt + knowledgePrompt;

    const response = await client.messages.create({
      model: env.model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: `请评审以下代码变更：\n\n${diffText}` }],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    batchReports.push(parseReviewResponse(text));
  }

  return mergeReports(batchReports);
}

function mergeReports(reports: ReviewReport[]): ReviewReport {
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
