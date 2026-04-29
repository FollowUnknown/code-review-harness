# 本地源码扫描架构设计

> 版本: v1.0 (Architecture Phase)
> 日期: 2026-04-28
> 状态: 待确认

---

## 1. 目标

让 CodeReview 支持不经过 GitLab API、直接扫描服务器本地代码仓库进行评审。

---

## 2. 核心对象模型

```
┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│   LocalRepoConfig   │────▶│    LocalScanner     │────▶│  LocalReviewContext │
├─────────────────────┤     ├─────────────────────┤     ├─────────────────────┤
│ project: string     │     │ repoPath: string    │     │ diffs: GitLabDiff[] │
│ localPath: string   │     │ sourceBranch        │     │ relatedFiles        │
│ (env/db)            │     │ targetBranch        │     │ classification      │
└─────────────────────┘     │                     │     │ requirement         │
                            │ run(): ScanResult   │     │ knowledge           │
                            └─────────────────────┘     └─────────────────────┘
                                    │                            │
                                    ▼                            ▼
                            ┌─────────────────────┐     ┌─────────────────────┐
                            │    ScanResult       │────▶│   ReviewPipeline    │
                            ├─────────────────────┤     │   (复用现有)        │
                            │ diffs: GitLabDiff[] │     ├─────────────────────┤
                            │ changedFiles        │     │ classify()          │
                            │ relatedFiles        │     │ reviewBatches()     │
                            │ totalFiles          │     │ mergeReports()      │
                            └─────────────────────┘     └─────────────────────┘
```

### 2.1 新增类型定义

```typescript
// src/shared/types.ts

export interface LocalReviewRequest {
  project: string;              // 项目标识
  sourceBranch: string;         // 需求分支
  targetBranch: string;         // 目标分支
  includeRelatedFiles?: boolean; // 是否包含关联文件上下文（默认 true）
  relatedFileDepth?: number;    // 关联层级：1=直接依赖（默认），2=间接依赖
}

export interface RelatedFile {
  path: string;                 // 仓库内相对路径
  content: string;              // 文件完整内容
  relationType: "import" | "reverse_import" | "same_dir_index" | "same_module";
  relationSource: string;       // 哪个变更文件关联过来的
}

export interface LocalScanResult {
  diffs: GitLabDiff[];
  changedFiles: string[];
  relatedFiles: RelatedFile[];
  totalFiles: number;
  skippedFiles: string[];
}

export interface RepoConfig {
  project: string;
  localPath: string;
  defaultBranch?: string;
  enabled: boolean;
}
```

---

## 3. 状态流

```
用户 POST /api/review/local
    │
    ▼
┌─────────────────┐
│ 1. 解析请求     │  验证必填字段
│   (Parse)       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 2. 解析仓库路径 │  project → localPath (查配置)
│   (Resolve)     │  验证路径存在、是git仓库
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 3. 提取Diff     │  git diff target...source
│   (GitDiff)     │  解析为 GitLabDiff[]
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 4. 发现关联文件 │  AST/正则提取 import 链
│   (Related)     │  读取关联文件完整内容
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 5. 分类+评审    │  复用现有 classify + reviewBatches
│   (Review)      │  关联文件注入 userPrompt
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 6. 保存+返回    │  saveReviewRecord + SSE 响应
│   (Complete)    │
└─────────────────┘
```

---

## 4. 模块设计

### 4.1 GitDiffExtractor — diff 提取与解析

```typescript
// src/server/services/local-scan/git-diff.ts

export interface GitDiffOptions {
  repoPath: string;
  targetBranch: string;
  sourceBranch: string;
}

/**
 * 提取并解析 git diff
 * 
 * 实现策略：
 * 1. cd repoPath
 * 2. git fetch origin（可选，确保分支最新）
 * 3. git diff --name-status target...source → 获取变更文件列表
 * 4. 对每个文件：git diff target...source -- file → 获取该文件diff
 * 5. 解析 unified diff 格式 → GitLabDiff[]
 */
export async function extractGitDiffs(options: GitDiffOptions): Promise<GitLabDiff[]>;

/**
 * 解析 unified diff 格式中的单个文件diff
 */
function parseDiffBlock(block: string, oldPath: string, newPath: string): GitLabDiff;
```

**技术决策：为什么不用 `git diff target...source` 一次性输出？**

因为 unified diff 格式中多个文件的diff连在一起，需要复杂的解析逻辑。逐文件获取更可靠，且每个diff块独立，天然对应 `GitLabDiff` 结构。

### 4.2 RelatedFinder — 关联文件发现

```typescript
// src/server/services/local-scan/related-finder.ts

export interface RelatedFinderOptions {
  repoPath: string;
  changedFiles: string[];
  maxDepth: number;        // 1=直接依赖, 2=间接依赖
  maxFilesPerChange: number; // 每个变更文件最多关联N个
}

/**
 * 为变更文件发现关联文件
 * 
 * 策略（按优先级排序）：
 * 1. 直接依赖：解析变更文件的 import/require，找到被引用的本地文件
 * 2. 反向依赖：哪些文件 import 了变更文件（需要预建或搜索）
 * 3. 同目录 index：变更文件同目录的 index.ts/index.js
 * 4. 同模块：同父目录下的其他文件（最后考虑）
 * 
 * 实现方式：正则提取（无需AST库）
 * - 覆盖 TS/JS/JSX/TSX 的 import/require
 * - 将相对路径解析为绝对路径，验证存在
 * - 按关联强度排序，截断到 maxFilesPerChange
 */
export async function findRelatedFiles(options: RelatedFinderOptions): Promise<RelatedFile[]>;

/**
 * 从文件内容提取 import/require 路径
 */
function extractImports(content: string, fileDir: string, repoPath: string): string[];

/**
 * 查找哪些文件 import 了指定文件（反向依赖）
 * 策略：在变更文件所在目录及上级目录搜索 import 语句
 */
function findReverseImports(targetFile: string, repoPath: string, searchScope: string[]): string[];
```

**技术决策：为什么用正则而不是 AST？**

| 维度 | 正则 | AST (ts-morph) |
|------|------|----------------|
| 依赖 | 无新增 | +1 大依赖 |
| 速度 | 快（字符串操作） | 慢（需解析整个文件） |
| TS/JS 覆盖率 | 95%+ | 100% |
| 其他语言 | 容易扩展 | 每个语言需要不同parser |
| 局域网部署 | 更轻量 | 更重 |

**结论**：先用正则。如果后续发现覆盖不够，再引入 AST。

### 4.3 ContextBuilder — 评审上下文组装

```typescript
// src/server/services/local-scan/context-builder.ts

/**
 * 将 diff + 关联文件组装为 LLM 评审输入
 * 
 * 格式（与现有 GitLab 模式保持一致，只在 userPrompt 中增加关联文件）：
 * 
 * ```
 * --- src/auth/login.ts
 * +++ src/auth/login.ts
 * [diff内容]
 * 
 * ### 关联文件上下文（供参考，不直接评审）
 * === src/types/user.ts ===
 * [完整内容]
 * 
 * === src/utils/auth.ts ===
 * [完整内容]
 * ```
 */
export function buildReviewContext(
  diffs: GitLabDiff[],
  relatedFiles: RelatedFile[],
  reviewMode: ReviewMode
): string;

/**
 * Token 预算控制：关联文件总量不超过预算
 */
function truncateRelatedFiles(
  files: RelatedFile[],
  tokenBudget: number
): RelatedFile[];
```

### 4.4 RepoConfig — 仓库路径映射

```typescript
// src/server/config/repo-mapping.ts

/**
 * 仓库路径映射管理
 * 
 * 配置来源（优先级从高到低）：
 * 1. 环境变量：REPO_<PROJECT>=/path/to/repo
 *    例：REPO_MY_PROJECT=/data/repos/my-project
 * 2. 数据库配置表：repo_configs(project, local_path, enabled)
 * 3. 默认值：无
 */
export function resolveRepoPath(project: string): string | null;
export function listRepoConfigs(): RepoConfig[];
export function addRepoConfig(config: RepoConfig): void;
export function validateRepoPath(path: string): { valid: boolean; error?: string };
```

---

## 5. 路由设计

```typescript
// src/server/routes/review-local.ts

// POST /api/review/local
// 请求体: LocalReviewRequest
// 响应: SSE (与现有 /api/review 完全一致的数据格式)

router.post("/review/local", async (req, res) => {
  const { project, sourceBranch, targetBranch, includeRelatedFiles, relatedFileDepth } = req.body;
  
  // 复用现有的 SSE 机制和响应格式
  // 内部流程：Resolve → GitDiff → Related → Classify → Review → Save
});
```

---

## 6. 关联文件注入 Prompt 格式

现有 userPrompt（GitLab 模式）：
```
请评审以下代码变更...

--- old_path
+++ new_path
[diff]
```

本地扫描模式（增加关联文件）：
```
请评审以下代码变更...

--- old_path
+++ new_path
[diff]

=== 关联文件上下文（供参考，不直接评审）===
[file: src/types/user.ts]
export interface User {
  id: string;
  name: string;
}

[file: src/utils/auth.ts]
export function verifyToken(token: string): boolean { ... }
```

**关键原则**：
- 关联文件明确标记为"供参考，不直接评审"
- LLM 用它们来理解接口定义、类型约束、工具函数签名
- 避免 LLM 对关联文件本身提 issue

---

## 7. 与现有系统的衔接

### 7.1 复用部分（不动）

| 模块 | 复用方式 |
|------|----------|
| `classifier.ts` | 直接复用。`classify(diffs)` 输入是 `GitLabDiff[]`，本地扫描输出同样的类型 |
| `reviewer.ts` | 直接复用。`reviewBatches()` 输入不变 |
| `llm/*` | 完全复用。Prompt 模板、LLM 调用不变 |
| `knowledge.ts` | 完全复用。`getKnowledgeForReview(project)` 不变 |
| `review-store.ts` | 完全复用。保存记录的方式不变 |
| `llm-logger.ts` | 完全复用 |

### 7.2 适配部分（修改）

| 模块 | 修改内容 |
|------|----------|
| `src/shared/types.ts` | 新增 `LocalReviewRequest`, `RelatedFile`, `LocalScanResult`, `RepoConfig` |
| `src/server/index.ts` | 注册 `POST /api/review/local` 路由 |
| `classifier.ts` | 可能需要暴露 `getReviewConfig` 供关联文件发现使用（确认 reviewMode 的使用） |

### 7.3 reviewMode 的使用

现有 classifier 返回三种 `reviewMode`：
- `standard` (S/A级): 需要深度关联文件
- `diff_plus_self` (B级): diff + 变更文件本身完整内容
- `diff_only` (C级): 只评diff，不要关联文件

**本地扫描应该按 reviewMode 控制关联文件注入**：
```typescript
if (reviewMode === "diff_only") {
  // 不注入任何关联文件
} else if (reviewMode === "diff_plus_self") {
  // 注入变更文件本身的完整内容（新文件时特别有用）
} else {
  // standard: 注入 import 链关联文件
}
```

---

## 8. Token 控制策略（核心）

本地扫描的核心风险：关联文件可能非常大（几千行的工具类、生成的代码），导致 token 超限。

**三层防御**：

### 8.1 第一层：关联文件数量上限

```typescript
const MAX_RELATED_FILES_PER_CHANGE = 3;  // 每个变更文件最多3个关联
const MAX_TOTAL_RELATED_FILES = 10;       // 全局最多10个关联文件
```

### 8.2 第二层：单文件行数上限

```typescript
const MAX_RELATED_FILE_LINES = 300;  // 单个关联文件最多读取300行
```

读取时只取前 300 行（接口定义通常在前部）：
```typescript
const lines = content.split("\n").slice(0, MAX_RELATED_FILE_LINES);
const truncated = lines.join("\n");
// 如果超了，末尾加提示
if (content.split("\n").length > MAX_RELATED_FILE_LINES) {
  truncated += "\n\n... [文件过长，已截断，仅保留前300行] ...";
}
```

### 8.3 第三层：全局 Token 预算

```typescript
const RELATED_FILES_TOKEN_BUDGET = 3000;  // 关联文件总预算

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);  // 粗略估算：1 token ≈ 4 chars
}

function truncateRelatedFiles(files: RelatedFile[], budget: number): RelatedFile[] {
  const result: RelatedFile[] = [];
  let used = 0;
  
  for (const file of files) {
    const tokens = estimateTokens(file.content);
    if (used + tokens > budget) {
      // 尝试只保留文件头部（接口定义区域）
      const headOnly = extractInterfaceDefinitions(file.content);
      const headTokens = estimateTokens(headOnly);
      if (used + headTokens <= budget) {
        result.push({ ...file, content: headOnly });
        used += headTokens;
      }
      break;  // 预算用完，停止
    }
    result.push(file);
    used += tokens;
  }
  
  return result;
}
```

### 8.4 智能截断：保留接口定义，去掉实现

关联文件的作用是**让 AI 知道接口长什么样**，不需要完整实现：

```typescript
/**
 * 从文件中提取关键定义（接口、类型、导出函数签名）
 * 用于预算不足时降级提供"精简版关联文件"
 */
function extractInterfaceDefinitions(content: string): string {
  const lines = content.split("\n");
  const result: string[] = [];
  let inInterface = false;
  let braceDepth = 0;
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // 匹配接口/类型定义开始
    if (/^(export\s+)?(interface|type)\s+\w+/.test(trimmed)) {
      inInterface = true;
      result.push(line);
      braceDepth = (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
      continue;
    }
    
    // 匹配导出函数签名（不含实现体）
    if (/^(export\s+)?(async\s+)?function\s+\w+\s*\(/.test(trimmed)) {
      result.push(line);
      // 如果函数体在同一行且是简单返回，保留
      if (trimmed.includes("{")) {
        const closeIdx = findMatchingBrace(lines, lines.indexOf(line));
        if (closeIdx - lines.indexOf(line) < 5) {
          // 短函数，保留完整
          for (let i = lines.indexOf(line); i <= closeIdx; i++) {
            result.push(lines[i]);
          }
        }
      }
      continue;
    }
    
    // 在接口内部，追踪括号深度
    if (inInterface) {
      result.push(line);
      braceDepth += (line.match(/{/g) || []).length;
      braceDepth -= (line.match(/}/g) || []).length;
      if (braceDepth <= 0) {
        inInterface = false;
        result.push("");  // 空行分隔
      }
    }
  }
  
  if (result.length === 0) {
    //  fallback：只保留前50行
    return lines.slice(0, 50).join("\n") + "\n... [已截断] ...";
  }
  
  return result.join("\n");
}
```

**示例效果**：

```typescript
// 原始文件（500行）
// src/types/user.ts
export interface User {
  id: string;
  name: string;
  email: string;
  // ... 更多字段
}

export function createUser(data: CreateUserInput): User {
  // 100行验证逻辑
  // 100行数据库操作
  // 100行错误处理
  // ...
}

export function updateUser(id: string, data: UpdateUserInput): User {
  // 200行实现
}

// 截断后（只保留接口+函数签名，约20行）
export interface User {
  id: string;
  name: string;
  email: string;
  // ... 更多字段
}

export function createUser(data: CreateUserInput): User;
export function updateUser(id: string, data: UpdateUserInput): User;
```

AI 只需要知道 "createUser 接收什么参数、返回什么类型"，不需要知道里面怎么查数据库。

### 8.5 预算分配优先级

```
total LLM context budget ≈ 100K - 200K tokens (Claude Sonnet)

分配：
- System Prompt:          ~1.5K  (固定)
- Knowledge Prompt:       ~4K    (已有预算)
- Diff Content:           ~variable (核心，优先保证)
- Related Files:          ~3K    (新增预算)
- User Prompt Overhead:   ~0.5K  (固定)

Diff 优先，关联文件是"锦上添花"。如果 diff 本身已经占用了大量 token，
关联文件自动降级为"只保留接口定义"甚至"完全不注入"。
```

---

## 9. 错误处理

| 场景 | 错误码 | 消息 |
|------|--------|------|
| 项目未配置路径 | 400 | Project "xxx" not configured. Add via settings or REPO_xxx env. |
| 本地路径不存在 | 400 | Repository path "/data/repos/xxx" does not exist |
| 不是git仓库 | 400 | "/data/repos/xxx" is not a git repository |
| 分支不存在 | 400 | Branch "feature/xxx" not found |
| 无变更 | 200 | No changes between branches (正常返回，report为空) |
| git命令失败 | 500 | Failed to execute git: [错误详情] |
| 关联文件读取失败 | 警告 | 跳过该关联文件，继续评审 |

---

## 10. 性能考虑

| 场景 | 策略 |
|------|------|
| 大仓库（1000+文件变更） | 限制最大变更文件数（如100个），超出时只取前100个 |
| 大diff（单文件 >500行变更） | 截断diff，只取前500行变更 |
| 关联文件过多 | Token预算控制，每变更文件最多3个关联文件 |
| git fetch 慢 | 可选参数 `skipFetch: true`，跳过fetch直接用本地分支 |
| 并发 | 串行处理，避免同时多个大仓库扫描拖垮服务器 |

---

## 11. 待确认的关键决策

### 决策 1：仓库路径映射方式

**选项 A：环境变量**（推荐，简单）
```bash
REPO_MY_PROJECT=/data/repos/my-project
REPO_ANOTHER=/data/repos/another
```

**选项 B：数据库配置表**
```sql
CREATE TABLE repo_configs (
  project TEXT PRIMARY KEY,
  local_path TEXT NOT NULL,
  default_branch TEXT DEFAULT 'main',
  enabled INTEGER DEFAULT 1,
  created_at TEXT
);
```

**选项 C：配置文件**（如 `.code-review/repos.yml`）
```yaml
repos:
  my-project: /data/repos/my-project
  another: /data/repos/another
```

### 决策 2：关联文件发现方式

**选项 A：正则提取**（推荐，轻量）
- 无新增依赖
- 覆盖 TS/JS 95%+ import 场景
- 速度快

**选项 B：ts-morph AST**
- 精确解析所有 import 形式
- 新增 `ts-morph` 依赖（~2MB）
- 能处理动态 import、type-only import 等边缘情况

### 决策 3：git diff 范围语法

**选项 A：`git diff target...source`**（推荐，即 merge-base..source）
- 只显示从分支点开始的变更
- 与 GitLab MR diff 行为一致

**选项 B：`git diff target source`**
- 显示两个分支所有差异
- 可能包含 target 上的变更（如果 target 在 source 创建后又更新了）

### 决策 4：reviewMode 的使用

现有系统定义了三种 reviewMode 但未实际使用。本地扫描中：

**选项 A：按 reviewMode 控制关联文件深度**（推荐）
- `standard` (S/A): 注入关联文件
- `diff_plus_self` (B): 只注入变更文件本身完整内容
- `diff_only` (C): 不注入关联文件

**选项 B：统一注入关联文件，忽略 reviewMode**
- 简单，但不区分风险等级

---

*架构确认后进入开发阶段。*
