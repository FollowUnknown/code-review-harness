# Sprint Contract: V2 平台化升级

> 创建时间: 2026-04-23
> 状态: in-progress (Phase 1-4 完成, Phase 5 待启动)
> 预计工期: 4 个迭代周期
> 最近更新: 2026-04-23 21:00

---

## 需求背景

当前系统是单用户本地工具，需要升级为团队可用的平台：
1. 多人各自登录使用，评审数据集中存储
2. 评审结果可持久化、可回顾、可继续评审
3. 评审存档（Review Plan）支持批量 MR 评审和汇总导出
4. LLM 相关代码独立模块化，便于维护和扩展

## 需求决策记录

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 用户身份 | 本地账号密码（非 OAuth） | 内部工具，简单优先 |
| 继续评审粒度 | 用户可选（全量/增量） | 灵活性，增量省 token |
| 数据库 | Phase 1-4 保持 SQLite，Phase 5 整体迁移 MySQL | 业务优先，避免迁移风险阻塞功能开发 |
| 评审计划归属 | 个人制 | 第一期简化，不做协作 |
| 汇总报告导出 | 支持 Markdown | 轻量，可转 PDF |
| 权限模型 | 简单：创建者可编辑，其他人只读 | 不上 RBAC |
| Prompt 管理 | 存 DB + 界面编辑 | 不同项目/场景可用不同 prompt 模板，可在线调优 |

---

## 总体架构变更

```
现状（Phase 1-4，SQLite）：
  客户端 → Express API → SQLite (better-sqlite3)
                   ├→ 用户认证中间件
                   ├→ LLM 模块（独立目录）
                   ├→ 评审存储（Repository 模式）
                   └→ 评审计划（Review Plan）

最终目标（Phase 5，MySQL）：
  客户端 → Express API → MySQL (mysql2)
                   └→ （结构不变，只换存储层）
```

---

## 迭代拆分

### Phase 1: 用户系统 [P0]

> 目标：新增用户登录，基于现有 SQLite，所有现有功能不受影响

#### 1.1 用户系统

**数据模型**（SQLite）：
```sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('admin', 'member')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**API 设计**：
```
POST /api/auth/login      { username, password } → { token, user }
POST /api/auth/setup       { username, password } → 注册（仅首次/管理员可创建）
GET  /api/auth/me          → 当前用户信息（需 token）
```

**认证方案**：
- JWT token，存放在 localStorage
- JWT_SECRET 首次启动自动生成，存入 DB `settings` 表（零配置）
- Express 中间件校验 Authorization: Bearer \<token\>
- token 有效期 7 天

**认证中间件**：
```typescript
// src/server/middleware/auth.ts
export function authRequired(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Login required" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Token expired" });
  }
}
```

**用户管理列表**（管理员界面）：
```
GET  /api/users           → 用户列表（仅 admin）
POST /api/users           → 创建用户（仅 admin）
DELETE /api/users/:id      → 删除用户（仅 admin）
```

**前端新增**：
- `LoginPage.tsx`：登录表单
- `UserManagement.tsx`：用户管理（管理员可见）
- App.tsx 路由：未登录 → LoginPage，已登录 → 主页

**初始管理员**：
- 首次启动时检测无用户，自动进入注册页面（注册第一个用户自动成为 admin）
- 后续用户由 admin 创建

#### 1.3 数据关联

所有现有表增加 `created_by` 字段关联用户（SQLite ALTER TABLE）：
```sql
ALTER TABLE reviews ADD COLUMN created_by TEXT;
ALTER TABLE entries ADD COLUMN created_by TEXT;
```

#### Phase 1 完成标准

- [x] users 表创建在 SQLite 中
- [x] 所有现有 62 个测试通过
- [x] 用户可以注册/登录
- [x] JWT 中间件保护所有 /api/* 路由（auth 路由除外）
- [x] 管理员可以创建/管理用户
- [x] JWT_SECRET 首次启动自动生成，存入 settings 表
- [x] 无 CRITICAL/HIGH 审查问题

#### Phase 1 风险

| 风险 | 影响 | 缓解 |
|------|------|------|
| bcrypt 依赖跨平台 | 低 | bcryptjs 纯 JS 实现，无原生依赖 |
| JWT_SECRET 存 SQLite 单文件 | 低 | 内部工具可接受，Phase 5 迁移 MySQL 后更安全 |

---

### Phase 2: 评审数据持久化 + 评审列表 [P0]

> 目标：评审结果可查询、可回顾、可继续评审

#### 2.1 评审数据模型扩展

```sql
-- 扩展 reviews 表（SQLite）
-- 注意：SQLite 不支持 ALTER TABLE ADD CONSTRAINT，需要重建表或直接在 initialize 中创建完整 schema
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  mr_url TEXT NOT NULL,
  project TEXT,
  author TEXT,
  status TEXT NOT NULL DEFAULT 'completed' CHECK(status IN ('completed', 'draft')),

  report_json TEXT NOT NULL,
  classification_json TEXT,
  requirement_json TEXT,
  mr_meta_json TEXT,

  reviewed_commit_sha TEXT,

  passed INTEGER,
  avg_score REAL,
  issue_count INTEGER,
  critical_count INTEGER DEFAULT 0,

  created_by TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reviews_project ON reviews(project);
CREATE INDEX IF NOT EXISTS idx_reviews_created_by ON reviews(created_by);
CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(status);
```

#### 2.2 评审存储服务

```typescript
// src/server/services/review-store.ts
export interface ReviewStore {
  save(record: ReviewRecord): Promise<string>;
  findById(id: string): Promise<ReviewRecord | null>;
  list(filter: ReviewFilter): Promise<PaginatedResult<ReviewListItem>>;
  update(id: string, patch: Partial<ReviewRecord>): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface ReviewFilter {
  project?: string;
  createdBy?: string;
  status?: string;
  page: number;
  pageSize: number;
}
```

#### 2.3 API 设计

```
GET  /api/reviews                    → 评审列表（分页）
GET  /api/reviews/:id                → 评审详情（完整 ReviewResponse）
POST /api/reviews/:id/continue       → 继续评审
  body: { mode: "full" | "incremental" }
DELETE /api/reviews/:id              → 删除评审
```

**继续评审逻辑**：
```
mode=full:
  重新拉取 MR 最新 diff → 走完整评审流程

mode=incremental:
  1. 从 reviews 表读取 reviewed_commit_sha
  2. 调用 GitLab API 获取该 SHA 之后的 commits
  3. 只取新增 commit 涉及的 diff
  4. 走评审流程（只评审增量部分）
  5. 更新 reviewed_commit_sha
```

#### 2.4 LLM 沟通历史

每次评审过程中的每个 LLM 调用（batch review），记录完整的交互日志。

**数据模型**（SQLite）：
```sql
CREATE TABLE IF NOT EXISTS llm_logs (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL,
  batch_index INTEGER NOT NULL,
  risk_level TEXT CHECK(risk_level IN ('S','A','B','C')),

  system_prompt TEXT NOT NULL,
  user_message TEXT NOT NULL,
  response_text TEXT NOT NULL,

  duration_ms INTEGER NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,

  provider TEXT,
  model TEXT,

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_llm_logs_review_id ON llm_logs(review_id);
```

**API**：
```
GET /api/reviews/:id/logs            → 该评审的所有 LLM 日志
GET /api/reviews/:id/logs/:logId     → 单条日志详情
```

**评审流程中自动记录**：
```typescript
// review.ts 中每次 callLLM 调用改为：
const startTime = Date.now();
const result = await callLLM(systemPrompt, diffText, llmConfig);
const duration = Date.now() - startTime;

await saveLLMLog({
  reviewId,
  batchIndex: i,
  riskLevel: level,
  systemPrompt,
  userMessage: diffText,
  responseText: result.text,
  durationMs: duration,
  inputTokens: result.usage?.inputTokens,
  outputTokens: result.usage?.outputTokens,
  provider: llmConfig.provider,
  model: llmConfig.model,
});
```

**前端展示 — 沟通历史抽屉**：

评审详情页每个 batch 旁增加一个"沟通历史"按钮，点击弹出侧边抽屉（Drawer）：

```
┌──────────────────────────────────────────────┐
│ ← LLM Communication History                  │
│ Batch 1/3 · Level A · deepseek-chat          │
├──────────────────────────────────────────────┤
│ ⏱ 1,234ms  📊 in: 2,340 / out: 856 tokens   │
├──────────────────────────────────────────────┤
│ ▼ System Prompt                    [Copy]    │
│ ┌────────────────────────────────────────┐   │
│ │ 你是一个专业的代码评审专家...          │   │
│ │ 评分维度：...                          │   │
│ │ ...                                    │   │
│ └────────────────────────────────────────┘   │
│                                              │
│ ▼ User Message (Diff)             [Copy]    │
│ ┌────────────────────────────────────────┐   │
│ │ --- a/src/pay/callback.ts             │   │
│ │ +++ b/src/pay/callback.ts             │   │
│ │ ...                                    │   │
│ └────────────────────────────────────────┘   │
│                                              │
│ ▼ AI Response                      [Copy]    │
│ ┌────────────────────────────────────────┐   │
│ │ { "scores": [...], "issues": [...] }   │   │
│ └────────────────────────────────────────┘   │
└──────────────────────────────────────────────┘
```

**前端组件**：
- `LLMHistoryDrawer.tsx` — 侧边抽屉，展示单次 LLM 交互详情
- `LLMHistorySummary.tsx` — 顶部指标条（耗时 + token 汇总）
- 可折叠的三个区域：System Prompt / User Message / AI Response
- 每个区域带 Copy 按钮

#### 2.4 前端新增

**ReviewListPage.tsx** — 评审列表页：
```
布局：
┌─────────────────────────────────────────┐
│ [New Review]  筛选: [项目▾] [状态▾]     │
├──────┬──────┬───────┬──────┬─────┬──────┤
│ 项目  │ MR   │ 评分  │ 状态  │ 问题 │ 时间  │
├──────┼──────┼───────┼──────┼─────┼──────┤
│ pay  │ !123 │ 4.2   │ ✓    │ 3   │ 4/23 │
│ user │ !456 │ 2.8   │ ✗    │ 7   │ 4/22 │
└──────┴──────┴───────┴──────┴─────┴──────┘
                                    < 1 2 3 >
```

- 点击行 → 进入评审详情（复用 ReviewResult 组件）
- 详情页有 "继续评审" 按钮 → 弹出选择粒度（全量/增量）
- 列表支持按项目、状态筛选

**路由变更**：
```
/              → ReviewForm（新评审）
/reviews       → ReviewListPage
/reviews/:id   → ReviewDetailPage
```

#### Phase 2 完成标准

- [x] 评审完成后自动保存到 SQLite（扩展 reviews 表）
- [x] 评审列表 API 支持分页和筛选
- [x] 评审详情页可查看完整结果
- [x] "继续评审" 支持全量和增量两种模式
- [x] 增量模式正确获取新增 commit 的 diff（GitLab compare API）
- [x] 每个评审节点可查看 LLM 沟通历史（prompt、响应、耗时、token）
- [x] 无 CRITICAL 审查问题（review 后已修复）

#### Phase 2 风险

| 风险 | 影响 | 缓解 |
|------|------|------|
| 增量 diff 获取复杂 | 中 | GitLab API 有 compare 两个 commit 的接口 |
| 大量评审数据的列表性能 | 低 | 分页 + 索引 |

---

### Phase 3: 评审存档（Review Plan）[P1]

> 目标：批量评审多个 MR，汇总统计，导出报告

#### 3.1 数据模型

```sql
CREATE TABLE IF NOT EXISTS review_plans (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'reviewing', 'archived')),
  created_by TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_plans_created_by ON review_plans(created_by);
CREATE INDEX IF NOT EXISTS idx_plans_status ON review_plans(status);

CREATE TABLE IF NOT EXISTS review_plan_items (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  mr_url TEXT NOT NULL,
  review_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'reviewing', 'completed', 'failed')),
  position INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (plan_id) REFERENCES review_plans(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_plan_items_plan_id ON review_plan_items(plan_id);
```

#### 3.2 API 设计

```
# 评审计划 CRUD
POST   /api/plans                     → 创建计划
GET    /api/plans                     → 我的计划列表
GET    /api/plans/:id                 → 计划详情（含所有 items）
PUT    /api/plans/:id                 → 更新计划信息
DELETE /api/plans/:id                 → 删除计划

# 计划项管理
POST   /api/plans/:id/items          → 添加 MR（支持批量）
DELETE /api/plans/:id/items/:itemId   → 移除 MR
PUT    /api/plans/:id/items/:itemId   → 更新排序等

# 评审执行
POST   /api/plans/:id/start          → 开始批量评审（逐个执行，SSE 流式返回进度）
POST   /api/plans/:id/items/:itemId/start → 单个评审

# 汇总导出
GET    /api/plans/:id/summary        → 汇总数据（统计）
GET    /api/plans/:id/export         → 导出 Markdown 报告
```

#### 3.3 批量评审 SSE 流

```
POST /api/plans/:id/start
→ SSE 流：
  step 1: "Starting plan: Sprint 23 前端评审"
  step 2: "Reviewing MR 1/5: !123 pay-module"
  step 3: "MR 1/5 completed: 4.2 score, 3 issues"
  step 4: "Reviewing MR 2/5: !456 user-module"
  ...
  step N: "COMPLETE" → 汇总数据
```

#### 3.4 汇总统计

```typescript
interface PlanSummary {
  totalMRs: number;
  completedMRs: number;
  passedMRs: number;
  failedMRs: number;
  avgScore: number;
  totalIssues: number;
  issuesBySeverity: Record<SeverityLevel, number>;
  filesByRisk: Record<RiskLevel, number>;
  // 每个 MR 的摘要
  items: Array<{
    mrUrl: string;
    score: number;
    passed: boolean;
    issueCount: number;
  }>;
}
```

#### 3.5 Markdown 导出格式

```markdown
# 评审报告：Sprint 23 前端代码评审

> 评审时间：2026-04-23
> 评审人：张三
> MR 数量：5

## 汇总

| 指标 | 值 |
|------|-----|
| 通过率 | 4/5 (80%) |
| 平均分 | 3.8/5 |
| 总问题数 | 15 |
| CRITICAL | 0 |
| HIGH | 3 |

## MR 详情

### !123 pay-module — ✓ 通过 (4.2分)

**文件分级**: S(1) A(2) B(3) C(5)

**问题**:
- [HIGH] 支付回调缺少幂等校验 — `src/pay/callback.ts:42`
- [MEDIUM] 日志打印了完整卡号 — `src/pay/logger.ts:15`

### !456 user-module — ✗ 未通过 (2.8分)
...
```

#### 3.6 前端新增

**PlanListPage.tsx** — 计划列表
**PlanDetailPage.tsx** — 计划详情 + 汇总

```
计划详情页布局：
┌─────────────────────────────────────────┐
│ Sprint 23 前端代码评审                   │
│ [Start All] [Export Markdown] [Archive]  │
├─────────────────────────────────────────┤
│ 汇总统计：                               │
│ 通过率 80% │ 平均分 3.8 │ 问题 15 个     │
├──────┬──────┬───────┬──────┬─────────────┤
│ MR   │ 状态  │ 评分  │ 问题  │ 操作        │
├──────┼──────┼───────┼──────┼─────────────┤
│ !123 │ ✓    │ 4.2   │ 3    │ [查看][重评] │
│ !456 │ ✗    │ 2.8   │ 7    │ [查看][重评] │
│ !789 │ 待评  │ —     │ —    │ [评审]       │
└──────┴──────┴───────┴──────┴─────────────┘
```

**路由**：
```
/plans          → 计划列表
/plans/new      → 新建计划
/plans/:id      → 计划详情
```

#### Phase 3 完成标准

- [x] 可以创建评审计划并批量添加 MR 链接
- [x] 支持逐个或一键全部评审，SSE 流式返回进度
- [x] 计划详情页展示汇总统计
- [x] 支持导出 Markdown 格式的评审报告
- [x] 计划可以存档（归档后只读）
- [x] 无 CRITICAL/HIGH 审查问题（代码审查 9ceed6b 修复：导出认证绕过、SSE 生命周期、输入验证）
- [ ] 单元测试覆盖（plan-store 18 个 + exporter 7 个 + 路由集成 13 个，共 38 个待写）

---

### Phase 4: LLM 模块抽离 + Prompt 管理 [P1]

> 目标：将 LLM 调用、prompt、配置抽离为独立模块，prompt 存 DB 支持界面编辑

#### 4.1 目标目录结构

```
src/server/llm/
├── index.ts              ← 统一导出 callLLM, getLLMConfig, saveLLMConfig
├── config.ts             ← LLM 配置读写（从 settings.ts 拆出）
├── providers/
│   ├── types.ts          ← LLMProvider 接口定义
│   ├── anthropic.ts      ← Anthropic SDK 调用
│   └── deepseek.ts       ← DeepSeek OpenAI-compatible 调用
├── prompts/
│   ├── types.ts          ← PromptTemplate 接口
│   ├── defaults.ts       ← 内置默认 prompt 模板（代码即兜底）
│   ├── review.ts         ← 评审 prompt 构建函数
│   ├── requirement.ts    ← 需求理解 prompt
│   └── knowledge.ts      ← 知识提取 prompt
└── router.ts             ← LLM 配置 + Prompt 管理的 API 路由
```

#### 4.2 Provider 接口

```typescript
// src/server/llm/providers/types.ts
export interface LLMProviderClient {
  call(systemPrompt: string, userMessage: string, config: LLMConfig): Promise<LLMResponse>;
}

export interface LLMResponse {
  text: string;
  usage?: { inputTokens: number; outputTokens: number };
}
```

每个 provider 实现此接口，`callLLM` 函数根据配置分发：
```typescript
// src/server/llm/index.ts
export async function callLLM(system: string, user: string, config: LLMConfig): Promise<LLMResponse> {
  const provider = getProvider(config.provider);
  return provider.call(system, user, config);
}
```

新增 provider 只需：
1. 在 `providers/` 下新建文件实现接口
2. 在 `getProvider` 中注册

#### 4.3 Prompt 存 DB + 界面编辑

**设计原则**：
- 代码内置默认 prompt（`defaults.ts`），作为兜底
- DB 中可覆盖每个 prompt 模板，优先级：DB > 代码默认值
- 不同场景（如不同项目类型）可以有不同的 prompt 变体

**数据模型**（SQLite）：
```sql
CREATE TABLE IF NOT EXISTS prompt_templates (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  category TEXT,
  description TEXT,

  system_template TEXT NOT NULL,
  user_template TEXT,

  variables TEXT,                        -- JSON 数组字符串

  is_default INTEGER DEFAULT 0,
  version INTEGER DEFAULT 1,

  created_by TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_prompts_category ON prompt_templates(category);
```

**Prompt 加载逻辑**：
```typescript
// src/server/llm/prompts/review.ts
export async function getReviewPrompt(ctx: ReviewPromptContext): Promise<string> {
  // 1. 尝试从 DB 加载
  const template = await loadPromptTemplate('review');
  if (template) {
    return renderTemplate(template.system_template, ctx);
  }
  // 2. 兜底到代码默认值
  return buildDefaultReviewPrompt(ctx);
}
```

**Prompt 模板变量语法**：
```
你是一个专业的代码评审专家。你需要对提供的代码变更进行评审。

评分维度（每项 1-5 分）：
{{#dimensions}}
{{index}}. {{name}}
{{/dimensions}}

当前评审批次：第 {{batchIndex}}/{{totalBatches}} 批，风险等级：{{riskLevelDesc}}。
```

简单的 `{{key}}` 替换即可（不用上模板引擎，避免依赖膨胀）。

**API 设计**：
```
# Prompt 模板 CRUD
GET    /api/prompts                   → 所有模板列表
GET    /api/prompts/:name             → 模板详情（含当前内容和变量定义）
PUT    /api/prompts/:name             → 更新模板内容（version 自动递增）
POST   /api/prompts/:name/reset       → 重置为代码默认值（删除 DB 记录）

# 调试
POST   /api/prompts/:name/preview     → 预览渲染结果（给定变量值，返回完整 prompt）
```

**前端新增 — PromptEditor.tsx**：

```
┌──────────────────────────────────────────────────┐
│ Prompt Management                    [+ New]      │
├──────────┬───────────────────────────────────────┤
│ 分类      │ 模板列表                               │
│          │                                       │
│ ▸ 评审    │ ● review        v3  [编辑][预览][重置] │
│ ▸ 理解    │ ● requirement   v1  [编辑][预览][重置] │
│ ▸ 提取    │ ● knowledge     v2  [编辑][预览][重置] │
│          │                                       │
├──────────┴───────────────────────────────────────┤
│ 编辑区域 — review (v3)                            │
│                                                  │
│ 可用变量: {{dimensions}}, {{batchIndex}},          │
│ {{totalBatches}}, {{riskLevel}}, {{requirement}}  │
│                                                  │
│ ┌────────────────────────────────────────────┐   │
│ │ 你是一个专业的代码评审专家...                │   │
│ │                                            │   │
│ │ 评分维度（每项 1-5 分）：                    │   │
│ │ {{dimensions}}                             │   │
│ │ ...                                        │   │
│ └────────────────────────────────────────────┘   │
│                                                  │
│ [Save] [Preview] [Reset to Default]              │
└──────────────────────────────────────────────────┘
```

- 左侧分类 + 模板列表
- 右侧编辑区：代码编辑器风格的 textarea
- 顶部显示可用变量
- Preview 按钮：弹窗展示填充变量后的完整 prompt
- Reset 按钮：确认后删除 DB 记录，回退到代码默认值

#### 4.4 路由瘦身后

```typescript
// src/server/routes/review.ts (改造后)
// 只负责：SSE 流编排 + 调用各模块
import { callLLM } from "../llm";
import { getReviewPrompt } from "../llm/prompts/review";

// 循环中：
const systemPrompt = await getReviewPrompt({ dimensions, batchIndex, totalBatches, riskLevel, reqPrompt, knowledgePrompt });
const result = await callLLM(systemPrompt, diffText, llmConfig);
```

#### 4.5 初始数据

在 `db.ts` 的 `initialize` 函数中，首次创建 `prompt_templates` 表后插入默认 prompt（从代码中提取）：
```sql
INSERT OR IGNORE INTO prompt_templates (id, name, category, system_template, variables, is_default, version)
VALUES
  ('default-review', 'review', 'review', '你是一个专业的代码评审专家...', '["dimensions","batchIndex","totalBatches","riskLevel"]', 1, 1),
  ('default-requirement', 'requirement', 'understanding', '...', '["mrTitle","diffSummary"]', 1, 1),
  ('default-knowledge', 'knowledge', 'extraction', '...', '["report","project"]', 1, 1);
```

#### Phase 4 完成标准

- [x] LLM 代码独立在 `src/server/llm/` 目录
- [x] review.ts 不再包含 prompt 模板
- [x] prompt 模板存 DB，支持界面编辑和版本管理
- [x] DB prompt 优先，代码默认值兜底
- [ ] 支持 Preview 预览渲染后的完整 prompt
- [x] 支持 Reset 重置为代码默认值
- [ ] 每个 prompt 函数有单元测试
- [x] 新增 provider 只需加一个文件
- [x] 所有现有 83 测试通过
- [x] 无 CRITICAL/HIGH 审查问题

---

## 技术选型汇总

| 项 | 选型 | 说明 |
|----|------|------|
| 数据库（Phase 1-4） | SQLite (better-sqlite3) | 保持现状，避免迁移阻塞业务开发 |
| 数据库（Phase 5） | MySQL 8+ (mysql2) | 所有业务完成后统一迁移 |
| ORM | 无（原生 SQL） | 保持轻量，SQL 更可控 |
| 密码哈希 | bcryptjs | 纯 JS，无原生依赖 |
| JWT | jsonwebtoken | 标准 JWT 库，SECRET 首次启动自动生成存 DB |
| 前端路由 | react-router-dom | SPA 页面切换 |
| 导出 | Markdown 字符串拼接 | 不依赖 PDF 库，浏览器打印即可 |
| Prompt 模板 | DB 存储 + 代码兜底 | `{{变量}}` 简单替换，支持界面编辑 |

## 新增依赖

```json
{
  "dependencies": {
    "bcryptjs": "^2.x",
    "jsonwebtoken": "^9.x",
    "react-router-dom": "^7.x"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.x",
    "@types/jsonwebtoken": "^9.x"
  }
}
```

> Phase 5 时再引入 `mysql2` 和移除 `better-sqlite3`。

## 文件影响范围总览

### Phase 1 改动
| 文件 | 动作 | 说明 |
|------|------|------|
| src/server/db.ts | 改造 | 新增 users 表初始化 |
| src/server/middleware/auth.ts | 新建 | JWT 认证中间件 |
| src/server/routes/auth.ts | 新建 | 登录/注册 API |
| src/server/routes/users.ts | 新建 | 用户管理 API |
| src/client/components/LoginPage.tsx | 新建 | 登录页 |
| src/client/components/UserManagement.tsx | 新建 | 用户管理 |
| src/client/App.tsx | 改造 | 加路由 + 登录判断 |
| tests/auth.test.ts | 新建 | 认证相关测试 |
| package.json | 改造 | 新增 bcryptjs, jsonwebtoken |

### Phase 2 改动
| 文件 | 动作 | 说明 |
|------|------|------|
| src/server/services/review-store.ts | 新建 | 评审存储服务 |
| src/server/services/llm-logger.ts | 新建 | LLM 调用日志记录 |
| src/server/routes/reviews.ts | 新建 | 评审列表/详情/继续 API |
| src/client/components/ReviewListPage.tsx | 新建 | 评审列表页 |
| src/client/components/ReviewDetailPage.tsx | 新建 | 评审详情页 |
| src/client/components/LLMHistoryDrawer.tsx | 新建 | LLM 沟通历史抽屉 |
| src/client/components/LLMHistorySummary.tsx | 新建 | 耗时/token 指标条 |

### Phase 3 改动
| 文件 | 动作 | 说明 |
|------|------|------|
| src/server/services/plan-store.ts | 新建 | 计划存储服务 |
| src/server/routes/plans.ts | 新建 | 计划 API |
| src/server/services/exporter.ts | 新建 | Markdown 导出 |
| src/client/components/PlanListPage.tsx | 新建 | 计划列表页 |
| src/client/components/PlanDetailPage.tsx | 新建 | 计划详情页 |
| src/client/components/PlanForm.tsx | 新建 | 新建计划表单 |

### Phase 4 改动
| 文件 | 动作 | 说明 |
|------|------|------|
| src/server/llm/* | 新建 | LLM 独立模块（含 providers + prompts） |
| src/server/services/llm.ts | 删除 | 合并到 llm/ |
| src/server/routes/review.ts | 瘦身 | 移除 prompt 模板，调用 llm 模块 |
| src/server/routes/prompts.ts | 新建 | Prompt 管理 API |
| src/client/components/PromptEditor.tsx | 新建 | Prompt 编辑界面 |
| tests/llm/*.test.ts | 新建 | Prompt 和 provider 测试 |

---

## 开发顺序建议

```
Phase 1 (用户系统)  ──→  Phase 4 (LLM 抽离 + Prompt 管理)
     │                         │
     └──→ Phase 2 (评审持久化 + 沟通历史) ──→ Phase 3 (评审存档)
                                                    │
                                                    └──→ Phase 5 (MySQL 迁移)
```

- Phase 1 先建用户系统（基础）
- Phase 4 在 Phase 2 之前（LLM 抽离后再改 review 路由更干净）
- Phase 2 包含 LLM 沟通历史（依赖 Phase 4 的 callLLM 返回 usage 数据）
- Phase 3 依赖 Phase 2（评审存档基于评审记录）
- Phase 5 放最后（所有业务完成后再整体迁移）

**建议执行顺序**: Phase 1 → Phase 4 → Phase 2 → Phase 3 → Phase 5

---

### Phase 5: MySQL 迁移 [P2]

> 目标：SQLite → MySQL，所有业务功能不变，只换存储层

**前置条件**：Phase 1-4 全部完成，功能稳定

**改动范围**：
- 移除 `better-sqlite3`，引入 `mysql2`
- 重写 `src/server/db.ts`：MySQL 连接池 + migration 机制
- 新增 `docker-compose.yml` 一键拉起 MySQL
- 所有服务层的 SQL 语法适配 MySQL（TEXT→VARCHAR, CHECK→ENUM, 同步→异步）
- 新增 `src/server/migrations/` 目录，版本化 SQL 文件

**Phase 5 完成标准**

- [ ] MySQL 连接池正常工作
- [ ] Migration 机制可重复执行（幂等）
- [ ] 所有测试通过（SQL 适配后）
- [ ] 现有功能完全不受影响
- [ ] Docker Compose 可一键拉起开发环境
- [ ] 无 CRITICAL/HIGH 审查问题

---

## 已确认决策

| 项 | 决策 |
|----|------|
| 存储策略 | Phase 1-4 保持 SQLite，Phase 5 统一迁移 MySQL |
| JWT_SECRET | 首次启动自动生成，存入 settings 表 |
| Prompt 管理 | 存 DB + 界面编辑，代码内置默认值兜底 |
| 开发环境 | MySQL 迁移时再加 Docker Compose |
