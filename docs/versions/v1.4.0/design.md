# v1.4.0 详细设计 -- 按需求评审 + 产品线 + 多工程集成

> 状态: draft
> 作者: architect agent
> 日期: 2026-05-09
> 前置: v1.3.9 (AST + knowledge UI + LLM detect)

---

## 目录

1. [议题 1: 多项目批量 diff 扫描](#议题-1-多项目批量-diff-扫描)
2. [议题 2: 产品线数据模型](#议题-2-产品线数据模型)
3. [议题 3: 知识库分层改造](#议题-3-知识库分层改造)
4. [议题 4: 跨项目依赖感知](#议题-4-跨项目依赖感知)
5. [议题 5: 评审工作流适配](#议题-5-评审工作流适配)
6. [数据模型汇总](#数据模型汇总)
7. [API 设计汇总](#api-设计汇总)
8. [文件影响范围](#文件影响范围)
9. [实施分阶段建议](#实施分阶段建议)
10. [开放问题](#开放问题)

---

## 议题 1: 多项目批量 diff 扫描

### 1.1 现状

当前 `buildLocalScanContext(repoPath, targetBranch, sourceBranch)` 只接受单个 `repoPath`。整条链路是:

```
POST /api/review/local  →  getRepoMapping(project)  →  mapping.localPath
  →  buildLocalScanContext(localPath, target, source)
  →  classify(diffs)  →  getKnowledgeForReview(project, ...)
  →  batch review  →  saveReviewRecord
```

核心约束:
- `LocalReviewRequest` 只有一个 `project` 字段
- `review_jobs` 表只有一个 `project` 字段
- `extractLocalDiff` 只对一个 repo 执行 `git diff`
- `ScanContext` 的 `diffs` 数组没有"来自哪个项目"的信息

### 1.2 方案设计

#### 核心思路: 引入"需求评审"(RequirementReview)概念

不是"多项目评审"，而是"按需求评审"。需求评审 = 一次评审任务覆盖多个项目的 diff。

#### 数据流（合并评审模式）

```
用户选择产品线 + 分支（不区分前后端）
  → 系统查询 product_line 下所有项目列表
  → 并行扫描所有项目的 diff，跳过无 diff 的项目
  → 每个 ProjectScanResult 带 project + techStack 标签
  → 按技术栈分组: java-backend 组 / vue-frontend 组 / mixed 组
  → 各技术栈组内按项目独立 classify + review（共享维度集和 Layer 0/1/2 知识）
  → 各技术栈组合并组报告
  → 所有组报告合并 → 一份产品级需求评审报告
```

**为什么按技术栈分组而不是按项目逐个？**

- 同一技术栈的项目共享同一套维度集（如 Java 后端维度集），评审标准一致
- 同一技术栈的项目共享 Layer 0（基础知识）和 Layer 2（前后端逻辑），避免重复加载
- 不同技术栈的维度集完全不同（Java 后端 9 个维度 vs Vue 前端 12 个维度），不能合并评审

**为什么组内按项目独立评审？**

- 不同项目的 diff 之间没有语义关联
- 合并后 LLM 上下文太长，准确率下降
- 按项目分组与用户"逐项目标注问题"的心智模型一致

#### 新类型定义

```typescript
// src/shared/types.ts

/** 带项目标签的 diff */
interface ProjectDiff extends GitLabDiff {
  project: string;       // 来自哪个项目
  repoPath: string;      // 原始仓库路径
}

/** 单项目的扫描结果 */
interface ProjectScanResult {
  project: string;
  repoPath: string;
  diffs: GitLabDiff[];
  changedSymbols: string[];
  relatedFiles: Array<RelatedFile & { content?: string }>;
  totalTokens: number;
  astChanges?: ASTChangeInfo[];
  techStack: TechStack;
  module?: string;
}

/** 多项目扫描汇总 */
interface MultiProjectScanContext {
  projects: ProjectScanResult[];
  totalFiles: number;
  totalTokens: number;
  projectCount: number;
}

/** 需求评审请求 (替代 LocalReviewRequest 的新模式) */
interface RequirementReviewRequest {
  productLine: string;         // 产品线 ID
  sourceBranch: string;
  targetBranch: string;
  excludedProjects?: string[];  // 排除的项目
  excludedFiles?: string[];     // 排除的文件
  requirement?: string;         // 需求描述 (可选)
  requirementId?: string;       // 需求编号 (可选)
}
```

#### buildLocalScanContext 改造

保留原函数签名不变(向后兼容)，新增多项目版本:

```typescript
// src/server/services/local-scan/index.ts

/** 原函数不变 */
export async function buildLocalScanContext(
  repoPath: string, targetBranch: string, sourceBranch: string
): Promise<ScanContext> { ... }

/** 新增: 多项目扫描 */
export async function buildMultiProjectScanContext(
  projects: Array<{ project: string; repoPath: string }>,
  targetBranch: string,
  sourceBranch: string,
  options?: { maxConcurrent?: number }
): Promise<MultiProjectScanContext> {
  const concurrency = options?.maxConcurrent ?? 3;
  const results: ProjectScanResult[] = [];

  // 并行扫描，限制并发数
  const queue = [...projects];
  const executing = new Set<Promise<void>>();

  while (queue.length > 0 || executing.size > 0) {
    while (queue.length > 0 && executing.size < concurrency) {
      const item = queue.shift()!;
      const p = buildLocalScanContext(item.repoPath, targetBranch, sourceBranch)
        .then((ctx) => {
          if (ctx.diffs.length === 0) return; // 跳过无 diff 的项目
          const techStack = inferTechStack(ctx.diffs.map(d => d.new_path));
          results.push({
            project: item.project,
            repoPath: item.repoPath,
            ...ctx,
            techStack,
            module: inferModuleFromPaths(ctx.diffs.map(d => d.new_path)),
          });
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
    totalFiles: results.reduce((sum, r) => sum + r.diffs.length, 0),
    totalTokens: results.reduce((sum, r) => sum + r.totalTokens, 0),
    projectCount: results.length,
  };
}
```

#### 技术栈分组策略

分组依据：`repo_mappings.tech_stack` 字段优先，否则按 `inferTechStack` 推断。

```typescript
function groupByTechStack(
  scanResults: ProjectScanResult[]
): Map<TechStack, ProjectScanResult[]> {
  const groups = new Map<TechStack, ProjectScanResult[]>();
  for (const result of scanResults) {
    const stack = result.techStack; // 已在扫描时推断
    const existing = groups.get(stack) ?? [];
    existing.push(result);
    groups.set(stack, existing);
  }
  return groups;
}
```

分组后的处理流程:

1. **按技术栈组内按项目独立评审**: 每个项目独立走 classify -> batch -> review
2. **共享同一个 reviewId**: 最终合并成一份产品级报告
3. **共享 Layer 0/1/2 知识**: 同一技术栈组内不重复加载基础知识和产品线知识
4. **独立维度集**: 每个技术栈组使用自己的维度集（java-backend 维度集 vs vue-frontend 维度集）
5. **token 预算**: 每个项目独立 4000 token 知识预算，共享知识只加载一次
6. **并发控制**: 同一技术栈组内最多 3 个项目并行扫描，组间串行（避免 LLM rate limit）

### 1.3 API 设计

```
POST /api/review/requirement/preview
  Body: { productLine, sourceBranch, targetBranch }
  Response: {
    projects: Array<{
      project: string;
      techStack: TechStack;
      fileCount: number;
      diffChars: number;
      diffPreview: Array<{ path: string; newFile: boolean; diffChars: number }>;
    }>;
    totalFiles: number;
    estimatedBatches: number;
    estimatedTokens: number;
  }
  说明: 预扫描，只读取 diff 统计，不执行评审。用户可基于此排除项目或文件。

POST /api/review/requirement
  Body: RequirementReviewRequest
  Response: SSE stream (同 /local 的 SSE 格式)
  Steps:
    1. "Loading product line" — 查产品线项目列表
    2. "Scanning N projects" — 并行扫描
    3. "Grouping by tech stack" — 按技术栈分组
    4. "Reviewing [java-backend] project X (1/N)" — 按技术栈组逐项目 review
    5. "COMPLETE" — 返回合并报告

GET /api/review/requirement/:jobId
  同 /local/:jobId 的轮询接口

GET /api/review/requirement/active
  同 /local/active 的活跃任务接口
```

### 1.4 风险点

| 风险 | 影响 | 缓解 |
|------|------|------|
| 7-8 个项目的评审 LLM 调用次数约 14-16 次，总 token 约 100K-130K | 低 | 成本约 0.2-0.3 元/次（DeepSeek），可控。预览阶段让用户排除不需要评审的项目 |
| 某个项目 git 操作失败（路径不存在、分支不存在）| 中 | 单项目失败不阻塞整体，报告中标记该项目为 error |
| 并行扫描磁盘 IO 打满 | 低 | 并发限制 3，可配置 |
| 评审总时间 5-8 分钟，SSE 可能超时 | 中 | 复用 job + polling 模式（已在 v1.3.8 实现） |
| 同一技术栈组内有大量 CRITICAL 问题时报告过长 | 中 | 报告支持摘要模式（只看 CRITICAL/HIGH）和完整模式切换 |

### 1.5 已解答的疑问

- **【已解答 Q1】** 通常一次需求改 **7-8 个后端项目**。预扫描检测有 diff 的项目是必须的。
- **【已解答 Q2】** 前后端**合并评审**是期望方向。系统自动按技术栈分组，用户只需选产品线 + 分支。
- **【已解答 Q3】** 报告中必须标注问题来源项目。ReviewIssue 新增 `project` 字段。

---

## 议题 2: 产品线数据模型

### 2.1 现状

当前没有"产品线"概念。`repo_mappings` 表只有 `project` + `local_path`，所有项目是扁平的。

### 2.2 方案设计

#### 新表: product_lines

```sql
CREATE TABLE IF NOT EXISTS product_lines (
  id              TEXT PRIMARY KEY,          -- e.g. "qiqiao", "qixi"
  name            TEXT NOT NULL,             -- 显示名: "七巧", "企悉"
  description     TEXT,                      -- 产品线描述
  knowledge_scope TEXT,                      -- 产品线知识查询范围 (JSON array of project names)
  default_dimension_set_id TEXT,             -- 默认维度集 ID（各技术栈可覆盖）
  config_json     TEXT,                      -- 扩展配置 (JSON)
  created_by      TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
```

#### 改造 repo_mappings 表

```sql
-- 新增 product_line_id 列 (迁移, 可空)
ALTER TABLE repo_mappings ADD COLUMN product_line_id TEXT;
ALTER TABLE repo_mappings ADD COLUMN tech_stack TEXT
  CHECK(tech_stack IN ('java-backend', 'vue-frontend', 'mixed', 'unknown'));

CREATE INDEX IF NOT EXISTS idx_repo_mappings_product_line
  ON repo_mappings(product_line_id);
```

完整 schema:

```sql
CREATE TABLE repo_mappings (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  project         TEXT NOT NULL UNIQUE,
  local_path      TEXT NOT NULL,
  product_line_id TEXT,                      -- 所属产品线
  tech_stack      TEXT DEFAULT 'unknown'     -- 技术栈
    CHECK(tech_stack IN ('java-backend', 'vue-frontend', 'mixed', 'unknown')),
  created_at      TEXT DEFAULT (datetime('now')),

  FOREIGN KEY (product_line_id) REFERENCES product_lines(id)
);
```

#### 新表: project_dependencies (议题 4 用)

```sql
CREATE TABLE IF NOT EXISTS project_dependencies (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  upstream_project   TEXT NOT NULL,          -- 被依赖的项目
  downstream_project TEXT NOT NULL,          -- 依赖方
  dep_type        TEXT NOT NULL DEFAULT 'compile'
    CHECK(dep_type IN ('compile', 'runtime', 'test', 'provided')),
  dep_details     TEXT,                      -- Maven GAV 等 (JSON)
  source          TEXT NOT NULL DEFAULT 'manual'
    CHECK(source IN ('manual', 'pom-scan', 'auto-detect')),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (upstream_project) REFERENCES repo_mappings(project),
  FOREIGN KEY (downstream_project) REFERENCES repo_mappings(project),
  UNIQUE(upstream_project, downstream_project)
);

CREATE INDEX IF NOT EXISTS idx_pd_upstream ON project_dependencies(upstream_project);
CREATE INDEX IF NOT EXISTS idx_pd_downstream ON project_dependencies(downstream_project);
```

#### 关系图

```
product_lines (1) ──→ (N) repo_mappings
                           ↑
project_dependencies       |
  .upstream_project ───────┘
  .downstream_project ─────┘

knowledge_entries.project → repo_mappings.project (逻辑外键)
```

### 2.3 产品线配置

每个产品线可配置:

| 配置项 | 存储位置 | 说明 |
|--------|----------|------|
| 包含的项目 | repo_mappings.product_line_id | 关联查询 |
| 默认维度集 | product_lines.default_dimension_set_id | 各技术栈可覆盖 |
| 知识范围 | product_lines.knowledge_scope | JSON array, 指定产品线知识查询的项目列表 |
| 扩展配置 | product_lines.config_json | 预留 |

### 2.4 产品线管理 API

```
POST   /api/product-lines              创建产品线
GET    /api/product-lines              列表
GET    /api/product-lines/:id          详情(含项目列表)
PUT    /api/product-lines/:id          更新
DELETE /api/product-lines/:id          删除(不删项目)

POST   /api/product-lines/:id/projects    添加项目到产品线
DELETE /api/product-lines/:id/projects/:project  移除项目
GET    /api/product-lines/:id/scan-stats   预览 diff 统计(不改数据)
```

### 2.5 产品线管理 UI 需要的能力

1. **创建产品线**: 填名称、描述、选择 scope
2. **项目列表管理**: 从已有 repo_mappings 中选择项目加入产品线
3. **快速导入**: 输入目录前缀(如 `/qiqiao/backend/`)，自动扫描子目录，批量创建 repo_mapping 并关联
4. **预览**: 选择分支后预览各项目 diff 统计
5. **配置**: 维度集、知识范围

### 2.6 风险点

| 风险 | 影响 | 缓解 |
|------|------|------|
| 同一个项目属于多个产品线 | 中 | 允许多对多关系，但评审时只选一个产品线。或者先做 1:N，后续扩展 M:N |
| 删除产品线时项目处理 | 低 | 只解绑不删除项目 |
| 产品线知识范围配置复杂 | 中 | 提供默认值(自动从 product_line_id 查所有项目) |

### 2.7 已解答的疑问

- **【已解答 Q4】** 七巧是一个产品，前后端都归属同一个产品线。1:N 关系（一个产品线包含多个项目）足够。不同产品线（如企悉）是独立的。
- **【已解答 Q5】** 产品线 ID 用英文 slug（如 `qiqiao`），用户填名称（如"七巧"）。

---

## 议题 3: 知识库三层结构改造

### 3.1 现状

当前 `knowledge_entries` 表有 `project` 字段，已有以下分层逻辑（在 `getKnowledgeForReview` 中）:

```
Layer 1: 通用 AP (所有 CONFIRMED CRITICAL/HIGH) — 过滤 techstack
Layer 2: 项目 AP (project = 请求的项目)
Layer 2.5: 技术栈 AP (project = "java-backend" 等)
Layer 3: 项目 CONV
Layer 3.5: 技术栈 CONV
Layer 4: 项目 EXP (最近 20 条)
Layer 4.5: 技术栈 EXP
Layer 5: 项目 BN (业务名词, 有 module 匹配)
Layer 6: RULE (BN 的子规则)
```

`TECHSTACK_KNOWLEDGE_PROJECTS` 映射:
```typescript
"java-backend": ["java-backend", "shared"],
"vue-frontend": ["qiqiao", "qixi", "do1cloud-qiqiao-console-web", "shared"],
```

**问题**: 这个映射是硬编码的，不通用。产品线概念引入后，"qiqiao"不再只是一个项目名，而是产品线标识。

### 3.2 方案设计（基于用户确认的三层结构）

#### 知识分层定义

用户明确的三层结构:

```
Layer 0: 基础知识 (foundation)
  - 与产品无关的通用规则
  - 与技术栈关联（Java 安全规范、Vue 编码规范）
  - 示例："禁止硬编码密钥"、"SQL 必须参数化"
  - 来源：项目 = "shared" 或 "java-backend"/"vue-frontend"
  - 对应 scope_level: 'foundation'

Layer 1: 产品线知识 (product)
  - 七巧的业务规则、产品名词
  - 不分前后端，是产品本身的领域知识
  - 示例："表单字段命名规范"、"工作流状态机规则"
  - 来源：project = 产品线 ID（如 "qiqiao"）
  - 对应 scope_level: 'product'

Layer 2: 产品线前后端逻辑 (integration)
  - 前后端之间的契约
  - API 接口约定、数据格式、字段映射
  - 示例："用户列表接口返回 userId 而非 id"、"日期格式统一用 yyyy-MM-dd"
  - 来源：project = 产品线 ID，额外标注 type='CONV' 或子类型
  - 对应 scope_level: 'integration'

隐含 Layer 3: 项目级知识 (project)
  - 特定项目的约束（如 do1cloud-form 的特殊配置）
  - 不是用户明确提出的层级，但作为 fallback 保留
  - 来源：project = 具体项目名
  - 对应 scope_level: 'project'
```

#### scope_level 字段设计

```sql
ALTER TABLE knowledge_entries ADD COLUMN scope_level TEXT
  CHECK(scope_level IN ('foundation', 'product', 'integration', 'project'))
  DEFAULT 'project';
```

映射关系:

| scope_level | project 字段值 | 含义 | Layer 对应 |
|---|---|---|---|
| `foundation` | `shared`, `java-backend`, `vue-frontend` | 基础知识（与产品无关，与技术栈关联） | Layer 0 |
| `product` | `qiqiao` (产品线 ID) | 产品线知识（不分前后端） | Layer 1 |
| `integration` | `qiqiao` (产品线 ID) | 产品线前后端逻辑（API 契约） | Layer 2 |
| `project` | `do1cloud-form` (项目名) | 项目特定知识 | Layer 3 |

**foundation 与原 global/techstack 的关系**: 原方案的 `global`（shared）和 `techstack`（java-backend/vue-frontend）合并为 `foundation`。它们都是"与产品无关的技术栈通用知识"，区别只是覆盖范围不同。

**product 与 integration 的区分**: 两者 project 字段值相同（都是产品线 ID），通过 `scope_level` 区分。`product` 是产品本身的领域知识，`integration` 是前后端之间的契约。

#### Layer 2 "前后端逻辑"的查询时机

前后端逻辑知识在**两个场景都注入**:

- **后端评审时注入**: 后端改动可能影响 API 契约，需要对照现有契约检查向后兼容性
- **前端评审时注入**: 前端调用方需要验证是否正确使用 API

因此 Layer 2 知识不按技术栈过滤，对同一产品线内所有技术栈的评审都注入。

查询条件:
```sql
-- Layer 2: 前后端逻辑
SELECT * FROM knowledge_entries
WHERE scope_level = 'integration'
  AND project = :productLine
  AND status = 'CONFIRMED'
```

#### 知识来源策略

| 层级 | 主要来源 | 辅助来源 | 未来增强 |
|------|----------|----------|----------|
| Layer 0 (foundation) | 人工录入 | LLM 从评审中提取 | 技术栈模板库 |
| Layer 1 (product) | 人工录入 | LLM 从评审中提取 | 产品文档解析 |
| Layer 2 (integration) | 人工录入 | — | Swagger/OpenAPI 自动导入（v1.5.0） |
| Layer 3 (project) | LLM 自动提取 | 人工录入 | — |

Layer 2 知识现阶段完全依赖人工录入。原因:
1. API 契约是精确的业务约定，LLM 难以自动提取
2. 从 Swagger/OpenAPI 自动提取需要额外开发（留到 v1.5.0）
3. 人工录入的 `source_type` 字段可扩展，预留 `swagger-import` 值

#### Token 预算分配（合并评审模式）

合并评审模式下知识注入需要特别考虑共享和独立部分:

```
单个项目的知识预算: 4000 tokens

  Layer 0 (foundation): 上限 800 tokens  — 同技术栈组内各项目共享，只加载一次
  Layer 1 (product):    上限 800 tokens  — 同产品线内所有项目共享，只加载一次
  Layer 2 (integration):上限 500 tokens  — 同产品线内所有技术栈组共享
  Layer 3 (project):    上限 1500 tokens — 每个项目独立加载
  Buffer:               约 400 tokens    — BN/RULE 按 module 动态匹配

共享知识的加载优化:
  首个项目: 加载 Layer 0 + Layer 1 + Layer 2 + Layer 3 = 3600 tokens
  后续项目: 只加载 Layer 3 = 1500 tokens（共享部分缓存复用）
```

#### 改造 getKnowledgeForReview

函数签名变化:

```typescript
// 旧:
function getKnowledgeForReview(
  project: string,
  module?: string,
  changedFiles?: string[],
  techStack?: TechStack
): KnowledgeEntry[]

// 新:
interface KnowledgeQuery {
  project: string;           // 具体项目 (Layer 3)
  productLine?: string;      // 产品线 ID (Layer 1, 2)
  techStack?: TechStack;     // 技术栈 (Layer 0)
  module?: string;
  changedFiles?: string[];
}

function getKnowledgeForReview(query: KnowledgeQuery): KnowledgeEntry[]
```

分层查询逻辑:

```
Layer 0 (foundation): scope_level = 'foundation' AND status = 'CONFIRMED'
  AND (project = 'shared' OR project = :techStack)
  → 基础知识（技术栈通用规则）

Layer 1 (product): scope_level = 'product' AND project = :productLine AND status = 'CONFIRMED'
  → 产品线知识（业务规则、产品名词）

Layer 2 (integration): scope_level = 'integration' AND project = :productLine AND status = 'CONFIRMED'
  → 前后端逻辑（API 契约、字段映射）

Layer 3 (project): scope_level = 'project' AND project = :project AND status = 'CONFIRMED'
  → 项目级知识（项目特定约束）

BN/RULE: 按 module 匹配 (产品线级 + 项目级)

排序: 先按 relevance score，同分时 Layer 0 > Layer 1 > Layer 2 > Layer 3
Token 预算: 见上方分配策略
```

#### 合并评审的知识共享优化

```typescript
// 新增: 批量预加载共享知识
interface SharedKnowledgeCache {
  foundation: KnowledgeEntry[];     // Layer 0, 按 techStack 缓存
  product: KnowledgeEntry[];        // Layer 1, 按 productLine 缓存
  integration: KnowledgeEntry[];    // Layer 2, 按 productLine 缓存
}

function preloadSharedKnowledge(
  productLine: string,
  techStacks: TechStack[]
): SharedKnowledgeCache

// 各项目评审时只需加载项目级知识 + 从缓存取共享知识
function getProjectKnowledge(
  query: KnowledgeQuery,
  cache: SharedKnowledgeCache
): KnowledgeEntry[]
```

#### 兼容性迁移

已有 `knowledge_entries` 数据迁移:

```sql
-- 已有 project = "shared" 的记录 → scope_level = 'foundation'
UPDATE knowledge_entries SET scope_level = 'foundation'
  WHERE project = 'shared' AND scope_level IS NULL;

-- 已有 project = "java-backend" 等技术栈标识 → scope_level = 'foundation'
UPDATE knowledge_entries SET scope_level = 'foundation'
  WHERE project IN ('java-backend', 'vue-frontend') AND scope_level IS NULL;

-- 如果 product_lines 表中存在 id = project 的记录 → scope_level = 'product'
-- 需要通过脚本判断哪些是产品线知识 vs 项目级知识
-- 提供预览迁移结果功能，用户确认后执行

-- 其余 → scope_level = 'project'
UPDATE knowledge_entries SET scope_level = 'project'
  WHERE scope_level IS NULL;
```

#### 去重策略

同一条知识可能在多个层级存在（如产品线级和项目级有相似的 AP）。去重规则:

1. 按 `fingerprint` 去重（已有机制）
2. 高层级优先: 如果 `foundation` 和 `project` 层有同 fingerprint，只保留 `foundation` 的
3. 优先级: `foundation` > `product` > `integration` > `project`

#### 删除硬编码的 TECHSTACK_KNOWLEDGE_PROJECTS

改为从 `product_lines` 表和 `repo_mappings` 表动态查询:

```
已知 productLine = "qiqiao", techStack = "java-backend"
→ 查询 scope_level IN ('foundation', 'product', 'integration', 'project')
  AND (
    (scope_level = 'foundation' AND project IN ('shared', 'java-backend'))
    OR (scope_level = 'product' AND project = 'qiqiao')
    OR (scope_level = 'integration' AND project = 'qiqiao')
    OR (scope_level = 'project' AND project = 'do1cloud-form')
  )
```

### 3.3 风险点

| 风险 | 影响 | 缓解 |
|------|------|------|
| 迁移脚本误判 project 归属层级 | 中 | 提供预览迁移结果功能，用户确认后执行 |
| scope_level 与 project 字段语义重叠 | 低 | scope_level 是显式标注，project 是查询键，二者配合使用 |
| 产品线级知识不够用时需要降级到基础级 | 低 | query 层可以 fallback，在 getKnowledgeForReview 内部处理 |
| Layer 2 (integration) 知识人工录入成本高 | 中 | v1.4.0 先手工录入高频规则，v1.5.0 支持 Swagger 自动导入 |

### 3.4 已解答的疑问

- **【已解答 Q6】** 已有 `knowledge_entries` 中 `project = "qiqiao"` 的记录：如果 product_lines 表中存在 `id = "qiqiao"` 则按 scope_level 分类（`product` 或 `integration`），否则视为项目级知识。
- **【已解答 Q7】** 产品线知识需要审核流程。影响范围更大，更需要审核。
- **【已解答 Q8】** 知识导入/导出不在 v1.4.0 实现，放到 v1.5.0。

---

## 议题 4: 跨项目依赖感知

### 4.1 现状

当前没有项目间依赖关系的表达。所有项目独立评审。

### 4.2 方案设计

#### 依赖关系来源（优先级）

1. **手动配置**: 管理员在产品线管理页面手动添加依赖关系
2. **Maven pom.xml 扫描**: 解析 pom.xml 中的 `<dependency>` 标签，匹配本地项目
3. **npm/pnpm workspace**: 解析 package.json 中的 dependencies

v1.4.0 只做手动配置 + Maven pom.xml 扫描。npm 扫描和自动检测留给后续版本。

#### 依赖关系表

已在议题 2 中定义 `project_dependencies` 表:

```sql
project_dependencies (
  upstream_project,      -- 被依赖的项目 (如 bpms-component)
  downstream_project,    -- 依赖方 (如 bpms-runtime)
  dep_type,              -- compile / runtime / test / provided
  dep_details,           -- JSON: { groupId, artifactId, version }
  source                 -- manual / pom-scan / auto-detect
)
```

#### Maven pom.xml 扫描器

新增服务文件: `src/server/services/dependency-scanner.ts`

```typescript
interface DependencyScanResult {
  project: string;
  dependencies: Array<{
    groupId: string;
    artifactId: string;
    version?: string;
    scope: string;           // compile, runtime, test, provided
    resolvedProject?: string; // 匹配到的本地项目名
  }>;
}

async function scanMavenDependencies(
  project: string,
  repoPath: string,
  knownProjects: string[]  // 产品线内的所有项目名
): Promise<DependencyScanResult>
```

匹配逻辑:
- 解析 pom.xml 中的 `<dependency>` 条目
- 用 `artifactId` 与产品线内项目名匹配
  - 例如 `artifactId = "bpms-component"` 匹配项目 `bpms-component`
- 记录匹配结果到 `project_dependencies` 表

#### 评审时的依赖感知

当评审发现某项目改动了被其他项目依赖的接口时:

1. **标记改动文件**: 在分类阶段，检查改动文件是否属于被依赖项目的公共 API
2. **生成提示**: 在评审 prompt 中注入依赖信息

```typescript
// 在 classify 或 review 阶段检查
function getAffectedDownstreams(
  project: string,
  changedFiles: string[],
  db: Database
): Array<{
  downstream: string;
  reason: string;   // "改动影响 bpms-component 的公共 API"
  affectedFiles: string[];
}>
```

3. **在 prompt 中注入**:

```
## 跨项目影响提示
本次评审涉及 bpms-component 的改动。以下项目依赖 bpms-component:
- bpms-runtime (compile 依赖)
- do1cloud-form (compile 依赖)

改动文件: ServiceFacade.java, DTO.java
这些文件被下游项目引用。请检查:
1. 接口签名是否向后兼容
2. DTO 字段是否只增不删
3. 是否需要通知下游项目开发者
```

4. **在报告中标注**: ReviewIssue 中增加 `crossProjectImpact` 字段

```typescript
interface ReviewIssue {
  severity: SeverityLevel;
  message: string;
  file: string;
  line?: number;
  suggestion?: string;
  project?: string;               // 新增: 来自哪个项目
  crossProjectImpact?: string[];  // 新增: 影响的下游项目列表
}
```

### 4.3 触发时机

不是每次评审都扫描 pom.xml。策略:

1. **产品线配置时**: 管理员触发一次扫描，结果存入 DB
2. **日常评审时**: 从 DB 读取依赖关系，不再扫描文件系统
3. **依赖更新时**: 手动触发重新扫描

### 4.4 API 设计

```
POST /api/product-lines/:id/scan-dependencies
  触发产品线内所有项目的 pom.xml 依赖扫描
  Body: { source: "pom-scan" | "manual" }

GET /api/product-lines/:id/dependencies
  返回依赖关系图

POST /api/product-lines/:id/dependencies
  手动添加依赖关系
  Body: { upstreamProject, downstreamProject, depType }

DELETE /api/product-lines/:id/dependencies/:depId
  删除依赖关系
```

### 4.5 风险点

| 风险 | 影响 | 缓解 |
|------|------|------|
| pom.xml 解析不完整（多模块、BOM 继承） | 中 | v1.4.0 只支持简单匹配，复杂场景手动配置 |
| 依赖提示增加 prompt token 成本 | 低 | 控制在 200 tokens 以内，只在检测到 API 改动时注入 |
| 误报依赖关系 | 低 | 依赖关系需要确认，pom-scan 结果标记为 `source = 'pom-scan'` |

### 4.6 已解答的疑问

- **【已解答 Q9】** v1.4.0 只做依赖提示，不自动检测下游项目 diff。
- **【已解答 Q10】** v1.4.0 只支持项目级别的扁平依赖，不处理 parent/BOM 继承。

---

## 议题 5: 评审工作流适配

### 5.1 现状

当前评审工作流:
```
用户选择项目 + 分支 → 扫描 → 分类 → 加载知识 → 分批 LLM review → 出报告
```

实际后端负责人的评审工作流:
```
1. 看需求文档，了解改了什么
2. 看全量 diff（跨 5-6 个后端项目）
3. 逐文件标注问题
4. 汇总反馈给开发者
```

### 5.2 方案设计

#### 新增"需求评审"页面

路由: `/requirement-review`

页面结构:

```
┌────────────────────────────────────────────────────┐
│ 需求评审: [需求标题]                                │
│ 产品线: 七巧 | 分支: feature/xxx → main             │
├────────────────────────────────────────────────────┤
│ Step 1: 需求上下文 (可选)                            │
│ ┌────────────────────────────────────────────────┐ │
│ │ 需求描述: [文本框，输入需求背景]                  │ │
│ │ 需求编号: [输入框]                               │ │
│ └────────────────────────────────────────────────┘ │
├────────────────────────────────────────────────────┤
│ Step 2: Diff 预览                                   │
│ ┌────────────────────────────────────────────────┐ │
│ │ 项目         | 文件数 | 新增 | 修改 | 删除       │ │
│ │ bpms-runtime |   12   |  3   |  8   |  1       │ │
│ │ do1cloud-form|    5   |  1   |  4   |  0       │ │
│ │ bpms-component|   3   |  0   |  3   |  0       │ │
│ │ [展开各项目文件列表]                             │ │
│ │ [排除不需要评审的项目/文件]                      │ │
│ └────────────────────────────────────────────────┘ │
│ [开始评审]                                          │
├────────────────────────────────────────────────────┤
│ Step 3: 评审进度                                    │
│ 项目 1/3: bpms-runtime - 扫描完成, 评审中...         │
│ 项目 2/3: do1cloud-form - 等待中                     │
│ 项目 3/3: bpms-component - 等待中                    │
├────────────────────────────────────────────────────┤
│ Step 4: 评审报告                                    │
│ [按项目分 tab 展示]                                  │
│ Tab: bpms-runtime | do1cloud-form | bpms-component  │
│ ┌────────────────────────────────────────────────┐ │
│ │ 综合评分: 3.8/5 | 问题数: 7 | Critical: 1       │ │
│ │                                                │ │
│ │ 跨项目影响: bpms-component 改动影响 2 个下游项目 │ │
│ │                                                │ │
│ │ [bpms-runtime tab 内容]                         │ │
│ │ 评分 / Issues / Diff 标注                       │ │
│ └────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────┘
```

#### 评审报告合并策略

一次需求评审产出一份产品级报告，按技术栈分组、按项目展开:

```typescript
/** 技术栈组的评审报告 */
interface TechStackGroupReport {
  techStack: TechStack;
  dimensionSetName: string;        // "Java 后端维度集"
  projectCount: number;
  totalFiles: number;
  totalIssues: number;
  criticalCount: number;
  groupScore: number;              // 组内各项目加权平均
  groupPassed: boolean;

  // 组内各项目的子报告
  projectReports: Array<{
    project: string;
    report: ReviewReport;          // 复用现有 ReviewReport
    classification: ClassificationSummary;
    crossProjectImpacts?: string[];
    error?: string;                // 项目扫描失败信息
  }>;
}

/** 需求评审报告（产品级） */
interface RequirementReviewReport {
  reviewId: string;
  productLine: string;
  sourceBranch: string;
  targetBranch: string;
  requirement?: string;            // 需求描述
  requirementId?: string;          // 需求编号

  // 整体统计
  totalProjects: number;
  totalFiles: number;
  totalIssues: number;
  criticalCount: number;
  overallPassed: boolean;
  overallScore: number;            // 各技术栈组加权平均

  // 按技术栈分组的子报告
  techStackReports: TechStackGroupReport[];

  // 跨技术栈问题汇总（如前后端 API 不一致）
  crossStackIssues?: Array<{
    description: string;
    backendProject?: string;
    frontendProject?: string;
    severity: SeverityLevel;
  }>;
}
```

**评分聚合规则:**

1. 项目级评分: 直接取 ReviewReport 的加权平均分
2. 技术栈组评分: 组内各项目评分按文件数量加权平均
3. 产品级评分: 各技术栈组评分按项目数量加权平均
4. 通过/不通过: 所有项目都通过才通过（任一项目有 CRITICAL 即不通过）

#### DB 存储

一次需求评审存一条 `reviews` 记录:

```
reviews.project = product_line_id (e.g. "qiqiao")
reviews.mr_url = "requirement://{productLine}/{sourceBranch}..{targetBranch}"
reviews.report_json = JSON.stringify(RequirementReviewReport)
reviews.mr_meta_json = JSON.stringify({
  type: "requirement",
  productLine: "qiqiao",
  techStackGroups: {
    "java-backend": ["bpms-runtime", "do1cloud-form", "bpms-component"],
    "vue-frontend": ["do1cloud-qiqiao-console-web"],
  },
  sourceBranch, targetBranch,
})
```

各项目的详细报告存在 `report_json` 的 `techStackReports[].projectReports` 数组中。

#### review_jobs 表扩展

```sql
ALTER TABLE review_jobs ADD COLUMN review_type TEXT
  DEFAULT 'single'
  CHECK(review_type IN ('single', 'requirement'));

ALTER TABLE review_jobs ADD COLUMN product_line_id TEXT;
```

### 5.3 前端改造清单

| 文件 | 改动 |
|------|------|
| `src/client/App.tsx` | 新增 `/requirement-review` 路由 |
| `src/client/pages/RequirementReviewPage.tsx` | 新建: 需求评审页面 |
| `src/client/pages/LocalReviewPage.tsx` | 添加"切换到需求评审"入口 |
| `src/client/components/ReviewResult.tsx` | 支持多项目 tab 展示 |
| `src/client/components/ProductLineSelector.tsx` | 新建: 产品线选择器 |
| `src/client/components/ProjectDiffSummary.tsx` | 新建: 多项目 diff 预览 |
| `src/client/pages/ProductLineManagePage.tsx` | 新建: 产品线管理页面 |

### 5.4 风险点

| 风险 | 影响 | 缓解 |
|------|------|------|
| 需求评审报告太大，JSON 存储性能 | 中 | SQLite 单字段最大 1GB，实际报告 < 1MB |
| 前端 tab 切换时大量 diff 渲染卡顿 | 中 | 懒加载，只在切换 tab 时加载该项目 diff |
| 用户体验复杂度增加 | 高 | 提供向导模式，引导用户完成全流程 |

### 5.5 已解答的疑问

- **【已解答 Q11】** 报告导出功能不在 v1.4.0 做，放到 v1.5.0。
- **【已解答 Q12】** v1.4.0 只看报告，不通知开发者。通知机制放到 v1.7.0。
- **【已解答 Q13】** 需求上下文字段可选。不填则只基于 diff 做评审。

---

## 数据模型汇总

### 新增表

```sql
-- 1. 产品线
CREATE TABLE product_lines (
  id                      TEXT PRIMARY KEY,
  name                    TEXT NOT NULL,
  description             TEXT,
  knowledge_scope         TEXT,           -- JSON array
  default_dimension_set_id TEXT,
  config_json             TEXT,
  created_by              TEXT,
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 2. 项目依赖
CREATE TABLE project_dependencies (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  upstream_project        TEXT NOT NULL,
  downstream_project      TEXT NOT NULL,
  dep_type                TEXT NOT NULL DEFAULT 'compile'
    CHECK(dep_type IN ('compile', 'runtime', 'test', 'provided')),
  dep_details             TEXT,           -- JSON
  source                  TEXT NOT NULL DEFAULT 'manual'
    CHECK(source IN ('manual', 'pom-scan', 'auto-detect')),
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at              TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (upstream_project) REFERENCES repo_mappings(project),
  FOREIGN KEY (downstream_project) REFERENCES repo_mappings(project),
  UNIQUE(upstream_project, downstream_project)
);
```

### 修改表

```sql
-- repo_mappings: 新增列
ALTER TABLE repo_mappings ADD COLUMN product_line_id TEXT;
ALTER TABLE repo_mappings ADD COLUMN tech_stack TEXT
  DEFAULT 'unknown' CHECK(tech_stack IN ('java-backend', 'vue-frontend', 'mixed', 'unknown'));
CREATE INDEX idx_repo_mappings_product_line ON repo_mappings(product_line_id);

-- knowledge_entries: 新增列
ALTER TABLE knowledge_entries ADD COLUMN scope_level TEXT
  DEFAULT 'project' CHECK(scope_level IN ('foundation', 'product', 'integration', 'project'));
CREATE INDEX idx_ke_scope_level ON knowledge_entries(scope_level);

-- review_jobs: 新增列
ALTER TABLE review_jobs ADD COLUMN review_type TEXT
  DEFAULT 'single' CHECK(review_type IN ('single', 'requirement'));
ALTER TABLE review_jobs ADD COLUMN product_line_id TEXT;
```

---

## API 设计汇总

### 产品线管理

| Method | Path | 说明 |
|--------|------|------|
| POST | `/api/product-lines` | 创建产品线 |
| GET | `/api/product-lines` | 列表 |
| GET | `/api/product-lines/:id` | 详情(含项目列表和依赖图) |
| PUT | `/api/product-lines/:id` | 更新 |
| DELETE | `/api/product-lines/:id` | 删除 |
| POST | `/api/product-lines/:id/projects` | 添加项目 |
| DELETE | `/api/product-lines/:id/projects/:project` | 移除项目 |
| GET | `/api/product-lines/:id/scan-stats` | 预览 diff 统计 |
| POST | `/api/product-lines/:id/scan-dependencies` | 扫描 pom.xml 依赖 |
| GET | `/api/product-lines/:id/dependencies` | 获取依赖关系图 |
| POST | `/api/product-lines/:id/dependencies` | 手动添加依赖 |
| DELETE | `/api/product-lines/:id/dependencies/:depId` | 删除依赖 |

### 需求评审

| Method | Path | 说明 |
|--------|------|------|
| POST | `/api/review/requirement` | 发起需求评审 (SSE) |
| GET | `/api/review/requirement/:jobId` | 轮询任务状态 |
| GET | `/api/review/requirement/active` | 查询活跃任务 |
| POST | `/api/review/requirement/preview` | 预览多项目 diff 统计 |

### 现有 API 影响

| API | 改动 |
|-----|------|
| `POST /api/review/local` | 不变，保持单项目评审 |
| `GET /api/reviews/:id` | 需要支持渲染需求评审报告格式 |
| `GET /api/review/local/active` | 需要同时检查 requirement 类型的活跃任务 |

---

## 文件影响范围

### 新增文件

| 文件 | 说明 |
|------|------|
| `src/server/services/dependency-scanner.ts` | Maven 依赖扫描器 |
| `src/server/services/techstack-grouper.ts` | 按技术栈分组项目 |
| `src/server/services/product-line.ts` | 产品线 CRUD 服务 |
| `src/server/routes/product-lines.ts` | 产品线 API 路由 |
| `src/server/routes/review-requirement.ts` | 需求评审 SSE 路由 |
| `src/client/pages/RequirementReviewPage.tsx` | 需求评审页面 |
| `src/client/pages/ProductLineManagePage.tsx` | 产品线管理页面 |
| `src/client/components/ProductLineSelector.tsx` | 产品线选择器组件 |
| `src/client/components/ProjectDiffSummary.tsx` | 多项目 diff 预览组件 |

### 修改文件

| 文件 | 改动范围 |
|------|----------|
| `src/shared/types.ts` | 新增 RequirementReviewRequest, RequirementReviewReport, TechStackGroupReport, ProjectDiff, ProjectScanResult, MultiProjectScanContext, KnowledgeQuery, SharedKnowledgeCache 等类型; ReviewIssue 增加 project, crossProjectImpact 字段 |
| `src/server/db.ts` | 新增 product_lines, project_dependencies 表; 迁移 repo_mappings, knowledge_entries, review_jobs 表 |
| `src/server/index.ts` | 注册 product-lines 和 review-requirement 路由 |
| `src/server/services/local-scan/index.ts` | 新增 buildMultiProjectScanContext 函数 |
| `src/server/services/knowledge.ts` | 改造 getKnowledgeForReview 签名为 KnowledgeQuery; 新增 preloadSharedKnowledge, getProjectKnowledge; 按 foundation/product/integration/project 四层查询; 删除硬编码 TECHSTACK_KNOWLEDGE_PROJECTS |
| `src/server/services/review-job-store.ts` | CreateJobParams 新增 reviewType, productLineId 字段 |
| `src/server/config/repo-mapping.ts` | 新增 product_line_id, tech_stack 字段映射; 按 product_line 查询 |
| `src/client/App.tsx` | 新增 /requirement-review 和 /product-lines 路由 |
| `src/client/pages/LocalReviewPage.tsx` | 添加"切换到需求评审"链接 |
| `src/client/components/ReviewResult.tsx` | 支持需求评审报告渲染（多项目 tab） |
| `docs/versions/v1.4.0/README.md` | 更新规划 |

---

## 实施分阶段建议

### Phase 1: 数据模型 + 产品线基础（预计 2 天）

1. 创建 product_lines 表, project_dependencies 表
2. 迁移 repo_mappings 增加 product_line_id, tech_stack
3. 产品线 CRUD 服务 + API
4. 产品线管理页面(基础版: 创建/编辑/添加项目)
5. 快速导入: 输入目录前缀批量创建 repo_mapping

### Phase 2: 知识库分层改造（预计 2 天）

1. knowledge_entries 增加 scope_level (foundation/product/integration/project)
2. 数据迁移: 标注已有知识的 scope_level
3. 改造 getKnowledgeForReview 为 KnowledgeQuery 接口
4. 新增 preloadSharedKnowledge 共享知识缓存
5. 删除硬编码 TECHSTACK_KNOWLEDGE_PROJECTS
6. 验证: 确保单项目评审的知识注入不受影响

### Phase 3: 多项目扫描 + 合并评审（预计 3 天）

1. buildMultiProjectScanContext 实现
2. techstack-grouper: 按技术栈分组项目
3. RequirementReviewRequest 接口 + review_jobs 扩展
4. review-requirement 路由 (SSE + job tracking)
5. preview 预扫描端点
6. 需求评审页面（按技术栈分组 tab + 项目 tab）
7. 报告合并（TechStackGroupReport + RequirementReviewReport）

### Phase 4: 跨项目依赖感知（预计 1.5 天）

1. project_dependencies CRUD
2. Maven pom.xml 扫描器
3. 评审时依赖提示注入
4. 依赖管理 UI

### Phase 5: 集成测试 + 验收（预计 1.5 天）

1. 七巧后端 23 项目批量 diff 验证
2. 知识分层注入验证
3. 依赖感知验证
4. 报告合并验证
5. 性能测试: 30 项目全量 diff 的响应时间

---

## 开放问题汇总

### 已解答（第二轮讨论）

| 编号 | 问题 | 结论 |
|------|------|------|
| Q1 | 通常一次需求改几个后端项目？ | **7-8 个项目**。预扫描检测有 diff 的项目是必须的 |
| Q2 | 前后端分开评审还是合并评审？ | **合并评审**。系统自动按技术栈分组评审，最终合并为产品级报告 |
| Q3 | 报告中是否需要标注问题来源项目？ | **需要**。ReviewIssue 新增 `project` 字段 |
| Q4 | 同一个前端项目是否属于多个产品线？ | **1:N 关系**。七巧是一个产品，前后端都归属同一个产品线 |
| Q5 | 产品线 ID 手动填还是自动生成？ | **手动填英文 slug**（如 `qiqiao`） |
| Q6 | 已有 project="qiqiao" 的知识怎么归属？ | 按 product_lines 表匹配，分 scope_level = 'product' 或 'integration' |
| Q7 | 产品线知识是否需要审核流程？ | **需要** |
| Q8 | 知识导入导出是否做？ | **不做**，放 v1.5.0 |
| Q9 | 是否自动检测下游项目 diff？ | **不做**，v1.4.0 只做提示 |
| Q10 | Maven 多模块/BOM 继承是否支持？ | **不支持**，手动配置补充 |
| Q11 | 报告导出功能是否做？ | **不做**，放 v1.5.0 |
| Q12 | 是否需要在系统中通知开发者？ | **不做**，放 v1.7.0 |
| Q13 | 需求上下文字段是否必须？ | **可选** |

### 仍待讨论

| 编号 | 问题 | 影响范围 | 备注 |
|------|------|----------|------|
| Q14 | 多产品线评审数据隔离：不同产品线的评审记录是否需要过滤？ | reviews 列表、知识库管理 | 可通过 product_line_id 过滤，但需要 UI 支持 |
| Q15 | 报告摘要模式 vs 完整模式：是否需要在 UI 上切换？ | 报告展示 | 7-8 个项目的完整报告可能很长 |
| Q16 | 项目级技术栈元数据 vs 文件推断：repo_mappings.tech_stack 是否优先于 inferTechStack？ | 分组准确性 | 建议 repo_mappings.tech_stack 优先，文件推断作为 fallback |
| Q17 | 合并评审模式下知识学习（extractLearnings）的目标 project 怎么设？ | 知识提取 | 建议按实际改动项目提取，不提取到产品线级 |

---

## 设计原则确认

本方案遵循以下原则:

1. **向后兼容**: 单项目评审流程(`POST /api/review/local`)完全不变
2. **渐进增强**: 新增"需求评审"模式，与现有模式并行存在
3. **产品线作为组织单元**: 项目归组到产品线，知识按产品线分层
4. **知识分层显式化**: scope_level 字段替代隐式的 project 命名约定
5. **依赖感知是提示而非阻断**: 依赖信息注入 prompt，不阻止评审执行
6. **SQLite 单库**: 所有新表在现有 knowledge.db 中，不引入新数据源
7. **合并评审**: 用户选产品线 + 分支，系统自动扫描全部项目、按技术栈分组、独立评审、合并报告

---

## 第二轮讨论记录

> 日期: 2026-05-09
> 基于: 用户对第一轮设计方案的反馈确认

### 用户确认的关键信息

1. **一个需求通常改 7-8 个后端项目**（不是 3-5 个，也不是 30 个全改）
2. **前后端合并评审是期望的方向** -- 系统应该支持按技术栈自动分组评审，最终合并成一份产品级报告
3. **七巧是一个产品** -- 不管前后端，所有工程归属同一个产品线
4. **知识库要分三个维度**: 基础知识（与产品无关）、产品线知识（不分前后端）、产品线前后端逻辑（API 契约）

### 议题 A: 合并评审模式

**决策变更**:
- RequirementReviewRequest 移除 `scope` 字段，不再需要用户区分前后端
- 新增技术栈分组环节：扫描完成后按 `techStack` 自动分组
- 报告结构从按项目列表改为按技术栈分组：`techStackReports[]` > `projectReports[]`
- 新增 `TechStackGroupReport` 类型
- 新增 `crossStackIssues` 字段，用于标注跨技术栈问题（如前后端 API 不一致）

**评审效率分析**:
- 7-8 个项目，每个约 2 个 batch，共 14-16 次 LLM 调用
- 总 token 约 100K-130K，成本约 0.2-0.3 元/次（DeepSeek）
- 总评审时间约 5-8 分钟
- 并发控制：组内最多 3 个项目并行，组间串行

**新增 API**: `POST /api/review/requirement/preview` -- 预扫描各项目 diff 统计，让用户排除不需要评审的项目

### 议题 B: 知识库三层结构

**决策变更**:
- scope_level 值从 `global/techstack/product_line/project` 改为 `foundation/product/integration/project`
- Layer 0 (foundation) 合并了原方案的 global 和 techstack，统一为"基础知识"
- Layer 1 (product) 对应产品线知识（不分前后端）
- Layer 2 (integration) 新增，专门存储前后端逻辑和 API 契约
- Layer 3 (project) 保留为 fallback，用于项目特定知识

**Layer 2 查询时机**: 前端和后端评审时都注入。因为后端需要检查 API 向后兼容性，前端需要验证 API 使用正确性。

**知识来源**: v1.4.0 完全依赖人工录入。从 Swagger/OpenAPI 自动导入预留到 v1.5.0。

**Token 预算分配**:
- foundation: 800 tokens（共享）
- product: 800 tokens（共享）
- integration: 500 tokens（共享）
- project: 1500 tokens（独立）
- 总计每个项目约 3600 tokens，共享部分只加载一次

**新增优化**: `preloadSharedKnowledge` 和 `SharedKnowledgeCache`，避免合并评审模式下重复加载共享知识。

### 议题 C: 遗漏项补充

**1. 评审效率与成本**:
- 已分析 7-8 个项目的 LLM 调用成本，结论可控
- 预扫描功能对成本控制至关重要

**2. 产品线数据隔离**:
- 评审记录可通过 product_line_id 过滤
- 知识库管理需支持按产品线查看
- 列入待讨论问题 Q14

**3. 报告展示优化**:
- 7-8 个项目的报告可能很长
- 建议支持摘要模式（只看 CRITICAL/HIGH）和完整模式切换
- 列入待讨论问题 Q15

**4. 技术栈元数据优先级**:
- `repo_mappings.tech_stack` 应优先于文件推断
- 列入待讨论问题 Q16

**5. 合并评审的知识学习**:
- extractLearnings 应按实际改动项目提取，不提取到产品线级
- 列入待讨论问题 Q17

### 对 design.md 的修改清单

| 位置 | 修改内容 |
|------|----------|
| 议题 1 数据流 | 改为合并评审模式：按技术栈分组 |
| 议题 1 diff 合并策略 | 重写为技术栈分组策略 |
| 议题 1 API 设计 | 新增 preview 端点，调整 SSE 步骤 |
| 议题 1 风险点 | 更新成本估算和新增风险项 |
| 议题 1 疑问 | 标记 Q1/Q2/Q3 已解答 |
| 议题 2 product_lines 表 | 移除 scope 字段 |
| 议题 2 配置表 | 移除 scope 相关行 |
| 议题 2 疑问 | 标记 Q4/Q5 已解答 |
| 议题 3 | 完全重写为三层结构 + 四层实现 |
| 议题 3 疑问 | 标记 Q6/Q7/Q8 已解答 |
| 议题 4 疑问 | 标记 Q9/Q10 已解答 |
| 议题 5 报告结构 | 重写为 TechStackGroupReport + RequirementReviewReport |
| 议题 5 DB 存储 | 更新 mr_url 和 mr_meta_json 格式 |
| 议题 5 疑问 | 标记 Q11/Q12/Q13 已解答 |
| 数据模型汇总 | 更新 product_lines 表和 scope_level 值 |
| 文件影响范围 | 新增 techstack-grouper.ts, 更新 types 和 knowledge 描述 |
| 开放问题 | 全部标记已解答，新增 Q14-Q17 |
| 设计原则 | 新增第 7 条"合并评审" |
| 新增 | 第二轮讨论记录章节（本节） |

---

*第二轮讨论更新于: 2026-05-09*
