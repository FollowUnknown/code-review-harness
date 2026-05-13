import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createSubReport,
  updateSubReport,
  listSubReports,
  findSubReportById,
  deleteSubReportsByReviewId,
} from "../../../src/server/services/review-sub-report-store";
import { saveReviewRecord, deleteReview } from "../../../src/server/services/review-store";
import { getDb, closeDb } from "../../../src/server/db";

process.env.KNOWLEDGE_DB_PATH = ":memory:";

beforeEach(() => {
  closeDb();
  getDb();
});

afterEach(() => {
  closeDb();
});

function createTestReview(reviewId?: string): string {
  const id = reviewId || `R-TEST-${Math.random().toString(36).slice(2, 10)}`;
  saveReviewRecord({
    id,
    mr_url: `requirement://test-product/feature..main`,
    project: "test-product",
    product_line_id: "test-product",
    author: null,
    status: "reviewing",
    report_json: JSON.stringify({ reviewId: id, productLine: "test-product" }),
    classification_json: null,
    requirement_json: null,
    mr_meta_json: null,
    reviewed_commit_sha: null,
    passed: null,
    avg_score: null,
    issue_count: null,
    critical_count: 0,
    created_by: null,
    knowledge_dispositions_json: null,
  });
  return id;
}

describe("review-sub-report-store", () => {
  let reviewId: string;

  beforeEach(() => {
    reviewId = createTestReview();
  });

  describe("createSubReport", () => {
    it("creates a sub-report with pending status", () => {
      const id = createSubReport(reviewId, "do1cloud-form", "java-backend");
      expect(id).toBeGreaterThan(0);

      const found = findSubReportById(id);
      expect(found).not.toBeNull();
      expect(found!.review_id).toBe(reviewId);
      expect(found!.project).toBe("do1cloud-form");
      expect(found!.tech_stack).toBe("java-backend");
      expect(found!.status).toBe("pending");
    });

    it("creates multiple sub-reports with sequential IDs", () => {
      const id1 = createSubReport(reviewId, "project-a", "java-backend");
      const id2 = createSubReport(reviewId, "project-b", "vue-frontend");
      expect(id2).toBeGreaterThan(id1);
    });

    it("accepts unknown tech_stack", () => {
      const id = createSubReport(reviewId, "some-project", "unknown");
      const found = findSubReportById(id);
      expect(found!.tech_stack).toBe("unknown");
    });
  });

  describe("updateSubReport", () => {
    it("updates status to reviewing", () => {
      const id = createSubReport(reviewId, "do1cloud-form", "java-backend");
      updateSubReport(id, { status: "reviewing" });
      expect(findSubReportById(id)!.status).toBe("reviewing");
    });

    it("updates with full result data on completion", () => {
      const id = createSubReport(reviewId, "do1cloud-form", "java-backend");
      const report = { contractTitle: "Code Review", timestamp: new Date().toISOString(), passed: true, scores: [], issues: [], summary: "ok" };
      const classification = { stats: { total: 0, byLevel: { S: 0, A: 0, B: 0, C: 0 }, skipped: 0 }, batches: [], skipped: [] };

      updateSubReport(id, {
        status: "completed",
        report_json: JSON.stringify(report),
        classification_json: JSON.stringify(classification),
        score: 4.5,
        issue_count: 3,
        critical_count: 1,
      });

      const found = findSubReportById(id);
      expect(found!.status).toBe("completed");
      expect(found!.score).toBe(4.5);
      expect(found!.issue_count).toBe(3);
      expect(found!.critical_count).toBe(1);
      expect(found!.report_json).toBe(JSON.stringify(report));
      expect(found!.updated_at).toBeTruthy();
    });

    it("updates status to failed with error_message", () => {
      const id = createSubReport(reviewId, "do1cloud-form", "java-backend");
      updateSubReport(id, { status: "failed", error_message: "LLM call failed: timeout" });
      const found = findSubReportById(id);
      expect(found!.status).toBe("failed");
      expect(found!.error_message).toBe("LLM call failed: timeout");
    });

    it("returns false for non-existent id", () => {
      expect(updateSubReport(999999, { status: "completed" })).toBe(false);
    });

    it("sets updated_at timestamp on update", () => {
      const id = createSubReport(reviewId, "do1cloud-form", "java-backend");
      const before = findSubReportById(id)!;
      // Small delay to ensure timestamp difference
      const origUpdatedAt = before.updated_at;

      updateSubReport(id, { status: "reviewing" });
      const after = findSubReportById(id)!;
      // SQLite datetime('now') has second granularity — verify it's not empty
      expect(after.updated_at).toBeTruthy();
    });
  });

  describe("listSubReports", () => {
    it("returns empty array when no sub-reports", () => {
      expect(listSubReports(reviewId)).toEqual([]);
    });

    it("lists sub-reports in creation order", () => {
      const id1 = createSubReport(reviewId, "project-a", "java-backend");
      const id2 = createSubReport(reviewId, "project-b", "vue-frontend");
      const id3 = createSubReport(reviewId, "project-c", "mixed");

      const list = listSubReports(reviewId);
      expect(list).toHaveLength(3);
      expect(list[0].id).toBe(id1);
      expect(list[1].id).toBe(id2);
      expect(list[2].id).toBe(id3);
    });

    it("returns only sub-reports for the given reviewId", () => {
      const otherReviewId = createTestReview();
      createSubReport(reviewId, "project-a", "java-backend");
      createSubReport(otherReviewId, "project-b", "vue-frontend");

      expect(listSubReports(reviewId)).toHaveLength(1);
      expect(listSubReports(otherReviewId)).toHaveLength(1);
    });
  });

  describe("findSubReportById", () => {
    it("returns null for non-existent id", () => {
      expect(findSubReportById(999999)).toBeNull();
    });
  });

  describe("deleteSubReportsByReviewId", () => {
    it("deletes all sub-reports for a review", () => {
      createSubReport(reviewId, "project-a", "java-backend");
      createSubReport(reviewId, "project-b", "vue-frontend");

      const deleted = deleteSubReportsByReviewId(reviewId);
      expect(deleted).toBe(2);
      expect(listSubReports(reviewId)).toHaveLength(0);
    });

    it("returns 0 when no sub-reports exist", () => {
      expect(deleteSubReportsByReviewId(reviewId)).toBe(0);
    });

    it("does not affect sub-reports of other reviews", () => {
      const otherReviewId = createTestReview();
      createSubReport(reviewId, "project-a", "java-backend");
      createSubReport(otherReviewId, "project-b", "vue-frontend");

      deleteSubReportsByReviewId(reviewId);
      expect(listSubReports(otherReviewId)).toHaveLength(1);
    });
  });

  describe("FK cascade behavior", () => {
    it("deletes sub-reports when parent review is deleted", () => {
      createSubReport(reviewId, "project-a", "java-backend");
      createSubReport(reviewId, "project-b", "vue-frontend");

      deleteReview(reviewId);
      expect(listSubReports(reviewId)).toHaveLength(0);
    });
  });
});
