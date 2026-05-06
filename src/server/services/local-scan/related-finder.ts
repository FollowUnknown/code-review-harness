import { execSync } from "child_process";
import path from "path";
import fs from "fs";
import type { RelatedFile } from "../../../shared/types";
import { classifyFile } from "./symbol-extractor";

interface FinderOptions {
  maxFiles?: number;
  maxDepth?: number;
}

const DEFAULT_OPTIONS: FinderOptions = {
  maxFiles: 10,
  maxDepth: 1,
};

export function findRelatedFiles(
  changedSymbols: string[],
  changedFile: string,
  repoPath: string,
  options: FinderOptions = {}
): RelatedFile[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const results: RelatedFile[] = [];
  const seen = new Set<string>();
  const category = classifyFile(changedFile);

  // Strategy 1: grep for symbol usage
  if (changedSymbols.length > 0) {
    for (const symbol of changedSymbols.slice(0, 5)) {
      const files = grepSymbol(symbol, repoPath, changedFile);
      for (const file of files) {
        if (!seen.has(file)) {
          seen.add(file);
          results.push({
            path: file,
            category: classifyFile(file),
            relevance: 0.8,
            reason: `uses symbol: ${symbol}`,
          });
        }
      }
    }
  }

  // Strategy 2: find importers (upstream)
  const importers = findImporters(changedFile, repoPath);
  for (const file of importers) {
    if (!seen.has(file)) {
      seen.add(file);
      results.push({
        path: file,
        category: classifyFile(file),
        relevance: 0.6,
        reason: `imports: ${changedFile}`,
      });
    }
  }

  // Strategy 3: business files trace 1 level downstream
  if (category === "business") {
    const directSymbols = extractExportsFromFile(path.join(repoPath, changedFile));
    for (const symbol of directSymbols.slice(0, 3)) {
      const callers = grepSymbol(symbol, repoPath, changedFile);
      for (const caller of callers) {
        if (!seen.has(caller)) {
          seen.add(caller);
          results.push({
            path: caller,
            category: classifyFile(caller),
            relevance: 0.4,
            reason: `calls exported: ${symbol}`,
          });
        }
      }
    }
  }

  results.sort((a, b) => b.relevance - a.relevance);
  return results.slice(0, opts.maxFiles);
}

function grepSymbol(symbol: string, repoPath: string, excludeFile: string): string[] {
  try {
    const cmd = `grep -rl "\\b${symbol}\\b" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.vue" --include="*.java" src/ 2>/dev/null || true`;
    const output = execSync(cmd, { cwd: repoPath, encoding: "utf-8", timeout: 10000 });
    return output.trim().split("\n").filter((f) => f && f !== excludeFile);
  } catch {
    return [];
  }
}

function findImporters(changedFile: string, repoPath: string): string[] {
  const results = new Set<string>();
  const baseName = path.basename(changedFile);

  // Frontend: ESM import pattern
  const moduleName = changedFile.replace(/\.(ts|tsx|js|jsx|vue)$/, "");
  try {
    const cmd = `grep -rl "from.*['\\"].*${escapeRegex(path.basename(moduleName))}" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.vue" src/ 2>/dev/null || true`;
    const output = execSync(cmd, { cwd: repoPath, encoding: "utf-8", timeout: 10000 });
    for (const f of output.trim().split("\n")) {
      if (f && f !== changedFile) results.add(f);
    }
  } catch {
    // ignore
  }

  // Java: import pattern — extract class name from file (FooBar.java → FooBar)
  if (changedFile.endsWith(".java")) {
    const javaClassName = baseName.replace(/\.java$/, "");
    try {
      const cmd = `grep -rl "import.*\\.\\(\\*\\|${escapeRegex(javaClassName)}\\)" --include="*.java" src/ 2>/dev/null || true`;
      const output = execSync(cmd, { cwd: repoPath, encoding: "utf-8", timeout: 10000 });
      for (const f of output.trim().split("\n")) {
        if (f && f !== changedFile) results.add(f);
      }
    } catch {
      // ignore
    }
  }

  return [...results];
}

function extractExportsFromFile(filePath: string): string[] {
  if (!fs.existsSync(filePath)) return [];
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const exports: string[] = [];

    if (filePath.endsWith(".java")) {
      // Java: extract class, interface, enum names and public method names
      const javaPatterns = [
        /(?:public\s+)?(?:abstract\s+)?(?:class|interface|enum)\s+(\w+)/g,
        /@(?:Service|Repository|Component|Controller|RestController)\s*(?:\([^)]*\))?\s*(?:public\s+)?(?:abstract\s+)?class\s+(\w+)/g,
        /public\s+(?:static\s+)?(?:\w+(?:<[^>]+>)?)\s+(\w+)\s*\(/g,
      ];
      for (const p of javaPatterns) {
        p.lastIndex = 0;
        let match;
        while ((match = p.exec(content)) !== null) exports.push(match[1]);
      }
    } else {
      // Frontend: ESM exports
      const patterns = [
        /export\s+(?:async\s+)?function\s+(\w+)/g,
        /export\s+(?:const|let|var)\s+(\w+)/g,
        /export\s+interface\s+(\w+)/g,
        /export\s+type\s+(\w+)/g,
      ];
      for (const p of patterns) {
        p.lastIndex = 0;
        let match;
        while ((match = p.exec(content)) !== null) exports.push(match[1]);
      }
    }
    return exports;
  } catch {
    return [];
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
