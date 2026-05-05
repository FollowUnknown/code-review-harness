import https from "https";
import http from "http";
import { GitLabMRMeta, GitLabDiff } from "../../shared/types";

function fetchJSON<T>(url: string, token: string): Promise<T> {
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
            reject(new Error(`GitLab API ${res.statusCode}: ${data.slice(0, 200)}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(30000, () => {
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
