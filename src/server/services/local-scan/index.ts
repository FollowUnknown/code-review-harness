import fs from "fs";
import path from "path";
import type { GitLabDiff, ScanContext, RelatedFile, ProjectScanResult, TechStack } from "../../../shared/types";
import { extractLocalDiff, parseDiffToGitLabDiffs } from "./git-diff";
import { extractChangedSymbols, classifyFile } from "./symbol-extractor";
import { findRelatedFiles } from "./related-finder";
import { extractFileContext } from "./context-extractor";
import { estimateTokens, truncateRelatedFiles, type RelatedFileWithContext } from "./token-budget";
import { analyzeDiffsWithAST, buildASTContextPrompt, type ASTChangeInfo } from "./ast-analyzer";
import { inferTechStack } from "../techstack";
import { fetchCompareDiffsForBranches } from "../gitlab";

export { buildASTContextPrompt };

const MAX_RELATED_FILES = 10;
const TOKEN_BUDGET = 30000;
const MAX_LINES_PER_FILE = 300;

export interface ScanOptions {
  gitlabDiffs?: GitLabDiff[];   // pre-fetched diffs, skip local git diff
  skipHeavy?: boolean;           // skip AST + related files + context (Preview mode)
}

function extractDiffs(
  repoPath: string,
  targetBranch: string,
  sourceBranch: string,
  options?: ScanOptions,
): GitLabDiff[] {
  // Use pre-fetched GitLab diffs if available, otherwise local git
  if (options?.gitlabDiffs && options.gitlabDiffs.length > 0) {
    return options.gitlabDiffs;
  }
  const diffText = extractLocalDiff(repoPath, targetBranch, sourceBranch);
  return parseDiffToGitLabDiffs(diffText);
}

export async function buildScanContext(
  repoPath: string,
  targetBranch: string,
  sourceBranch: string,
  options?: ScanOptions
): Promise<ScanContext> {
  // 1. Extract diff
  const diffs = extractDiffs(repoPath, targetBranch, sourceBranch, options);

  if (diffs.length === 0) {
    return { diffs, changedSymbols: [], relatedFiles: [], totalTokens: 0 };
  }

  // Preview mode — only need file list + diff stats, skip heavy steps
  if (options?.skipHeavy) {
    const totalTokens = Math.round(diffs.reduce((sum, d) => sum + d.diff.length, 0) / 4);
    return { diffs, changedSymbols: [], relatedFiles: [], totalTokens };
  }

  // 2. Extract changed symbols
  const allSymbols = diffs.flatMap((d) => extractChangedSymbols(d.diff));
  const changedSymbols = [...new Set(allSymbols)];

  // 2.5 AST analysis (tree-sitter based, gracefully degrades)
  let astChanges: ASTChangeInfo[] | undefined;
  try {
    astChanges = await analyzeDiffsWithAST(diffs, repoPath);
    console.log(`[AST] analyzed ${diffs.length} diffs, got ${astChanges?.length ?? 0} results`);
  } catch (e) {
    console.error("[AST] analysis failed:", e instanceof Error ? e.message : e);
    // tree-sitter unavailable, continue without AST
  }

  // 3. Find related files per changed file
  const allRelated = new Map<string, RelatedFile>();
  for (const diff of diffs) {
    const filePath = diff.new_path;
    const fileCategory = classifyFile(filePath);
    const symbols = extractChangedSymbols(diff.diff);

    const related = findRelatedFiles(symbols, filePath, repoPath, {
      maxFiles: fileCategory === "utility" ? 3 : 5,
    });

    for (const r of related) {
      if (!allRelated.has(r.path)) {
        allRelated.set(r.path, r);
      }
    }
  }

  // 4. Extract context from related files
  const filesWithContext: RelatedFileWithContext[] = [];
  for (const [filePath, related] of allRelated) {
    const fullPath = path.join(repoPath, filePath);
    if (!fs.existsSync(fullPath)) continue;

    const rawContent = fs.readFileSync(fullPath, "utf-8");
    const extracted = extractFileContext(rawContent, filePath, { maxLines: MAX_LINES_PER_FILE });

    if (extracted) {
      filesWithContext.push({ ...related, content: extracted });
    }
  }

  // 5. Apply token budget
  const budgetResult = truncateRelatedFiles(filesWithContext, {
    maxFiles: MAX_RELATED_FILES,
    tokenBudget: TOKEN_BUDGET,
  });

  return {
    diffs,
    changedSymbols,
    relatedFiles: budgetResult.accepted,
    totalTokens: budgetResult.totalTokensUsed,
    astChanges,
  };
}

export function buildRelatedFilesPrompt(context: ScanContext): string {
  if (context.relatedFiles.length === 0) return "";

  let prompt = "\n\n## Related File Context\n\n";
  prompt += `Found ${context.relatedFiles.length} related files (${context.totalTokens} estimated tokens):\n\n`;

  for (const file of context.relatedFiles) {
    prompt += `### ${file.path} (${file.reason})\n\`\`\`\n${file.content}\n\`\`\`\n\n`;
  }

  return prompt;
}

// ---- Multi-Project Scan (v1.4.0) ----

export interface MultiProjectScanContext {
  projects: Array<{
    project: string;
    repoPath: string;
    context: ScanContext;
    techStack: TechStack;
    diffCount: number;
    diffChars: number;
    diffPreview: Array<{ path: string; newFile: boolean; diffChars: number }>;
  }>;
  totalFiles: number;
  totalTokens: number;
  projectCount: number;
}

/**
 * GitLab config per project for API-based diff fetching.
 * If provided and token is available, diffs are fetched from GitLab Compare API
 * instead of local git operations, significantly reducing scan time.
 */
export interface GitLabProjectConfig {
  gitlabHost: string;
  gitlabProjectPath: string;
}

export interface MultiProjectScanOptions {
  maxConcurrent?: number;
  gitlabToken?: string;
  gitlabConfigs?: Map<string, GitLabProjectConfig>;  // keyed by project name
  skipHeavy?: boolean;                                // skip AST + related files (Preview mode)
}

/**
 * Per-repoPath lock for git operations to avoid index.lock conflicts.
 * Uses Promise chain: same repoPath operations serialize, different paths run in parallel.
 */
const gitLocks = new Map<string, Promise<void>>();

async function withGitLock<T>(repoPath: string, fn: () => Promise<T>): Promise<T> {
  // Wait for any in-flight operation on the same repo
  const prev = gitLocks.get(repoPath);
  let resolveChain: () => void;
  const chain = new Promise<void>((r) => { resolveChain = r; });

  // Register our slot before awaiting the previous one
  gitLocks.set(repoPath, chain);

  if (prev) {
    await prev;
  }

  try {
    return await fn();
  } finally {
    resolveChain!();
    // Clean up only if our chain is still the current one
    if (gitLocks.get(repoPath) === chain) {
      gitLocks.delete(repoPath);
    }
  }
}

/**
 * Scan multiple projects concurrently (max 3 parallel).
 * Projects without diff are skipped.
 * Git operations on the same repoPath are serialized via a lock.
 */
export async function buildMultiProjectScanContext(
  projects: Array<{ project: string; repoPath: string }>,
  targetBranch: string,
  sourceBranch: string,
  options?: MultiProjectScanOptions
): Promise<MultiProjectScanContext> {
  const concurrency = options?.maxConcurrent ?? 3;
  const gitlabToken = options?.gitlabToken;
  const gitlabConfigs = options?.gitlabConfigs;
  const results: MultiProjectScanContext["projects"] = [];

  const queue = [...projects];
  const executing = new Set<Promise<void>>();

  const scanOne = async (item: { project: string; repoPath: string }): Promise<void> => {
    // Try GitLab API first for projects with GitLab config
    let gitlabDiffs: GitLabDiff[] | undefined;
    const glConfig = gitlabConfigs?.get(item.project);
    if (glConfig && gitlabToken) {
      const diffs = await fetchCompareDiffsForBranches(
        glConfig.gitlabHost,
        glConfig.gitlabProjectPath,
        sourceBranch,
        targetBranch,
        gitlabToken
      );
      if (diffs && diffs.length > 0) {
        gitlabDiffs = diffs;
      }
    }

    const ctx = await withGitLock(item.repoPath, () =>
      buildScanContext(item.repoPath, targetBranch, sourceBranch, {
        gitlabDiffs,
        skipHeavy: options?.skipHeavy,
      })
    );

    if (ctx.diffs.length === 0) return;

    const techStack = inferTechStack(ctx.diffs.map((d) => d.new_path));
    const diffChars = ctx.diffs.reduce((sum, d) => sum + d.diff.length, 0);
    const diffPreview = ctx.diffs.map((d) => ({
      path: d.new_path,
      newFile: d.new_file,
      diffChars: d.diff.length,
    }));

    results.push({
      project: item.project,
      repoPath: item.repoPath,
      context: ctx,
      techStack,
      diffCount: ctx.diffs.length,
      diffChars,
      diffPreview,
    });
  };

  while (queue.length > 0 || executing.size > 0) {
    while (queue.length > 0 && executing.size < concurrency) {
      const item = queue.shift()!;
      const p = scanOne(item)
        .catch((err) => {
          console.error(`[MultiScan] ${item.project} failed: ${err instanceof Error ? err.message : err}`);
        })
        .finally(() => executing.delete(p));
      executing.add(p);
    }
    if (executing.size > 0) {
      await Promise.race(executing);
    }
  }

  return {
    projects: results,
    totalFiles: results.reduce((sum, r) => sum + r.diffCount, 0),
    totalTokens: results.reduce((sum, r) => sum + r.context.totalTokens, 0),
    projectCount: results.length,
  };
}
