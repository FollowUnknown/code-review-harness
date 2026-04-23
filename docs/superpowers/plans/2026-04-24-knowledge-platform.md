# 实施计划：评审知识沉淀平台化

> 来源: `docs/superpowers/specs/2026-04-23-knowledge-platform-design.md`
> 创建: 2026-04-24
> 状态: draft

---

## 概览

将知识管理系统从简单的 key-value 提取升级为结构化平台，包含 5 类知识、编号体系、覆盖门禁、分层注入、项目级维度、管理 API 和前端界面。

**分 7 个阶段，按依赖顺序执行。每个阶段完成后可独立验证。**

---

## Phase 1: 数据层 — 新表 + 迁移

**目标**: 创建 `knowledge_entries` 和 `review_dimension_sets` 表，迁移旧 `entries` 数据。

### 步骤

1. **扩展 `db.ts` 中的 `initialize()` 函数**
   - 创建 `knowledge_entries` 表（按 spec §2.1 的完整 schema）
   - 创建 `review_dimension_sets` 表（按 spec §6.1）
   - 新增索引: `idx_ke_type`, `idx_ke_project`, `idx_ke_status`, `idx_ke_type_project`, `idx_ke_type_project_status`, `idx_rds_project`
   - 保留旧 `entries` 表暂不删除（等迁移脚本跑完再清理）

2. **更新 `KnowledgeEntry` 接口** (`src/server/services/knowledge.ts`)
   - 新增字段: `pattern`, `impact`, `fix_suggestion`, `source_mr`, `source_file`, `parent_id`, `hit_count`, `last_hit_at`, `updated_at`
   - 更新 `EntryType` 增加 `"RULE"`
   - 更新 `EntrySeverity` 增加 `"CRITICAL"`
   - 更新 `EntryStatus` 增加 `"DEPRECATED"`

3. **编写迁移脚本** `scripts/migrate-knowledge.ts`
   - 读取旧 `entries` 表数据
   - 按类型/项目分组，生成分组缩写
   - 为 CONFIRMED 条目分配正式编号 `{TYPE}-{abbr}-{NNN}`
   - TEMP 条目保留原 ID 或分配 `{TYPE}-TEMP-{NNN}`
   - 写入 `knowledge_entries`
   - 更新 `reviews` 表中引用旧 ID 的 JSON 字段（如 knowledge_dispositions）

4. **seed 默认维度集** — 在 `initialize()` 中插入 `is_default=1` 的维度集，内容来自现有 `REVIEW_DIMENSIONS`

### 涉及文件
- `src/server/db.ts` — 新表 + 索引
- `src/server/services/knowledge.ts` — 接口更新
- `src/shared/types.ts` — 如有共享类型需同步
- `scripts/migrate-knowledge.ts` — 新建迁移脚本

### 验证
- 新表创建成功，索引存在
- 旧数据迁移完整（条目数一致）
- 默认维度集已 seed

---

## Phase 2: 知识服务层 — CRUD + 编号 + 注入

**目标**: 重写知识服务函数，实现编号体系、分层注入、命中追踪。

### 步骤

1. **重写 CRUD 函数** (`src/server/services/knowledge.ts`)
   - `addKnowledge(entry)` — 生成临时号 `{TYPE}-TEMP-{NNN}`
   - `getKnowledge(id)` — 查单条
   - `updateKnowledge(id, updates)` — 编辑内容字段
   - `confirmKnowledge(id, projectAbbr)` — TEMP→CONFIRMED，分配正式号
   - `deprecateKnowledge(id)` — status→DEPRECATED
   - `deleteKnowledge(id)` — 仅 TEMP 可删
   - `listKnowledge(filters)` — 分页 + type/project/status 筛选
   - `getKnowledgeStats()` — 按 type/project/status 分组计数

2. **实现编号逻辑**
   - `getNextTempId(type)` — 查 TEMP 最大 NNN + 1
   - `getNextFormalId(type, projectAbbr)` — 查 CONFIRMED 最大 NNN + 1
   - `getProjectAbbr(projectPath)` — 从 GitLab path 生成缩写（末段前 3-5 字符去连字符）

3. **重写 `getKnowledgeForReview()`** — 分层加载（spec §5.1）
   - Layer 1: 通用 AP（HIGH, 所有项目, CONFIRMED）
   - Layer 2: 项目 AP
   - Layer 3: 项目 CONV
   - Layer 4: 最近 EXP（≤20 条, module 优先）
   - Layer 5: BN（project+module 匹配）
   - Layer 6: RULE（parent 匹配 Layer 5）
   - 上限 2000 行，从 Layer 6 开始裁剪

4. **重写 `buildKnowledgePrompt()`** — 按层生成结构化 prompt（spec §5.4）

5. **命中追踪** — `trackKnowledgeHits(ids)` — hit_count += 1, last_hit_at = now()

6. **重写 `extractLearnings()`** — 改用新的编号体系和接口

### 涉及文件
- `src/server/services/knowledge.ts` — 全面重写
- `src/server/llm/prompts/knowledge.ts` — 可能需要调整 re-export

### 验证
- CRUD 操作正确，编号自增无误
- 分层注入返回正确优先级和上限
- 命中追踪计数准确
- `pnpm test` 全部通过

---

## Phase 3: 覆盖门禁 — Issue Disposition

**目标**: 评审 issue 必须映射到 disposition，CRITICAL/HIGH 不可跳过。

### 步骤

1. **定义 disposition 类型和常量** (`src/shared/constants.ts` 或 `src/shared/types.ts`)
   ```typescript
   type IssueDisposition = 'AP' | 'EXP' | 'RULE' | 'MERGE' | 'SKIP';
   interface KnowledgeDisposition {
     issueIndex: number;
     disposition: IssueDisposition;
     knowledgeId?: string;     // MERGE 时指向已有条目
     skipReason?: string;      // SKIP 时必填
     autoSuggested: boolean;
   }
   ```

2. **实现自动建议逻辑** (`src/server/services/knowledge.ts`)
   - `suggestDispositions(issues)` — 按 spec §4.3 规则自动建议
   - CRITICAL/HIGH 不可 SKIP（除非有理由）

3. **集成到评审流程**
   - 评审报告生成后、保存前调用 `suggestDispositions()`
   - 将 `knowledge_dispositions` JSON 存入 `reviews` 表（需新增列）

4. **更新 `reviews` 表** — 新增 `knowledge_dispositions_json TEXT` 列

### 涉及文件
- `src/shared/types.ts` — 新类型
- `src/server/services/knowledge.ts` — suggestDispositions()
- `src/server/db.ts` — reviews 表加列
- `src/server/routes/review.ts` — 集成到评审流程
- `src/server/routes/reviews.ts` — 同上
- `src/server/routes/plans.ts` — 同上

### 验证
- CRITICAL/HIGH issue 无法被 SKIP
- disposition 建议合理
- 数据正确存入 reviews 表

---

## Phase 4: 项目级评审维度

**目标**: 按项目路径匹配维度集，替代全局 `REVIEW_DIMENSIONS`。

### 步骤

1. **实现维度匹配逻辑** (`src/server/services/dimensions.ts` — 新文件)
   - `getDimensionsForProject(projectPath)` — 精确匹配 → 前缀匹配 → 默认
   - `listDimensionSets()` / `createDimensionSet()` / `updateDimensionSet()` / `deleteDimensionSet()`

2. **替换硬编码引用**
   - 找到所有使用 `REVIEW_DIMENSIONS` 的地方，改为 `getDimensionsForProject()`
   - 保留 `REVIEW_DIMENSIONS` 作为 fallback 常量（db seed 用）

3. **更新评审流程** — review/reviews/plans 路由中获取项目路径，查维度集

### 涉及文件
- `src/server/services/dimensions.ts` — 新建
- `src/server/routes/review.ts` — 替换硬编码
- `src/server/routes/reviews.ts` — 同上
- `src/server/routes/plans.ts` — 同上
- `src/server/llm/defaults.ts` — 如有引用需调整
- `src/server/reviewer.ts` — 如有引用需调整

### 验证
- 项目路径匹配正确（精确 > 前缀 > 默认）
- 评审 prompt 使用匹配到的维度
- 默认维度集内容与现有 `REVIEW_DIMENSIONS` 一致

---

## Phase 5: 知识管理 API

**目标**: 暴露知识条目和维度集的 RESTful API。

### 步骤

1. **知识条目路由** (`src/server/routes/knowledge.ts` — 新文件)
   ```
   GET    /api/knowledge              — 列表（分页 + 筛选）
   GET    /api/knowledge/:id          — 详情
   PUT    /api/knowledge/:id          — 编辑
   PUT    /api/knowledge/:id/confirm  — 确认（分配正式号）
   PUT    /api/knowledge/:id/deprecate — 废弃
   DELETE /api/knowledge/:id          — 删除（仅 TEMP）
   GET    /api/knowledge/stats        — 统计
   ```

2. **维度集路由** (`src/server/routes/dimensions.ts` — 新文件)
   ```
   GET    /api/dimension-sets         — 列表
   POST   /api/dimension-sets         — 新建（admin only）
   PUT    /api/dimension-sets/:id     — 编辑（admin only）
   DELETE /api/dimension-sets/:id     — 删除（admin only）
   ```

3. **知识映射路由** — 挂在 reviews 路由下
   ```
   POST   /api/reviews/:id/knowledge-map
   GET    /api/reviews/:id/knowledge-map
   ```

4. **注册路由** — `src/server/index.ts` 中挂载新路由

5. **权限控制** — admin 全操作，member 只能操作自己项目下的

### 涉及文件
- `src/server/routes/knowledge.ts` — 新建
- `src/server/routes/dimensions.ts` — 新建
- `src/server/routes/reviews.ts` — 加 knowledge-map 端点
- `src/server/index.ts` — 注册路由

### 验证
- 所有 CRUD 端点工作正常
- 权限控制生效
- 分页和筛选正确

---

## Phase 6: 前端 — 知识管理页面

**目标**: 知识库管理 UI + 维度集管理 UI。

### 步骤

1. **KnowledgePage.tsx** — 知识库管理主页
   - Tab 切换: AP / EXP / CONV / BN / RULE
   - 筛选栏: 项目、状态
   - 列表: 编号、标题、严重度、项目、来源、命中次数、状态
   - 操作按钮: 确认、编辑、废弃、删除
   - 路由: `/knowledge`

2. **KnowledgeDetailPanel.tsx** — 右侧抽屉详情/编辑
   - 按类型展示不同结构化字段
   - 编辑模式: 修改内容、补充字段
   - 确认操作: 预览正式编号

3. **DimensionSetPage.tsx** — 维度集管理
   - 列表展示所有维度集
   - 新建/编辑表单
   - 路由: `/dimensions`

4. **路由注册** — `src/client/App.tsx` 中添加新路由

5. **导航更新** — 侧边栏/顶部导航添加"知识库"入口

### 涉及文件
- `src/client/pages/KnowledgePage.tsx` — 新建
- `src/client/components/KnowledgeDetailPanel.tsx` — 新建
- `src/client/pages/DimensionSetPage.tsx` — 新建
- `src/client/App.tsx` — 添加路由 + 导航

### 验证
- 知识列表正确展示，筛选工作
- 详情面板展示正确，编辑保存成功
- 确认操作分配正式编号
- 维度集 CRUD 正常

---

## Phase 7: 清理 + 测试 + 文档

**目标**: 删除旧代码，补全测试，更新文档。

### 步骤

1. **删除旧代码**
   - 删除 `entries` 表相关代码（迁移后确认无引用）
   - 清理旧的 `addEntry()` / `confirmEntry()` 等函数（如果 Phase 2 已替换为新函数名则跳过）

2. **补全测试**
   - 更新 `tests/knowledge.test.ts` 覆盖新功能
   - 新增 `tests/dimensions.test.ts`
   - API 路由集成测试
   - 覆盖率 ≥ 80%

3. **更新文档**
   - `docs/architecture/index.md` — 更新架构说明
   - `docs/architecture/implicit-contracts.md` — 记录隐性约定

### 涉及文件
- `src/server/db.ts` — 删除旧 entries 表创建
- `tests/knowledge.test.ts` — 重写
- `tests/dimensions.test.ts` — 新建
- `docs/` — 更新

### 验证
- `pnpm test` 全部通过
- 覆盖率 ≥ 80%
- 无死代码

---

## 风险与注意事项

| 风险 | 缓解措施 |
|------|----------|
| 数据迁移丢失 | 迁移前备份 `knowledge.db`，保留旧表直到验证完成 |
| 编号冲突 | 正式号分配用事务 + MAX 查询，避免并发冲突 |
| 分层注入性能 | 每层查询加 LIMIT，总上限 2000 行 |
| 前端页面复杂度 | 优先实现列表 + 详情，维度集管理可简化 |
| CRITICAL issue 误 disposition | 门禁只做建议，不阻塞评审保存 |

---

## 依赖关系

```
Phase 1 (数据层)
  ├─→ Phase 2 (服务层)
  │     ├─→ Phase 3 (覆盖门禁)
  │     └─→ Phase 4 (项目维度)
  ├─→ Phase 5 (API) ←── depends on Phase 2
  └─→ Phase 6 (前端) ←── depends on Phase 5
Phase 7 (清理) ←── depends on all
```

Phase 3 和 Phase 4 可并行。Phase 5 需要 Phase 2 完成。Phase 6 需要 Phase 5 完成。
