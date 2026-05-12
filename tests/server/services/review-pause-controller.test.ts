import { describe, it, expect, beforeEach } from "vitest";
import {
  requestPause,
  isPauseRequested,
  clearPause,
  removeJob,
} from "../../../src/server/services/review-pause-controller";

describe("review-pause-controller", () => {
  beforeEach(() => {
    // Clean up any leftover pause flags between tests
    removeJob("job-1");
    removeJob("job-2");
    removeJob("job-3");
  });

  describe("requestPause / isPauseRequested", () => {
    it("isPauseRequested returns false for unknown jobId", () => {
      expect(isPauseRequested("nonexistent")).toBe(false);
    });

    it("isPauseRequested returns true after requestPause", () => {
      requestPause("job-1");
      expect(isPauseRequested("job-1")).toBe(true);
    });

    it("multiple independent jobs don't interfere", () => {
      requestPause("job-1");
      requestPause("job-2");
      expect(isPauseRequested("job-1")).toBe(true);
      expect(isPauseRequested("job-2")).toBe(true);
      expect(isPauseRequested("job-3")).toBe(false);
    });
  });

  describe("clearPause", () => {
    it("removes the pause flag for a job", () => {
      requestPause("job-1");
      expect(isPauseRequested("job-1")).toBe(true);
      clearPause("job-1");
      expect(isPauseRequested("job-1")).toBe(false);
    });

    it("is idempotent — clearing non-existent flag does not throw", () => {
      expect(() => clearPause("nonexistent")).not.toThrow();
    });
  });

  describe("removeJob", () => {
    it("cleans up pause flag for a job", () => {
      requestPause("job-1");
      removeJob("job-1");
      expect(isPauseRequested("job-1")).toBe(false);
    });

    it("is idempotent — removing non-existent flag does not throw", () => {
      expect(() => removeJob("nonexistent")).not.toThrow();
    });
  });
});
