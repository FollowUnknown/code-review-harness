import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { computePlanSummary, exportPlanMarkdown } from "../src/server/services/exporter";
import { createPlan, addPlanItems, updatePlanItem } from "../src/server/services/plan-store";
import { saveReviewRecord } from "../src/server/services/review-store";
import { getDb, closeDb } from "../src/server/db";
import type { ReviewPlanDetail, ReviewRecord } from "../src/shared/types";

process.env.KNOWLEDGE_DB_PATH = ":memory:";

beforeEach(() => {
  closeDb();
  getDb();
});

afterEach(() => {
  closeDb();
});

function makePlanWithItems(): { plan: ReturnType<typeof createPlan>; items: ReturnType<typeof addPlanItems> } {
  const plan = createPlan("Sprint Test", "desc", "user-1");
  const items = addPlanItems(plan.id, [
    "https://gitlab.com/team/proj/-/merge_requests/1",
    "https://gitlab.com/team/proj/-/merge_requests/2",
    "https://gitlab.com/team/proj/-/merge_requests/3",
  ]);
  return { plan, items };
}

function seedReview(reviewId: string, overrides: Record<string, unknown> = {}) {
  saveReviewRecord({
    id: reviewId,
    mr_url: "https://gitlab.com/team/proj/-/merge_requests/1",
    project: "proj",
    author: null,
    status: "completed",
    report_json: JSON.stringify({
      contractTitle: "Code Review",
      timestamp: new Date().toISOString(),
      passed: true,
      scores: [{ dimension: "正确性", score: 4, comment: "ok" }],
      issues: [],
      summary: "LGTM",
      ...overrides,
    }),
    classification_json: null,
    requirement_json: null,
    mr_meta_json: null,
    reviewed_commit_sha: null,
    passed: true,
    avg_score: 4.0,
    issue_count: 0,
    critical_count: 0,
    created_by: "user-1",
    ...overrides,
  });
}

function getDetail(planId: string): ReviewPlanDetail {
  const db = getDb();
  const row = db.prepare("SELECT * FROM review_plans WHERE id = ?").get(planId) as Record<string, unknown>;
  const items = db.prepare("SELECT * FROM review_plan_items WHERE plan_id = ? ORDER BY position").all(planId) as ReviewPlanDetail["items"];
  return {
    id: row.id as string,
    title: row.title as string,
    description: row.description as string | null,
    status: row.status as "open",
    created_by: row.created_by as string,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    items,
  };
}

describe("exporter", () => {
  describe("computePlanSummary", () => {
    it("returns zero stats for plan with no completed MRs", () => {
      const { plan } = makePlanWithItems();
      const detail = getDetail(plan.id);
      const records = new Map<string, ReviewRecord>();
      const summary = computePlanSummary(detail, records);
      expect(summary.totalMRs).toBe(3);
      expect(summary.completedMRs).toBe(0);
      expect(summary.passedMRs).toBe(0);
      expect(summary.avgScore).toBeNull();
      expect(summary.totalIssues).toBe(0);
    });

    it("computes pass/fail counts correctly", () => {
      const { plan, items } = makePlanWithItems();
      seedReview("R-pass", { passed: true, avg_score: 4.0 });
      seedReview("R-fail", { passed: false, avg_score: 2.0 });
      updatePlanItem(plan.id, items[0].id, { status: "completed", review_id: "R-pass" });
      updatePlanItem(plan.id, items[1].id, { status: "completed", review_id: "R-fail" });

      const detail = getDetail(plan.id);
      const records = new Map<string, ReviewRecord>();
      records.set("R-pass", { id: "R-pass", mr_url: "", project: null, author: null, status: "completed", report_json: "{}", classification_json: null, requirement_json: null, mr_meta_json: null, reviewed_commit_sha: null, passed: true, avg_score: 4.0, issue_count: 0, critical_count: 0, created_by: null, created_at: "", updated_at: "" });
      records.set("R-fail", { id: "R-fail", mr_url: "", project: null, author: null, status: "completed", report_json: "{}", classification_json: null, requirement_json: null, mr_meta_json: null, reviewed_commit_sha: null, passed: false, avg_score: 2.0, issue_count: 3, critical_count: 1, created_by: null, created_at: "", updated_at: "" });

      const summary = computePlanSummary(detail, records);
      expect(summary.completedMRs).toBe(2);
      expect(summary.passedMRs).toBe(1);
      expect(summary.failedMRs).toBe(1);
    });

    it("computes issue severity counts from report_json", () => {
      const { plan, items } = makePlanWithItems();
      const reportWithIssues = {
        scores: [],
        issues: [
          { severity: "CRITICAL", message: "bad", file: "a.ts" },
          { severity: "HIGH", message: "warn", file: "b.ts" },
          { severity: "MEDIUM", message: "note", file: "c.ts" },
          { severity: "LOW", message: "nit", file: "d.ts" },
        ],
      };
      seedReview("R-1", { report_json: JSON.stringify(reportWithIssues) });
      updatePlanItem(plan.id, items[0].id, { status: "completed", review_id: "R-1" });

      const detail = getDetail(plan.id);
      const records = new Map<string, ReviewRecord>();
      const rec = findReviewByIdHelper("R-1");
      if (rec) records.set("R-1", rec);

      const summary = computePlanSummary(detail, records);
      expect(summary.issuesBySeverity.CRITICAL).toBe(1);
      expect(summary.issuesBySeverity.HIGH).toBe(1);
      expect(summary.issuesBySeverity.MEDIUM).toBe(1);
      expect(summary.issuesBySeverity.LOW).toBe(1);
    });

    it("computes avgScore rounded to 1 decimal", () => {
      const { plan, items } = makePlanWithItems();
      seedReview("R-a", { avg_score: 3.33 });
      seedReview("R-b", { avg_score: 4.67 });
      updatePlanItem(plan.id, items[0].id, { status: "completed", review_id: "R-a" });
      updatePlanItem(plan.id, items[1].id, { status: "completed", review_id: "R-b" });

      const detail = getDetail(plan.id);
      const records = new Map<string, ReviewRecord>();
      let rec = findReviewByIdHelper("R-a");
      if (rec) records.set("R-a", rec);
      rec = findReviewByIdHelper("R-b");
      if (rec) records.set("R-b", rec);

      const summary = computePlanSummary(detail, records);
      expect(summary.avgScore).toBe(4.0); // (3.33 + 4.67) / 2 = 4.0
    });
  });

  describe("exportPlanMarkdown", () => {
    it("includes title and summary table", () => {
      const { plan } = makePlanWithItems();
      const detail = getDetail(plan.id);
      const records = new Map<string, ReviewRecord>();
      const md = exportPlanMarkdown(detail, records);
      expect(md).toContain("# Sprint Test");
      expect(md).toContain("汇总");
      expect(md).toContain("通过率");
      expect(md).toContain("平均分");
    });

    it("shows dash for unreviewed MRs", () => {
      const { plan } = makePlanWithItems();
      const detail = getDetail(plan.id);
      const records = new Map<string, ReviewRecord>();
      const md = exportPlanMarkdown(detail, records);
      expect(md).toContain("—");
    });

    it("includes issues from report_json", () => {
      const { plan, items } = makePlanWithItems();
      const reportWithIssues = {
        scores: [{ dimension: "正确性", score: 3, comment: "ok" }],
        issues: [
          { severity: "HIGH", message: "Missing error handling", file: "src/api.ts", line: 42 },
        ],
      };
      seedReview("R-1", { passed: false, avg_score: 3.0, issue_count: 1, report_json: JSON.stringify(reportWithIssues) });
      updatePlanItem(plan.id, items[0].id, { status: "completed", review_id: "R-1" });

      const detail = getDetail(plan.id);
      const records = new Map<string, ReviewRecord>();
      const rec = findReviewByIdHelper("R-1");
      if (rec) records.set("R-1", rec);

      const md = exportPlanMarkdown(detail, records);
      expect(md).toContain("[HIGH]");
      expect(md).toContain("Missing error handling");
      expect(md).toContain("src/api.ts:42");
    });
  });
});

function findReviewByIdHelper(id: string): ReviewRecord | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM reviews WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    id: row.id as string,
    mr_url: row.mr_url as string,
    project: row.project as string | null,
    author: row.author as string | null,
    status: row.status as "completed" | "draft",
    report_json: row.report_json as string,
    classification_json: row.classification_json as string | null,
    requirement_json: row.requirement_json as string | null,
    mr_meta_json: row.mr_meta_json as string | null,
    reviewed_commit_sha: row.reviewed_commit_sha as string | null,
    passed: row.passed === 1,
    avg_score: row.avg_score as number | null,
    issue_count: row.issue_count as number | null,
    critical_count: row.critical_count as number,
    created_by: row.created_by as string | null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}
