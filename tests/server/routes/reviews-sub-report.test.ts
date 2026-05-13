import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from "vitest";
import { getDb, closeDb } from "../../../src/server/db";
import { saveReviewRecord } from "../../../src/server/services/review-store";
import { createSubReport, updateSubReport } from "../../../src/server/services/review-sub-report-store";
import type { Request, Response } from "express";

process.env.KNOWLEDGE_DB_PATH = ":memory:";

beforeEach(() => {
  closeDb();
  getDb();
});

afterEach(() => {
  closeDb();
});

// ---- Helpers ----

function mockReq(overrides: Partial<Request> = {}): Request {
  return { body: {}, query: {}, params: {}, ...overrides } as Request;
}

function mockRes(): Response & { _status: number; _json: unknown } {
  const res: Record<string, unknown> = {
    _status: 200,
    _json: null,
    status: vi.fn(function (this: any, code: number) { this._status = code; return this; }),
    json: vi.fn(function (this: any, data: unknown) { this._json = data; return this; }),
    setHeader: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
  };
  return res as unknown as Response & { _status: number; _json: unknown };
}

function createTestReview(reviewId: string, status: string, mrUrl: string): void {
  saveReviewRecord({
    id: reviewId,
    mr_url: mrUrl,
    project: "test-product",
    product_line_id: "test-product",
    author: null,
    status: status as any,
    report_json: JSON.stringify({ reviewId, productLine: "test-product" }),
    classification_json: null,
    requirement_json: null,
    mr_meta_json: null,
    reviewed_commit_sha: null,
    passed: null,
    avg_score: null,
    issue_count: null,
    critical_count: 0,
    created_by: "user-1",
    knowledge_dispositions_json: null,
  });
}

describe("reviews route - sub-report integration", () => {
  let listHandler: (req: Request, res: Response) => void;
  let detailHandler: (req: Request, res: Response) => void;
  let subReportsHandler: (req: Request, res: Response) => void;
  let checkpointHandler: (req: Request, res: Response) => void;

  beforeAll(async () => {
    const { default: router } = await import("../../../src/server/routes/reviews");
    const stack = (router as any).stack;
    for (const layer of stack) {
      if (!layer.route) continue;
      const path = layer.route.path;
      const method = Object.keys(layer.route.methods)[0];
      const handler = layer.route.stack[0].handle;

      if (method === "get" && path === "/") listHandler = handler;
      else if (method === "get" && path === "/:id") detailHandler = handler;
      else if (method === "get" && path === "/:id/sub-reports") subReportsHandler = handler;
      else if (method === "get" && path === "/:id/checkpoint") checkpointHandler = handler;
    }
  });

  describe("GET / — list enrichment", () => {
    it("enriches requirement reviews with subReportStats", () => {
      const reviewId = "R-REQ-001";
      createTestReview(reviewId, "reviewing", "requirement://test-product/feature..main");
      createSubReport(reviewId, "proj-a", "java-backend");
      createSubReport(reviewId, "proj-b", "vue-frontend");
      updateSubReport(1, { status: "completed" });

      const req = mockReq({ query: { page: "1", pageSize: "20" } });
      const res = mockRes();
      listHandler(req, res);
      expect(res._status).toBe(200);
      const result = res._json as any;
      expect(result.items).toHaveLength(1);
      expect(result.items[0].subReportStats).toBeDefined();
      expect(result.items[0].subReportStats.completed).toBe(1);
      expect(result.items[0].subReportStats.total).toBe(2);
    });

    it("does not add subReportStats for MR reviews", () => {
      const reviewId = "R-MR-001";
      createTestReview(reviewId, "completed", "https://gitlab.com/team/project/-/merge_requests/1");
      createSubReport(reviewId, "proj-a", "java-backend");

      const req = mockReq({ query: { page: "1", pageSize: "20" } });
      const res = mockRes();
      listHandler(req, res);
      const result = res._json as any;
      expect(result.items[0].subReportStats).toBeUndefined();
    });
  });

  describe("GET /:id — detail", () => {
    it("returns 200 for an existing review", () => {
      const reviewId = "R-DTL-001";
      createTestReview(reviewId, "completed", "requirement://test-product/feature..main");

      const req = mockReq({ params: { id: reviewId } });
      const res = mockRes();
      detailHandler(req, res);
      expect(res._status).toBe(200);
      const result = res._json as any;
      expect(result.record).toBeDefined();
      expect(result.record.id).toBe(reviewId);
    });

    it("returns 404 for non-existent review", () => {
      const req = mockReq({ params: { id: "R-NONEXIST" } });
      const res = mockRes();
      detailHandler(req, res);
      expect(res._status).toBe(404);
    });
  });

  describe("GET /:id/sub-reports", () => {
    it("returns sub-reports for an existing review", () => {
      const reviewId = "R-SUB-001";
      createTestReview(reviewId, "reviewing", "requirement://test-product/feature..main");
      createSubReport(reviewId, "proj-a", "java-backend");
      createSubReport(reviewId, "proj-b", "vue-frontend");

      const req = mockReq({ params: { id: reviewId } });
      const res = mockRes();
      subReportsHandler(req, res);
      expect(res._status).toBe(200);
      const subs = res._json as any[];
      expect(subs).toHaveLength(2);
      expect(subs[0].project).toBe("proj-a");
      expect(subs[1].project).toBe("proj-b");
    });

    it("returns 404 when review does not exist", () => {
      const req = mockReq({ params: { id: "R-NONEXIST" } });
      const res = mockRes();
      subReportsHandler(req, res);
      expect(res._status).toBe(404);
    });

    it("returns empty array when no sub-reports exist", () => {
      const reviewId = "R-EMPTY";
      createTestReview(reviewId, "reviewing", "requirement://test-product/feature..main");

      const req = mockReq({ params: { id: reviewId } });
      const res = mockRes();
      subReportsHandler(req, res);
      expect(res._status).toBe(200);
      expect(res._json).toEqual([]);
    });
  });

  describe("GET /:id/checkpoint", () => {
    it("returns 404 when review does not exist", () => {
      const req = mockReq({ params: { id: "R-NONEXIST" } });
      const res = mockRes();
      checkpointHandler(req, res);
      expect(res._status).toBe(404);
    });

    it("returns null when no matching checkpoint", () => {
      const reviewId = "R-NOCP";
      createTestReview(reviewId, "completed", "requirement://test-product/feature..main");

      const req = mockReq({ params: { id: reviewId } });
      const res = mockRes();
      checkpointHandler(req, res);
      expect(res._status).toBe(200);
      expect(res._json).toBeNull();
    });
  });
});
