import https from "https";
import http from "http";
import { GitLabMRMeta, GitLabDiff } from "../../shared/types";

/** GitLab API 返回非 2xx 时抛出，便于调用方按状态码分类（404 / 401 / 5xx 等） */
export class GitLabApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "GitLabApiError";
    this.status = status;
  }
}

function fetchJSON<T>(url: string, token: string, timeoutMs = 30000): Promise<T> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === "https:" ? https : http;
    const req = mod.get(
      url,
      {
        headers: { "PRIVATE-TOKEN": token },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data));
            } catch {
              reject(new Error(`Failed to parse JSON from ${url}`));
            }
          } else {
            reject(
              new GitLabApiError(
                res.statusCode ?? 0,
                `GitLab API ${res.statusCode}: ${data.slice(0, 200)}`
              )
            );
          }
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error(`Request to ${url} timed out`));
    });
  });
}

export interface ParsedMRUrl {
  host: string;
  projectPath: string;
  iid: number;
}

export function parseMRUrl(mrUrl: string): ParsedMRUrl {
  // https://gitlab.example.com/group/project/-/merge_requests/123
  const match = mrUrl.match(/^(https?:\/\/[^/]+)\/(.+?)\/-\/merge_requests\/(\d+)/);
  if (!match) {
    throw new Error(`Invalid MR URL: ${mrUrl}`);
  }
  return {
    host: match[1],
    projectPath: decodeURIComponent(match[2]),
    iid: parseInt(match[3], 10),
  };
}

export async function fetchMRMeta(
  host: string,
  projectPath: string,
  iid: number,
  token: string
): Promise<GitLabMRMeta> {
  const encoded = encodeURIComponent(projectPath);
  return fetchJSON<GitLabMRMeta>(
    `${host}/api/v4/projects/${encoded}/merge_requests/${iid}`,
    token
  );
}

export async function fetchMRDiffs(
  host: string,
  projectPath: string,
  iid: number,
  token: string
): Promise<GitLabDiff[]> {
  const encoded = encodeURIComponent(projectPath);
  const data = await fetchJSON<{ changes: GitLabDiff[] } & { diff_refs?: { head_sha: string } }>(
    `${host}/api/v4/projects/${encoded}/merge_requests/${iid}/changes`,
    token
  );
  const diffs = data.changes || [];

  // Fill empty diffs for new files by fetching raw file content
  const headSha = data.diff_refs?.head_sha;
  const emptyNewFiles = diffs.filter((d) => d.new_file && !d.deleted_file && d.diff.trim() === "");
  if (emptyNewFiles.length > 0 && headSha) {
    await fillEmptyDiffs(host, projectPath, headSha, emptyNewFiles, token);
  }

  return diffs;
}

/**
 * For new files where GitLab omitted the diff (too large or too many files),
 * fetch the raw file content via the repository files API and construct a
 * full-add diff.
 */
async function fillEmptyDiffs(
  host: string,
  projectPath: string,
  ref: string,
  diffs: GitLabDiff[],
  token: string,
  concurrency = 5,
): Promise<void> {
  const encoded = encodeURIComponent(projectPath);
  const encodedRef = encodeURIComponent(ref);

  // Process in batches to avoid overwhelming the API
  for (let i = 0; i < diffs.length; i += concurrency) {
    const batch = diffs.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      batch.map(async (d) => {
        const filePath = encodeURIComponent(d.new_path);
        const url = `${host}/api/v4/projects/${encoded}/repository/files/${filePath}/raw?ref=${encodedRef}`;
        const res = await new Promise<string>((resolve, reject) => {
          const parsed = new URL(url);
          const mod = parsed.protocol === "https:" ? https : http;
          const req = mod.get(url, { headers: { "PRIVATE-TOKEN": token } }, (res) => {
            let body = "";
            res.on("data", (chunk) => (body += chunk));
            res.on("end", () => {
              if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                resolve(body);
              } else {
                reject(new Error(`HTTP ${res.statusCode} for ${d.new_path}`));
              }
            });
          });
          req.on("error", reject);
          req.setTimeout(15000, () => { req.destroy(); reject(new Error("timeout")); });
        });
        // Construct a unified diff: all lines added
        const lines = res.split("\n");
        const diffLines = [`--- /dev/null`, `+++ b/${d.new_path}`];
        for (const line of lines) {
          diffLines.push(`+${line}`);
        }
        d.diff = diffLines.join("\n");
      }),
    );
    // Log failures but don't block
    results.forEach((r, idx) => {
      if (r.status === "rejected") {
        console.warn(`[gitlab] Failed to fetch raw file ${batch[idx].new_path}: ${r.reason}`);
      }
    });
  }
}

export async function fetchMRHeadSha(
  host: string,
  projectPath: string,
  iid: number,
  token: string
): Promise<string | null> {
  const encoded = encodeURIComponent(projectPath);
  const data = await fetchJSON<Record<string, unknown>>(
    `${host}/api/v4/projects/${encoded}/merge_requests/${iid}`,
    token
  );
  const diffRefs = data.diff_refs as Record<string, unknown> | undefined;
  return (diffRefs?.head_sha as string) || null;
}

export async function fetchCompareDiffs(
  host: string,
  projectPath: string,
  fromSha: string,
  toSha: string,
  token: string
): Promise<GitLabDiff[]> {
  const encoded = encodeURIComponent(projectPath);
  const data = await fetchJSON<{ diffs: GitLabDiff[] }>(
    `${host}/api/v4/projects/${encoded}/repository/compare?from=${fromSha}&to=${toSha}`,
    token
  );
  return data.diffs || [];
}

/**
 * compare 调用结果。区分「分支不存在」与「调用故障」：
 * 前者是正常业务情况（该项目没有这个分支），后者代表查询没成功、结果不可信。
 *
 * 注意：GitLab 对「无权限访问的项目」同样返回 404，因此 no-branch 的 message
 * 必须原样保留（其中含响应体），用于区分 Branch Not Found / Project Not Found。
 */
export type CompareDetailResult =
  | { ok: true; diffs: GitLabDiff[] }
  | { ok: false; kind: "no-branch"; status: number; message: string }
  | { ok: false; kind: "error"; status?: number; message: string };

/**
 * compare 单请求超时（经验值，未做慢链路对照实验）。
 * 取 10s 是为了让「重试 × 超时」不至于把 preview 拖到分钟级；实际是 req.setTimeout
 * 的空闲超时语义，对持续流动的大响应体不构成硬上界。
 */
export const DEFAULT_COMPARE_REQUEST_TIMEOUT_MS = 10_000;

/** 完整评审路径（local-scan）沿用原有 30s，避免随 compare 快路径一起收紧、放大失败面 */
export const LEGACY_COMPARE_REQUEST_TIMEOUT_MS = 30_000;

export async function fetchCompareDiffsDetailed(
  host: string,
  projectPath: string,
  sourceBranch: string,
  targetBranch: string,
  token: string,
  timeoutMs: number = DEFAULT_COMPARE_REQUEST_TIMEOUT_MS
): Promise<CompareDetailResult> {
  const encoded = encodeURIComponent(projectPath);
  const from = encodeURIComponent(targetBranch);
  const to = encodeURIComponent(sourceBranch);
  const url = `${host}/api/v4/projects/${encoded}/repository/compare?from=${from}&to=${to}`;
  try {
    const data = await fetchJSON<{ diffs: GitLabDiff[] }>(url, token, timeoutMs);
    return { ok: true, diffs: data.diffs || [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // fetchJSON 的非 2xx 路径统一抛 GitLabApiError，状态码直接取，不再解析错误消息文本
    const status = error instanceof GitLabApiError ? error.status : undefined;
    if (status === 404) {
      return { ok: false, kind: "no-branch", status, message };
    }
    return { ok: false, kind: "error", status, message };
  }
}

export async function fetchCompareDiffsForBranches(
  host: string,
  projectPath: string,
  sourceBranch: string,
  targetBranch: string,
  token: string
): Promise<GitLabDiff[] | null> {
  // 该函数同时服务完整评审路径（local-scan），沿用 30s，不随 compare 快路径收紧
  const result = await fetchCompareDiffsDetailed(
    host,
    projectPath,
    sourceBranch,
    targetBranch,
    token,
    LEGACY_COMPARE_REQUEST_TIMEOUT_MS
  );
  if (result.ok) return result.diffs;
  // Branch not found, 404, or other API errors — return null for fallback
  console.warn(
    `[gitlab] fetchCompareDiffsForBranches failed for ${projectPath}: ${result.message}`
  );
  return null;
}

export interface CompareProjectTarget {
  project: string;
  gitlabHost: string;
  gitlabProjectPath: string;
}

export type CompareOutcome =
  | { project: string; status: "changed"; diffs: GitLabDiff[] }
  | { project: string; status: "unchanged" }
  | { project: string; status: "no-branch"; reason: string }
  | { project: string; status: "failed"; reason: string };

/** 供路由层复用的状态字面量联合 */
export type CompareStatus = CompareOutcome["status"];

export interface CompareBatchOptions {
  /** 同时进行的 compare 请求数上限 */
  concurrency?: number;
  /** 调用故障的重试次数（分支不存在不重试） */
  retries?: number;
  retryDelayMs?: number;
  /** 单请求超时，透传给 fetcher */
  requestTimeoutMs?: number;
  /** 整批总预算：超出后剩余项目直接判 failed，避免「重试 × 超时」把接口拖到分钟级 */
  deadlineMs?: number;
  /** 便于测试注入 */
  fetcher?: typeof fetchCompareDiffsDetailed;
}

// v1.4.10: 并发上限取 5。测试环境链路在「一次性并发 29 个新建连接」时高概率失败，
// 而并发过低又会让 preview 变慢，5 是当前取值（未做严格的并发度对照实验，如需调整改这里）。
const DEFAULT_COMPARE_CONCURRENCY = 5;
const DEFAULT_COMPARE_RETRIES = 1;
const DEFAULT_COMPARE_RETRY_DELAY_MS = 500;
/**
 * 整批预算。注意这是「批间」预算：检查发生在每批开始之前，
 * 因此实际上界是 `deadlineMs + 单批最坏耗时`（不是 deadlineMs），并发越低越接近失效。
 * 它拦的是「还没开始的批次」，拦不住「已经开始的那一批」。
 */
const DEFAULT_COMPARE_DEADLINE_MS = 40_000;

/**
 * 非法值（undefined / NaN / 负数 / 0）一律回退默认值。
 * 也就是说 0 或负数无法用来「关闭」预算或重试；需要放宽请传入一个很大的数值。
 */
function positiveIntOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 1
    ? Math.floor(value)
    : fallback;
}

function nonNegativeIntOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * v1.4.10: 批量拉取多个项目的 compare 结果（受控并发 + 故障重试 + 整批预算）。
 * 单个项目失败不影响其他项目；结果顺序与输入项目顺序一致；
 * 每个输入项目都必然产出一条结果（含 failed），便于调用方对账。
 */
export async function fetchCompareForProjects(
  targets: CompareProjectTarget[],
  sourceBranch: string,
  targetBranch: string,
  token: string,
  options: CompareBatchOptions = {}
): Promise<CompareOutcome[]> {
  const concurrency = positiveIntOr(options.concurrency, DEFAULT_COMPARE_CONCURRENCY);
  const retries = nonNegativeIntOr(options.retries, DEFAULT_COMPARE_RETRIES);
  const retryDelayMs = nonNegativeIntOr(options.retryDelayMs, DEFAULT_COMPARE_RETRY_DELAY_MS);
  const requestTimeoutMs = positiveIntOr(
    options.requestTimeoutMs,
    DEFAULT_COMPARE_REQUEST_TIMEOUT_MS
  );
  const deadlineMs = positiveIntOr(options.deadlineMs, DEFAULT_COMPARE_DEADLINE_MS);
  const fetcher = options.fetcher ?? fetchCompareDiffsDetailed;
  const startedAt = Date.now();

  const runOne = async (target: CompareProjectTarget): Promise<CompareOutcome> => {
    let lastReason = "unknown error";

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      let result: CompareDetailResult;
      try {
        result = await fetcher(
          target.gitlabHost,
          target.gitlabProjectPath,
          sourceBranch,
          targetBranch,
          token,
          requestTimeoutMs
        );
      } catch (error) {
        // 注入的实现可能直接抛错，同样按调用故障处理
        result = {
          ok: false,
          kind: "error",
          message: error instanceof Error ? error.message : String(error),
        };
      }

      if (result.ok) {
        return result.diffs.length > 0
          ? { project: target.project, status: "changed", diffs: result.diffs }
          : { project: target.project, status: "unchanged" };
      }
      // 分支不存在属正常业务情况，重试没有意义
      if (result.kind === "no-branch") {
        return { project: target.project, status: "no-branch", reason: result.message };
      }

      lastReason = result.message;
      if (attempt < retries) await sleep(retryDelayMs * (attempt + 1));
    }

    console.warn(
      `[gitlab] compare failed for ${target.gitlabProjectPath} after ${retries + 1} attempt(s): ${lastReason}`
    );
    return { project: target.project, status: "failed", reason: lastReason };
  };

  const outcomes: CompareOutcome[] = [];
  for (let i = 0; i < targets.length; i += concurrency) {
    const chunk = targets.slice(i, i + concurrency);

    // 超出整批预算：剩余项目不再发起请求，直接标记失败（保证每个项目都有结果）
    if (Date.now() - startedAt >= deadlineMs) {
      for (const target of chunk) {
        outcomes.push({
          project: target.project,
          status: "failed",
          reason: `compare 查询超时预算耗尽（${deadlineMs}ms）`,
        });
      }
      continue;
    }

    outcomes.push(...(await Promise.all(chunk.map(runOne))));
  }
  return outcomes;
}
