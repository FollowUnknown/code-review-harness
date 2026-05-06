import { describe, it, expect } from "vitest";
import { parseReviewResponse, parseMarkdownReview } from "../src/server/services/reviewer.js";

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

  it("recovers JSON with unescaped quotes inside string values", () => {
    // Real-world case: LLM returns `get("id")` inside a JSON string
    const input = `\`\`\`json
{
  "scores": [
    { "dimension": "输入验证", "score": 3, "comment": "代码中使用了 \`aggsFormDataMap.get("id").toString()\` 和 \`Integer.parseInt(aggsFormDataMap.get("version").toString())\`，存在空指针风险" },
    { "dimension": "密钥管理", "score": 5, "comment": "无问题" }
  ],
  "issues": [
    { "severity": "MEDIUM", "message": "使用了 map.get(\\"id\\")", "file": "Test.java", "line": 10, "suggestion": "做空值判断" }
  ],
  "summary": "代码有改进空间"
}
\`\`\``;

    const result = parseReviewResponse(input);
    expect(result.scores).toHaveLength(2);
    expect(result.scores[0].dimension).toBe("输入验证");
    expect(result.scores[0].score).toBe(3);
    expect(result.issues).toHaveLength(1);
    expect(result.summary).toContain("改进空间");
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

describe("parseMarkdownReview", () => {
  const dims = ["Contract 完成度", "测试覆盖率", "函数长度", "输入验证", "密钥管理"];

  it("extracts scores from markdown format", () => {
    const md = `
## 评分
Contract 完成度：4 分
测试覆盖率：3 分
函数长度：5 分
输入验证：4 分
密钥管理：5 分

[HIGH] 函数 handleX 过长，建议拆分
`;
    const result = parseMarkdownReview(md, dims);
    expect(result.scores).toHaveLength(5);
    expect(result.scores.find((s) => s.dimension === "Contract 完成度")?.score).toBe(4);
  });

  it("matches dimensions by prefix when not exact", () => {
    const md = `
Contract：4 分
测试覆盖：3 分
`;
    const result = parseMarkdownReview(md, dims);
    expect(result.scores).toHaveLength(2);
    // "Contract" should match "Contract 完成度" via prefix
    expect(result.scores[0].dimension).toBe("Contract 完成度");
  });

  it("does not match arbitrary colons as dimensions", () => {
    const md = `
时间：2024-01-01
状态：完成
`;
    const result = parseMarkdownReview(md, dims);
    expect(result.scores).toHaveLength(0);
  });

  it("extracts issues with severity", () => {
    const md = `
[HIGH] 函数 handleX 超过 80 行
**[CRITICAL]** 硬编码 API key 在 config.ts
`;
    const result = parseMarkdownReview(md, dims);
    expect(result.issues).toHaveLength(2);
    expect(result.issues.find((i) => i.severity === "HIGH")).toBeDefined();
    expect(result.issues.find((i) => i.severity === "CRITICAL")).toBeDefined();
  });

  it("deduplicates dimension scores", () => {
    const md = `
Contract 完成度：4 分
Contract 完成度：3 分
`;
    const result = parseMarkdownReview(md, dims);
    expect(result.scores).toHaveLength(1);
    // First match wins
    expect(result.scores[0].score).toBe(4);
  });

  it("extracts summary from 总结 section", () => {
    const md = `
Contract 完成度：4 分
总结：
代码质量良好，建议补充测试。
`;
    const result = parseMarkdownReview(md, dims);
    expect(result.summary).toContain("代码质量良好");
  });

  it("returns empty scores for non-matching text", () => {
    const result = parseMarkdownReview("no review content here", dims);
    expect(result.scores).toHaveLength(0);
    expect(result.issues).toHaveLength(0);
    expect(result.passed).toBe(false);
  });
});
