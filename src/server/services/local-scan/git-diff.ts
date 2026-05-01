import { execSync } from "child_process";
import type { GitLabDiff } from "../../../shared/types";

export function extractLocalDiff(repoPath: string, targetBranch: string, sourceBranch: string): string {
  try {
    execSync(`git fetch origin ${targetBranch} ${sourceBranch} 2>/dev/null || true`, { cwd: repoPath });

    let diff: string;
    try {
      diff = execSync(`git diff origin/${targetBranch}...origin/${sourceBranch} -- .`, {
        cwd: repoPath,
        maxBuffer: 10 * 1024 * 1024,
      }).toString();
    } catch {
      diff = execSync(`git diff ${targetBranch}..${sourceBranch} -- .`, {
        cwd: repoPath,
        maxBuffer: 10 * 1024 * 1024,
      }).toString();
    }

    return diff;
  } catch (error) {
    throw new Error(`Failed to extract diff from ${repoPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function parseDiffToGitLabDiffs(diffText: string): GitLabDiff[] {
  if (!diffText.trim()) return [];

  const diffs: GitLabDiff[] = [];
  const fileSections = diffText.split(/^diff --git /m).filter((s) => s.trim());

  for (const section of fileSections) {
    const headerMatch = section.match(/^a\/(.+?) b\/(.+?)\n/);
    if (!headerMatch) continue;

    const oldPath = headerMatch[1];
    const newPath = headerMatch[2];
    const isNew = section.includes("--- /dev/null");
    const isDeleted = section.includes("+++ /dev/null");
    const isRenamed = oldPath !== newPath;

    const lines = section.split("\n");
    const diffLines: string[] = [];
    let pastHeader = false;

    for (const line of lines) {
      if (line.startsWith("--- ") || line.startsWith("+++ ")) {
        pastHeader = true;
        continue;
      }
      if (pastHeader && (line.startsWith("+") || line.startsWith("-") || line.startsWith("@@") || line.startsWith(" "))) {
        diffLines.push(line);
      }
    }

    diffs.push({
      old_path: oldPath,
      new_path: newPath,
      new_file: isNew,
      deleted_file: isDeleted,
      renamed_file: isRenamed,
      diff: diffLines.join("\n"),
    });
  }

  return diffs;
}
