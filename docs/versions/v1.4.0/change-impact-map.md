# v1.4.0 代码变更 → 功能提升 对照表

> 日期: 2026-05-10
> 目的: 精确到每个代码变更点，说明改了什么、改完能看到什么提升
> 基于对当前代码库的完整阅读

---

## 变更点 1: 新增 product_lines 表 + repo_mappings 扩展

### 改了什么

**文件**: `src/server/db.ts`

现状（第 68-73 行）:
```sql
CREATE TABLE IF NOT EXISTS repo_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project TEXT NOT NULL UNIQUE,
  local_path TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
```

改造后:
```sql
-- 新增表
CREATE TABLE product_lines (
  id TEXT PRIMARY KEY,           -- "qiqiao"
  name TEXT NOT NULL,            -- "七巧"
  description TEXT,
  config_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- repo_mappings 新增 2 列
ALTER TABLE repo_mappings ADD COLUMN product_line_id TEXT;
ALTER TABLE repo_mappings ADD COLUMN tech_stack TEXT DEFAULT 'unknown'
  CHECK(tech_stack IN ('java-backend', 'vue-frontend', 'mixed', 'unknown'));
```

**文件**: `src/server/config/repo-mapping.ts`

现状（第 20-26 行）:
```typescript
export function getRepoMapping(project: string): RepoMapping | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM repo_mappings WHERE project = ?")
    .get(project) as RepoMappingRow | undefined;
  return row ? mapRow(row) : null;
}
```
→ 只能按单个 project 查，不知道项目属于哪个产品线，不知道技术栈。

改造后新增:
```typescript
getRepoMappingsByProductLine(productLineId: string): RepoMapping[]
getRepoMappingsByTechStack(techStack: TechStack): RepoMapping[]
```

### 改完你能看到什么

**现在**:
- `/settings` 页面添加项目时，项目之间没有任何关系，23 个后端项目 + 7 个前端项目是一个平铺列表
- 评审时只能选一个项目，系统不知道这个项目属于哪个产品、什么技术栈

**改完后**:
- `/product-lines` 新页面：可以看到"七巧"产品线，展开后看到 30 个项目按技术栈分组（Java 23 个 / Vue 7 个）
- 添加新项目时自动关联到产品线，自动标记技术栈
- 在需求评审页面选"七巧"产品线 + 分支，系统自动找出所有属于七巧的项目

---

## 变更点 2: 删除硬编码 TECHSTACK_KNOWLEDGE_PROJECTS

### 改了什么

**文件**: `src/server/services/knowledge.ts`

现状（第 422-427 行）:
```typescript
const TECHSTACK_KNOWLEDGE_PROJECTS: Record<string, string[]> = {
  "java-backend": ["java-backend", "shared"],
  "vue-frontend": ["qiqiao", "qixi", "do1cloud-qiqiao-console-web", "shared"],
  "mixed": ["shared"],
  "unknown": [],
};
```

这是硬编码的映射 — "vue-frontend 技术栈只能看 qiqiao、qixi、shared 这几个项目的知识"。
如果新增一个前端项目（如 do1cloud-qiqiao-mobile-web），要改代码重新部署。

改造后:
```typescript
// 删除整个 TECHSTACK_KNOWLEDGE_PROJECTS
// 替换为基于 scope_level + product_line_id 的动态查询
function filterByScopeLevel(entries, query: KnowledgeQuery): KnowledgeEntry[] {
  // 从 DB 查 product_line 下所有项目
  // 按 scope_level (foundation/product/integration/project) 分层过滤
}
```

### 改完你能看到什么

**现在**:
- 知识库 project 字段为 "shared" 的条目对所有技术栈可见
- 知识库 project 字段为 "java-backend" 的条目只对 Java 项目可见
- 知识库 project 字段为 "qiqiao" 的条目只对 Vue 前端项目可见（因为硬编码）
- 新增一个前端项目后，它看不到 "qiqiao" 的知识，除非改代码
- **没有产品线级别的知识** — 所有产品共用同一套，七巧和企悉的知识混在一起

**改完后**:
- 知识条目有 `scope_level` 字段，显式标记这条知识属于哪一层
  - `foundation` = "SQL 必须参数化" — 所有项目共享
  - `product` = "七巧表单字段命名规范" — 七巧所有项目共享
  - `integration` = "用户列表接口返回 userId" — 七巧前后端共享
  - `project` = "bpms-runtime 的定时任务注册规则" — 只在 bpms-runtime 评审时注入
- 新项目接入后，自动继承产品线的 foundation + product + integration 三层知识，无需改代码
- 不同产品线（七巧 vs 企悉）的知识完全隔离

---

## 变更点 3: getKnowledgeForReview 签名改造

### 改了什么

**文件**: `src/server/services/knowledge.ts`

现状（第 450 行）:
```typescript
export function getKnowledgeForReview(
  project: string, module?: string, changedFiles?: string[], techStack?: TechStack
): KnowledgeEntry[]
```
→ 只能传一个 project，不知道产品线，只能隐式分层（靠 project 名字猜测）。

改造后:
```typescript
interface KnowledgeQuery {
  project: string;           // 具体项目名 (Layer 3)
  productLine?: string;      // 产品线 ID (Layer 1, 2)
  techStack?: TechStack;     // 技术栈 (Layer 0)
  module?: string;
  changedFiles?: string[];
}

export function getKnowledgeForReview(query: KnowledgeQuery): KnowledgeEntry[]
```

**调用方变化**:

**文件**: `src/server/routes/review-local.ts` 第 187 行:

现状:
```typescript
const knowledge = getKnowledgeForReview(
  project, inferredModule,
  diffs.map((d: { new_path: string }) => d.new_path), techStack
);
```

改造后:
```typescript
const knowledge = getKnowledgeForReview({
  project,
  productLine: getProductLineForProject(project),  // 从 repo_mappings 查
  techStack,
  module: inferredModule,
  changedFiles: diffs.map((d) => d.new_path),
});
```

### 改完你能看到什么

**现在**:
- 评审 bpms-runtime 时，注入的知识只有：bpms-runtime 项目级 + java-backend 技术栈级 + shared 通用级
- 评审 do1cloud-form 时，注入的知识只有：do1cloud-form 项目级 + java-backend 技术栈级 + shared 通用级
- 两个项目同属七巧产品线，但**看不到七巧的产品级知识**（因为 getKnowledgeForReview 不知道产品线）

**改完后**:
- 评审 bpms-runtime 时，注入的知识变为：
  - Layer 0 (foundation): "SQL 必须参数化" 等 Java 通用规则
  - Layer 1 (product): "七巧表单字段命名规范" 等产品级规则（**新增**）
  - Layer 2 (integration): "用户列表接口返回 userId" 等前后端契约（**新增**）
  - Layer 3 (project): "bpms-runtime 定时任务注册规则" 等项目级规则
- 同产品线的所有项目共享同一套产品级知识，不需要重复创建

---

## 变更点 4: 新增 buildMultiProjectScanContext

### 改了什么

**文件**: `src/server/services/local-scan/index.ts`

现状（第 17-89 行）: `buildLocalScanContext(repoPath, targetBranch, sourceBranch)` 只接受一个 repoPath。

改造后新增函数:
```typescript
export async function buildMultiProjectScanContext(
  projects: Array<{ project: string; repoPath: string }>,
  targetBranch: string,
  sourceBranch: string,
  options?: { maxConcurrent?: number }
): Promise<MultiProjectScanContext>
```

并发扫描多个项目（最多 3 个并行），返回每个项目的 diff、symbol、AST 结果。

### 改完你能看到什么

**现在**:
- `/local-review` 页面只能选一个项目
- 评审 7 个项目 = 手动操作 7 次，每次 3 分钟，总共 21 分钟

**改完后**:
- `/requirement-review` 页面选择产品线 + 分支
- 系统自动扫描 7 个项目的 diff（3 个并行，约 2 分钟完成全部扫描）
- 一次性看到所有项目的变更文件列表
- 可排除不需要评审的项目
- 点"开始评审"后 5-8 分钟拿到全部报告

---

## 变更点 5: 按技术栈自动分组评审

### 改了什么

新增文件: `src/server/services/techstack-grouper.ts`

```typescript
function groupByTechStack(
  scanResults: ProjectScanResult[]
): Map<TechStack, ProjectScanResult[]>
```

分组逻辑: `repo_mappings.tech_stack` 优先，`inferTechStack()` 作为 fallback。

**文件**: `src/server/llm/prompts/defaults.ts`

现状已有: `JAVA_BACKEND_DIMENSIONS`（9 个维度，第 233 行）和 Vue 维度。
改造后: 分组评审时按技术栈自动选择维度集 — Java 项目用 Java 维度集，Vue 项目用 Vue 维度集。

### 改完你能看到什么

**现在**:
- 评审 Java 项目和 Vue 项目用的是同一套维度集（除非手动配了项目级维度集）
- 前后端混在一起评审时，Vue 的 "Vuex 状态管理" 维度会出现在 Java 评审中（无意义）

**改完后**:
- 需求评审自动分组：Java 后端 7 个项目用 Java 维度集（9 维度），Vue 前端 1 个项目用 Vue 维度集（12 维度）
- 分组后的报告按技术栈分 tab 展示，每个 tab 下按项目展开
- 两组使用各自合适的评审标准，不会出现 Java 项目评 "Vuex 状态管理" 的情况

---

## 变更点 6: 需求评审 SSE 路由 + 报告合并

### 改了什么

新增文件: `src/server/routes/review-requirement.ts`

核心流程:
```
POST /api/review/requirement
  → 查产品线项目列表
  → buildMultiProjectScanContext（并发扫描）
  → groupByTechStack（分组）
  → 按组内项目独立 classify → review（共享知识缓存）
  → 合并 TechStackGroupReport + RequirementReviewReport
  → SSE 推送进度
```

**文件**: `src/shared/types.ts`

新增类型:
```typescript
interface RequirementReviewRequest {
  productLine: string;
  sourceBranch: string;
  targetBranch: string;
  excludedProjects?: string[];
  excludedFiles?: string[];
  requirement?: string;     // 需求描述（可选）
}

interface TechStackGroupReport {
  techStack: TechStack;
  projectCount: number;
  totalIssues: number;
  groupScore: number;
  projectReports: Array<{ project: string; report: ReviewReport; ... }>;
}

interface RequirementReviewReport {
  reviewId: string;
  productLine: string;
  overallScore: number;
  overallPassed: boolean;
  techStackReports: TechStackGroupReport[];
  crossStackIssues?: Array<{ description: string; severity: SeverityLevel }>;
}
```

**文件**: `src/shared/types.ts` 现有 ReviewIssue（第 57-63 行）扩展:
```typescript
export interface ReviewIssue {
  severity: SeverityLevel;
  message: string;
  file: string;
  line?: number;
  suggestion?: string;
  project?: string;               // 新增: 来自哪个项目
  crossProjectImpact?: string[];  // 新增: 影响的下游项目
}
```

### 改完你能看到什么

**现在**:
- 评审 7 个项目产生 7 份独立报告，分别在 `/reviews/R-xxxx` 页面查看
- 无法知道 bpms-component 的改动是否影响了 bpms-runtime
- 报告中问题不知道来自哪个项目（因为每次只评审一个项目）

**改完后**:
- 一次需求评审产生一份合并报告 `/reviews/R-xxxx`
- 报告按技术栈分组 tab，组内按项目 tab 展示
- 每个问题标注来自哪个项目: `file: "ServiceFacade.java", project: "bpms-component"`
- 跨技术栈问题汇总段落: "后端用户列表接口返回 userId，前端使用 id 调用"
- 一个总分: 3.8/5（各技术栈组加权平均）

---

## 变更点 7: 跨项目依赖感知

### 改了什么

新增表 `project_dependencies`:
```sql
CREATE TABLE project_dependencies (
  upstream_project TEXT NOT NULL,    -- 被依赖的（如 bpms-component）
  downstream_project TEXT NOT NULL,  -- 依赖方（如 bpms-runtime）
  dep_type TEXT DEFAULT 'compile',
  source TEXT DEFAULT 'manual'       -- manual / pom-scan
);
```

新增文件: `src/server/services/dependency-scanner.ts`
- `scanMavenDependencies(project, repoPath, knownProjects)` — 解析 pom.xml 中的 `<dependency>` 标签

评审 prompt 注入（在 review-requirement.ts 中）:
```
## 跨项目影响提示
本次评审涉及 bpms-component 的改动。以下项目依赖 bpms-component:
- bpms-runtime (compile 依赖)
- do1cloud-form (compile 依赖)

改动文件: ServiceFacade.java, DTO.java
请检查: 1. 接口签名向后兼容  2. DTO 字段只增不删  3. 是否需通知下游
```

### 改完你能看到什么

**现在**:
- 改了 bpms-component 的 ServiceFacade.java
- 评审只看 bpms-component 内部代码质量
- 不知道 bpms-runtime 依赖这个接口
- 发布后下游项目编译失败/运行报错

**改完后**:
- 产品线管理页面: 扫描 pom.xml 后显示依赖关系图
  ```
  bpms-component → bpms-runtime (compile)
  bpms-component → do1cloud-form (compile)
  bpms-component → bpms-workflow (compile)
  ```
- 评审 bpms-component 时，如果改了 ServiceFacade.java，LLM 的 prompt 中会多一段：
  "以下项目依赖此文件：bpms-runtime, do1cloud-form。请检查接口兼容性"
- 报告中问题标注: `crossProjectImpact: ["bpms-runtime", "do1cloud-form"]`
- LLM 可能产出: "ServiceFacade.login() 方法签名从 (String, String) 改为 (LoginRequest)，
  这是一个**破坏性变更**，bpms-runtime 和 do1cloud-form 需要同步更新调用方代码"

---

## 变更点 8: 合并评审知识共享缓存

### 改了什么

新增函数: `preloadSharedKnowledge(productLine, techStacks)`
新增类型: `SharedKnowledgeCache { foundation, product, integration }`

评审 7 个项目时:
- 第 1 个项目: 加载 Layer 0 + Layer 1 + Layer 2 + Layer 3 = 3600 tokens
- 第 2-7 个项目: 只加载 Layer 3 = 1500 tokens（共享部分从缓存取）

### 改完你能看到什么

**现在**:
- 7 个项目各自独立加载知识，每个项目都查询一遍 DB 获取 shared + java-backend 知识
- 重复加载了 7 次相同的基础知识

**改完后**:
- 首个项目加载后缓存共享知识
- 后续 6 个项目直接从内存取共享知识，只查询项目级知识
- 知识加载 DB 查询从 7 × 全量 降到 1 × 全量 + 6 × 项目级
- 评审速度提升（知识加载阶段从 7 次全量查询降到 6 次轻量查询）

---

## 变更点 9: 前端新增需求评审页面

### 改了什么

新增文件: `src/client/pages/RequirementReviewPage.tsx`

页面流程:
```
Step 1: 选产品线 + 填分支（sourceBranch / targetBranch）
Step 2: 预扫描 → 显示各项目 diff 统计（文件数/变更量）
        可勾选排除不需要评审的项目
Step 3: 点"开始评审" → SSE 进度展示（扫描 N 项目 / 分组 / 逐项目评审）
Step 4: 合并报告展示（按技术栈 tab → 按项目 tab → 问题列表）
```

**文件**: `src/client/App.tsx` 新增路由 `/requirement-review`
**文件**: `src/client/pages/LocalReviewPage.tsx` 添加"切换到需求评审"入口链接

### 改完你能看到什么

**现在**:
- `/local-review` 页面: 选单个项目 → 选分支 → 评审 → 看报告
- 7 个项目 = 操作 7 次，每个报告单独看

**改完后**:
- `/requirement-review` 页面: 选产品线"七巧" → 选分支 → 预览 → 评审 → 看合并报告
- `/local-review` 页面右上角多一个"需求评审"入口链接
- 需求评审报告页面: 顶部总分 + 跨技术栈问题摘要，下面按技术栈 tab 展开，每个 tab 内按项目 tab 展开

---

## 变更点 10: 数据迁移（知识库 scope_level 标注）

### 改了什么

**文件**: `src/server/db.ts` 的 migration 函数

```sql
-- knowledge_entries 新增列
ALTER TABLE knowledge_entries ADD COLUMN scope_level TEXT
  DEFAULT 'project' CHECK(scope_level IN ('foundation', 'product', 'integration', 'project'));

-- 迁移已有数据
UPDATE knowledge_entries SET scope_level = 'foundation'
  WHERE project IN ('shared', 'java-backend', 'vue-frontend');

-- project = 'qiqiao' 的条目: 需人工确认是 product 还是 integration
-- 默认标为 'product'，后续可手动改

-- 其余: scope_level = 'project'（默认值，无需额外 UPDATE）
```

### 改完你能看到什么

**现在**:
- 知识库页面 `/knowledge` 的筛选只有 project、type、status
- 不知道一条知识是属于"通用基础"还是"产品级规则"还是"项目级约束"
- shared 的 6 条知识和 java-backend 的 20 条知识，在筛选器里只是不同的 project 值

**改完后**:
- 知识库页面新增 `scope_level` 筛选:
  - 选 "foundation" → 看到 "SQL 必须参数化" 等通用基础规则
  - 选 "product" → 看到 "七巧表单字段命名规范" 等产品级规则
  - 选 "integration" → 看到 "用户列表接口返回 userId" 等前后端契约
  - 选 "project" → 看到 "bpms-runtime 定时任务注册规则" 等项目级约束
- 知识条目的详情页显示 scope_level 标签，明确标识这条知识的作用范围
- 单项目评审时，注入的知识来源可追溯（prompt 中能看到每条知识的 scope_level）

---

## 变更点 11: 前端新增产品线管理页面

### 改了什么

新增文件: `src/client/pages/ProductLineManagePage.tsx`

功能:
1. 创建/编辑产品线（ID + 名称 + 描述）
2. 查看产品线下所有项目（按技术栈分组显示）
3. 快速导入: 输入目录前缀，扫描子目录，批量创建 repo_mapping
4. 依赖关系图展示
5. 触发 pom.xml 扫描

### 改完你能看到什么

**现在**:
- `/settings` 里逐个手动输入 project + localPath 添加映射
- 23 个后端项目 + 7 个前端项目 = 手动添加 30 次
- 没有产品线概念，项目之间无关联

**改完后**:
- `/product-lines` 页面: 看到"七巧"卡片，显示 23 个 Java + 7 个 Vue
- 点击"快速导入"，输入 `/Users/tzknow/.../qiqiao/backend/`
- 系统自动扫描 23 个子目录，列出所有 Git 仓库
- 勾选后一键导入，自动创建 23 个 repo_mapping + 关联到七巧产品线 + 标记 tech_stack = java-backend
- 同样操作导入 7 个前端项目，tech_stack = vue-frontend
- 产品线详情页: 看到依赖关系图（扫描 pom.xml 后）

---

## 变更点 12 [P0]: getKnowledgeForReview 全部调用方同步改造

### 改了什么

**文件**: `src/server/services/knowledge.ts` 签名从 4 个独立参数改为 KnowledgeQuery 对象。

调用 `getKnowledgeForReview` 的**全部 5 个文件**（缺一不可）:

| 文件 | 行号 | 当前调用 | 改造后 |
|------|------|----------|--------|
| `src/server/routes/review-local.ts` | 187 | `getKnowledgeForReview(project, module, files, techStack)` | `getKnowledgeForReview({ project, productLine, techStack, module, changedFiles: files })` |
| `src/server/routes/review.ts` | 108 | `getKnowledgeForReview(project, requirement.module, undefined, techStack)` | `getKnowledgeForReview({ project, techStack, module: requirement.module })` |
| `src/server/routes/reviews.ts` | 244 | `getKnowledgeForReview(project, requirement.module, undefined, techStack)` | `getKnowledgeForReview({ project, techStack, module: requirement.module })` |
| `src/server/routes/plans.ts` | 203 | `getKnowledgeForReview(project, requirement.module, undefined, techStack)` | `getKnowledgeForReview({ project, techStack, module: requirement.module })` |
| `src/server/routes/review-diff.ts` | 52 | `getKnowledgeForReview(project, undefined, diffs, techStack)` | `getKnowledgeForReview({ project: project || "diff-upload", techStack, changedFiles: diffs })` |

**向后兼容策略**: 旧签名保留为废弃别名，内部转换为新签名，避免遗漏调用方导致运行时报错:

```typescript
/** @deprecated Use KnowledgeQuery overload */
export function getKnowledgeForReview(project: string, module?: string, changedFiles?: string[], techStack?: TechStack): KnowledgeEntry[];
export function getKnowledgeForReview(queryOrProject: KnowledgeQuery | string, module?: string, changedFiles?: string[], techStack?: TechStack): KnowledgeEntry[] {
  const query = typeof queryOrProject === 'string'
    ? { project: queryOrProject, module, changedFiles, techStack }
    : queryOrProject;
  // ... new implementation
}
```

### 改完你能看到什么

**现在**:
- 5 个文件各自用 4 参数调用，无法传入 productLine
- GitLab 评审（review.ts）、Plan 批量评审（plans.ts）、diff 上传评审（review-diff.ts）都无法使用产品线级知识

**改完后**:
- review-local.ts: 传入 productLine（从 repo_mappings.product_line_id 查）
- review.ts / reviews.ts: 传入 productLine（从 GitLab project path 推断或跳过）
- plans.ts: 传入 productLine（同 review.ts）
- review-diff.ts: 不传 productLine（纯 diff 上传无法推断，保持现状）
- 所有路径的单项目评审都能享受到产品线级知识注入

---

## 变更点 13 [P0]: review-job-store 扩展 + review_jobs 表迁移

### 改了什么

**文件**: `src/server/services/review-job-store.ts`

现状（第 4-10 行）:
```typescript
export interface CreateJobParams {
  project: string;
  sourceBranch: string;
  targetBranch: string;
  excludedFilesJson: string | null;
  createdBy: string | null;
}
```

改造后:
```typescript
export interface CreateJobParams {
  project: string;
  sourceBranch: string;
  targetBranch: string;
  excludedFilesJson: string | null;
  createdBy: string | null;
  // v1.4.0: requirement review support
  reviewType?: 'single' | 'requirement';   // default: 'single'
  productLineId?: string;
}
```

**文件**: `src/server/db.ts` review_jobs 表新增 2 列:
```sql
ALTER TABLE review_jobs ADD COLUMN review_type TEXT DEFAULT 'single'
  CHECK(review_type IN ('single', 'requirement'));
ALTER TABLE review_jobs ADD COLUMN product_line_id TEXT;
```

**文件**: `src/shared/types.ts` ReviewJob 扩展:
```typescript
export interface ReviewJob {
  // ... 现有字段
  reviewType?: 'single' | 'requirement';
  productLineId?: string;
}
```

### 改完你能看到什么

**现在**:
- review_jobs 表只有 project 字段，无法区分单项目评审和需求评审
- `/local/active` 查询活跃任务时，不知道任务是需求评审还是单项目评审
- 需求评审创建的 job 和单项目评审的 job 混在一起

**改完后**:
- 需求评审创建 job 时: `createJob({ ..., reviewType: 'requirement', productLineId: 'qiqiao' })`
- 单项目评审创建 job 时: `createJob({ ..., reviewType: 'single' })`（默认值，无需显式传）
- `/local/active` 和 `/requirement/active` 各自查自己类型的活跃任务，互不干扰
- 前端需求评审页面轮询 job 状态时，路由到正确的接口

---

## 变更点 14 [P1]: 跨技术栈问题生成逻辑

### 改了什么

新增文件: `src/server/services/cross-stack-analyzer.ts`

```typescript
interface CrossStackIssue {
  description: string;
  backendProject?: string;
  frontendProject?: string;
  severity: SeverityLevel;
}

/**
 * 比较后端和前端的评审结果，找出跨技术栈的不一致。
 * 策略:
 * 1. 扫描后端 issues 中涉及 API/DTO/Controller 的文件
 * 2. 扫描前端 issues 中涉及 API 调用的文件
 * 3. 匹配 Layer 2 (integration) 知识中的 API 契约
 * 4. 找出前后端不一致的问题
 */
function detectCrossStackIssues(
  javaReport: TechStackGroupReport,
  vueReport: TechStackGroupReport,
  integrationKnowledge: KnowledgeEntry[]
): CrossStackIssue[]
```

匹配逻辑:
1. 从后端 issues 中提取涉及 `Controller.java`、`DTO.java`、`VO.java` 的改动
2. 从前端 issues 中提取涉及 `api/`、`service/`、`store/` 的改动
3. 用 Layer 2 知识的 `pattern` 字段做交叉匹配（如 pattern = "UserController" 同时出现在后端改动和前端 issue 中）
4. 生成跨技术栈问题: "后端 getUserList 返回 {userId, name}，前端使用 {id, name}"

### 改完你能看到什么

**现在**:
- 前后端分开评审，报告中没有"跨技术栈问题"段落
- 后端改了接口，前端不知道

**改完后**:
- 合并报告中有"跨技术栈问题"段落
- 自动检测: 后端接口返回字段与前端使用字段不一致
- 自动检测: 后端新增/删除接口，前端是否同步
- 严重级别: MEDIUM 或 HIGH（取决于是否是破坏性变更）

---

## 变更点 15 [P1]: 公共 API 判定规则

### 改了什么

新增函数: `src/server/services/dependency-scanner.ts` 中:

```typescript
/**
 * 判断文件是否属于公共 API。
 * 基于路径规则 + 依赖关系综合判断。
 */
function isPublicAPI(filePath: string, project: string, dependencies: DependencyInfo[]): boolean {
  // 路径规则: 以下目录下的文件视为公共 API
  const PUBLIC_API_PATTERNS = [
    /\/controller\//i,
    /\/api\//i,
    /\/facade\//i,
    /\/dto\//i,
    /\/vo\//i,
    /\/model\//i,
    /\/service\/I[A-Z]/,   // 接口文件 (IXxxService)
  ];

  // 如果项目被其他项目依赖，且文件匹配公共 API 路径
  const hasDownstreams = dependencies.some(d => d.upstream_project === project);
  if (!hasDownstreams) return false;

  return PUBLIC_API_PATTERNS.some(p => p.test(filePath));
}
```

### 改完你能看到什么

**现在**:
- 改了 bpms-component 的任何文件，系统不知道是否影响下游

**改完后**:
- 改了 `bpms-component/src/main/java/com/.../controller/UserController.java`
  → isPublicAPI 返回 true（匹配 `/controller/`）
  → 注入依赖提示到 prompt
- 改了 `bpms-component/src/main/java/com/.../util/StringHelper.java`
  → isPublicAPI 返回 false（内部工具类，不在公共 API 路径下）
  → 不注入依赖提示（减少无用的 prompt token）

---

## 变更点 16 [P1]: git diff 并发安全性

### 改了什么

**文件**: `src/server/services/local-scan/git-diff.ts`

现状: 使用 `execSync` 执行 git 命令（阻塞进程）。

改造: 在 `buildMultiProjectScanContext` 中加锁:

```typescript
// 新增: 按 repoPath 粒度串行化 git 操作
const gitLocks = new Map<string, Promise<void>>();

async function withGitLock<T>(repoPath: string, fn: () => Promise<T>): Promise<T> {
  // 等待同一 repo 的前一个操作完成
  while (gitLocks.has(repoPath)) {
    await gitLocks.get(repoPath);
  }
  const promise = fn();
  gitLocks.set(repoPath, promise.then(() => {}, () => {}).finally(() => gitLocks.delete(repoPath)));
  return promise;
}
```

**不同 repo 之间可以并行**（git 操作在不同目录下不会冲突），**同一 repo 的 diff 操作串行化**（避免 git lock 竞争）。

### 改完你能看到什么

**现在**: 不存在并发 git 操作（单项目评审是串行的）

**改完后**:
- 7 个不同项目的 git diff 可以并行执行（3 个并发）
- 同一项目不会有两个 git diff 同时执行（避免 git index.lock 冲突）
- 某个项目 git 操作失败（如分支不存在）不阻塞其他项目

---

## 变更点 17 [P1]: extractLearnings 在合并评审模式下的 project 定位

### 改了什么

**文件**: `src/server/services/knowledge.ts` 的 `extractLearnings` 函数

现状（第 780 行）:
```typescript
export function extractLearnings(report, project: string, reviewId: string): KnowledgeEntry[]
```
→ project 参数是固定的，知识提取到对应项目下。

改造后: 合并评审时，按 issue 实际关联的项目提取知识:

```typescript
// review-requirement.ts 中
for (const projectResult of groupResults) {
  extractLearnings(
    projectResult.report,
    projectResult.project,  // 按实际项目提取，不提取到产品线级
    reviewId
  );
}
```

### 改完你能看到什么

**现在**: 单项目评审，知识提取到当前项目，没有问题

**改完后**:
- 合并评审时，bpms-runtime 的评审问题 → 提取到 bpms-runtime 项目知识（scope_level = 'project'）
- 不会错误地提取到 "qiqiao" 产品线级（避免产品线知识被 LLM 自动提取的低质量知识污染）
- 产品线级知识仍然只通过人工审核录入
