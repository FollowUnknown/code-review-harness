import { describe, it, expect, beforeEach, vi } from "vitest";
import { createSSEHelpers } from "../../../src/server/services/sse-helper";
import type { Response } from "express";
import type {
  SSEReviewStart,
  SSEBatchResult,
  SSEPaused,
  SSEResumed,
  ReviewIssue,
  ReviewScore,
} from "../../../src/shared/types";

function mockRes(): Response {
  const chunks: string[] = [];
  const res = {
    write: vi.fn((chunk: string) => {
      chunks.push(chunk);
      return true;
    }),
    getWrittenChunks: () => chunks,
    getLastWritten: () => {
      if (chunks.length === 0) return null;
      return JSON.parse(chunks[chunks.length - 1].replace(/^data: /, "").replace(/\n\n$/, ""));
    },
    getAllParsed: () =>
      chunks.map((c) => JSON.parse(c.replace(/^data: /, "").replace(/\n\n$/, ""))),
  } as unknown as Response & {
    getWrittenChunks: () => string[];
    getLastWritten: () => Record<string, unknown> | null;
    getAllParsed: () => Record<string, unknown>[];
  };
  return res;
}

describe("sse-helper", () => {
  let res: ReturnType<typeof mockRes>;

  beforeEach(() => {
    res = mockRes();
  });

  describe("sendSSE", () => {
    it("writes SSE-formatted data", () => {
      const { sendSSE } = createSSEHelpers(res);
      sendSSE({ step: 1, status: "running", label: "test" });
      const last = res.getLastWritten();
      expect(last).toEqual({ step: 1, status: "running", label: "test" });
    });

    it("properly formats as SSE (data: prefix + double newline)", () => {
      const { sendSSE } = createSSEHelpers(res);
      sendSSE({ step: 1, status: "done", label: "" });
      const raw = res.getWrittenChunks()[0];
      expect(raw).toMatch(/^data: /);
      expect(raw).toMatch(/\n\n$/);
    });
  });

  describe("nextStep", () => {
    it("increments step and emits running event", () => {
      const { nextStep } = createSSEHelpers(res);
      nextStep("Step 1", "detail");
      const last = res.getLastWritten();
      expect(last).toMatchObject({ step: 1, status: "running", label: "Step 1", detail: "detail" });
    });

    it("omits detail when not provided", () => {
      const { nextStep } = createSSEHelpers(res);
      nextStep("Step 1");
      const last = res.getLastWritten();
      expect(last).not.toHaveProperty("detail");
      expect(last).toMatchObject({ step: 1, status: "running", label: "Step 1" });
    });

    it("increments step across multiple calls", () => {
      const { nextStep } = createSSEHelpers(res);
      nextStep("First");
      nextStep("Second");
      const all = res.getAllParsed();
      expect(all[0]).toMatchObject({ step: 1, label: "First" });
      expect(all[1]).toMatchObject({ step: 2, label: "Second" });
    });
  });

  describe("completeStep", () => {
    it("emits done event at current step", () => {
      const { nextStep, completeStep } = createSSEHelpers(res);
      nextStep("Working");
      completeStep("finished");
      const last = res.getLastWritten();
      expect(last).toMatchObject({ step: 1, status: "done", label: "", detail: "finished" });
    });

    it("uses empty string for detail when not provided", () => {
      const { nextStep, completeStep } = createSSEHelpers(res);
      nextStep("Working");
      completeStep();
      const last = res.getLastWritten();
      expect(last).toMatchObject({ detail: "" });
    });
  });

  describe("getStep", () => {
    it("returns 0 initially", () => {
      const { getStep } = createSSEHelpers(res);
      expect(getStep()).toBe(0);
    });

    it("returns current step after nextStep calls", () => {
      const { getStep, nextStep } = createSSEHelpers(res);
      nextStep("One");
      expect(getStep()).toBe(1);
      nextStep("Two");
      expect(getStep()).toBe(2);
    });
  });

  describe("sendEvent", () => {
    function makeIssues(): ReviewIssue[] {
      return [
        { severity: "MEDIUM", message: "test issue", file: "src/a.ts" },
      ];
    }

    function makeScores(): ReviewScore[] {
      return [{ dimension: "正确性", score: 4, comment: "ok" }];
    }

    describe("review_start", () => {
      it("emits review_start with correct shape", () => {
        const { sendEvent } = createSSEHelpers(res);
        const data: SSEReviewStart = {
          reviewType: "mr",
          totalBatches: 10,
          totalFiles: 100,
          jobId: "R-abc123",
        };
        sendEvent("review_start", data);
        const last = res.getLastWritten();
        expect(last).toMatchObject({
          type: "review_start",
          reviewType: "mr",
          totalBatches: 10,
          totalFiles: 100,
          jobId: "R-abc123",
        });
      });
    });

    describe("batch_result", () => {
      it("emits batch_result with correct shape", () => {
        const { sendEvent } = createSSEHelpers(res);
        const data: SSEBatchResult = {
          batchIndex: 0,
          files: ["src/a.ts", "src/b.ts"],
          issues: makeIssues(),
          scores: makeScores(),
          progress: {
            completedBatches: 1,
            totalBatches: 10,
            reviewedFiles: 12,
            totalFiles: 100,
          },
        };
        sendEvent("batch_result", data);
        const last = res.getLastWritten();
        expect(last).toMatchObject({
          type: "batch_result",
          batchIndex: 0,
          files: ["src/a.ts", "src/b.ts"],
          issues: makeIssues(),
          scores: makeScores(),
          progress: {
            completedBatches: 1,
            totalBatches: 10,
            reviewedFiles: 12,
            totalFiles: 100,
          },
        });
      });
    });

    describe("paused", () => {
      it("emits paused with correct shape", () => {
        const { sendEvent } = createSSEHelpers(res);
        const data: SSEPaused = {
          checkpointId: "CP-abc123",
          progress: {
            completedBatches: 3,
            totalBatches: 10,
            reviewedFiles: 30,
            totalFiles: 100,
          },
        };
        sendEvent("paused", data);
        const last = res.getLastWritten();
        expect(last).toMatchObject({
          type: "paused",
          checkpointId: "CP-abc123",
          progress: { completedBatches: 3, reviewedFiles: 30 },
        });
      });
    });

    describe("resumed", () => {
      it("emits resumed with correct shape", () => {
        const { sendEvent } = createSSEHelpers(res);
        const data: SSEResumed = {
          checkpointId: "CP-abc123",
          remainingBatches: 7,
        };
        sendEvent("resumed", data);
        const last = res.getLastWritten();
        expect(last).toMatchObject({
          type: "resumed",
          checkpointId: "CP-abc123",
          remainingBatches: 7,
        });
      });
    });
  });
});
