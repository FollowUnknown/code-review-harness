import type { FileCategory } from "../../../shared/types";

export function extractChangedSymbols(diffText: string): string[] {
  const symbols = new Set<string>();

  // Only look at changed lines (starting with + or -)
  const changedLines = diffText.split("\n").filter((l) => l.startsWith("+") || l.startsWith("-"));

  const patterns = [
    // function declarations
    /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g,
    // const/let/var declarations
    /(?:export\s+)?(?:const|let|var)\s+(\w+)/g,
    // interface/type declarations
    /(?:export\s+)?(?:interface|type)\s+(\w+)/g,
    // class declarations
    /(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+(\w+)/g,
  ];

  for (const line of changedLines) {
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      const match = pattern.exec(line);
      if (match) {
        symbols.add(match[1]);
      }
    }
  }

  return [...symbols];
}

export function classifyFile(filePath: string): FileCategory {
  const normalized = filePath.replace(/\\/g, "/").toLowerCase();

  // Config files
  if (
    normalized.endsWith(".json") ||
    normalized.endsWith(".yml") ||
    normalized.endsWith(".yaml") ||
    normalized.endsWith(".config.") ||
    normalized.includes("tsconfig") ||
    normalized.includes(".eslintrc") ||
    normalized.includes(".prettierrc")
  ) {
    return "config";
  }

  // Entry points
  if (
    normalized.endsWith("index.ts") ||
    normalized.endsWith("index.js") ||
    normalized.endsWith("app.ts") ||
    normalized.endsWith("app.js") ||
    normalized.endsWith("main.ts") ||
    normalized.endsWith("main.js") ||
    normalized.includes("/routes/") ||
    normalized.includes("/router/")
  ) {
    return "entry";
  }

  // Utility files
  if (
    normalized.includes("/utils/") ||
    normalized.includes("/helpers/") ||
    normalized.includes("/lib/") ||
    normalized.startsWith("lib/") ||
    normalized.includes("/common/") ||
    normalized.includes("/shared/") ||
    normalized.includes("/util/")
  ) {
    return "utility";
  }

  // Everything else is business logic
  return "business";
}
