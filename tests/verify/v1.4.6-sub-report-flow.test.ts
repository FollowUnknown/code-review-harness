/**
 * v1.4.6 需求评审子报告 E2E 自动化验证脚本
 *
 * 运行方式: npx vitest run tests/verify/v1.4.6-sub-report-flow.test.ts
 *
 * 覆盖场景:
 *  - 评审开始 → 创建记录 (status: reviewing)
 *  - 多项目逐一批次创建 sub_report
 *  - sub_report 状态流转: pending → reviewing → completed/failed
 *  - 主记录 report_json 增量更新
 *  - 暂停 → status: paused (checkpoint 联动)
 *  - 完成 → status: completed
 *  - 列表页 enrichment (subReportStats)
 *  - 详情查询 sub-reports
 *  - checkpoint 关联查询
 *  - 异常路径: interrupted / failed
 *  - FK 级联删除
 *  - 旧数据兼容（无 sub_reports 时降级）
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { getDb, closeDb } from "../../src/server/db";
import {
  saveReviewRecord,
  findReviewById,
  listReviews,
  updateReview,
  deleteReview,
} from "../../src/server/services/review-store";
import {
  createSubReport,
  updateSubReport,
  listSubReports,
  findSubReportById,
  deleteSubReportsByReviewId,
} from "../../src/server/services/review-sub-report-store";
import {
  createCheckpoint,
  updateCheckpoint,
  listCheckpoints,
} from "../../src/server/services/review-checkpoint-store";

process.env.KNOWLEDGE_DB_PATH = ":memory:";

beforeEach(() => {
  closeDb();
  getDb();
});

afterEach(() => {
  closeDb();
});

function createRequirementReview(id: string, status: string, extra: Record<string, unknown> = {}) {
  saveReviewRecord({
    id,
    mr_url: `requirement://product-line-X/feature..main`,
    project: "product-line-X",
    product_line_id: "product-line-X",
    author: null,
    status: status as any,
    report_json: JSON.stringify({
      reviewId: id,
      productLine: "product-line-X",
      sourceBranch: "feature",
      targetBranch: "main",
      totalProjects: 3,
      totalFiles: 100,
      totalIssues: 0,
      criticalCount: 0,
      overallPassed: false,
      overallScore: 0,
      techStackReports: [],
    }),
    classification_json: null,
    requirement_json: null,
    mr_meta_json: JSON.stringify({ type: "requirement", productLine: "product-line-X" }),
    reviewed_commit_sha: null,
    passed: null,
    avg_score: null,
    issue_count: null,
    critical_count: 0,
    created_by: "user-v1.4.6",
    knowledge_dispositions_json: JSON.stringify([]),
    ...extra,
  });
}

function makeReport(overrides: Record<string, unknown> = {}) {
  return {
    contractTitle: "Code Review",
    timestamp: new Date().toISOString(),
    passed: true,
    scores: [{ dimension: "正确性", score: 4, comment: "ok" }],
    issues: [],
    summary: "LGTM",
    ...overrides,
  };
}

// ─── 验证 1: 完整生命周期（评审开始 → 逐项目完成 → 完成） ───

describe("V1: 完整生命周期 — 评审开始 → 逐项目完成 → 完成", () => {
  it("V1.1: 评审开始时立即创建 reviews 记录 (status: reviewing)", () => {
    createRequirementReview("R-LIFECYCLE-1", "reviewing");
    const found = findReviewById("R-LIFECYCLE-1");
    expect(found).not.toBeNull();
    expect(found!.status).toBe("reviewing");
    expect(found!.mr_url).toContain("requirement://");
    expect(found!.avg_score).toBeNull();
    expect(found!.issue_count).toBeNull();
  });

  it("V1.2: 逐项目创建 sub_report (pending → reviewing → completed)", () => {
    createRequirementReview("R-LIFECYCLE-2", "reviewing");

    // 项目 A
    const subA = createSubReport("R-LIFECYCLE-2", "project-a", "java-backend");
    updateSubReport(subA, { status: "reviewing" });
    expect(findSubReportById(subA)!.status).toBe("reviewing");

    const reportA = makeReport({ issues: [{ severity: "HIGH", message: "bug", file: "a.java" }] });
    updateSubReport(subA, { status: "completed", report_json: JSON.stringify(reportA), score: 4.0, issue_count: 1, critical_count: 0 });
    expect(findSubReportById(subA)!.status).toBe("completed");

    // 项目 B
    const subB = createSubReport("R-LIFECYCLE-2", "project-b", "vue-frontend");
    updateSubReport(subB, { status: "reviewing" });
    const reportB = makeReport({ passed: false, issues: [{ severity: "CRITICAL", message: "XSS", file: "b.vue" }] });
    updateSubReport(subB, { status: "completed", report_json: JSON.stringify(reportB), score: 2.0, issue_count: 1, critical_count: 1 });
    expect(findSubReportById(subB)!.status).toBe("completed");
    expect(findSubReportById(subB)!.critical_count).toBe(1);

    // 验证：listSubReports 返回全部
    const all = listSubReports("R-LIFECYCLE-2");
    expect(all).toHaveLength(2);
  });

  it("V1.3: 全部完成 → 主记录 status: completed", () => {
    createRequirementReview("R-LIFECYCLE-3", "reviewing");

    createSubReport("R-LIFECYCLE-3", "proj-a", "java-backend");
    createSubReport("R-LIFECYCLE-3", "proj-b", "vue-frontend");
    updateSubReport(1, { status: "completed", score: 4.5, issue_count: 2, report_json: JSON.stringify(makeReport()) });
    updateSubReport(2, { status: "completed", score: 3.5, issue_count: 1, report_json: JSON.stringify(makeReport()) });

    updateReview("R-LIFECYCLE-3", {
      status: "completed",
      avg_score: 4.0,
      issue_count: 3,
      passed: true,
      report_json: JSON.stringify({ totalIssues: 3, overallScore: 4.0, overallPassed: true }),
    });

    const found = findReviewById("R-LIFECYCLE-3");
    expect(found!.status).toBe("completed");
    expect(found!.avg_score).toBe(4.0);
    expect(found!.issue_count).toBe(3);
    expect(found!.passed).toBe(true);
  });
});

// ─── 验证 2: 暂停/中断流 ───

describe("V2: 暂停/中断流", () => {
  it("V2.1: 暂停时 status → paused（主记录 + checkpoint 联动）", () => {
    createRequirementReview("R-PAUSE-1", "reviewing");
    createSubReport("R-PAUSE-1", "proj-a", "java-backend");
    updateSubReport(1, { status: "completed" });

    const cp = createCheckpoint({
      reviewType: "requirement", projectId: "product-line-X",
      sourceBranch: "feature", targetBranch: "main",
      totalBatches: 5, totalFiles: 50, currentBatch: 2, reviewedCount: 20,
    });

    // 暂停：主记录 + checkpoint 同时更新
    updateReview("R-PAUSE-1", { status: "paused" });
    updateCheckpoint(cp.id, { status: "paused", accumulatedStats: JSON.stringify({ reviewId: "R-PAUSE-1" }) });

    const found = findReviewById("R-PAUSE-1");
    expect(found!.status).toBe("paused");

    const cps = listCheckpoints({ reviewType: "requirement" });
    const pausedCp = cps.find((c) => c.id === cp.id);
    expect(pausedCp).toBeDefined();
    expect(pausedCp!.status).toBe("paused");
  });

  it("V2.2: 异常中断时 status → interrupted", () => {
    createRequirementReview("R-INT-1", "reviewing");
    createSubReport("R-INT-1", "proj-a", "java-backend");
    updateSubReport(1, { status: "reviewing" });

    // 模拟异常中断
    updateReview("R-INT-1", { status: "interrupted" });
    updateSubReport(1, { status: "failed", error_message: "LLM timeout" });

    const found = findReviewById("R-INT-1");
    expect(found!.status).toBe("interrupted");
    const sub = findSubReportById(1);
    expect(sub!.status).toBe("failed");
    expect(sub!.error_message).toBe("LLM timeout");
  });
});

// ─── 验证 3: 列表页 enrichment ───

describe("V3: 列表页 enrichment (subReportStats)", () => {
  it("V3.1: 需求评审列表包含 subReportStats", () => {
    createRequirementReview("R-LIST-1", "reviewing");
    createRequirementReview("R-LIST-2", "completed");

    createSubReport("R-LIST-1", "proj-a", "java-backend");
    createSubReport("R-LIST-1", "proj-b", "vue-frontend");
    createSubReport("R-LIST-2", "proj-c", "mixed");
    updateSubReport(1, { status: "completed" });
    updateSubReport(2, { status: "reviewing" });
    updateSubReport(3, { status: "completed" });

    // 模拟 listReviews enrichment（和 reviews.ts 中一样的行为）
    const result = listReviews({ page: 1, pageSize: 20 });
    for (const item of result.items) {
      if (item.mr_url.startsWith("requirement://")) {
        const subs = listSubReports(item.id);
        (item as any).subReportStats = {
          completed: subs.filter((s) => s.status === "completed").length,
          total: subs.length,
          failed: subs.filter((s) => s.status === "failed").length,
        };
      }
    }

    const reqItem1 = result.items.find((i) => i.id === "R-LIST-1");
    expect(reqItem1).toBeDefined();
    expect((reqItem1 as any).subReportStats).toBeDefined();
    expect((reqItem1 as any).subReportStats.completed).toBe(1);
    expect((reqItem1 as any).subReportStats.total).toBe(2);

    const reqItem2 = result.items.find((i) => i.id === "R-LIST-2");
    expect((reqItem2 as any).subReportStats.completed).toBe(1);
    expect((reqItem2 as any).subReportStats.total).toBe(1);
  });
});

// ─── 验证 4: checkpoint 关联查询 ───

describe("V4: checkpoint 关联查询", () => {
  it("V4.1: 可查询到 pause/interrupted checkpoint", () => {
    createRequirementReview("R-CP-QUERY", "paused");
    const cp = createCheckpoint({
      reviewType: "requirement", projectId: "product-line-X",
      sourceBranch: "feature", targetBranch: "main",
      totalBatches: 5, totalFiles: 50, currentBatch: 2, reviewedCount: 20,
    });
    updateCheckpoint(cp.id, { status: "paused", accumulatedStats: JSON.stringify({ reviewId: "R-CP-QUERY" }) });

    // 模拟 checkpoint 查询（和 reviews.ts handler 一样的行为）
    const cps = listCheckpoints({ reviewType: "requirement" }).filter(
      (c) => (c.status === "paused" || c.status === "interrupted")
        && c.accumulatedStats.includes("R-CP-QUERY")
    );
    expect(cps).toHaveLength(1);
    expect(cps[0].id).toBe(cp.id);
  });
});

// ─── 验证 5: 边界情况 ───

describe("V5: 边界情况", () => {
  it("V5.1: 空的 sub-reports 返回空数组", () => {
    createRequirementReview("R-EMPTY", "reviewing");
    expect(listSubReports("R-EMPTY")).toEqual([]);
  });

  it("V5.2: FK 级联删除 — 删除主记录后 sub_reports 自动删除", () => {
    createRequirementReview("R-CASCADE", "reviewing");
    createSubReport("R-CASCADE", "proj-a", "java-backend");
    createSubReport("R-CASCADE", "proj-b", "vue-frontend");
    expect(listSubReports("R-CASCADE")).toHaveLength(2);

    deleteReview("R-CASCADE");
    expect(listSubReports("R-CASCADE")).toHaveLength(0);
  });

  it("V5.3: 不存在 sub_report 的更新返回 false", () => {
    expect(updateSubReport(999999, { status: "completed" })).toBe(false);
  });

  it("V5.4: 旧数据兼容 — 无 sub_reports 时不做 enrichment（不崩溃）", () => {
    // 旧格式的 review（没有 sub_reports 表时的数据）
    saveReviewRecord({
      id: "R-LEGACY",
      mr_url: "requirement://old-product/release..main",
      project: "old-product",
      product_line_id: null,
      author: null,
      status: "completed",
      report_json: JSON.stringify({
        reviewId: "R-LEGACY", techStackReports: [{ techStack: "java-backend", projectReports: [{ project: "old-a", report: makeReport() }] }],
      }),
      classification_json: null,
      requirement_json: null,
      mr_meta_json: null,
      reviewed_commit_sha: null,
      passed: true,
      avg_score: 4.0,
      issue_count: 0,
      critical_count: 0,
      created_by: "legacy-user",
      knowledge_dispositions_json: null,
    });

    // 不应崩溃
    const subs = listSubReports("R-LEGACY");
    expect(subs).toEqual([]);
  });

  it("V5.5: 同次评审中 sub_reports 按创建顺序排列", () => {
    createRequirementReview("R-ORDER", "reviewing");
    const ids = [
      createSubReport("R-ORDER", "proj-c", "mixed"),
      createSubReport("R-ORDER", "proj-a", "java-backend"),
      createSubReport("R-ORDER", "proj-b", "vue-frontend"),
    ];
    const list = listSubReports("R-ORDER");
    expect(list.map((s) => s.id)).toEqual(ids);
  });
});
