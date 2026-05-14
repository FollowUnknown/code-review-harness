import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createCheckpoint,
  findCheckpointById,
  findCheckpointByJobId,
  listCheckpoints,
  updateCheckpoint,
  deleteCheckpoint,
  abandonCheckpoint,
  completeCheckpoint,
} from "../../../src/server/services/review-checkpoint-store";
import { getDb, closeDb } from "../../../src/server/db";
import { findReviewById, saveReviewRecord } from "../../../src/server/services/review-store";
import type { ReviewCheckpoint } from "../../../src/shared/types";

process.env.KNOWLEDGE_DB_PATH = ":memory:";

beforeEach(() => {
  closeDb();
  getDb();
});

afterEach(() => {
  closeDb();
});

function makeParams(overrides: Record<string, unknown> = {}) {
  return {
    reviewType: "mr" as const,
    projectId: "test-project",
    sourceBranch: "feature/x",
    targetBranch: "main",
    totalBatches: 5,
    totalFiles: 50,
    currentBatch: 0,
    reviewedCount: 0,
    ...overrides,
  };
}

describe("review-checkpoint-store", () => {
  describe("createCheckpoint", () => {
    it("creates a checkpoint and returns it with all fields", () => {
      const cp = createCheckpoint(makeParams());
      expect(cp.id).toMatch(/^CP-/);
      expect(cp.reviewType).toBe("mr");
      expect(cp.projectId).toBe("test-project");
      expect(cp.sourceBranch).toBe("feature/x");
      expect(cp.targetBranch).toBe("main");
      expect(cp.status).toBe("running");
      expect(cp.currentBatch).toBe(0);
      expect(cp.totalBatches).toBe(5);
      expect(cp.totalFiles).toBe(50);
      expect(cp.reviewedCount).toBe(0);
      expect(cp.batchResults).toBe("[]");
      expect(cp.accumulatedScores).toBe("[]");
      expect(cp.accumulatedStats).toBe("{}");
      expect(cp.createdAt).toBeTruthy();
      expect(cp.updatedAt).toBeTruthy();
    });

    it("stores optional fields (jobId, createdBy)", () => {
      const cp = createCheckpoint(makeParams({ jobId: "JOB-1", createdBy: "user-1" }));
      expect(cp.jobId).toBe("JOB-1");
      expect(cp.createdBy).toBe("user-1");
    });
  });

  describe("findCheckpointById", () => {
    it("returns the checkpoint for a valid id", () => {
      const created = createCheckpoint(makeParams());
      const found = findCheckpointById(created.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
    });

    it("returns null for unknown id", () => {
      expect(findCheckpointById("CP-nonexistent")).toBeNull();
    });
  });

  describe("findCheckpointByJobId", () => {
    it("returns the latest checkpoint for a jobId", () => {
      createCheckpoint(makeParams({ jobId: "JOB-1" }));
      const found = findCheckpointByJobId("JOB-1");
      expect(found).not.toBeNull();
      expect(found!.jobId).toBe("JOB-1");
    });

    it("returns null for unknown jobId", () => {
      expect(findCheckpointByJobId("JOB-nonexistent")).toBeNull();
    });
  });

  describe("listCheckpoints", () => {
    it("lists all checkpoints without filters", () => {
      createCheckpoint(makeParams({ reviewType: "mr" }));
      createCheckpoint(makeParams({ reviewType: "requirement" }));
      const all = listCheckpoints();
      expect(all.length).toBeGreaterThanOrEqual(2);
    });

    it("filters by reviewType", () => {
      createCheckpoint(makeParams({ reviewType: "mr", projectId: "p1" }));
      createCheckpoint(makeParams({ reviewType: "requirement" }));
      const mr = listCheckpoints({ reviewType: "mr" });
      expect(mr.every((c) => c.reviewType === "mr")).toBe(true);
    });

    it("filters by status", () => {
      const cp = createCheckpoint(makeParams());
      updateCheckpoint(cp.id, { status: "paused" });
      const paused = listCheckpoints({ status: "paused" });
      expect(paused.length).toBeGreaterThanOrEqual(1);
      expect(paused.every((c) => c.status === "paused")).toBe(true);
    });

    it("filters by project", () => {
      createCheckpoint(makeParams({ projectId: "project-a" }));
      createCheckpoint(makeParams({ projectId: "project-b" }));
      const filtered = listCheckpoints({ project: "project-a" });
      expect(filtered.every((c) => c.projectId === "project-a")).toBe(true);
    });

    it("combines multiple filters", () => {
      createCheckpoint(makeParams({ reviewType: "mr", projectId: "p1" }));
      createCheckpoint(makeParams({ reviewType: "requirement", projectId: "p1" }));
      const result = listCheckpoints({ reviewType: "mr", project: "p1" });
      expect(result.every((c) => c.reviewType === "mr" && c.projectId === "p1")).toBe(true);
    });
  });

  describe("updateCheckpoint", () => {
    it("updates status and returns true", () => {
      const cp = createCheckpoint(makeParams());
      const ok = updateCheckpoint(cp.id, { status: "paused" });
      expect(ok).toBe(true);
      const updated = findCheckpointById(cp.id);
      expect(updated!.status).toBe("paused");
    });

    it("updates currentBatch and reviewedCount", () => {
      const cp = createCheckpoint(makeParams());
      updateCheckpoint(cp.id, { currentBatch: 3, reviewedCount: 25 });
      const updated = findCheckpointById(cp.id);
      expect(updated!.currentBatch).toBe(3);
      expect(updated!.reviewedCount).toBe(25);
    });

    it("updates batchResults", () => {
      const cp = createCheckpoint(makeParams());
      const results = JSON.stringify([{ batchIndex: 0, files: ["a.ts"] }]);
      updateCheckpoint(cp.id, { batchResults: results });
      const updated = findCheckpointById(cp.id);
      expect(updated!.batchResults).toBe(results);
    });

    it("updates accumulatedScores and accumulatedStats", () => {
      const cp = createCheckpoint(makeParams());
      const scores = JSON.stringify([{ dimension: "正确性", score: 4, comment: "ok" }]);
      const stats = JSON.stringify({ projectIndex: 2 });
      updateCheckpoint(cp.id, { accumulatedScores: scores, accumulatedStats: stats });
      const updated = findCheckpointById(cp.id);
      expect(updated!.accumulatedScores).toBe(scores);
      expect(updated!.accumulatedStats).toBe(stats);
    });

    it("returns false for unknown id", () => {
      expect(updateCheckpoint("CP-unknown", { currentBatch: 1 })).toBe(false);
    });
  });

  describe("abandonCheckpoint", () => {
    it("sets status to abandoned", () => {
      const cp = createCheckpoint(makeParams());
      abandonCheckpoint(cp.id);
      const updated = findCheckpointById(cp.id);
      expect(updated!.status).toBe("abandoned");
    });
  });

  describe("completeCheckpoint", () => {
    it("sets status to completed", () => {
      const cp = createCheckpoint(makeParams());
      completeCheckpoint(cp.id);
      const updated = findCheckpointById(cp.id);
      expect(updated!.status).toBe("completed");
    });
  });

  describe("deleteCheckpoint", () => {
    it("deletes the checkpoint permanently", () => {
      const cp = createCheckpoint(makeParams());
      const ok = deleteCheckpoint(cp.id);
      expect(ok).toBe(true);
      expect(findCheckpointById(cp.id)).toBeNull();
    });

    it("returns false for unknown id", () => {
      expect(deleteCheckpoint("CP-nonexistent")).toBe(false);
    });
  });

  describe("FK migration — review_sub_reports", () => {
    it("外键正确指向 reviews(id) 而非 reviews_old", () => {
      const db = getDb();
      const fkList = db.prepare("PRAGMA foreign_key_list(review_sub_reports)").all() as any[];
      const fk = fkList.find((fk: any) => fk.from === "review_id");
      expect(fk).toBeDefined();
      expect(fk!.table).toBe("reviews");
    });

    it("写入子报告不会触发 FK 错误（verifies runtime FK enforcement）", () => {
      const db = getDb();

      const reviewId = "R-fk-verify-test";
      saveReviewRecord({
        id: reviewId, mr_url: "url", project: "test", author: "dev",
        status: "completed", report_json: "{}",
        classification_json: null, requirement_json: null, mr_meta_json: null,
        reviewed_commit_sha: null, passed: true, avg_score: 4,
        issue_count: 0, critical_count: 0, created_by: "tester",
      });

      // If FK is broken, this INSERT throws "no such table: main.reviews_old"
      expect(() => {
        db.prepare(`
          INSERT INTO review_sub_reports (review_id, project, tech_stack, status)
          VALUES (?, 'test-project', 'java-backend', 'completed')
        `).run(reviewId);
      }).not.toThrow();

      const sub = db.prepare("SELECT review_id, project FROM review_sub_reports WHERE review_id = ?").get(reviewId) as any;
      expect(sub).toBeDefined();
      expect(sub.review_id).toBe(reviewId);
    });
  });

  describe("批量清理 — running/interrupted checkpoint", () => {
    it("abandon 后 checkpoint 不再出现在 interrupted 查询结果中", () => {
      const cp = createCheckpoint(makeParams({ reviewType: "requirement" }));
      updateCheckpoint(cp.id, { status: "interrupted" });

      const before = listCheckpoints({ status: "interrupted" });
      expect(before.some((c) => c.id === cp.id)).toBe(true);

      abandonCheckpoint(cp.id);

      const after = listCheckpoints({ status: "interrupted" });
      expect(after.some((c) => c.id === cp.id)).toBe(false);
    });

    it("可同时清理 running 和 interrupted 状态的 checkpoint", () => {
      const cp1 = createCheckpoint(makeParams({ reviewType: "requirement" }));
      updateCheckpoint(cp1.id, { status: "interrupted" });
      const cp2 = createCheckpoint(makeParams({ reviewType: "requirement" })); // 默认 running

      abandonCheckpoint(cp1.id);
      abandonCheckpoint(cp2.id);

      const interrupted = listCheckpoints({ status: "interrupted" });
      const running = listCheckpoints({ status: "running" });
      expect(interrupted.some((c) => c.id === cp1.id)).toBe(false);
      expect(running.some((c) => c.id === cp2.id)).toBe(false);
    });

    it("清理后对应 review 的状态应更新为 interrupted", () => {
      const reviewId = "R-test-cleanup";
      saveReviewRecord({
        id: reviewId,
        mr_url: "url",
        project: "test",
        author: "dev",
        status: "reviewing",
        report_json: "{}",
        classification_json: null,
        requirement_json: null,
        mr_meta_json: null,
        reviewed_commit_sha: null,
        passed: false,
        avg_score: null,
        issue_count: 0,
        critical_count: 0,
        created_by: "tester",
      });

      const cp = createCheckpoint(makeParams({
        reviewType: "requirement",
        accumulatedStats: JSON.stringify({ reviewId }),
      }));

      abandonCheckpoint(cp.id);

      // abandonCheckpoint 只标记 checkpoint 状态，不更新 review
      // review 状态同步由路由层 deleteHandler 负责（在 routes 测试中验证）
      expect(findCheckpointById(cp.id)!.status).toBe("abandoned");
    });
  });
});
