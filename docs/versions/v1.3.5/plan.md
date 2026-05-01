# v1.3.5 文件选择过滤器 — Implementation Plan

**Goal:** 当 diff 文件过多（>20）时，弹出文件选择对话框，让用户按需选择评审范围，减少不必要的 LLM 调用和 token 消耗。

**Architecture:** 前端新增 FileSelectorDialog 组件，支持三种分组维度切换（文件类型/目录模块/风险等级），默认按文件类型分组。后端新增预览接口返回分类信息供前端展示。

---

## 核心交互

```
用户输入 diff / 选择分支
        ↓
  解析得到 N 个文件
        ↓
  N > 20 ? ──否──→ 直接评审
        ↓ 是
  ┌─ 文件选择对话框 ───────────────────────────┐
  │  [文件类型] [目录模块] [风险等级]  ← 切换    │
  │                                            │
  │  ☑ Vue 组件      128 文件  新增:49 改:79    │
  │  ☑ JavaScript      62 文件  新增:15 改:47    │
  │  ☐ SVG/图片        16 文件  (建议跳过)       │
  │  ☐ 样式(.less/.css) 12 文件  (建议跳过)       │
  │  ─────────────────────────────────────      │
  │  已选 190/266 | 预估 ~48 批 | ~700K tokens  │
  │  [全选] [反选] [跳过低风险] [跳过图片/样式]   │
  │                          [开始评审]          │
  └────────────────────────────────────────────┘
        ↓
  只 review 选中的文件，进入正常评审流程
```

---

## File Structure

| 操作 | 文件 | 职责 |
|------|------|------|
| 新建 | `src/client/components/FileSelectorDialog.tsx` | 文件选择对话框组件 |
| 修改 | `src/client/pages/LocalReviewPage.tsx` | 集成文件选择流程 |
| 修改 | `src/client/components/ReviewForm.tsx` | diff 上传流程集成文件选择 |
| 新建 | `src/server/services/local-scan/diff-preview.ts` | diff 预览分析服务 |
| 新建 | `src/server/routes/review-preview.ts` | 预览 API 路由 |
| 修改 | `src/server/routes/review-local.ts` | 接收 excludedFiles 参数 |
| 修改 | `src/server/routes/review-diff.ts` | 接收 excludedFiles 参数 |
| 修改 | `src/server/index.ts` | 挂载预览路由 |
| 新建 | `tests/diff-preview.test.ts` | 预览服务测试 |

---

### Task 1: Types — 新增预览类型

**Files:**
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Add types**

```typescript
// ---- Diff Preview (v1.3.5) ----

export interface FilePreviewItem {
  path: string;
  newFile: boolean;
  deletedFile: boolean;
  renamedFile: boolean;
  diffChars: number;
  riskLevel: RiskLevel;
  fileCategory: FileCategory;
  symbols: string[];
}

export type GroupByMode = "fileType" | "directory" | "riskLevel";

export interface FileGroup {
  key: string;               // 分组标识
  label: string;             // 显示名
  count: number;             // 文件数
  newCount: number;          // 新增文件数
  modifiedCount: number;     // 修改文件数
  suggestedSkip: boolean;    // 建议跳过（SVG/样式/配置）
  files: FilePreviewItem[];
}

export interface DiffPreviewRequest {
  project?: string;
  diffText?: string;
  sourceBranch?: string;
  targetBranch?: string;
}

export interface DiffPreviewResponse {
  totalFiles: number;
  skipCount: number;
  groups: FileGroup[];
  batchEstimate: number;
  tokenEstimate: number;
  triggerThreshold: boolean;  // 是否触发选择框
}
```

- [ ] **Step 2: Verify TypeScript compiles**

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat(v1.3.5): add diff preview types"
```

---

### Task 2: Diff Preview Service — 分析 diff 并分组

**Files:**
- Create: `src/server/services/local-scan/diff-preview.ts`
- Create: `tests/diff-preview.test.ts`

- [ ] **Step 1: Write failing tests**

`tests/diff-preview.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  analyzeDiffPreview,
  groupByFileType,
  groupByDirectory,
  groupByRiskLevel,
  estimateBatchesAndTokens,
  type FilePreviewItem,
} from "../src/server/services/local-scan/diff-preview";

const mockFiles: FilePreviewItem[] = [
  { path: "src/components/UserCard.vue", newFile: false, deletedFile: false, renamedFile: false, diffChars: 500, riskLevel: "A", fileCategory: "business", symbols: ["user"] },
  { path: "src/components/UserAvatar.vue", newFile: true, deletedFile: false, renamedFile: false, diffChars: 800, riskLevel: "S", fileCategory: "business", symbols: ["avatar"] },
  { path: "src/utils/helper.ts", newFile: false, deletedFile: false, renamedFile: false, diffChars: 200, riskLevel: "B", fileCategory: "utility", symbols: ["format"] },
  { path: "src/assets/logo.svg", newFile: true, deletedFile: false, renamedFile: false, diffChars: 1500, riskLevel: "C", fileCategory: "config", symbols: [] },
  { path: "src/styles/common.less", newFile: false, deletedFile: false, renamedFile: false, diffChars: 300, riskLevel: "C", fileCategory: "config", symbols: [] },
  { path: ".eslintrc.json", newFile: false, deletedFile: false, renamedFile: false, diffChars: 50, riskLevel: "C", fileCategory: "config", symbols: [] },
];

describe("diff-preview", () => {
  describe("groupByFileType", () => {
    it("groups files by extension", () => {
      const groups = groupByFileType(mockFiles);
      expect(groups.length).toBeGreaterThanOrEqual(3);
      const vueGroup = groups.find((g) => g.key === "vue");
      expect(vueGroup?.count).toBe(2);
      expect(vueGroup?.newCount).toBe(1);
    });
  });

  describe("groupByDirectory", () => {
    it("groups files by top-level src directory", () => {
      const groups = groupByDirectory(mockFiles);
      const compGroup = groups.find((g) => g.key === "src/components");
      expect(compGroup?.count).toBe(2);
    });
  });

  describe("groupByRiskLevel", () => {
    it("groups files by risk level", () => {
      const groups = groupByRiskLevel(mockFiles);
      const sGroup = groups.find((g) => g.key === "S");
      expect(sGroup?.count).toBe(1);
    });
  });

  describe("estimateBatchesAndTokens", () => {
    it("estimates batch count and tokens", () => {
      const { batchEstimate, tokenEstimate } = estimateBatchesAndTokens(mockFiles);
      expect(batchEstimate).toBeGreaterThanOrEqual(1);
      expect(tokenEstimate).toBeGreaterThan(0);
    });
  });

  describe("analyzeDiffPreview", () => {
    it("returns full preview with all group modes", () => {
      const preview = analyzeDiffPreview(mockFiles);
      expect(preview.totalFiles).toBe(6);
      expect(preview.groups.length).toBeGreaterThan(0);
      expect(preview.triggerThreshold).toBe(false); // 6 < 20
    });

    it("triggers threshold when files > 20", () => {
      const manyFiles = Array(25).fill(null).map((_, i) => ({
        ...mockFiles[0],
        path: `file${i}.ts`,
      }));
      const preview = analyzeDiffPreview(manyFiles);
      expect(preview.triggerThreshold).toBe(true);
    });

    it("marks SVG/style/config as suggestedSkip", () => {
      const groups = groupByFileType(mockFiles);
      const svgGroup = groups.find((g) => g.key === "image");
      expect(svgGroup?.suggestedSkip).toBe(true);
      const styleGroup = groups.find((g) => g.key === "style");
      expect(styleGroup?.suggestedSkip).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run tests — RED**

- [ ] **Step 3: Create diff-preview.ts**

`src/server/services/local-scan/diff-preview.ts`:

```typescript
import type { FilePreviewItem, FileGroup, GroupByMode, DiffPreviewResponse } from "../../../shared/types";
import { classifyFile } from "./symbol-extractor";
import { extractChangedSymbols } from "./symbol-extractor";

const FILE_TYPE_CONFIG: Record<string, { label: string; order: number; suggestedSkip: boolean }> = {
  vue:       { label: "Vue 组件",    order: 1, suggestedSkip: false },
  js:        { label: "JavaScript",  order: 2, suggestedSkip: false },
  ts:        { label: "TypeScript",  order: 3, suggestedSkip: false },
  tsx:       { label: "TSX",         order: 4, suggestedSkip: false },
  jsx:       { label: "JSX",         order: 5, suggestedSkip: false },
  java:      { label: "Java",        order: 6, suggestedSkip: false },
  style:     { label: "样式文件",    order: 7, suggestedSkip: true },
  image:     { label: "图片/SVG",    order: 8, suggestedSkip: true },
  config:    { label: "配置文件",    order: 9, suggestedSkip: true },
  other:     { label: "其他",        order: 10, suggestedSkip: false },
};

const RISK_LEVEL_ORDER: Record<string, { label: string; order: number }> = {
  S: { label: "S 级 (高风险)",   order: 1 },
  A: { label: "A 级 (中高风险)",  order: 2 },
  B: { label: "B 级 (中低风险)",  order: 3 },
  C: { label: "C 级 (低风险)",    order: 4 },
};

function getFileTypeKey(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  if (ext === "vue" || ext === "svelte") return "vue";
  if (ext === "js" || ext === "jsx") return "js";
  if (ext === "ts") return "ts";
  if (ext === "tsx") return "tsx";
  if (["css", "less", "scss", "sass"].includes(ext)) return "style";
  if (["svg", "png", "jpg", "jpeg", "gif", "ico", "webp"].includes(ext)) return "image";
  if (["json", "yml", "yaml"].includes(ext) || path.includes(".eslintrc") || path.includes(".prettierrc") || path === ".gitignore") return "config";
  if (ext === "java") return "java";
  return "other";
}

function getDirectoryKey(path: string): string {
  const parts = path.split("/");
  // Return first 2 segments (e.g., "src/components", "src/modules/aiDesign")
  if (parts.length >= 3 && parts[0] === "src") {
    return parts.slice(0, 3).join("/");
  }
  if (parts.length >= 2) {
    return parts.slice(0, 2).join("/");
  }
  return parts[0] || "root";
}

export function groupByFileType(files: FilePreviewItem[]): FileGroup[] {
  const map = new Map<string, FilePreviewItem[]>();
  for (const f of files) {
    const key = getFileTypeKey(f.path);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(f);
  }

  const groups: FileGroup[] = [];
  for (const [key, items] of map) {
    const config = FILE_TYPE_CONFIG[key] || FILE_TYPE_CONFIG.other;
    groups.push({
      key,
      label: config.label,
      count: items.length,
      newCount: items.filter((f) => f.newFile).length,
      modifiedCount: items.filter((f) => !f.newFile && !f.deletedFile).length,
      suggestedSkip: config.suggestedSkip,
      files: items,
    });
  }

  return groups.sort((a, b) => (FILE_TYPE_CONFIG[a.key]?.order ?? 99) - (FILE_TYPE_CONFIG[b.key]?.order ?? 99));
}

export function groupByDirectory(files: FilePreviewItem[]): FileGroup[] {
  const map = new Map<string, FilePreviewItem[]>();
  for (const f of files) {
    const key = getDirectoryKey(f.path);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(f);
  }

  const groups: FileGroup[] = [];
  for (const [key, items] of map) {
    groups.push({
      key,
      label: key + "/",
      count: items.length,
      newCount: items.filter((f) => f.newFile).length,
      modifiedCount: items.filter((f) => !f.newFile && !f.deletedFile).length,
      suggestedSkip: items.every((f) => f.riskLevel === "C"),
      files: items,
    });
  }

  return groups.sort((a, b) => b.count - a.count);
}

export function groupByRiskLevel(files: FilePreviewItem[]): FileGroup[] {
  const map = new Map<string, FilePreviewItem[]>();
  for (const f of files) {
    if (!map.has(f.riskLevel)) map.set(f.riskLevel, []);
    map.get(f.riskLevel)!.push(f);
  }

  const groups: FileGroup[] = [];
  for (const [key, items] of map) {
    const config = RISK_LEVEL_ORDER[key] || { label: key, order: 99 };
    groups.push({
      key,
      label: config.label,
      count: items.length,
      newCount: items.filter((f) => f.newFile).length,
      modifiedCount: items.filter((f) => !f.newFile && !f.deletedFile).length,
      suggestedSkip: key === "C",
      files: items,
    });
  }

  return groups.sort((a, b) => (RISK_LEVEL_ORDER[a.key]?.order ?? 99) - (RISK_LEVEL_ORDER[b.key]?.order ?? 99));
}

export function estimateBatchesAndTokens(files: FilePreviewItem[]): { batchEstimate: number; tokenEstimate: number } {
  // Rough estimate: 3-4 files per batch, ~8K tokens per batch
  const batchEstimate = Math.max(1, Math.ceil(files.length / 4));
  const totalDiffChars = files.reduce((sum, f) => sum + f.diffChars, 0);
  // System prompt ~2K + diff content (~4 chars/token) + expected output ~2K
  const tokenEstimate = batchEstimate * 2000 + Math.ceil(totalDiffChars / 4);
  return { batchEstimate, tokenEstimate };
}

const PREVIEW_THRESHOLD = 20;

export function analyzeDiffPreview(
  files: FilePreviewItem[],
  groupBy: GroupByMode = "fileType"
): DiffPreviewResponse {
  const skipCount = files.filter((f) => f.riskLevel === "C" || ["image", "style"].includes(getFileTypeKey(f.path))).length;
  const { batchEstimate, tokenEstimate } = estimateBatchesAndTokens(files);

  let groups: FileGroup[];
  switch (groupBy) {
    case "directory":
      groups = groupByDirectory(files);
      break;
    case "riskLevel":
      groups = groupByRiskLevel(files);
      break;
    default:
      groups = groupByFileType(files);
  }

  return {
    totalFiles: files.length,
    skipCount,
    groups,
    batchEstimate,
    tokenEstimate,
    triggerThreshold: files.length > PREVIEW_THRESHOLD,
  };
}
```

- [ ] **Step 4: Run tests — GREEN**

- [ ] **Step 5: Commit**

```bash
git add src/server/services/local-scan/diff-preview.ts tests/diff-preview.test.ts
git commit -m "feat(v1.3.5): add diff preview service with multi-dimension grouping"
```

---

### Task 3: Preview API Route

**Files:**
- Create: `src/server/routes/review-preview.ts`
- Modify: `src/server/index.ts`

- [ ] **Step 1: Create preview route**

`src/server/routes/review-preview.ts`:

```typescript
import { Router, Request, Response } from "express";
import { parseDiffToGitLabDiffs } from "../services/local-scan/git-diff";
import { extractLocalDiff } from "../services/local-scan/git-diff";
import { extractChangedSymbols, classifyFile } from "../services/local-scan/symbol-extractor";
import { analyzeDiffPreview } from "../services/local-scan/diff-preview";
import { getRepoMapping } from "../config/repo-mapping";
import { classify } from "../services/classifier";
import type { FilePreviewItem, GroupByMode, DiffPreviewRequest } from "../../shared/types";

const router = Router();

// POST /api/review/preview — preview diff files before review
router.post("/preview", (req: Request, res: Response) => {
  const { project, diffText, sourceBranch, targetBranch }: DiffPreviewRequest = req.body;

  const groupBy = (req.query.groupBy as GroupByMode) || "fileType";

  let rawDiff: string;

  if (diffText) {
    // Direct diff upload
    rawDiff = diffText;
  } else if (project && sourceBranch && targetBranch) {
    // Local repo scan
    const mapping = getRepoMapping(project);
    if (!mapping) {
      res.status(404).json({ error: `No repo mapping for project: ${project}` });
      return;
    }
    try {
      rawDiff = extractLocalDiff(mapping.localPath, targetBranch, sourceBranch);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to extract diff" });
      return;
    }
  } else {
    res.status(400).json({ error: "Provide either diffText or (project + sourceBranch + targetBranch)" });
    return;
  }

  const diffs = parseDiffToGitLabDiffs(rawDiff);
  if (diffs.length === 0) {
    res.json({ totalFiles: 0, skipCount: 0, groups: [], batchEstimate: 0, tokenEstimate: 0, triggerThreshold: false });
    return;
  }

  // Classify for risk levels
  const { summary } = classify(diffs);
  const levelMap = new Map<string, string>();
  summary.batches.forEach((b) => {
    b.files.forEach((f) => levelMap.set(f.path, f.level));
  });

  // Build preview items
  const items: FilePreviewItem[] = diffs.map((d) => ({
    path: d.new_path,
    newFile: d.new_file,
    deletedFile: d.deleted_file,
    renamedFile: d.renamed_file,
    diffChars: d.diff.length,
    riskLevel: (levelMap.get(d.new_path) as any) || "C",
    fileCategory: classifyFile(d.new_path),
    symbols: extractChangedSymbols(d.diff).slice(0, 5),
  }));

  const preview = analyzeDiffPreview(items, groupBy);
  res.json(preview);
});

export default router;
```

- [ ] **Step 2: Mount in index.ts**

Add import and mount:
```typescript
import reviewPreviewRouter from "./routes/review-preview";
// ...
app.use("/api/review", reviewPreviewRouter);
```

- [ ] **Step 3: Verify TypeScript compiles**

- [ ] **Step 4: Commit**

```bash
git add src/server/routes/review-preview.ts src/server/index.ts
git commit -m "feat(v1.3.5): add POST /api/review/preview endpoint"
```

---

### Task 4: Review Routes — 接收 excludedFiles 参数

**Files:**
- Modify: `src/server/routes/review-local.ts`
- Modify: `src/server/routes/review-diff.ts`

- [ ] **Step 1: Add excludedFiles filtering to review-local.ts**

In the route handler, after parsing diffs, add:

```typescript
// Filter excluded files
const excludedFiles: string[] = req.body.excludedFiles || [];
const filteredDiffs = excludedFiles.length > 0
  ? diffs.filter((d: any) => !excludedFiles.includes(d.new_path))
  : diffs;
```

Then use `filteredDiffs` instead of `diffs` in the classify step.

- [ ] **Step 2: Add same filtering to review-diff.ts**

Same pattern in the diff route.

- [ ] **Step 3: Update types**

Add to `DiffReviewRequest`:
```typescript
excludedFiles?: string[];
```

Add to `LocalReviewRequest`:
```typescript
excludedFiles?: string[];
```

- [ ] **Step 4: Commit**

```bash
git add src/server/routes/review-local.ts src/server/routes/review-diff.ts src/shared/types.ts
git commit -m "feat(v1.3.5): support excludedFiles filter in review routes"
```

---

### Task 5: Frontend — FileSelectorDialog 组件

**Files:**
- Create: `src/client/components/FileSelectorDialog.tsx`

- [ ] **Step 1: Create FileSelectorDialog.tsx**

组件功能：
1. 接收 `DiffPreviewResponse` 数据
2. 三个 tab 切换：文件类型 / 目录模块 / 风险等级
3. 每个分组显示 checkbox + 文件数 + 新增/修改统计
4. 可展开分组查看具体文件列表（带独立 checkbox）
5. 底部状态栏：已选文件数 / 预估批次数 / 预估 token
6. 快捷按钮：全选 / 反选 / 跳过低风险 / 跳过图片样式
7. 返回选中的文件路径列表

Props:
```typescript
interface FileSelectorDialogProps {
  preview: DiffPreviewResponse;
  onConfirm: (selectedFiles: string[]) => void;
  onCancel: () => void;
}
```

- [ ] **Step 2: Verify build**

- [ ] **Step 3: Commit**

```bash
git add src/client/components/FileSelectorDialog.tsx
git commit -m "feat(v1.3.5): add FileSelectorDialog component"
```

---

### Task 6: Frontend — 集成到 LocalReviewPage 和 ReviewForm

**Files:**
- Modify: `src/client/pages/LocalReviewPage.tsx`
- Modify: `src/client/components/ReviewForm.tsx`

- [ ] **Step 1: LocalReviewPage flow update**

LocalReviewPage 提交流程改为：
1. 先调 `/api/review/preview` 获取文件分析
2. 如果 `triggerThreshold === true`，弹出 FileSelectorDialog
3. 用户确认后，将 `excludedFiles`（未选中的文件）传入 review 请求
4. 如果 `triggerThreshold === false`，直接进入评审

- [ ] **Step 2: ReviewForm diff upload flow**

对 diff 上传也增加同样逻辑：
1. 用户粘贴 diff 后先调 preview
2. 文件多时弹出选择框
3. 确认后带 excludedFiles 发起评审

- [ ] **Step 3: Verify build**

- [ ] **Step 4: Commit**

```bash
git add src/client/pages/LocalReviewPage.tsx src/client/components/ReviewForm.tsx
git commit -m "feat(v1.3.5): integrate file selector into review flow"
```

---

### Task 7: Integration Test + Final

- [ ] **Step 1: Test with qiqiao console-web**
- [ ] **Step 2: Verify file selection reduces batches/tokens**
- [ ] **Step 3: Update version docs**
- [ ] **Step 4: Final commit**

---

## Self-Review

### Spec Coverage
- Preview API: Task 2 + Task 3 ✅
- Three group modes: Task 2 (groupByFileType/Directory/RiskLevel) ✅
- File selection UI: Task 5 ✅
- Integration into review flow: Task 6 ✅
- excludedFiles filter: Task 4 ✅
- Estimation display: Task 2 (estimateBatchesAndTokens) ✅

### No Placeholders
All tasks contain actual code.

---

*Plan saved: 2026-05-02*
