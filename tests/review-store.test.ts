import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  saveReviewRecord,
  findReviewById,
  listReviews,
  updateReview,
  deleteReview,
  computeReviewStats,
} from "../src/server/services/review-store";
import { getDb, closeDb } from "../src/server/db";
import type { ReviewReport } from "../src/shared/types";

process.env.KNOWLEDGE_DB_PATH = ":memory:";

beforeEach(() => {
  closeDb();
  getDb();
});

afterEach(() => {
  closeDb();
});

function makeReport(overrides: Partial<ReviewReport> = {}): ReviewReport {
  return {
    contractTitle: "Code Review",
    timestamp: new Date().toISOString(),
    passed: true,
    scores: [
      { dimension: "正确性", score: 4, comment: "ok" },
      { dimension: "可读性", score: 5, comment: "good" },
    ],
    issues: [],
    summary: "LGTM",
    ...overrides,
  };
}

function makeRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: `R-${Math.random().toString(36).slice(2, 10)}`,
    mr_url: "https://gitlab.com/team/project/-/merge_requests/1",
    project: "project",
    author: "developer",
    status: "completed" as const,
    report_json: JSON.stringify(makeReport()),
    classification_json: null,
    requirement_json: null,
    mr_meta_json: null,
    reviewed_commit_sha: null,
    passed: true,
    avg_score: 4.5,
    issue_count: 0,
    critical_count: 0,
    created_by: "user-1",
    ...overrides,
  };
}

describe("review-store", () => {
  describe("saveReviewRecord + findReviewById", () => {
    it("saves and retrieves a record", () => {
      const record = makeRecord();
      saveReviewRecord(record);
      const found = findReviewById(record.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(record.id);
      expect(found!.mr_url).toBe(record.mr_url);
      expect(found!.project).toBe("project");
      expect(found!.passed).toBe(true);
      expect(found!.avg_score).toBe(4.5);
      expect(found!.created_by).toBe("user-1");
    });

    it("returns null for non-existent ID", () => {
      expect(findReviewById("R-NONEXIST")).toBeNull();
    });

    it("handles passed=false correctly", () => {
      const record = makeRecord({ passed: false });
      saveReviewRecord(record);
      const found = findReviewById(record.id);
      expect(found!.passed).toBe(false);
    });
  });

  describe("listReviews", () => {
    it("returns empty list when no records", () => {
      const result = listReviews({ page: 1, pageSize: 20 });
      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
    });

    it("returns paginated results", () => {
      for (let i = 0; i < 5; i++) {
        saveReviewRecord(makeRecord({ id: `R-${i}`, project: "proj" }));
      }
      const page1 = listReviews({ page: 1, pageSize: 2 });
      expect(page1.items).toHaveLength(2);
      expect(page1.total).toBe(5);
      expect(page1.totalPages).toBe(3);

      const page2 = listReviews({ page: 2, pageSize: 2 });
      expect(page2.items).toHaveLength(2);
    });

    it("filters by project", () => {
      saveReviewRecord(makeRecord({ id: "R-a", project: "frontend" }));
      saveReviewRecord(makeRecord({ id: "R-b", project: "backend" }));
      saveReviewRecord(makeRecord({ id: "R-c", project: "frontend" }));

      const result = listReviews({ project: "frontend", page: 1, pageSize: 20 });
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it("filters by createdBy", () => {
      saveReviewRecord(makeRecord({ id: "R-a", created_by: "alice" }));
      saveReviewRecord(makeRecord({ id: "R-b", created_by: "bob" }));

      const result = listReviews({ createdBy: "alice", page: 1, pageSize: 20 });
      expect(result.items).toHaveLength(1);
    });

    it("filters by status", () => {
      saveReviewRecord(makeRecord({ id: "R-a", status: "completed" }));
      saveReviewRecord(makeRecord({ id: "R-b", status: "draft" }));

      const result = listReviews({ status: "draft", page: 1, pageSize: 20 });
      expect(result.items).toHaveLength(1);
    });

    it("results are ordered by created_at DESC", () => {
      const db = getDb();
      // Insert with explicit timestamps to control order
      db.prepare("INSERT INTO reviews (id, mr_url, project, author, status, report_json, passed, avg_score, issue_count, critical_count, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run("R-old", "url1", "p", "a", "completed", "{}", 1, 5, 0, 0, "u", "2024-01-01T00:00:00Z", "2024-01-01T00:00:00Z");
      db.prepare("INSERT INTO reviews (id, mr_url, project, author, status, report_json, passed, avg_score, issue_count, critical_count, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run("R-new", "url2", "p", "a", "completed", "{}", 1, 5, 0, 0, "u", "2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z");

      const result = listReviews({ page: 1, pageSize: 20 });
      expect(result.items[0].id).toBe("R-new");
      expect(result.items[1].id).toBe("R-old");
    });
  });

  describe("updateReview", () => {
    it("updates status field", () => {
      const record = makeRecord();
      saveReviewRecord(record);
      updateReview(record.id, { status: "draft" });
      const found = findReviewById(record.id);
      expect(found!.status).toBe("draft");
    });

    it("updates score and issue count", () => {
      const record = makeRecord();
      saveReviewRecord(record);
      updateReview(record.id, { avg_score: 3.2, issue_count: 5, critical_count: 1 });
      const found = findReviewById(record.id);
      expect(found!.avg_score).toBe(3.2);
      expect(found!.issue_count).toBe(5);
      expect(found!.critical_count).toBe(1);
    });

    it("returns false for non-existent ID", () => {
      expect(updateReview("R-FAKE", { status: "draft" })).toBe(false);
    });

    it("returns true with no fields to update", () => {
      const record = makeRecord();
      saveReviewRecord(record);
      expect(updateReview(record.id, {})).toBe(true);
    });
  });

  describe("deleteReview", () => {
    it("deletes a record and returns true", () => {
      const record = makeRecord();
      saveReviewRecord(record);
      expect(deleteReview(record.id)).toBe(true);
      expect(findReviewById(record.id)).toBeNull();
    });

    it("returns false for non-existent ID", () => {
      expect(deleteReview("R-FAKE")).toBe(false);
    });
  });

  describe("computeReviewStats", () => {
    it("computes avgScore from scores", () => {
      const report = makeReport({
        scores: [
          { dimension: "a", score: 4, comment: "" },
          { dimension: "b", score: 3, comment: "" },
        ],
      });
      const stats = computeReviewStats(report);
      expect(stats.avgScore).toBe(3.5);
      expect(stats.issueCount).toBe(0);
      expect(stats.criticalCount).toBe(0);
    });

    it("returns null avgScore when no scores", () => {
      const report = makeReport({ scores: [] });
      const stats = computeReviewStats(report);
      expect(stats.avgScore).toBeNull();
    });

    it("counts issues and critical issues", () => {
      const report = makeReport({
        issues: [
          { severity: "CRITICAL", message: "bad", file: "a.ts" },
          { severity: "HIGH", message: "meh", file: "b.ts" },
          { severity: "CRITICAL", message: "worse", file: "c.ts" },
        ],
      });
      const stats = computeReviewStats(report);
      expect(stats.issueCount).toBe(3);
      expect(stats.criticalCount).toBe(2);
    });
  });
});
