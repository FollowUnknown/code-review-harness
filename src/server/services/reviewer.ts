import Anthropic from "@anthropic-ai/sdk";
import { GitLabDiff, ReviewReport, ReviewScore, ReviewIssue } from "../../shared/types";
import { REVIEW_DIMENSIONS, PASS_THRESHOLD } from "../../shared/constants";

function createClient(env: { authToken: string; baseUrl: string }): Anthropic {
  return new Anthropic({
    apiKey: env.authToken,
    baseURL: env.baseUrl,
  });
}

const SYSTEM_PROMPT = `你是一个专业的代码评审专家。你需要对提供的代码变更进行评审，并按照指定维度打分。

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
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `请评审以下代码变更：\n\n${diffText}`,
      },
    ],
  });

  const text =
    response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("") ?? "";

  return parseReviewResponse(text);
}

export function parseReviewResponse(text: string): ReviewReport {
  // Extract JSON from response (may have markdown wrapping)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      contractTitle: "Review",
      timestamp: new Date().toISOString(),
      passed: false,
      scores: REVIEW_DIMENSIONS.map((d) => ({ dimension: d, score: 3, comment: "无法解析评分" })),
      issues: [{ severity: "HIGH", message: "AI 返回格式异常，无法解析评审结果", file: "" }],
      summary: "评审结果解析失败",
    };
  }

  const parsed = JSON.parse(jsonMatch[0]);
  const scores: ReviewScore[] = parsed.scores || [];
  const issues: ReviewIssue[] = parsed.issues || [];

  const passed =
    scores.every((s) => s.score >= PASS_THRESHOLD.minAllScores) &&
    scores.filter((s) => s.dimension.includes("输入验证") || s.dimension.includes("密钥"))
      .every((s) => s.score >= PASS_THRESHOLD.minSecurityScore) &&
    issues.filter((i) => i.severity === "CRITICAL").length <= PASS_THRESHOLD.maxCriticalIssues &&
    issues.filter((i) => i.severity === "HIGH").length <= PASS_THRESHOLD.maxHighIssues;

  return {
    contractTitle: "Code Review",
    timestamp: new Date().toISOString(),
    passed,
    scores,
    issues,
    summary: parsed.summary || "",
  };
}
