import { describe, it, expect } from "vitest";
import { fetchCompareForProjects } from "../src/server/services/gitlab.js";
import type { CompareDetailResult } from "../src/server/services/gitlab.js";

/** 构造 5 个假项目，用于并发/重试行为测试 */
function makeTargets(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    project: `p${i + 1}`,
    gitlabHost: "https://gl.example.com",
    gitlabProjectPath: `group/p${i + 1}`,
  }));
}

const okResult = (files = 1): CompareDetailResult => ({
  ok: true,
  diffs: Array.from({ length: files }, (_, i) => ({
    old_path: `a${i}.ts`,
    new_path: `a${i}.ts`,
    new_file: false,
    deleted_file: false,
    diff: "+line",
  })),
});

const errorResult = (message = "socket hang up"): CompareDetailResult => ({
  ok: false,
  kind: "error",
  message,
});

const notFoundResult = (): CompareDetailResult => ({
  ok: false,
  kind: "no-branch",
  status: 404,
  message: "GitLab API 404: {\"message\":\"404 Branch Not Found\"}",
});

describe("fetchCompareForProjects — 受控并发", () => {
  it("同时进行的请求数不超过 concurrency", async () => {
    let active = 0;
    let maxActive = 0;
    const fetcher = async (): Promise<CompareDetailResult> => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
      return okResult();
    };

    await fetchCompareForProjects(makeTargets(9), "src", "tgt", "token", {
      fetcher,
      concurrency: 3,
    });

    expect(maxActive).toBeLessThanOrEqual(3);
    expect(maxActive).toBeGreaterThan(1);
  });

  it("结果顺序与输入项目顺序一致", async () => {
    const fetcher = async (
      _host: string,
      projectPath: string,
    ): Promise<CompareDetailResult> => ({
      ok: true,
      diffs: [
        {
          old_path: projectPath,
          new_path: projectPath,
          new_file: false,
          deleted_file: false,
          diff: "+x",
        },
      ],
    });

    const outcomes = await fetchCompareForProjects(makeTargets(6), "src", "tgt", "token", {
      fetcher,
      concurrency: 2,
    });

    expect(outcomes.map((o) => o.project)).toEqual(["p1", "p2", "p3", "p4", "p5", "p6"]);
  });
});

describe("fetchCompareForProjects — 失败分类与重试", () => {
  it("404（分支不存在）不重试，记为 no-branch", async () => {
    let calls = 0;
    const fetcher = async (): Promise<CompareDetailResult> => {
      calls += 1;
      return notFoundResult();
    };

    const outcomes = await fetchCompareForProjects(makeTargets(3), "src", "tgt", "token", {
      fetcher,
      concurrency: 3,
      retries: 2,
      retryDelayMs: 0,
    });

    expect(calls).toBe(3); // 每个项目只调一次
    expect(outcomes.every((o) => o.status === "no-branch")).toBe(true);
  });

  it("调用故障会重试，重试成功后记为 changed", async () => {
    const attempts = new Map<string, number>();
    const fetcher = async (
      _host: string,
      projectPath: string,
    ): Promise<CompareDetailResult> => {
      const n = (attempts.get(projectPath) ?? 0) + 1;
      attempts.set(projectPath, n);
      return n === 1 ? errorResult() : okResult(2);
    };

    const outcomes = await fetchCompareForProjects(makeTargets(2), "src", "tgt", "token", {
      fetcher,
      concurrency: 2,
      retries: 1,
      retryDelayMs: 0,
    });

    expect(attempts.get("group/p1")).toBe(2);
    expect(outcomes.every((o) => o.status === "changed")).toBe(true);
  });

  it("重试耗尽后记为 failed，并保留原因", async () => {
    let calls = 0;
    const fetcher = async (): Promise<CompareDetailResult> => {
      calls += 1;
      return errorResult("connect ETIMEDOUT");
    };

    const outcomes = await fetchCompareForProjects(makeTargets(2), "src", "tgt", "token", {
      fetcher,
      concurrency: 2,
      retries: 1,
      retryDelayMs: 0,
    });

    expect(calls).toBe(4); // 2 个项目 × (1 次 + 1 次重试)
    expect(outcomes.every((o) => o.status === "failed")).toBe(true);
    expect(outcomes.map((o) => ("reason" in o ? o.reason : "")).join(" ")).toContain("ETIMEDOUT");
  });

  it("有分支但无差异记为 unchanged，不是 failed", async () => {
    const fetcher = async (): Promise<CompareDetailResult> => okResult(0);

    const outcomes = await fetchCompareForProjects(makeTargets(3), "src", "tgt", "token", {
      fetcher,
      concurrency: 3,
      retries: 1,
      retryDelayMs: 0,
    });

    expect(outcomes.every((o) => o.status === "unchanged")).toBe(true);
  });

  it("单个项目异常不阻断其他项目", async () => {
    const fetcher = async (
      _host: string,
      projectPath: string,
    ): Promise<CompareDetailResult> => {
      if (projectPath.endsWith("p2")) throw new Error("unexpected crash");
      return okResult(1);
    };

    const outcomes = await fetchCompareForProjects(makeTargets(3), "src", "tgt", "token", {
      fetcher,
      concurrency: 3,
      retries: 0,
    });

    expect(outcomes).toHaveLength(3);
    expect(outcomes.filter((o) => o.status === "changed")).toHaveLength(2);
    expect(outcomes.filter((o) => o.status === "failed")).toHaveLength(1);
  });
});

describe("fetchCompareForProjects — 预算与参数健壮性", () => {
  it("空项目列表返回空数组", async () => {
    const outcomes = await fetchCompareForProjects([], "src", "tgt", "token", {
      fetcher: async () => okResult(),
    });
    expect(outcomes).toEqual([]);
  });

  it("超出整批预算时，剩余项目直接判 failed 且仍逐一给出结果", async () => {
    const fetcher = async (): Promise<CompareDetailResult> => {
      await new Promise((r) => setTimeout(r, 30));
      return okResult(1);
    };

    const outcomes = await fetchCompareForProjects(makeTargets(10), "src", "tgt", "token", {
      fetcher,
      concurrency: 2,
      retries: 0,
      deadlineMs: 50,
    });

    expect(outcomes).toHaveLength(10); // 每个项目都有结果，便于调用方对账
    expect(outcomes.map((o) => o.project)).toEqual(
      Array.from({ length: 10 }, (_, i) => `p${i + 1}`),
    );
    const failed = outcomes.filter((o) => o.status === "failed");
    expect(failed.length).toBeGreaterThan(0);
    expect(String((failed[0] as { reason?: string }).reason)).toContain("预算耗尽");
  });

  it("未显式指定并发时使用默认上限，且不因非法值静默返回空", async () => {
    let active = 0;
    let maxActive = 0;
    const fetcher = async (): Promise<CompareDetailResult> => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
      return okResult(1);
    };

    const outcomes = await fetchCompareForProjects(makeTargets(12), "src", "tgt", "token", {
      fetcher,
      retryDelayMs: 0,
    });

    expect(outcomes).toHaveLength(12);
    expect(maxActive).toBe(5); // 默认并发上限

    // 非法 concurrency / retries 应回退到默认值，而不是 slice(0, NaN) 得到空结果
    const guarded = await fetchCompareForProjects(makeTargets(3), "src", "tgt", "token", {
      fetcher,
      concurrency: Number.NaN,
      retries: Number.NaN,
      retryDelayMs: 0,
    });
    expect(guarded).toHaveLength(3);
  });

  it("最后一次尝试失败后不再退避等待", async () => {
    const started = Date.now();
    const outcomes = await fetchCompareForProjects(makeTargets(1), "src", "tgt", "token", {
      fetcher: async () => errorResult(),
      retries: 1,
      retryDelayMs: 400,
      concurrency: 1,
    });

    expect(outcomes[0].status).toBe("failed");
    // 1 次退避 400ms；若最后一次也等待，耗时会接近 800ms
    expect(Date.now() - started).toBeLessThan(750);
  });
});
