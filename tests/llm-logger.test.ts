import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  saveLLMLog,
  getLogsByReviewId,
  getLogById,
} from "../src/server/services/llm-logger";
import { getDb, closeDb } from "../src/server/db";
import { saveReviewRecord } from "../src/server/services/review-store";

process.env.KNOWLEDGE_DB_PATH = ":memory:";

beforeEach(() => {
  closeDb();
  getDb();
});

afterEach(() => {
  closeDb();
});

function seedReview(reviewId: string) {
  saveReviewRecord({
    id: reviewId,
    mr_url: "https://gitlab.com/team/proj/-/merge_requests/1",
    project: "proj",
    author: null,
    status: "completed",
    report_json: "{}",
    classification_json: null,
    requirement_json: null,
    mr_meta_json: null,
    reviewed_commit_sha: null,
    passed: true,
    avg_score: 4.0,
    issue_count: 0,
    critical_count: 0,
    created_by: "user-1",
  });
}

function makeLog(overrides: Record<string, unknown> = {}) {
  return {
    id: `LOG-${Math.random().toString(36).slice(2, 10)}`,
    review_id: "R-test",
    batch_index: 0,
    risk_level: "A" as const,
    system_prompt: "You are a reviewer",
    user_message: "diff content here",
    response_text: '{"scores":[],"issues":[]}',
    duration_ms: 1500,
    input_tokens: 2000,
    output_tokens: 800,
    provider: "deepseek",
    model: "deepseek-chat",
    ...overrides,
  };
}

describe("llm-logger", () => {
  describe("saveLLMLog + getLogById", () => {
    it("saves and retrieves a log", () => {
      seedReview("R-test");
      const log = makeLog();
      saveLLMLog(log);
      const found = getLogById(log.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(log.id);
      expect(found!.review_id).toBe("R-test");
      expect(found!.batch_index).toBe(0);
      expect(found!.system_prompt).toBe("You are a reviewer");
      expect(found!.duration_ms).toBe(1500);
      expect(found!.input_tokens).toBe(2000);
      expect(found!.output_tokens).toBe(800);
      expect(found!.provider).toBe("deepseek");
    });

    it("returns null for non-existent ID", () => {
      expect(getLogById("LOG-FAKE")).toBeFalsy();
    });
  });

  describe("getLogsByReviewId", () => {
    it("returns empty array for review with no logs", () => {
      seedReview("R-empty");
      const logs = getLogsByReviewId("R-empty");
      expect(logs).toHaveLength(0);
    });

    it("returns all logs for a review ordered by batch_index", () => {
      seedReview("R-test");
      saveLLMLog(makeLog({ id: "LOG-1", batch_index: 2 }));
      saveLLMLog(makeLog({ id: "LOG-2", batch_index: 0 }));
      saveLLMLog(makeLog({ id: "LOG-3", batch_index: 1 }));

      const logs = getLogsByReviewId("R-test");
      expect(logs).toHaveLength(3);
      expect(logs[0].batch_index).toBe(0);
      expect(logs[1].batch_index).toBe(1);
      expect(logs[2].batch_index).toBe(2);
    });

    it("does not return logs from other reviews", () => {
      seedReview("R-a");
      seedReview("R-b");
      saveLLMLog(makeLog({ id: "LOG-a1", review_id: "R-a" }));
      saveLLMLog(makeLog({ id: "LOG-b1", review_id: "R-b" }));

      const logsA = getLogsByReviewId("R-a");
      expect(logsA).toHaveLength(1);
      expect(logsA[0].id).toBe("LOG-a1");

      const logsB = getLogsByReviewId("R-b");
      expect(logsB).toHaveLength(1);
      expect(logsB[0].id).toBe("LOG-b1");
    });
  });

  describe("nullable fields", () => {
    it("handles null token counts", () => {
      seedReview("R-test");
      const log = makeLog({ input_tokens: null, output_tokens: null });
      saveLLMLog(log);
      const found = getLogById(log.id);
      expect(found!.input_tokens).toBeNull();
      expect(found!.output_tokens).toBeNull();
    });

    it("handles null risk_level", () => {
      seedReview("R-test");
      const log = makeLog({ risk_level: null });
      saveLLMLog(log);
      const found = getLogById(log.id);
      expect(found!.risk_level).toBeNull();
    });
  });
});
