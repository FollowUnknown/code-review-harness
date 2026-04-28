# 设计文档：评审知识沉淀平台化

> 创建时间: 2026-04-23
> 状态: draft
> 来源: 对齐 claude-skills 的知识管理体系

---

## 1. 背景与目标

### 现状

codeReview 平台已有基础的知识提取（`extractLearnings()`），但存在以下问题：

- **提取粗糙**：只从低分维度和 CRITICAL issue 提取，遗漏大量有价值的模式
- **结构扁平**：知识条目只有 title + content，缺少模式描述、影响、修复建议等结构化字段
- **无去重**：重复知识堆积
- **注入策略粗糙**：按 project+module 简单查询，无分层、无上限控制
- **Prompt 全局一套**：不区分项目/技术栈，所有项目用相同评审维度
- **无管理界面**：知识 TEMP→CONFIRMED 有状态流但无 UI

### 参照系

claude-skills 已有成熟的知识体系（5 类知识、编号体系、覆盖门禁、分层注入、ingest 管线），经过多轮评审验证。本设计将其核心机制迁移到平台。

### 目标

1. 知识条目结构化，对齐 claude-skills 的 5 类知识（AP/EXP/CONV/BN/RULE）
2. 评审 issue 强制覆盖门禁（每个 issue 必须映射到知识条目类型）
3. 按项目编号，支持临时号→正式号转换
4. 分层注入策略（通用→项目→模块，有上限控制）
5. 项目级评审维度（按 GitLab 项目路径匹配）
6. 知识管理 API + 界面

---

## 1.1 在 Harness Superpower 路线中的位置

本设计不是独立的 harness 框架设计，而是 `codeReview` 作为业务验证场，对 **Phase 4: Memory Superpower** 的一次落地验证。

它验证的不是"GitLab 评审"本身，而是以下通用问题：

- 知识如何从执行结果中写回
- 自动提取的知识如何进入状态流（TEMP / CONFIRMED / DEPRECATED）
- 知识如何按作用域分层召回
- 知识如何被注入后续任务运行时

边界划分如下：

- `harness` 负责定义 Memory 的通用模型、Recall Policy、Writeback Policy、作用域和状态流
- `codeReview` 负责提供第一个业务实现：review issue、knowledge entry、project/module 召回策略

关联路线见：

- `docs/superpowers/specs/2026-04-23-harness-superpower-roadmap.md`

因此本设计的输出既服务当前业务，也应反哺 harness 的 Memory Superpower 抽象。

---

## 2. 知识表结构

### 2.1 替换现有 `entries` 表

新建 `knowledge_entries` 表，替代原有 `entries` 表。旧数据通过迁移脚本转换。

```sql
CREATE TABLE knowledge_entries (
  id              TEXT PRIMARY KEY,       -- 格式: {TYPE}-{project_abbr}-{NNN} 或临时号 {TYPE}-TEMP-{NNN}
  type            TEXT NOT NULL,          -- AP/EXP/CONV/BN/RULE
  project         TEXT NOT NULL,          -- GitLab project path
  module          TEXT,                   -- 子模块
  severity        TEXT,                   -- CRITICAL/HIGH/MEDIUM/LOW
  title           TEXT NOT NULL,          -- 短标题
  pattern         TEXT,                   -- 模式描述（AP: 什么问题模式）
  impact          TEXT,                   -- 影响范围（AP: 会造成什么后果）
  fix_suggestion  TEXT,                   -- 修复建议
  content         TEXT NOT NULL,          -- 完整内容/说明
  status          TEXT NOT NULL DEFAULT 'TEMP',  -- TEMP/CONFIRMED/DEPRECATED
  source_review   TEXT,                   -- 来源评审 ID
  source_mr       TEXT,                   -- 来源 MR URL
  source_file     TEXT,                   -- 来源文件路径
  parent_id       TEXT,                   -- RULE 关联的 BN ID
  hit_count       INTEGER NOT NULL DEFAULT 0,    -- 被注入评审的次数
  last_hit_at     TEXT,                   -- 最近一次命中时间
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,

  FOREIGN KEY (parent_id) REFERENCES knowledge_entries(id)
);

CREATE INDEX idx_ke_type ON knowledge_entries(type);
CREATE INDEX idx_ke_project ON knowledge_entries(project);
CREATE INDEX idx_ke_status ON knowledge_entries(status);
CREATE INDEX idx_ke_type_project ON knowledge_entries(type, project);
CREATE INDEX idx_ke_type_project_status ON knowledge_entries(type, project, status);
```

### 2.2 各类型字段使用

| 字段 | AP（反模式） | EXP（经验） | CONV（约定） | BN（业务名词） | RULE（业务规则） |
|------|------------|------------|-------------|--------------|----------------|
| pattern | **必填** — 问题模式描述 | - | - | - | - |
| impact | **必填** — 影响范围 | - | - | - | - |
| fix_suggestion | **必填** — 修复建议 | 可选 — 过滤规则 | 可选 — 正确做法 | - | - |
| severity | **必填** | - | - | - | - |
| content | 补充说明 | 完整反馈+过滤规则 | 约定详细说明 | 功能说明+数据结构 | 规则约束+边界条件 |
| parent_id | - | - | - | - | **必填** — 关联的 BN |
| source_mr | 推荐 | 推荐 | 可选 | 可选 | 可选 |

---

## 3. 编号体系

### 3.1 临时号与正式号

```
临时号（评审提取时生成）:
  AP-TEMP-{NNN}    如 AP-TEMP-001
  EXP-TEMP-{NNN}   如 EXP-TEMP-002
  CONV-TEMP-{NNN}
  BN-TEMP-{NNN}
  RULE-TEMP-{NNN}

正式号（管理员确认时分配）:
  {TYPE}-{PROJECT_ABBR}-{NNN}
  如: AP-do1-001, EXP-cw-012, CONV-do1-003, BN-do1-001, RULE-do1-001
```

### 3.2 PROJECT_ABBR 规则

- 默认取 GitLab project path 最后一段的前 3-5 字符（去除连字符后）
- 例: `do1cloud-qiqiao-console-web` → `cw`, `do1cloud-qiqiao-runtime-web` → `rw`
- 管理员可在项目档案中手动指定

### 3.3 NNN 自增规则

- 按 `type + project_abbr` 独立自增
- 查询当前最大 NNN: `SELECT MAX(CAST(SUBSTR(id, ...) AS INTEGER)) FROM knowledge_entries WHERE type=? AND project=? AND status='CONFIRMED'`
- 新分配的 NNN = max + 1

---

## 4. 覆盖门禁

### 4.1 Issue Disposition

评审报告中的每个 issue 必须映射到以下 disposition 之一：

| Disposition | 含义 | 生成的知识类型 |
|------------|------|--------------|
| `→ AP` | 明确的 bug/性能/安全反模式 | AP 条目 |
| `→ EXP` | 评审经验（误判过滤、严重度修正） | EXP 条目 |
| `→ RULE` | 业务逻辑约束 | RULE 条目（需关联 BN） |
| `→ MERGE` | 与已有知识重复 | 追加 source 到已有条目 |
| `→ SKIP` | 不提取（需填理由） | 不生成条目 |

### 4.2 门禁逻辑

在评审报告生成后、保存评审记录前：

1. 遍历 `report.issues`，为每个 issue 生成 disposition 建议
2. CRITICAL/HIGH issue **必须**有 disposition（不可 SKIP 除非有理由）
3. MEDIUM/LOW issue 默认 SKIP，可手动改为其他
4. 生成 `knowledge_dispositions` JSON 存入评审记录

### 4.3 自动建议 disposition

```
if issue.severity === "CRITICAL" && issue.file → AP
if issue.severity === "HIGH" && issue.message matches 已有 AP pattern → MERGE
if issue.message 涉及业务逻辑 → RULE
else → AP（默认）
```

---

## 5. 分层注入策略

### 5.1 替换 `getKnowledgeForReview()`

新的 `getKnowledgeForReview(project, module?)` 按优先级分层加载：

```
Layer 1: 通用反模式（type=AP, severity=HIGH, 所有项目, status=CONFIRMED）
Layer 2: 项目反模式（type=AP, project 匹配, status=CONFIRMED）
Layer 3: 项目约定（type=CONV, project 匹配, status=CONFIRMED）
Layer 4: 最近经验（type=EXP, project 匹配, status=CONFIRMED, ≤20 条, module 优先）
Layer 5: 业务名词（type=BN, project+module 匹配, status=CONFIRMED）
Layer 6: 业务规则（type=RULE, parent_id 匹配 Layer 5 的 BN, status=CONFIRMED）
```

### 5.2 上限控制

- 总内容上限: 2000 行
- 从 Layer 6 开始裁剪（最不重要的优先丢弃）
- 每层内部按 `hit_count DESC, last_hit_at DESC` 排序（高频命中的优先保留）

### 5.3 命中追踪

每次知识被注入评审时：
- `hit_count += 1`
- `last_hit_at = now()`

### 5.4 Prompt 构建

替换 `buildKnowledgePrompt()`，按层生成结构化 prompt：

```
## 项目知识库
以下是本项目的已知模式和约定，请在评审时参考：

### 反模式（必须避免）
{Layer 1 + Layer 2 的 AP 条目，格式: [严重度] title — pattern → fix_suggestion}

### 项目约定
{Layer 3 的 CONV 条目}

### 评审经验
{Layer 4 的 EXP 条目}

### 业务上下文
{Layer 5 BN + Layer 6 RULE}
```

---

## 6. 项目级评审维度

### 6.1 新表 `review_dimension_sets`

```sql
CREATE TABLE review_dimension_sets (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,          -- 如 "qiqiao-frontend", "default"
  project     TEXT,                   -- 关联的 GitLab project path（null=通用）
  dimensions  TEXT NOT NULL,          -- JSON array: ["正确性", "安全性", ...]
  focus_areas TEXT,                   -- JSON: 补充关注点
  is_default  INTEGER NOT NULL DEFAULT 0,
  created_by  TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,

  UNIQUE(name)
);
CREATE INDEX idx_rds_project ON review_dimension_sets(project);
```

### 6.2 维度匹配逻辑

评审时按 project path 查找维度集：

```
1. 精确匹配: project = '{full_path}'
2. 前缀匹配: project LIKE '{path_prefix}%'
3. 兜底: is_default = 1
```

### 6.3 默认数据

seed 时插入默认维度集（`is_default=1`），内容为现有 `REVIEW_DIMENSIONS` 常量。

---

## 7. 知识管理 API

### 7.1 知识条目 CRUD

```
GET    /api/knowledge                    -- 列表（?type=AP&project=xxx&status=TEMP&page=1&pageSize=20）
GET    /api/knowledge/:id                -- 详情
PUT    /api/knowledge/:id                -- 编辑（修改内容、补充字段）
PUT    /api/knowledge/:id/confirm        -- 确认（TEMP→CONFIRMED，分配正式编号）
PUT    /api/knowledge/:id/deprecate      -- 废弃（status→DEPRECATED）
DELETE /api/knowledge/:id                -- 删除（仅 TEMP 状态可删）
GET    /api/knowledge/stats              -- 统计（按 type/project/status 分组计数）
```

权限：admin 可操作所有，member 只能操作自己项目下的。

### 7.2 维度集管理

```
GET    /api/dimension-sets               -- 列表
POST   /api/dimension-sets               -- 新建（admin only）
PUT    /api/dimension-sets/:id           -- 编辑（admin only）
DELETE /api/dimension-sets/:id           -- 删除（admin only）
```

### 7.3 评审报告知识映射

```
POST   /api/reviews/:id/knowledge-map    -- 提交 issue disposition 映射
GET    /api/reviews/:id/knowledge-map    -- 获取映射结果
```

---

## 8. 前端页面

### 8.1 KnowledgePage.tsx — 知识库管理

- Tab 切换: AP / EXP / CONV / BN / RULE
- 筛选: 项目、状态（TEMP/CONFIRMED/DEPRECATED）
- 列表字段: 编号、标题、严重度、项目、来源、命中次数、状态
- 操作: 确认（分配正式号）、编辑、废弃、删除

### 8.2 KnowledgeDetailPanel.tsx — 知识详情/编辑

右侧抽屉，展示结构化字段：
- AP: 模式描述、影响、修复建议
- EXP: 原始判断、人工反馈、过滤规则
- CONV: 约定说明、正确做法
- BN: 功能说明、数据结构、关联文件
- RULE: 规则说明、关联的 BN

### 8.3 DimensionSetPage.tsx — 维度集管理

- 列表展示所有维度集
- 新建/编辑表单: 名称、关联项目、维度列表、补充关注点
- 预览: 展示该维度集会被哪些项目使用

---

## 9. 数据迁移

### 9.1 从旧 `entries` 表迁移

```sql
-- 1. 创建新表 knowledge_entries
-- 2. 迁移数据
INSERT INTO knowledge_entries (id, type, project, module, severity, title, content, status, source_review, created_at)
  SELECT id, type, project, module, severity, title, content, status, source_review, created_at FROM entries;

-- 3. 重新编号（分配正式号）
-- 对 CONFIRMED 的条目按 type+project 重新分配 {TYPE}-{abbr}-{NNN} 格式 ID

-- 4. 删除旧表
DROP TABLE entries;
```

### 9.2 迁移脚本

Node.js 脚本 `scripts/migrate-knowledge.ts`：
1. 读取旧 entries
2. 按类型/项目分组，生成分组缩写
3. 分配正式编号
4. 写入 knowledge_entries
5. 更新所有引用（review record 中的 source_review 等）

---

## 10. 不在本次范围内

- 知识老化自动降权（可后续根据 hit_count 实现）
- 从 claude-skills Git 仓库导入/同步知识
- 知识条目版本历史
- 知识条目评论/讨论
