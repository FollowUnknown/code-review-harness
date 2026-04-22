import { describe, it, expect } from "vitest";
import { parseReviewResponse } from "../src/server/services/reviewer.js";

describe("parseReviewResponse", () => {
  it("parses valid JSON response", () => {
    const input = JSON.stringify({
      scores: [
        { dimension: "Contract 完成度", score: 4, comment: "大部分满足" },
        { dimension: "测试覆盖率", score: 3, comment: "70%" },
      ],
      issues: [
        { severity: "HIGH", message: "函数过长", file: "app.ts", line: 42, suggestion: "拆分函数" },
      ],
      summary: "代码基本合格",
    });

    const result = parseReviewResponse(input);
    expect(result.passed).toBe(true); // scores >= 3, only 1 HIGH (≤ 2 allowed)
    expect(result.scores).toHaveLength(2);
    expect(result.issues).toHaveLength(1);
    expect(result.summary).toBe("代码基本合格");
  });

  it("handles markdown-wrapped JSON", () => {
    const input = "```json\n" + JSON.stringify({
      scores: [{ dimension: "测试", score: 5, comment: "全覆盖" }],
      issues: [],
      summary: "完美",
    }) + "\n```";

    const result = parseReviewResponse(input);
    expect(result.scores).toHaveLength(1);
    expect(result.scores[0].score).toBe(5);
  });

  it("handles unparseable response", () => {
    const result = parseReviewResponse("This is not JSON at all");
    expect(result.passed).toBe(false);
    expect(result.issues[0].severity).toBe("HIGH");
  });

  it("detects fail when CRITICAL issue present", () => {
    const input = JSON.stringify({
      scores: [
        { dimension: "Contract 完成度", score: 5, comment: "OK" },
        { dimension: "测试覆盖率", score: 5, comment: "OK" },
        { dimension: "TDD 合规", score: 5, comment: "OK" },
        { dimension: "函数长度", score: 5, comment: "OK" },
        { dimension: "文件长度", score: 5, comment: "OK" },
        { dimension: "嵌套深度", score: 5, comment: "OK" },
        { dimension: "输入验证", score: 5, comment: "OK" },
        { dimension: "密钥管理", score: 5, comment: "OK" },
      ],
      issues: [
        { severity: "CRITICAL", message: "硬编码密钥", file: "config.ts", line: 10 },
      ],
      summary: "有严重问题",
    });

    const result = parseReviewResponse(input);
    expect(result.passed).toBe(false);
  });
});
