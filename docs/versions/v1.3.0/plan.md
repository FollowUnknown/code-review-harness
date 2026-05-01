# v1.3.0 本地源码扫描 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 CodeReview 在本地服务器直接扫描 git 仓库做评审，提供 diff + 关联文件 + 符号级调用链上下文。

**Architecture:** 新增 `local-scan/` 模块，从本地 git 提取 diff → 发现关联文件 → 提取上下文 → 组装增强 Prompt → 复用现有 LLM review pipeline。纯新增模块，不修改现有 reviewer/classifier。

**Tech Stack:** Node.js (child_process for git/grep)、TypeScript、Express SSE、Vitest

---

## File Structure

| 操作 | 文件 | 职责 |
|------|------|------|
| 新建 | `src/server/services/local-scan/git-diff.ts` | 本地 git diff 提取 |
| 新建 | `src/server/services/local-scan/symbol-extractor.ts` | 从 diff 提取变更符号名 |
| 新建 | `src/server/services/local-scan/related-finder.ts` | grep 符号 → 找关联文件 |
| 新建 | `src/server/services/local-scan/context-extractor.ts` | 按文件类型提取上下文（Vue/TS） |
| 新建 | `src/server/services/local-scan/token-budget.ts` | 三层 Token 防御 |
| 新建 | `src/server/services/local-scan/index.ts` | 编排入口 |
| 新建 | `src/server/config/repo-mapping.ts` | project → 本地路径映射 |
| 新建 | `src/server/routes/review-local.ts` | POST /api/review/local（SSE） |
| 新建 | `src/server/routes/review-diff.ts` | POST /api/review/diff |
| 修改 | `src/shared/types.ts` | 新增 LocalReviewRequest, DiffReviewRequest, RepoMapping |
| 修改 | `src/server/index.ts` | 挂载新路由 |
| 修改 | `src/server/db.ts` | repo_mappings 表 |
| 新建 | `tests/local-scan.test.ts` | 本地扫描测试 |
| 新建 | `tests/context-extractor.test.ts` | 上下文提取测试 |

---

### Task 1: Types — 新增类型定义

**Files:**
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Add types to end of types.ts**

```typescript
// ---- Local Scan (v1.3.0) ----

export interface LocalReviewRequest {
  project: string;
  sourceBranch: string;
  targetBranch: string;
  includeRelatedFiles?: boolean;   // default true
  relatedFileDepth?: number;       // 1 = direct deps only (default)
}

export interface DiffReviewRequest {
  project: string;
  diffText: string;
  fileName?: string;
}

export interface RepoMapping {
  id: number;
  project: string;
  localPath: string;
  createdAt: string;
}

export type FileCategory = "utility" | "business" | "entry" | "config";

export interface RelatedFile {
  path: string;
  category: FileCategory;
  relevance: number;               // 0-1, 用于排序
  reason: string;                  // 为什么关联（import/call/same-dir）
}

export interface ScanContext {
  diffs: GitLabDiff[];
  changedSymbols: string[];
  relatedFiles: RelatedFile[];
  totalTokens: number;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | grep -v plans.ts | head -5`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat(v1.3.0): add LocalScan types to shared types"
```

---

### Task 2: Repo Mapping — DB 表 + 服务

**Files:**
- Modify: `src/server/db.ts`
- Create: `src/server/config/repo-mapping.ts`
- Create: `tests/repo-mapping.test.ts`

- [ ] **Step 1: Write failing tests**

`tests/repo-mapping.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getDb, closeDb } from "../src/server/db";
import { getRepoMapping, setRepoMapping, listRepoMappings } from "../src/server/config/repo-mapping";

beforeEach(() => {
  process.env.KNOWLEDGE_DB_PATH = ":memory:";
  closeDb();
  const db = getDb();
  db.exec(`CREATE TABLE IF NOT EXISTS repo_mappings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project TEXT NOT NULL UNIQUE,
    local_path TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
});

afterEach(() => {
  closeDb();
  delete process.env.KNOWLEDGE_DB_PATH;
});

describe("repo-mapping", () => {
  it("setRepoMapping inserts new mapping", () => {
    setRepoMapping("my-project", "/data/repos/my-project");
    const mapping = getRepoMapping("my-project");
    expect(mapping).not.toBeNull();
    expect(mapping!.localPath).toBe("/data/repos/my-project");
  });

  it("setRepoMapping updates existing mapping", () => {
    setRepoMapping("my-project", "/old/path");
    setRepoMapping("my-project", "/new/path");
    const mapping = getRepoMapping("my-project");
    expect(mapping!.localPath).toBe("/new/path");
  });

  it("getRepoMapping returns null for unknown project", () => {
    const mapping = getRepoMapping("unknown");
    expect(mapping).toBeNull();
  });

  it("listRepoMappings returns all", () => {
    setRepoMapping("project-a", "/path/a");
    setRepoMapping("project-b", "/path/b");
    const list = listRepoMappings();
    expect(list.length).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests — RED**

Run: `npx vitest run tests/repo-mapping.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create repo-mapping.ts**

`src/server/config/repo-mapping.ts`:

```typescript
import { getDb } from "../db";
import type { RepoMapping } from "../../shared/types";

export function getRepoMapping(project: string): RepoMapping | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM repo_mappings WHERE project = ?").get(project) as RepoMapping | undefined;
  return row ?? null;
}

export function setRepoMapping(project: string, localPath: string): void {
  const db = getDb();
  db.prepare(
    "INSERT INTO repo_mappings (project, local_path) VALUES (?, ?) ON CONFLICT(project) DO UPDATE SET local_path = excluded.local_path"
  ).run(project, localPath);
}

export function listRepoMappings(): RepoMapping[] {
  const db = getDb();
  return db.prepare("SELECT * FROM repo_mappings ORDER BY project").all() as RepoMapping[];
}

export function deleteRepoMapping(project: string): void {
  const db = getDb();
  db.prepare("DELETE FROM repo_mappings WHERE project = ?").run(project);
}

export function ensureRepoMappingsTable(): void {
  const db = getDb();
  db.exec(`CREATE TABLE IF NOT EXISTS repo_mappings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project TEXT NOT NULL UNIQUE,
    local_path TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
}
```

- [ ] **Step 4: Add table init to db.ts**

In `src/server/db.ts`, inside the `getDb()` function, after existing table creates, add:

```typescript
db.exec(`CREATE TABLE IF NOT EXISTS repo_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project TEXT NOT NULL UNIQUE,
  local_path TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
)`);
```

- [ ] **Step 5: Run tests — GREEN**

Run: `npx vitest run tests/repo-mapping.test.ts`
Expected: 4 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/server/config/repo-mapping.ts src/server/db.ts tests/repo-mapping.test.ts
git commit -m "feat(v1.3.0): add repo mapping service with tests"
```

---

### Task 3: Git Diff Extraction — 本地 git diff 提取

**Files:**
- Create: `src/server/services/local-scan/git-diff.ts`
- Create: `tests/git-diff-local.test.ts`

- [ ] **Step 1: Write failing tests**

`tests/git-diff-local.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import { extractLocalDiff, parseDiffToGitLabDiffs } from "../src/server/services/local-scan/git-diff";

const TEST_REPO = path.join(os.tmpdir(), `test-repo-${Date.now()}`);

beforeEach(() => {
  // Create a minimal git repo with two branches
  fs.mkdirSync(TEST_REPO);
  execSync("git init", { cwd: TEST_REPO });
  execSync("git config user.email 'test@test.com'", { cwd: TEST_REPO });
  execSync("git config user.name 'Test'", { cwd: TEST_REPO });

  fs.writeFileSync(path.join(TEST_REPO, "hello.ts"), "export function hello() { return 'hello'; }\n");
  execSync("git add . && git commit -m initial", { cwd: TEST_REPO });

  execSync("git checkout -b feature", { cwd: TEST_REPO });
  fs.writeFileSync(path.join(TEST_REPO, "hello.ts"), "export function hello(name: string) { return `hello ${name}`; }\n");
  fs.writeFileSync(path.join(TEST_REPO, "world.ts"), "export function world() { return 'world'; }\n");
  execSync("git add . && git commit -m feature", { cwd: TEST_REPO });

  execSync("git checkout master || git checkout main", { cwd: TEST_REPO });
});

afterEach(() => {
  fs.rmSync(TEST_REPO, { recursive: true, force: true });
});

describe("git-diff", () => {
  it("extractLocalDiff returns diff string", () => {
    const diff = extractLocalDiff(TEST_REPO, "master", "feature");
    expect(diff).toContain("hello");
    expect(diff).toContain("world.ts");
  });

  it("parseDiffToGitLabDiffs parses diff into GitLabDiff array", () => {
    const diff = extractLocalDiff(TEST_REPO, "master", "feature");
    const gitlabDiffs = parseDiffToGitLabDiffs(diff);
    expect(gitlabDiffs.length).toBeGreaterThanOrEqual(2);
    // Should have hello.ts (modified) and world.ts (added)
    const paths = gitlabDiffs.map((d) => d.new_path);
    expect(paths).toContain("hello.ts");
    expect(paths).toContain("world.ts");
  });

  it("extractLocalDiff throws on invalid branch", () => {
    expect(() => extractLocalDiff(TEST_REPO, "master", "nonexistent")).toThrow();
  });
});
```

- [ ] **Step 2: Run tests — RED**

- [ ] **Step 3: Create git-diff.ts**

`src/server/services/local-scan/git-diff.ts`:

```typescript
import { execSync } from "child_process";
import path from "path";
import type { GitLabDiff } from "../../shared/types";

export function extractLocalDiff(repoPath: string, targetBranch: string, sourceBranch: string): string {
  try {
    // Ensure branches are available
    execSync(`git fetch origin ${targetBranch} ${sourceBranch} 2>/dev/null || true`, { cwd: repoPath });

    // Try with origin/ prefix first, then without
    let diff: string;
    try {
      diff = execSync(`git diff origin/${targetBranch}...origin/${sourceBranch} -- .`, {
        cwd: repoPath,
        maxBuffer: 10 * 1024 * 1024, // 10MB
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
  // Split on diff headers: "diff --git a/path b/path"
  const fileSections = diffText.split(/^diff --git /m).filter((s) => s.trim());

  for (const section of fileSections) {
    const headerMatch = section.match(/^a\/(.+?) b\/(.+?)\n/);
    if (!headerMatch) continue;

    const oldPath = headerMatch[1];
    const newPath = headerMatch[2];

    // Extract the actual diff content (lines starting with + or -, after --- and +++ lines)
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
      diff: diffLines.join("\n"),
    });
  }

  return diffs;
}
```

- [ ] **Step 4: Run tests — GREEN**

Run: `npx vitest run tests/git-diff-local.test.ts`
Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/services/local-scan/git-diff.ts tests/git-diff-local.test.ts
git commit -m "feat(v1.3.0): add local git diff extraction with parser"
```

---

### Task 4: Symbol Extractor — 从 diff 提取变更符号

**Files:**
- Create: `src/server/services/local-scan/symbol-extractor.ts`
- Create: `tests/symbol-extractor.test.ts`

- [ ] **Step 1: Write failing tests**

`tests/symbol-extractor.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { extractChangedSymbols, classifyFile } from "../src/server/services/local-scan/symbol-extractor";

describe("symbol-extractor", () => {
  it("extracts function names from diff", () => {
    const diff = `+export function calculateScore(dim: Dimension[]): number {
-  export function calculateScore(scores: number[]): number {`;
    const symbols = extractChangedSymbols(diff);
    expect(symbols).toContain("calculateScore");
  });

  it("extracts variable names from diff", () => {
    const diff = `+const MAX_RETRIES = 3;
-const MAX_RETRIES = 5;`;
    const symbols = extractChangedSymbols(diff);
    expect(symbols).toContain("MAX_RETRIES");
  });

  it("extracts interface names from diff", () => {
    const diff = `+interface UserConfig {`;
    const symbols = extractChangedSymbols(diff);
    expect(symbols).toContain("UserConfig");
  });

  it("deduplicates symbols", () => {
    const diff = `+function hello() {}
+function hello2() { hello() }`;
    const symbols = extractChangedSymbols(diff);
    const unique = [...new Set(symbols)];
    expect(symbols.length).toBe(unique.length);
  });

  it("classifies utility files", () => {
    expect(classifyFile("src/utils/format.ts")).toBe("utility");
    expect(classifyFile("src/helpers/common.js")).toBe("utility");
    expect(classifyFile("lib/crypto.ts")).toBe("utility");
  });

  it("classifies business files", () => {
    expect(classifyFile("src/services/order.ts")).toBe("business");
    expect(classifyFile("src/components/UserCard.vue")).toBe("business");
    expect(classifyFile("src/pages/Dashboard.vue")).toBe("business");
  });

  it("classifies entry files", () => {
    expect(classifyFile("src/routes/review.ts")).toBe("entry");
    expect(classifyFile("src/index.ts")).toBe("entry");
    expect(classifyFile("src/app.ts")).toBe("entry");
  });

  it("classifies config files", () => {
    expect(classifyFile(".eslintrc.json")).toBe("config");
    expect(classifyFile("tsconfig.json")).toBe("config");
  });
});
```

- [ ] **Step 2: Run tests — RED**

- [ ] **Step 3: Create symbol-extractor.ts**

`src/server/services/local-scan/symbol-extractor.ts`:

```typescript
import type { FileCategory } from "../../shared/types";

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
    // Vue defineProps/defineEmits (not useful as symbols, skip)
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
    normalized.includes("/common/") ||
    normalized.includes("/shared/") ||
    normalized.includes("/util/")
  ) {
    return "utility";
  }

  // Everything else is business logic
  return "business";
}
```

- [ ] **Step 4: Run tests — GREEN**

Run: `npx vitest run tests/symbol-extractor.test.ts`
Expected: 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/services/local-scan/symbol-extractor.ts tests/symbol-extractor.test.ts
git commit -m "feat(v1.3.0): add symbol extractor and file classifier"
```

---

### Task 5: Related File Finder — grep 符号查找关联文件

**Files:**
- Create: `src/server/services/local-scan/related-finder.ts`
- Create: `tests/related-finder.test.ts`

- [ ] **Step 1: Write failing tests**

`tests/related-finder.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import { findRelatedFiles } from "../src/server/services/local-scan/related-finder";

const TEST_REPO = path.join(os.tmpdir(), `test-related-${Date.now()}`);

beforeEach(() => {
  fs.mkdirSync(path.join(TEST_REPO, "src"), { recursive: true });
  fs.mkdirSync(path.join(TEST_REPO, "src/services"), { recursive: true });
  fs.mkdirSync(path.join(TEST_REPO, "src/routes"), { recursive: true });
  fs.mkdirSync(path.join(TEST_REPO, "src/utils"), { recursive: true });

  // Create test files with known relationships
  fs.writeFileSync(path.join(TEST_REPO, "src/services/order.ts"),
    `import { calculateScore } from '../utils/scoring';
import { UserConfig } from '../types';
export function createOrder(config: UserConfig) {
  const score = calculateScore(config);
  return { score };
}`
  );

  fs.writeFileSync(path.join(TEST_REPO, "src/utils/scoring.ts"),
    `export function calculateScore(config: any): number {
  return 42;
}
export function formatScore(score: number): string {
  return String(score);
}`
  );

  fs.writeFileSync(path.join(TEST_REPO, "src/routes/order.ts"),
    `import { createOrder } from '../services/order';
export function handleOrder(req: any) {
  return createOrder(req.body);
}`
  );

  fs.writeFileSync(path.join(TEST_REPO, "src/types.ts"),
    `export interface UserConfig {
  name: string;
  maxRetries: number;
}`
  );
});

afterEach(() => {
  fs.rmSync(TEST_REPO, { recursive: true, force: true });
});

describe("related-finder", () => {
  it("finds files that use a specific symbol", () => {
    const results = findRelatedFiles(["calculateScore"], "src/utils/scoring.ts", TEST_REPO, { maxFiles: 10 });
    const paths = results.map((r) => r.path);
    expect(paths).toContain("src/services/order.ts");
  });

  it("finds upstream imports of changed file", () => {
    const results = findRelatedFiles([], "src/services/order.ts", TEST_REPO, { maxFiles: 10 });
    // Should find files that import from order.ts
    const paths = results.map((r) => r.path);
    expect(paths).toContain("src/routes/order.ts");
  });

  it("respects maxFiles limit", () => {
    const results = findRelatedFiles(["calculateScore", "formatScore", "UserConfig", "createOrder"], "src/services/order.ts", TEST_REPO, { maxFiles: 2 });
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it("skips utility files from downstream tracing", () => {
    const results = findRelatedFiles(["calculateScore"], "src/utils/scoring.ts", TEST_REPO, { maxFiles: 10 });
    // Utility file: should not trace downstream callers beyond what's already found
    // The result should only contain files using calculateScore, not their callers
    expect(results.every((r) => r.relevance > 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests — RED**

- [ ] **Step 3: Create related-finder.ts**

`src/server/services/local-scan/related-finder.ts`:

```typescript
import { execSync } from "child_process";
import path from "path";
import fs from "fs";
import type { RelatedFile, FileCategory } from "../../shared/types";
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

  // Strategy 1: If symbols provided, grep for their usage
  if (changedSymbols.length > 0) {
    for (const symbol of changedSymbols.slice(0, 5)) { // max 5 symbols
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

  // Strategy 2: Find files that import the changed file (upstream deps)
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

  // Strategy 3: For business files, trace 1 level of downstream callers
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

  // Sort by relevance, apply limit
  results.sort((a, b) => b.relevance - a.relevance);
  return results.slice(0, opts.maxFiles);
}

function grepSymbol(symbol: string, repoPath: string, excludeFile: string): string[] {
  try {
    // Use word boundary to avoid partial matches
    const cmd = `grep -rl "\\b${symbol}\\b" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.vue" src/ 2>/dev/null || true`;
    const output = execSync(cmd, { cwd: repoPath, encoding: "utf-8", timeout: 10000 });
    return output
      .trim()
      .split("\n")
      .filter((f) => f && f !== excludeFile);
  } catch {
    return [];
  }
}

function findImporters(changedFile: string, repoPath: string): string[] {
  // Extract the module name without extension
  const moduleName = changedFile.replace(/\.(ts|tsx|js|jsx|vue)$/, "");
  try {
    const cmd = `grep -rl "from.*['\\"].*${escapeRegex(path.basename(moduleName))}" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.vue" src/ 2>/dev/null || true`;
    const output = execSync(cmd, { cwd: repoPath, encoding: "utf-8", timeout: 10000 });
    return output
      .trim()
      .split("\n")
      .filter((f) => f && f !== changedFile);
  } catch {
    return [];
  }
}

function extractExportsFromFile(filePath: string): string[] {
  if (!fs.existsSync(filePath)) return [];
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const exports: string[] = [];
    const patterns = [
      /export\s+(?:async\s+)?function\s+(\w+)/g,
      /export\s+(?:const|let|var)\s+(\w+)/g,
      /export\s+interface\s+(\w+)/g,
      /export\s+type\s+(\w+)/g,
    ];
    for (const p of patterns) {
      p.lastIndex = 0;
      let match;
      while ((match = p.exec(content)) !== null) {
        exports.push(match[1]);
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
```

- [ ] **Step 4: Run tests — GREEN**

Run: `npx vitest run tests/related-finder.test.ts`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/services/local-scan/related-finder.ts tests/related-finder.test.ts
git commit -m "feat(v1.3.0): add related file finder with symbol grep"
```

---

### Task 6: Context Extractor — 按文件类型智能提取

**Files:**
- Create: `src/server/services/local-scan/context-extractor.ts`
- Create: `tests/context-extractor.test.ts`

- [ ] **Step 1: Write failing tests**

`tests/context-extractor.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { extractFileContext, extractVueScript } from "../src/server/services/local-scan/context-extractor";

describe("context-extractor", () => {
  describe("extractVueScript", () => {
    it("extracts script section from Vue SFC", () => {
      const vue = `<template>
  <div class="hello">{{ message }}</div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import UserCard from '@/components/UserCard.vue';

const message = ref('hello');
</script>

<style scoped>
.hello { color: red; }
</style>`;

      const script = extractVueScript(vue);
      expect(script).toContain("import { ref } from 'vue'");
      expect(script).toContain("UserCard");
      expect(script).not.toContain("<template>");
      expect(script).not.toContain("<style");
    });

    it("extracts child component names from template", () => {
      const vue = `<template>
  <UserCard :user="user" />
  <UserAvatar :src="user.avatar" />
</template>

<script setup lang="ts">
const user = { name: 'test' };
</script>`;

      const script = extractVueScript(vue);
      expect(script).toContain("Child components used: UserCard, UserAvatar");
    });

    it("handles Vue file with no script", () => {
      const vue = `<template><div>hello</div></template>`;
      const script = extractVueScript(vue);
      expect(script).toBe("");
    });
  });

  describe("extractFileContext", () => {
    it("truncates TS files to maxLines", () => {
      const longContent = Array(500).fill("const x = 1;").join("\n");
      const result = extractFileContext(longContent, "src/utils/helper.ts", { maxLines: 300 });
      expect(result.split("\n").length).toBeLessThanOrEqual(301); // 300 + truncation notice
      expect(result).toContain("[truncated]");
    });

    it("does not truncate short files", () => {
      const short = "const x = 1;\nconst y = 2;";
      const result = extractFileContext(short, "src/utils/helper.ts", { maxLines: 300 });
      expect(result).toBe(short);
    });

    it("extracts Vue script instead of full content", () => {
      const vue = `<template><div>{{ msg }}</div></template>\n<script setup lang="ts">const msg = 'hi';</script>`;
      const result = extractFileContext(vue, "src/components/Test.vue", { maxLines: 300 });
      expect(result).toContain("const msg = 'hi'");
      expect(result).not.toContain("<template>");
    });
  });
});
```

- [ ] **Step 2: Run tests — RED**

- [ ] **Step 3: Create context-extractor.ts**

`src/server/services/local-scan/context-extractor.ts`:

```typescript
import fs from "fs";

interface ExtractOptions {
  maxLines?: number;
}

export function extractFileContext(content: string, filePath: string, options: ExtractOptions = {}): string {
  const maxLines = options.maxLines ?? 300;

  // Vue files: extract script section
  if (filePath.endsWith(".vue") || filePath.endsWith(".svelte")) {
    const script = extractVueScript(content);
    if (script) return script;
    return ""; // No script section, skip
  }

  // CSS/SCSS: skip entirely
  if (/\.(css|scss|less|sass)$/.test(filePath)) {
    return "";
  }

  // TS/JS/Java: truncate to maxLines
  const lines = content.split("\n");
  if (lines.length <= maxLines) {
    return content;
  }

  return lines.slice(0, maxLines).join("\n") + "\n\n... [truncated, showing first " + maxLines + " lines] ...";
}

export function extractVueScript(content: string): string {
  // Extract <script> or <script setup> section
  const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/);
  const script = scriptMatch ? scriptMatch[1].trim() : "";

  if (!script && !content.includes("<template>")) {
    return "";
  }

  // Extract child component names from template (PascalCase tags)
  const templateMatch = content.match(/<template>([\s\S]*?)<\/template>/);
  const childComponents: string[] = [];

  if (templateMatch) {
    const uniqueComponents = new Set<string>();
    const tagRegex = /<([A-Z][a-zA-Z]+)/g;
    let match;
    while ((match = tagRegex.exec(templateMatch[1])) !== null) {
      uniqueComponents.add(match[1]);
    }
    uniqueComponents.forEach((c) => childComponents.push(c));
  }

  // Build result
  let result = "";
  if (script) {
    result = "// <script> section:\n" + script;
  }

  if (childComponents.length > 0) {
    result += "\n\n// Child components used: " + childComponents.join(", ");
  }

  return result.trim();
}
```

- [ ] **Step 4: Run tests — GREEN**

Run: `npx vitest run tests/context-extractor.test.ts`
Expected: 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/services/local-scan/context-extractor.ts tests/context-extractor.test.ts
git commit -m "feat(v1.3.0): add context extractor with Vue script support"
```

---

### Task 7: Token Budget — 三层 Token 防御

**Files:**
- Create: `src/server/services/local-scan/token-budget.ts`
- Create: `tests/token-budget.test.ts`

- [ ] **Step 1: Write failing tests**

`tests/token-budget.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { estimateTokens, truncateRelatedFiles, type RelatedFileWithContext } from "../src/server/services/local-scan/token-budget";

describe("token-budget", () => {
  it("estimateTokens approximates token count", () => {
    // ~4 chars per token
    expect(estimateTokens("hello world")).toBe(3); // 11 / 4 = 2.75 → ceil = 3
    expect(estimateTokens("a")).toBe(1);
  });

  it("truncateRelatedFiles respects file count limit", () => {
    const files: RelatedFileWithContext[] = Array(15)
      .fill(null)
      .map((_, i) => ({
        path: `file${i}.ts`,
        category: "business" as const,
        relevance: 0.8,
        reason: "test",
        content: "const x = 1;",
      }));

    const result = truncateRelatedFiles(files, { maxFiles: 10, tokenBudget: 100000 });
    expect(result.accepted.length).toBe(10);
    expect(result.rejected.length).toBe(5);
  });

  it("truncateRelatedFiles respects token budget", () => {
    const files: RelatedFileWithContext[] = [
      { path: "a.ts", category: "business", relevance: 0.8, reason: "test", content: "x".repeat(12000) }, // ~3000 tokens
      { path: "b.ts", category: "business", relevance: 0.6, reason: "test", content: "y".repeat(12000) }, // ~3000 tokens
    ];

    // Budget only fits one file
    const result = truncateRelatedFiles(files, { maxFiles: 10, tokenBudget: 3000 });
    expect(result.accepted.length).toBe(1);
    expect(result.rejected.length).toBe(1);
  });

  it("truncateRelatedFiles sorts by relevance", () => {
    const files: RelatedFileWithContext[] = [
      { path: "low.ts", category: "utility", relevance: 0.3, reason: "low", content: "const x = 1;" },
      { path: "high.ts", category: "business", relevance: 0.9, reason: "high", content: "const y = 2;" },
    ];

    const result = truncateRelatedFiles(files, { maxFiles: 1, tokenBudget: 100000 });
    expect(result.accepted[0].path).toBe("high.ts");
  });
});
```

- [ ] **Step 2: Run tests — RED**

- [ ] **Step 3: Create token-budget.ts**

`src/server/services/local-scan/token-budget.ts`:

```typescript
import type { RelatedFile, FileCategory } from "../../shared/types";

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

    // Check both limits
    if (accepted.length >= options.maxFiles) {
      rejected.push(file);
      continue;
    }

    if (usedTokens + tokens > options.tokenBudget) {
      // Try to fit a truncated version
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
```

- [ ] **Step 4: Run tests — GREEN**

Run: `npx vitest run tests/token-budget.test.ts`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/services/local-scan/token-budget.ts tests/token-budget.test.ts
git commit -m "feat(v1.3.0): add token budget controller with 3-layer defense"
```

---

### Task 8: Local Scan Orchestrator — 编排入口

**Files:**
- Create: `src/server/services/local-scan/index.ts`

- [ ] **Step 1: Create the orchestrator**

`src/server/services/local-scan/index.ts`:

```typescript
import fs from "fs";
import path from "path";
import type { GitLabDiff, ScanContext, RelatedFile } from "../../shared/types";
import { extractLocalDiff, parseDiffToGitLabDiffs } from "./git-diff";
import { extractChangedSymbols, classifyFile } from "./symbol-extractor";
import { findRelatedFiles } from "./related-finder";
import { extractFileContext } from "./context-extractor";
import { estimateTokens, truncateRelatedFiles, type RelatedFileWithContext } from "./token-budget";

const MAX_RELATED_FILES = 10;
const TOKEN_BUDGET = 3000;
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
```

- [ ] **Step 2: Commit**

```bash
git add src/server/services/local-scan/index.ts
git commit -m "feat(v1.3.0): add local scan orchestrator"
```

---

### Task 9: API Routes — review-local + review-diff

**Files:**
- Create: `src/server/routes/review-local.ts`
- Create: `src/server/routes/review-diff.ts`
- Modify: `src/server/index.ts`

- [ ] **Step 1: Create review-local.ts**

`src/server/routes/review-local.ts`:

```typescript
import { Router, Request, Response } from "express";
import { randomUUID } from "crypto";
import { getRepoMapping } from "../config/repo-mapping";
import { classify } from "../services/classifier";
import { understandRequirement } from "../services/requirement";
import { getKnowledgeForReview, extractLearnings, trackKnowledgeHits, buildKnowledgePrompt } from "../services/knowledge";
import { parseReviewResponse, mergeReports } from "../services/reviewer";
import { buildRequirementPrompt } from "../services/requirement";
import { callLLM, getLLMConfig } from "../llm";
import { getReviewPrompt, getReviewUserPrompt } from "../llm/prompts/review";
import { getDimensionsForProject } from "../services/dimensions";
import { saveReviewRecord } from "../services/review-store";
import { saveLLMLog } from "../services/llm-logger";
import { buildLocalScanContext, buildRelatedFilesPrompt } from "../services/local-scan";
import type { LocalReviewRequest } from "../../shared/types";

const router = Router();

function sendSSE(res: Response, event: { step: number; status: string; label: string; detail?: string }) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

router.post("/local", async (req: Request, res: Response) => {
  const { project, sourceBranch, targetBranch }: LocalReviewRequest = req.body;

  if (!project || !sourceBranch || !targetBranch) {
    res.status(400).json({ error: "project, sourceBranch, targetBranch are required" });
    return;
  }

  const llmConfig = getLLMConfig();
  if (!llmConfig.apiKey) {
    res.status(500).json({ error: "LLM API key not configured" });
    return;
  }

  const mapping = getRepoMapping(project);
  if (!mapping) {
    res.status(404).json({ error: `No repo mapping for project: ${project}. Configure in Settings.` });
    return;
  }

  // Switch to SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  let step = 0;
  const nextStep = (label: string, detail?: string) => { step++; sendSSE(res, { step, status: "running", label, detail }); };
  const completeStep = (detail?: string) => { sendSSE(res, { step, status: "done", label: "", detail }); };

  try {
    // Step 1: Scan local repo
    nextStep("Scanning local repo", `${mapping.localPath}: ${targetBranch}..${sourceBranch}`);
    const context = await buildLocalScanContext(mapping.localPath, targetBranch, sourceBranch);
    completeStep(`${context.diffs.length} files changed, ${context.relatedFiles.length} related files`);

    if (context.diffs.length === 0) {
      sendSSE(res, { step: step + 1, status: "done", label: "No changes", detail: "No diff found between branches" });
      res.end();
      return;
    }

    // Step 2: Classify
    nextStep("Classifying files");
    const { summary: classification, batchDiffs } = classify(context.diffs);
    const batchLevels = classification.batches.map((b) => b.level);
    completeStep();

    // Step 3: Load knowledge
    nextStep("Loading knowledge base");
    const knowledge = getKnowledgeForReview(project);
    completeStep(`${knowledge.length} entries loaded`);

    // Step 4: Review batches
    const reviewId = `R-${randomUUID().slice(0, 8)}`;
    const dimensions = getDimensionsForProject(project);
    const reqPrompt = "";
    const knowledgePrompt = knowledge.length > 0 ? buildKnowledgePrompt(knowledge) : "";
    const relatedPrompt = buildRelatedFilesPrompt(context);
    const userPromptPrefix = getReviewUserPrompt();

    const batchReports = [];
    const totalBatches = batchDiffs.length;

    for (let i = 0; i < totalBatches; i++) {
      const level = batchLevels[i];
      nextStep(`Reviewing batch ${i + 1}/${totalBatches}`, `Level ${level}`);

      const diffText = batchDiffs[i]
        .map((d: { old_path: string; new_path: string; diff: string }) => `--- ${d.old_path}\n+++ ${d.new_path}\n${d.diff}`)
        .join("\n\n");

      const systemPrompt = getReviewPrompt({
        dimensions,
        batchIndex: i,
        totalBatches,
        riskLevel: level,
        requirement: reqPrompt,
        knowledge: knowledgePrompt,
      });

      const userMessage = `${userPromptPrefix}${relatedPrompt}\n\n${diffText}`;
      const result = await callLLM(systemPrompt, userMessage, llmConfig);
      batchReports.push(parseReviewResponse(result.text));

      saveLLMLog({
        id: `LOG-${randomUUID().slice(0, 8)}`,
        review_id: reviewId,
        batch_index: i,
        risk_level: level,
        system_prompt: systemPrompt,
        user_prompt: userMessage,
        response: result.text,
        model: llmConfig.model,
        provider: llmConfig.provider,
        input_tokens: result.inputTokens,
        output_tokens: result.outputTokens,
        duration_ms: 0,
        created_at: new Date().toISOString(),
      });

      completeStep();
    }

    const report = mergeReports(batchReports);
    report.reviewId = reviewId;

    // Save
    saveReviewRecord({
      id: reviewId,
      project,
      mr_url: `local://${project}/${sourceBranch}..${targetBranch}`,
      mr_meta_json: JSON.stringify({ sourceBranch, targetBranch, localPath: mapping.localPath, relatedFiles: context.relatedFiles.length }),
      report_json: JSON.stringify(report),
      score: report.passed ? 1 : 0,
      created_at: new Date().toISOString(),
    });

    sendSSE(res, { step: step + 1, status: "done", label: "Review complete", detail: JSON.stringify(report) });
    res.end();
  } catch (error) {
    sendSSE(res, { step, status: "error", label: error instanceof Error ? error.message : "Unknown error" });
    res.end();
  }
});

export default router;
```

- [ ] **Step 2: Create review-diff.ts**

`src/server/routes/review-diff.ts`:

```typescript
import { Router, Request, Response } from "express";
import { randomUUID } from "crypto";
import { classify } from "../services/classifier";
import { parseReviewResponse, mergeReports } from "../services/reviewer";
import { callLLM, getLLMConfig } from "../llm";
import { getReviewPrompt, getReviewUserPrompt } from "../llm/prompts/review";
import { getDimensionsForProject } from "../services/dimensions";
import { saveReviewRecord } from "../services/review-store";
import { parseDiffToGitLabDiffs } from "../services/local-scan/git-diff";
import type { DiffReviewRequest } from "../../shared/types";

const router = Router();

router.post("/diff", async (req: Request, res: Response) => {
  const { project, diffText }: DiffReviewRequest = req.body;

  if (!diffText) {
    res.status(400).json({ error: "diffText is required" });
    return;
  }

  const llmConfig = getLLMConfig();
  if (!llmConfig.apiKey) {
    res.status(500).json({ error: "LLM API key not configured" });
    return;
  }

  try {
    const diffs = parseDiffToGitLabDiffs(diffText);
    if (diffs.length === 0) {
      res.json({ success: true, data: { message: "No changes found in diff" } });
      return;
    }

    const { summary: classification, batchDiffs } = classify(diffs);
    const batchLevels = classification.batches.map((b) => b.level);
    const dimensions = getDimensionsForProject(project || "default");
    const reviewId = `R-${randomUUID().slice(0, 8)}`;

    const batchReports = [];
    for (let i = 0; i < batchDiffs.length; i++) {
      const diffContent = batchDiffs[i]
        .map((d: { old_path: string; new_path: string; diff: string }) => `--- ${d.old_path}\n+++ ${d.new_path}\n${d.diff}`)
        .join("\n\n");

      const systemPrompt = getReviewPrompt({
        dimensions,
        batchIndex: i,
        totalBatches: batchDiffs.length,
        riskLevel: batchLevels[i],
        requirement: "",
        knowledge: "",
      });

      const userMessage = `${getReviewUserPrompt()}${diffContent}`;
      const result = await callLLM(systemPrompt, userMessage, llmConfig);
      batchReports.push(parseReviewResponse(result.text));
    }

    const report = mergeReports(batchReports);
    report.reviewId = reviewId;

    saveReviewRecord({
      id: reviewId,
      project: project || "diff-upload",
      mr_url: `diff://${reviewId}`,
      mr_meta_json: JSON.stringify({ type: "diff-upload", fileCount: diffs.length }),
      report_json: JSON.stringify(report),
      score: report.passed ? 1 : 0,
      created_at: new Date().toISOString(),
    });

    res.json({ success: true, data: report });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Review failed",
    });
  }
});

export default router;
```

- [ ] **Step 3: Mount routes in index.ts**

Read `src/server/index.ts`, add imports and mounts:

```typescript
import reviewLocalRouter from "./routes/review-local";
import reviewDiffRouter from "./routes/review-diff";
```

After existing route mounts:

```typescript
app.use("/api/review", reviewLocalRouter);
app.use("/api/review", reviewDiffRouter);
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | grep -v plans.ts | head -10`

- [ ] **Step 5: Commit**

```bash
git add src/server/routes/review-local.ts src/server/routes/review-diff.ts src/server/index.ts
git commit -m "feat(v1.3.0): add /api/review/local and /api/review/diff routes"
```

---

### Task 10: Frontend — 本地评审入口

**Files:**
- Modify: `src/client/pages/PlanNewPage.tsx` (or create LocalReviewPage.tsx)
- Modify: `src/client/App.tsx`

- [ ] **Step 1: Create LocalReviewPage.tsx**

`src/client/pages/LocalReviewPage.tsx`:

```tsx
import { useState } from "react";
import { motion } from "framer-motion";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3001";

export function LocalReviewPage() {
  const [project, setProject] = useState("");
  const [sourceBranch, setSourceBranch] = useState("");
  const [targetBranch, setTargetBranch] = useState("");
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<string[]>([]);

  const handleSubmit = async () => {
    if (!project || !sourceBranch || !targetBranch) {
      setError("All fields are required");
      return;
    }

    setLoading(true);
    setError(null);
    setSteps([]);
    setReviewId(null);

    const token = localStorage.getItem("auth_token");
    const response = await fetch(`${API_BASE}/api/review/local`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ project, sourceBranch, targetBranch }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: "Request failed" }));
      setError(data.error || "Unknown error");
      setLoading(false);
      return;
    }

    // Read SSE stream
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const event = JSON.parse(line.slice(6));
              if (event.status === "running") {
                setSteps((prev) => [...prev, `${event.label}: ${event.detail || ""}`]);
              }
              if (event.status === "done" && event.detail?.startsWith("{")) {
                try {
                  const report = JSON.parse(event.detail);
                  setReviewId(report.reviewId);
                } catch { /* last event */ }
              }
            } catch { /* skip */ }
          }
        }
      }
    }

    setLoading(false);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold text-white">Local Code Review</h1>
      <p className="text-slate-400 text-sm">Scan a local git repository branch diff for AI review</p>

      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 space-y-4">
        <div>
          <label className="block text-sm text-slate-400 mb-1">Project</label>
          <input
            type="text"
            value={project}
            onChange={(e) => setProject(e.target.value)}
            placeholder="e.g. qiqiao-console"
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Source Branch</label>
            <input
              type="text"
              value={sourceBranch}
              onChange={(e) => setSourceBranch(e.target.value)}
              placeholder="e.g. feature/login"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Target Branch</label>
            <input
              type="text"
              value={targetBranch}
              onChange={(e) => setTargetBranch(e.target.value)}
              placeholder="e.g. main"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"
            />
          </div>
        </div>
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
        >
          {loading ? "Reviewing..." : "Start Review"}
        </button>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-800/50 rounded-xl p-4 text-red-400 text-sm">{error}</div>
      )}

      {steps.length > 0 && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <h3 className="text-sm font-medium text-slate-400 mb-2">Progress</h3>
          <div className="space-y-1">
            {steps.map((s, i) => (
              <div key={i} className="text-sm text-slate-300">{s}</div>
            ))}
          </div>
        </div>
      )}

      {reviewId && (
        <div className="bg-green-900/20 border border-green-800/50 rounded-xl p-4">
          <span className="text-green-400 text-sm">Review complete: </span>
          <a href={`#/reviews/${reviewId}`} className="text-blue-400 underline text-sm">View Report</a>
        </div>
      )}
    </motion.div>
  );
}
```

- [ ] **Step 2: Wire into App.tsx**

Add import + Route + nav link (same pattern as MemoryPage).

- [ ] **Step 3: Verify build**

Run: `npx vite build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/client/pages/LocalReviewPage.tsx src/client/App.tsx
git commit -m "feat(v1.3.0): add LocalReviewPage with SSE progress"
```

---

### Task 11: Integration Test — qiqiao 仓库实测

**Files:**
- No new files

- [ ] **Step 1: Configure repo mapping**

```bash
# Start the server
npx tsx src/server/index.ts &

# Add mapping via API (or settings page)
curl -X POST http://localhost:3001/api/settings/repo-mapping \
  -H "Content-Type: application/json" \
  -d '{"project":"qiqiao-console","localPath":"/Users/tzknow/Documents/do1/do1_workspace/01_workspace/qiqiao/frontend/do1cloud-qiqiao-console-web"}'
```

- [ ] **Step 2: Test diff extraction**

```bash
curl -X POST http://localhost:3001/api/review/local \
  -H "Content-Type: application/json" \
  -d '{"project":"qiqiao-console","sourceBranch":"<test-branch>","targetBranch":"master"}'
```

Expected: SSE stream with scanning → classifying → reviewing → complete.

- [ ] **Step 3: Test diff upload**

```bash
# Create a sample diff
cd /Users/tzknow/Documents/do1/do1_workspace/01_workspace/qiqiao/frontend/do1cloud-qiqiao-console-web
git diff master..HEAD > /tmp/test.diff

curl -X POST http://localhost:3001/api/review/diff \
  -H "Content-Type: application/json" \
  -d "{\"project\":\"qiqiao-console\",\"diffText\":\"$(cat /tmp/test.diff | head -100)\"}"
```

Expected: JSON response with ReviewReport.

- [ ] **Step 4: Verify review report in UI**

Open browser → Local Review → enter project/branches → verify report renders correctly.

- [ ] **Step 5: Update version status docs**

Update `docs/versions/README.md` and `docs/versions/v1.3.0/README.md`.

- [ ] **Step 6: Final commit**

```bash
git add docs/
git commit -m "docs: update v1.3.0 status"
```

---

## Self-Review

### 1. Spec Coverage
- Local scan flow: Task 3 (git diff) + Task 8 (orchestrator) + Task 9 (route) ✅
- Symbol extraction: Task 4 ✅
- Related file discovery: Task 5 ✅
- Context extraction (Vue/TS): Task 6 ✅
- Token budget: Task 7 ✅
- Repo mapping: Task 2 ✅
- Diff upload: Task 9 (review-diff route) ✅
- Frontend: Task 10 ✅
- Integration test: Task 11 ✅

### 2. Placeholder Scan
No TBD/TODO. All steps contain actual code.

### 3. Type Consistency
- `LocalReviewRequest`, `DiffReviewRequest`, `RepoMapping`, `RelatedFile`, `ScanContext` defined in Task 1
- Used consistently across routes (Task 9), orchestrator (Task 8), and services
- `GitLabDiff` reused from existing types for pipeline compatibility
- `FileCategory` used in symbol-extractor and related-finder consistently

---

*Plan saved: 2026-05-01*
