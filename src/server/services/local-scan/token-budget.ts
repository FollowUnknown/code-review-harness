import type { RelatedFile } from "../../../shared/types";

export interface RelatedFileWithContext extends RelatedFile {
  content: string;
}

interface BudgetOptions {
  maxFiles: number;
  tokenBudget: number; // in tokens
}

interface BudgetResult {
  accepted: RelatedFileWithContext[];
  rejected: RelatedFileWithContext[];
  totalTokensUsed: number;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function truncateRelatedFiles(
  files: RelatedFileWithContext[],
  options: BudgetOptions
): BudgetResult {
  // Sort by relevance descending
  const sorted = [...files].sort((a, b) => b.relevance - a.relevance);

  const accepted: RelatedFileWithContext[] = [];
  const rejected: RelatedFileWithContext[] = [];
  let usedTokens = 0;

  for (const file of sorted) {
    const tokens = estimateTokens(file.content);

    // Check file count limit
    if (accepted.length >= options.maxFiles) {
      rejected.push(file);
      continue;
    }

    // Check token budget
    if (usedTokens + tokens > options.tokenBudget) {
      // Try to fit a truncated version if there's meaningful budget left
      const remainingBudget = options.tokenBudget - usedTokens;
      if (remainingBudget > 100) {
        const maxChars = remainingBudget * 4;
        accepted.push({
          ...file,
          content: file.content.slice(0, maxChars) + "\n\n... [token budget truncated] ...",
        });
        usedTokens += remainingBudget;
      }
      rejected.push(file);
      continue;
    }

    accepted.push(file);
    usedTokens += tokens;
  }

  return { accepted, rejected, totalTokensUsed: usedTokens };
}
