import { describe, it, expect } from "vitest";
import { estimateTokens, truncateRelatedFiles, type RelatedFileWithContext } from "../src/server/services/local-scan/token-budget";

describe("token-budget", () => {
  it("estimateTokens approximates token count", () => {
    expect(estimateTokens("hello world")).toBe(3);
    expect(estimateTokens("a")).toBe(1);
    expect(estimateTokens("")).toBe(0);
  });

  it("truncateRelatedFiles respects file count limit", () => {
    const files: RelatedFileWithContext[] = Array(15)
      .fill(null)
      .map((_, i) => ({
        path: `file${i}.ts`,
        category: "business" as const,
        relevance: 0.8,
        reason: "test",
        content: "const x = 1;",
      }));

    const result = truncateRelatedFiles(files, { maxFiles: 10, tokenBudget: 100000 });
    expect(result.accepted.length).toBe(10);
    expect(result.rejected.length).toBe(5);
  });

  it("truncateRelatedFiles respects token budget", () => {
    const files: RelatedFileWithContext[] = [
      { path: "a.ts", category: "business", relevance: 0.8, reason: "test", content: "x".repeat(12000) },
      { path: "b.ts", category: "business", relevance: 0.6, reason: "test", content: "y".repeat(12000) },
    ];

    const result = truncateRelatedFiles(files, { maxFiles: 10, tokenBudget: 3000 });
    expect(result.accepted.length).toBe(1);
    expect(result.rejected.length).toBe(1);
  });

  it("truncateRelatedFiles sorts by relevance", () => {
    const files: RelatedFileWithContext[] = [
      { path: "low.ts", category: "utility", relevance: 0.3, reason: "low", content: "const x = 1;" },
      { path: "high.ts", category: "business", relevance: 0.9, reason: "high", content: "const y = 2;" },
    ];

    const result = truncateRelatedFiles(files, { maxFiles: 1, tokenBudget: 100000 });
    expect(result.accepted[0].path).toBe("high.ts");
  });

  it("handles empty input", () => {
    const result = truncateRelatedFiles([], { maxFiles: 10, tokenBudget: 1000 });
    expect(result.accepted).toEqual([]);
    expect(result.rejected).toEqual([]);
    expect(result.totalTokensUsed).toBe(0);
  });
});
