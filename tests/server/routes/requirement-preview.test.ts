import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import type { Request, Response } from "express";
import Database from "better-sqlite3";
import { getDb, closeDb } from "../../../src/server/db";
import {
  setRepoMapping,
  setRepoMappingProductLine,
  setRepoMappingGitlab,
} from "../../../src/server/config/repo-mapping";
import { fetchCompareForProjects } from "../../../src/server/services/gitlab";

vi.mock("../../../src/server/services/gitlab", () => ({
  fetchCompareForProjects: vi.fn(),
  fetchCompareDiffsForBranches: vi.fn(),
}));

vi.mock("../../../src/server/services/local-scan", () => ({
  buildMultiProjectScanContext: vi.fn(async () => ({
    projects: [],
    totalFiles: 0,
    totalTokens: 0,
    projectCount: 0,
  })),
  buildRelatedFilesPrompt: vi.fn(),
  buildASTContextPrompt: vi.fn(),
}));

// 注意：当前 db.ts 在 initialize() 最开始执行 runMigrations()，而 002 migration 需要 llm_logs 表，
// 全新库会直接失败（既有问题，与本次改动无关，已单独记录）。这里预先写入 schema_version，
// 模拟“migration 已应用过”的既有库，避免被该问题阻塞。
const TEST_DB_PATH = path.join(os.tmpdir(), `cr-preview-test-${process.pid}.db`);
fs.rmSync(TEST_DB_PATH, { force: true });
{
  const seed = new Database(TEST_DB_PATH);
  seed.exec(
    "CREATE TABLE IF NOT EXISTS schema_version (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))"
  );
  const insert = seed.prepare("INSERT OR IGNORE INTO schema_version (version) VALUES (?)");
  insert.run("001_schema_version.sql");
  insert.run("002_llm_logs_provider_model_index.sql");
  seed.close();
}
process.env.KNOWLEDGE_DB_PATH = TEST_DB_PATH;
process.env.GITLAB_TOKEN = "test-token";

const mockedBatch = vi.mocked(fetchCompareForProjects);

function mockReq(overrides: Partial<Request> = {}): Request {
  return { body: {}, query: {}, params: {}, ...overrides } as Request;
}

function mockRes(): Response & { _status: number; _json: unknown } {
  const res = {
    _status: 200,
    _json: null as unknown,
    status: vi.fn(function (code: number) {
      res._status = code;
      return res;
    }),
    json: vi.fn(function (data: unknown) {
      res._json = data;
      return res;
    }),
    setHeader: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
  };
  return res as unknown as Response & { _status: number; _json: unknown };
}

/** 注册一个带 GitLab 配置的项目映射 */
function seedProject(project: string, productLine: string): void {
  setRepoMapping(project, `/tmp/${project}`);
  setRepoMappingProductLine(project, productLine);
  setRepoMappingGitlab(project, "https://gl.example.com", `group/${project}`);
}

const diff = (path: string, chars = 10) => ({
  old_path: path,
  new_path: path,
  new_file: false,
  deleted_file: false,
  diff: "+".repeat(chars),
});

describe("POST /requirement/preview — 失败分类与状态明细", () => {
  let previewHandler: (req: Request, res: Response) => Promise<void>;

  beforeAll(async () => {
    const { default: router } = await import(
      "../../../src/server/routes/review-requirement"
    );
    for (const layer of (router as any).stack) {
      if (!layer.route) continue;
      const method = Object.keys(layer.route.methods)[0];
      if (method === "post" && layer.route.path === "/requirement/preview") {
        previewHandler = layer.route.stack[0].handle;
      }
    }
  });

  beforeEach(() => {
    closeDb();
    getDb();
    mockedBatch.mockReset();
  });

  afterEach(() => {
    closeDb();
  });

  afterAll(() => {
    fs.rmSync(TEST_DB_PATH, { force: true });
  });

  it("全部项目查询失败时，返回 failures 而不是普通空结果", async () => {
    seedProject("px-a", "line-fail");
    seedProject("px-b", "line-fail");
    mockedBatch.mockResolvedValue([
      { project: "px-a", status: "failed", reason: "connect ETIMEDOUT" },
      { project: "px-b", status: "failed", reason: "socket hang up" },
    ]);

    const res = mockRes();
    await previewHandler(
      mockReq({
        body: {
          productLine: "line-fail",
          sourceBranch: "src",
          targetBranch: "tgt",
        },
      }),
      res
    );

    const json = res._json as any;
    expect(res._status).toBe(200);
    expect(json.projects).toEqual([]);
    expect(json.projectCount).toBe(0);
    expect(json.failures).toHaveLength(2);
    expect(json.failures[0].reason).toContain("ETIMEDOUT");
    // 失败项目同样进入 scanned，保证 scanned.length 与映射总数可对账
    expect(json.scanned).toHaveLength(2);
    expect(json.scanned.every((s: any) => s.status === "failed")).toBe(true);
    expect(json.scanned[0].reason).toContain("ETIMEDOUT");
    // 调用点必须显式声明并发/重试/超时，避免默认值变化时静默改变线上表现
    expect(mockedBatch).toHaveBeenCalledWith(
      expect.any(Array),
      "src",
      "tgt",
      expect.any(String),
      { concurrency: 5, retries: 1, retryDelayMs: 500, requestTimeoutMs: 10_000 },
    );
  });

  it("no-branch / unchanged 计入 scanned，不误报为 failures", async () => {
    seedProject("px-c", "line-mixed");
    seedProject("px-d", "line-mixed");
    seedProject("px-e", "line-mixed");
    mockedBatch.mockResolvedValue([
      { project: "px-c", status: "changed", diffs: [diff("a.ts"), diff("b.ts")] },
      { project: "px-d", status: "unchanged" },
      { project: "px-e", status: "no-branch", reason: "GitLab API 404" },
    ]);

    const res = mockRes();
    await previewHandler(
      mockReq({
        body: {
          productLine: "line-mixed",
          sourceBranch: "src",
          targetBranch: "tgt",
        },
      }),
      res
    );

    const json = res._json as any;
    expect(json.failures).toEqual([]);
    expect(json.scanned).toHaveLength(3);
    expect(json.scanned.map((s: any) => s.status).sort()).toEqual([
      "changed",
      "no-branch",
      "unchanged",
    ]);
    // no-branch 必须保留原始 message：GitLab 对「无权限项目」与「分支不存在」都返回 404
    const noBranch = json.scanned.find((s: any) => s.status === "no-branch");
    expect(noBranch.reason).toContain("404");
    // 原有字段语义不变
    expect(json.projects).toHaveLength(1);
    expect(json.projects[0].project).toBe("px-c");
    expect(json.projects[0].diffCount).toBe(2);
    expect(json.totalFiles).toBe(2);
    expect(json.projectCount).toBe(1);
  });

  it("缺失必填参数时返回 400", async () => {
    const res = mockRes();
    await previewHandler(mockReq({ body: { productLine: "line-x" } }), res);
    expect(res._status).toBe(400);
  });

  it("未配置 GitLab 项目路径的项目走本地兜底，并在 reason 中标注来源", async () => {
    // 只配 localPath，不配 gitlabHost/gitlabProjectPath → 走本地扫描分支
    setRepoMapping("px-local", "/tmp/px-local");
    setRepoMappingProductLine("px-local", "line-local");
    mockedBatch.mockResolvedValue([]);

    const res = mockRes();
    await previewHandler(
      mockReq({
        body: {
          productLine: "line-local",
          sourceBranch: "src",
          targetBranch: "tgt",
        },
      }),
      res
    );

    const json = res._json as any;
    expect(mockedBatch).not.toHaveBeenCalled(); // 该项目不走 GitLab API
    expect(json.scanned).toHaveLength(1);
    expect(json.scanned[0]).toMatchObject({ project: "px-local", status: "unchanged" });
    // 本地扫描无法区分「无变更」与「扫描失败」，必须在 reason 中说明来源
    expect(json.scanned[0].reason).toContain("未走 GitLab API");
  });
});
