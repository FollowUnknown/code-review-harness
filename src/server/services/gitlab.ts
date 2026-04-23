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
  const data = await fetchJSON<{ changes: GitLabDiff[] }>(
    `${host}/api/v4/projects/${encoded}/merge_requests/${iid}/changes`,
    token
  );
  return data.changes || [];
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
