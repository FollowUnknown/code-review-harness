import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getDb, closeDb } from "../../../src/server/db";
import { createCheckpoint, updateCheckpoint } from "../../../src/server/services/review-checkpoint-store";
import type { Request, Response } from "express";

process.env.KNOWLEDGE_DB_PATH = ":memory:";

beforeEach(() => {
  closeDb();
  getDb();
});

afterEach(() => {
  closeDb();
});

// ---- Helpers to build mock req/res ----

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    body: {},
    query: {},
    params: {},
    ...overrides,
  } as Request;
}

function mockRes(): Response & { _status: number; _json: unknown; _headers: Record<string, string> } {
  const res = {
    _status: 200,
    _json: null,
    _headers: {} as Record<string, string>,
    status: vi.fn(function (code: number) {
      res._status = code;
      return res;
    }),
    json: vi.fn(function (data: unknown) {
      res._json = data;
      return res;
    }),
    setHeader: vi.fn(function (key: string, value: string) {
      res._headers[key] = value;
      return res;
    }),
    write: vi.fn(),
    end: vi.fn(),
  } as unknown as Response & { _status: number; _json: unknown; _headers: Record<string, string> };
  return res;
}

describe("review-checkpoint-routes", () => {
  // Import the router module inline so DB is initialized before it runs
  let pauseHandler: (req: Request, res: Response) => void;
  let resumeHandler: (req: Request, res: Response) => void;
  let checkpointsHandler: (req: Request, res: Response) => void;
  let deleteHandler: (req: Request, res: Response) => void;

  beforeAll(async () => {
    // Import router and extract handlers by re-creating the router
    const { default: router } = await import("../../../src/server/routes/review-checkpoint-routes");
    const stack = (router as any).stack;
    for (const layer of stack) {
      if (!layer.route) continue;
      const path = layer.route.path;
      const method = Object.keys(layer.route.methods)[0];
      const handler = layer.route.stack[0].handle;

      if (method === "post" && path === "/pause") pauseHandler = handler;
      else if (method === "post" && path === "/resume") resumeHandler = handler;
      else if (method === "get" && path === "/checkpoints") checkpointsHandler = handler;
      else if (method === "delete" && path === "/checkpoints/:id") deleteHandler = handler;
    }
  });

  it("should have all 4 route handlers registered", () => {
    expect(pauseHandler).toBeDefined();
    expect(resumeHandler).toBeDefined();
    expect(checkpointsHandler).toBeDefined();
    expect(deleteHandler).toBeDefined();
  });

  describe("POST /pause", () => {
    it("returns 400 when jobId is missing", () => {
      const req = mockReq({ body: {} });
      const res = mockRes();
      pauseHandler(req, res);
      expect(res._status).toBe(400);
      expect((res._json as any).error).toContain("jobId");
    });

    it("returns 200 with success message when jobId is provided", () => {
      const req = mockReq({ body: { jobId: "JOB-1" } });
      const res = mockRes();
      pauseHandler(req, res);
      expect(res._status).toBe(200);
      expect((res._json as any).success).toBe(true);
      expect((res._json as any).jobId).toBe("JOB-1");
    });
  });

  describe("POST /resume", () => {
    it("returns 400 when checkpointId is missing", () => {
      const req = mockReq({ body: {} });
      const res = mockRes();
      resumeHandler(req, res);
      expect(res._status).toBe(400);
      expect((res._json as any).error).toContain("checkpointId");
    });

    it("returns 404 when checkpoint does not exist", () => {
      const req = mockReq({ body: { checkpointId: "CP-nonexistent" } });
      const res = mockRes();
      resumeHandler(req, res);
      expect(res._status).toBe(404);
    });

    it("returns 400 when checkpoint status is not paused", () => {
      const cp = createCheckpoint({
        reviewType: "mr",
        projectId: "p1",
        totalBatches: 5,
        totalFiles: 50,
        currentBatch: 0,
        reviewedCount: 0,
      });
      // Status is "running" by default — not paused
      const req = mockReq({ body: { checkpointId: cp.id } });
      const res = mockRes();
      resumeHandler(req, res);
      expect(res._status).toBe(400);
      expect((res._json as any).error).toContain("paused");
    });

    it("returns 200 with checkpoint data when paused", () => {
      const cp = createCheckpoint({
        reviewType: "mr",
        projectId: "p1",
        totalBatches: 5,
        totalFiles: 50,
        currentBatch: 2,
        reviewedCount: 20,
      });
      // Manually set to paused
      updateCheckpoint(cp.id, { status: "paused" });

      const req = mockReq({ body: { checkpointId: cp.id } });
      const res = mockRes();
      resumeHandler(req, res);
      expect(res._status).toBe(200);
      expect((res._json as any).checkpoint.id).toBe(cp.id);
      expect((res._json as any).checkpoint.status).toBe("paused");
    });
  });

  describe("GET /checkpoints", () => {
    it("returns empty array when no checkpoints exist", () => {
      const req = mockReq();
      const res = mockRes();
      checkpointsHandler(req, res);
      expect(res._status).toBe(200);
      expect(res._json).toEqual([]);
    });

    it("returns all checkpoints without filters", () => {
      createCheckpoint({
        reviewType: "mr", projectId: "p1",
        totalBatches: 3, totalFiles: 30, currentBatch: 0, reviewedCount: 0,
      });
      createCheckpoint({
        reviewType: "local", projectId: "p1",
        totalBatches: 5, totalFiles: 50, currentBatch: 0, reviewedCount: 0,
      });
      const req = mockReq();
      const res = mockRes();
      checkpointsHandler(req, res);
      expect((res._json as any[]).length).toBeGreaterThanOrEqual(2);
    });

    it("filters by status", () => {
      const cp = createCheckpoint({
        reviewType: "mr", projectId: "p1",
        totalBatches: 3, totalFiles: 30, currentBatch: 0, reviewedCount: 0,
      });
      updateCheckpoint(cp.id, { status: "paused" });

      const req = mockReq({ query: { status: "paused" } });
      const res = mockRes();
      checkpointsHandler(req, res);
      const items = res._json as any[];
      expect(items.length).toBeGreaterThanOrEqual(1);
      expect(items.every((c: any) => c.status === "paused")).toBe(true);
    });

    it("filters by review_type", () => {
      createCheckpoint({
        reviewType: "mr", projectId: "p1",
        totalBatches: 3, totalFiles: 30, currentBatch: 0, reviewedCount: 0,
      });
      createCheckpoint({
        reviewType: "local", projectId: "p2",
        totalBatches: 5, totalFiles: 50, currentBatch: 0, reviewedCount: 0,
      });
      const req = mockReq({ query: { review_type: "local" } });
      const res = mockRes();
      checkpointsHandler(req, res);
      const items = res._json as any[];
      expect(items.every((c: any) => c.reviewType === "local")).toBe(true);
    });

    it("filters by project", () => {
      createCheckpoint({
        reviewType: "mr", projectId: "proj-a",
        totalBatches: 3, totalFiles: 30, currentBatch: 0, reviewedCount: 0,
      });
      createCheckpoint({
        reviewType: "mr", projectId: "proj-b",
        totalBatches: 5, totalFiles: 50, currentBatch: 0, reviewedCount: 0,
      });
      const req = mockReq({ query: { project: "proj-a" } });
      const res = mockRes();
      checkpointsHandler(req, res);
      const items = res._json as any[];
      expect(items.every((c: any) => c.projectId === "proj-a")).toBe(true);
    });
  });

  describe("DELETE /checkpoints/:id", () => {
    it("returns 404 when checkpoint does not exist", () => {
      const req = mockReq({ params: { id: "CP-nonexistent" } });
      const res = mockRes();
      deleteHandler(req, res);
      expect(res._status).toBe(404);
    });

    it("deletes checkpoint permanently without abandon flag", () => {
      const cp = createCheckpoint({
        reviewType: "mr", projectId: "p1",
        totalBatches: 3, totalFiles: 30, currentBatch: 0, reviewedCount: 0,
      });
      const req = mockReq({ params: { id: cp.id } });
      const res = mockRes();
      deleteHandler(req, res);
      expect(res._status).toBe(200);
      expect((res._json as any).action).toBe("deleted");
    });

    it("abandons checkpoint with abandon=true flag", () => {
      const cp = createCheckpoint({
        reviewType: "mr", projectId: "p1",
        totalBatches: 3, totalFiles: 30, currentBatch: 0, reviewedCount: 0,
      });
      const req = mockReq({ params: { id: cp.id }, query: { abandon: "true" } });
      const res = mockRes();
      deleteHandler(req, res);
      expect(res._status).toBe(200);
      expect((res._json as any).action).toBe("abandoned");
    });
  });
});
