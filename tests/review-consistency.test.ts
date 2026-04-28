import { describe, it, expect } from "vitest";
import { computeReviewConsistency, parseReviewResponse } from "../src/server/services/reviewer";
import { ReviewReport } from "../src/shared/types";

describe("computeReviewConsistency", () => {
  it("returns perfect consistency for identical reports", () => {
    const report: ReviewReport = {
      contractTitle: "Test",
      timestamp: "2026-04-28",
      passed: true,
      scores: [
        { dimension: "代码可读性", score: 4, comment: "OK" },
        { dimension: "测试覆盖率", score: 3, comment: "OK" },
        { dimension: "函数长度", score: 5, comment: "OK" },
      ],
      issues: [
        { severity: "HIGH", message: "Missing error handling", file: "api.ts", line: 10 },
      ],
      summary: "Good",
    };

    const result = computeReviewConsistency([report, report, report]);
    expect(result.overall).toBe(1);
    expect(result.rankCorrelation).toBe(1);
    expect(result.issueOverlap).toBe(1);
    expect(result.scoreVariance).toBe(0);
  });

  it("returns lower consistency for divergent scores", () => {
    const report1: ReviewReport = {
      contractTitle: "Test",
      timestamp: "2026-04-28",
      passed: true,
      scores: [
        { dimension: "代码可读性", score: 5, comment: "" },
        { dimension: "测试覆盖率", score: 5, comment: "" },
        { dimension: "函数长度", score: 5, comment: "" },
      ],
      issues: [],
      summary: "",
    };
    const report2: ReviewReport = {
      contractTitle: "Test",
      timestamp: "2026-04-28",
      passed: false,
      scores: [
        { dimension: "代码可读性", score: 1, comment: "" },
        { dimension: "测试覆盖率", score: 1, comment: "" },
        { dimension: "函数长度", score: 1, comment: "" },
      ],
      issues: [{ severity: "CRITICAL", message: "Bad", file: "a.ts" }],
      summary: "",
    };

    const result = computeReviewConsistency([report1, report2]);
    expect(result.overall).toBeLessThan(0.5);
    expect(result.scoreVariance).toBeGreaterThan(1);
  });

  it("measures issue overlap with Jaccard similarity", () => {
    const report1: ReviewReport = {
      contractTitle: "Test",
      timestamp: "2026-04-28",
      passed: false,
      scores: [
        { dimension: "代码可读性", score: 3, comment: "" },
      ],
      issues: [
        { severity: "HIGH", message: "Issue A", file: "a.ts" },
        { severity: "MEDIUM", message: "Issue B", file: "b.ts" },
      ],
      summary: "",
    };
    const report2: ReviewReport = {
      contractTitle: "Test",
      timestamp: "2026-04-28",
      passed: false,
      scores: [
        { dimension: "代码可读性", score: 3, comment: "" },
      ],
      issues: [
        { severity: "HIGH", message: "Issue A", file: "a.ts" },
        { severity: "CRITICAL", message: "Issue C", file: "c.ts" },
      ],
      summary: "",
    };

    const result = computeReviewConsistency([report1, report2]);
    // 1 overlapping issue out of 3 unique = 0.33
    expect(result.issueOverlap).toBeCloseTo(1 / 3, 2);
  });

  it("returns perfect consistency for single report", () => {
    const report: ReviewReport = {
      contractTitle: "Test",
      timestamp: "2026-04-28",
      passed: true,
      scores: [{ dimension: "代码可读性", score: 3, comment: "" }],
      issues: [],
      summary: "",
    };

    const result = computeReviewConsistency([report]);
    expect(result.overall).toBe(1);
  });

  it("baseline: 3 reviews of same MR should have >85% consistency", () => {
    // Simulated 3 reviews of the same MR with minor variations
    const baseScores = [
      { dimension: "代码可读性", score: 4 },
      { dimension: "测试覆盖率", score: 3 },
      { dimension: "函数长度", score: 5 },
      { dimension: "错误处理", score: 4 },
      { dimension: "输入验证", score: 3 },
    ];

    const reports: ReviewReport[] = [
      {
        contractTitle: "Test",
        timestamp: "2026-04-28",
        passed: true,
        scores: baseScores.map((s) => ({ ...s, comment: "" })),
        issues: [
          { severity: "HIGH", message: "Missing null check", file: "service.ts" },
        ],
        summary: "Good",
      },
      {
        contractTitle: "Test",
        timestamp: "2026-04-28",
        passed: true,
        scores: baseScores.map((s) => ({ dimension: s.dimension, score: s.score + (Math.random() > 0.5 ? 0 : 0), comment: "" })),
        issues: [
          { severity: "HIGH", message: "Missing null check", file: "service.ts" },
          { severity: "MEDIUM", message: "Long function", file: "utils.ts" },
        ],
        summary: "Good",
      },
      {
        contractTitle: "Test",
        timestamp: "2026-04-28",
        passed: true,
        scores: baseScores.map((s) => ({ dimension: s.dimension, score: s.score, comment: "" })),
        issues: [
          { severity: "HIGH", message: "Missing null check", file: "service.ts" },
        ],
        summary: "Good",
      },
    ];

    const result = computeReviewConsistency(reports);
    expect(result.overall).toBeGreaterThan(0.85);
  });
});
