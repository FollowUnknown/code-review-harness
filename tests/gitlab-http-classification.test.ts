import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "http";
import {
  fetchCompareDiffsDetailed,
  fetchCompareDiffsForBranches,
  DEFAULT_COMPARE_REQUEST_TIMEOUT_MS,
  LEGACY_COMPARE_REQUEST_TIMEOUT_MS,
} from "../src/server/services/gitlab.js";

/**
 * 走真实 HTTP 的分类测试：验证 404 / 401 / 5xx / 200 与超时的归类，
 * 以及 fetchCompareDiffsForBranches 的向后兼容语义。
 * （不 mock，避免「分类逻辑零覆盖」——它是本次修复的命门）
 */
let server: http.Server;
let baseUrl = "";

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = req.url ?? "";

    if (url.includes("/slow")) {
      setTimeout(() => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ diffs: [] }));
      }, 500);
      return;
    }

    if (url.includes("/branch-not-found")) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "404 Branch Not Found" }));
      return;
    }

    if (url.includes("/project-not-found")) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "404 Project Not Found" }));
      return;
    }

    if (url.includes("/unauthorized")) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "401 Unauthorized" }));
      return;
    }

    if (url.includes("/boom")) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "500 Internal Server Error" }));
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        diffs: [
          {
            old_path: "a.ts",
            new_path: "a.ts",
            new_file: false,
            deleted_file: false,
            diff: "+line",
          },
        ],
      })
    );
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("server address unavailable");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("fetchCompareDiffsDetailed — 真实 HTTP 响应分类", () => {
  it("200 → ok，并返回 diffs", async () => {
    const result = await fetchCompareDiffsDetailed(baseUrl, "ok-project", "src", "tgt", "token");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.diffs).toHaveLength(1);
  });

  it("404 Branch Not Found → no-branch，message 保留响应体", async () => {
    const result = await fetchCompareDiffsDetailed(
      baseUrl,
      "branch-not-found",
      "src",
      "tgt",
      "token"
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("no-branch");
      expect(result.status).toBe(404);
      expect(result.message).toContain("Branch Not Found");
    }
  });

  it("404 Project Not Found 仍归 no-branch，但 message 可与分支不存在区分", async () => {
    const result = await fetchCompareDiffsDetailed(
      baseUrl,
      "project-not-found",
      "src",
      "tgt",
      "token"
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("no-branch");
      expect(result.message).toContain("Project Not Found");
    }
  });

  it("401 → error（不是 no-branch，避免把鉴权失败当成没有变更）", async () => {
    const result = await fetchCompareDiffsDetailed(
      baseUrl,
      "unauthorized",
      "src",
      "tgt",
      "token"
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("error");
      expect(result.status).toBe(401);
    }
  });

  it("500 → error 且带状态码", async () => {
    const result = await fetchCompareDiffsDetailed(baseUrl, "boom", "src", "tgt", "token");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("error");
      expect(result.status).toBe(500);
    }
  });

  it("单请求超时可配置，超时归为 error", async () => {
    const result = await fetchCompareDiffsDetailed(
      baseUrl,
      "slow",
      "src",
      "tgt",
      "token",
      100
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("error");
      expect(result.message).toContain("timed out");
    }
  });
});

describe("fetchCompareDiffsForBranches — 向后兼容回归", () => {
  it("成功时返回数组（local-scan 依赖该语义）", async () => {
    const diffs = await fetchCompareDiffsForBranches(baseUrl, "ok-project", "src", "tgt", "token");
    expect(Array.isArray(diffs)).toBe(true);
    expect(diffs).toHaveLength(1);
  });

  it("失败时返回 null 且不抛出", async () => {
    const diffs = await fetchCompareDiffsForBranches(
      baseUrl,
      "branch-not-found",
      "src",
      "tgt",
      "token"
    );
    expect(diffs).toBeNull();
  });

  it("服务不可达时返回 null 且不抛出", async () => {
    const diffs = await fetchCompareDiffsForBranches(
      "http://127.0.0.1:1",
      "whatever",
      "src",
      "tgt",
      "token"
    );
    expect(diffs).toBeNull();
  });
});

describe("超时契约", () => {
  it("preview 快路径 10s；完整评审路径沿用 30s，不得随快路径一起收紧", () => {
    expect(DEFAULT_COMPARE_REQUEST_TIMEOUT_MS).toBe(10_000);
    expect(LEGACY_COMPARE_REQUEST_TIMEOUT_MS).toBe(30_000);
  });
});
