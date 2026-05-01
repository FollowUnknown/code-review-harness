import fs from "fs";
import path from "path";
import type { GitLabDiff, ScanContext, RelatedFile } from "../../../shared/types";
import { extractLocalDiff, parseDiffToGitLabDiffs } from "./git-diff";
import { extractChangedSymbols, classifyFile } from "./symbol-extractor";
import { findRelatedFiles } from "./related-finder";
import { extractFileContext } from "./context-extractor";
import { estimateTokens, truncateRelatedFiles, type RelatedFileWithContext } from "./token-budget";

const MAX_RELATED_FILES = 10;
const TOKEN_BUDGET = 30000;
const MAX_LINES_PER_FILE = 300;

export async function buildLocalScanContext(
  repoPath: string,
  targetBranch: string,
  sourceBranch: string
): Promise<ScanContext> {
  // 1. Extract diff
  const diffText = extractLocalDiff(repoPath, targetBranch, sourceBranch);
  const diffs = parseDiffToGitLabDiffs(diffText);

  if (diffs.length === 0) {
    return { diffs, changedSymbols: [], relatedFiles: [], totalTokens: 0 };
  }

  // 2. Extract changed symbols
  const allSymbols = diffs.flatMap((d) => extractChangedSymbols(d.diff));
  const changedSymbols = [...new Set(allSymbols)];

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
