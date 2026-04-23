import { REVIEW_DIMENSIONS } from "../../../shared/constants";
import { RiskLevel } from "../../../shared/types";

// Risk level descriptions for prompt context
export const LEVEL_DESCRIPTIONS: Record<RiskLevel, string> = {
  S: "高风险（S级）",
  A: "中高风险（A级）",
  B: "中低风险（B级）",
  C: "低风险（C级）",
};

// Default review system prompt (code fallback when no DB override exists)
export const DEFAULT_REVIEW_SYSTEM_PROMPT = `你是一个专业的代码评审专家。你需要对提供的代码变更进行评审，并按照指定维度打分。

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

export interface ReviewPromptContext {
  dimensions: readonly string[];
  batchIndex: number;
  totalBatches: number;
  riskLevel: RiskLevel;
  requirement?: string;
  knowledge?: string;
}

export function buildDefaultReviewPrompt(ctx: ReviewPromptContext): string {
  const levelDesc = LEVEL_DESCRIPTIONS[ctx.riskLevel];
  let prompt = `${DEFAULT_REVIEW_SYSTEM_PROMPT}\n\n当前评审批次：第 ${ctx.batchIndex + 1}/${ctx.totalBatches} 批，风险等级：${levelDesc}。`;

  if (ctx.riskLevel === "S") {
    prompt += "\n这是高风险变更，请特别关注安全、业务逻辑正确性和边界情况。";
  } else if (ctx.riskLevel === "A") {
    prompt += "\n这是中高风险变更，请重点关注核心逻辑和 API 接口的正确性。";
  }

  if (ctx.requirement) prompt += ctx.requirement;
  if (ctx.knowledge) prompt += ctx.knowledge;

  return prompt;
}

// Default user message template
export const DEFAULT_REVIEW_USER_PROMPT = `请评审以下代码变更：\n\n`;
