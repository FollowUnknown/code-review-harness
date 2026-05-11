# v1.4.2 — 版本/Contract 关系治理

> 状态: ✅ 完成
> 前置: v1.4.1
> 后置: v1.5.0
> 类型: Platform Task（治理迭代）
> 架构评审: 2026-05-11，architect agent + 迭代沟通 agent 联合评审
> 需求场景: 2026-05-11，新增 Phase 1 需求场景输出

## 背景

在当前 `docs/versions/` 和 `docs/contracts/` 两个目录的审查中发现以下问题（迭代沟通 agent 逐项核实）：

1. **双向链路断裂**：仅 31%（4/13）的 contract 声明了版本号，仅 15% 的 version README 反向引用 contract
2. **状态三层打架**：v1.3.0 总表标记 `✅ 完成`，但子目录 README 仍写 `待规划`
3. **幽灵版本**：v1.3.9 总表标记完成但目录不存在；v1.3.8 只存在于 contract 头部，不在 roadmap 中
4. **Contract 状态无受控词汇**：`in_progress` / `in-progress` / `draft (待确认)` 混用；`review_pending` 定义但 0 个 contract 使用
5. **文档密度严重不均**：v1.4.0 有 5 个文件 ~5000+ 行，部分版本只有 1 个文件
6. **废弃目录未清理**：v1.4.0-archived/ 仍留在树中

## 核心目标

不引入新功能，纯粹治理 `docs/versions/` 和 `docs/contracts/` 的关系，建立可维护的双向追溯链路。

## 治理原则

> **版本和 contract 之间只需要一条双向链路：contract 声明 version，version 列出 contract。** 这条链路目前是断的，补上之后其他问题自然消解。

## 架构决策（2026-05-11 architect + 迭代沟通联合评审）

### 决策 1: v1.3.8 并入 v1.3.9
v1.3.8 只存在于 contract `2026-05-07-local-review-job-persistence.md` 头部，不在 roadmap 总表中。将 v1.3.8 时期的 contract 归入 v1.3.9，减少版本碎片。

### 决策 2: v1.4.0 文档精简目标 → 4 个文件
`change-impact-map.md`（精确到文件/行号的代码变更映射）与 `design.md`（架构设计）服务不同读者。合并 `scenario-analysis.md` + `business-scenarios.md` → `user-scenarios.md`。保留 `change-impact-map.md` 独立。**目标：5 → 4，不是 3。**

### 决策 3: `review_pending` 作为提交前强制评审的关键状态
见下方「review_pending 实操设计」节。

## 需求场景输出（2026-05-11 新增）

> 明确 v1.4.2 完成后的具体效果。每个场景覆盖一个当前痛点 → 改后效果。

### 场景 1: 新建 Contract 自动归入版本

**当前痛点**：创建 contract 时 `版本` 字段经常漏填，导致 69% 的 contract 挂在幽灵版本上，不知道是哪个迭代的工作。

**改后效果**：
- AI 创建 contract 时自动填入 `> 版本: vX.Y.Z`，必填不可跳过
- 新 contract 建完，对应的 version README「关联 Contract」表自动多一行
- 版本总表、contract、子目录 README 三者一致，追溯链路闭合

**验证**：创建一个测试 contract → 检查 version 字段非空 → 检查对应 README 关联表存在该条目

### 场景 2: 代码写完 → 自动触发评审 → 通过才能 commit

**当前痛点**：`review_pending` 定义了但 0 个 contract 使用。代码写完直接 commit，pre-commit hook 需要手动创建 `review-passed` 标记文件，全靠 AI 自觉。

**改后效果**：
```
in_progress → review_pending  →  code-reviewer agent 自动触发
                                    ↓
                              审查通过 → review-passed hash 写入
                                    ↓
                              completed → commit（hook 验证 hash 通过）
```
- Contract 状态驱动行为，不是靠"AI 记得"
- 每次 commit 都有对应的 review 记录
- review-passed 标记不再是"凭空出现的文件"，而是 contract 状态流转的自然产物

**验证**：走一遍完整流程 `in_progress → review_pending → code-reviewer → review-passed → completed → commit`

### 场景 3: 查一个版本做了哪些事，一目了然

**当前痛点**：要看 v1.3.9 的完整工作，需要手动翻 `docs/contracts/` 目录靠文件名和记忆匹配。没有版本 → contract 的反向索引。

**改后效果**：
- 打开 v1.3.9/README.md，底部「关联 Contract」列出所有属于该版本的 contract
- 每个 contract 有日期、状态、一句话范围
- 反过来，打开任意 contract 看头部 `> 版本: v1.3.9`，直接知道属于哪个迭代

**验证**：v1.3.9 关联表覆盖所有 v1.3.9 时期的 contract → v1.4.0 同样 → v1.4.1 同样

### 场景 4: 状态全局一致，不再打架

**当前痛点**：v1.3.0 总表写 `✅ 完成`，子目录 README 写 `待规划`。不知道信哪个。

**改后效果**：
- `docs/versions/README.md` 总表是唯一状态真相源
- 子目录 README 的状态标记必须与总表一致
- v1.4.2 完成后新增规则：修改子目录状态时，必须同步验证总表

**验证**：遍历所有活跃 version，总表状态 = 子目录 README 状态

### 场景 5: 文档密度可预期

**当前痛点**：v1.4.0 有 5 个文件 ~5000+ 行，v1.3.9 目录不存在，信息密度严重不均衡。不知道一个新版本应该有哪些文档。

**改后效果**：
- v1.4.0 从 5 个文件精简到 4 个（合并场景文档，保留有独立价值的 change-impact-map）
- v1.3.9 有最小目录（README + 关联 Contract 表）
- 后续版本有明确的文件数量预期：README + design.md（可选）+ 任务文件 + 场景文档（可选）≤ 4

**验证**：v1.4.0 目录下只有 4 个文件 → v1.3.9 目录存在且内容完整 → 无幽灵版本目录

### 场景覆盖验证

5 个需求场景 vs 6 个结构问题：

| 结构问题 | 覆盖场景 |
|----------|----------|
| 1. 双向链路断裂（31% contract缺版本号，15% version缺反向引用） | 场景 1 + 场景 3 |
| 2. 状态三层打架（总表 vs 子目录 README 矛盾） | 场景 4 |
| 3. 幽灵版本（v1.3.9 无目录，v1.3.8 只存在于 contract） | 场景 5 |
| 4. Contract 状态无受控词汇（in_progress/in-progress/draft 混用） | 场景 1 + 场景 2 |
| 5. 文档密度严重不均（v1.4.0 ~5000行 vs 部分版本 1 文件） | 场景 5 |
| 6. 废弃目录未清理（v1.4.0-archived/） | 场景 5 |

**结论：6/6 结构问题被至少一个场景覆盖。**

### 验收标准 → 场景对照

| 验收标准 | 验证场景 | 度量方式 |
|----------|----------|----------|
| 13 个 contract 的 `version` 字段非空 | 场景 1 | `grep -L "版本:" docs/contracts/*.md` 返回空 |
| 13 个 contract 的 `status` 在受控词汇集合内 | 场景 1 | 逐一检查 status 值 ∈ {draft, confirmed, in_progress, review_pending, completed} |
| 活跃 version README 底部有关联 Contract 列表 | 场景 3 | v1.3.9/v1.4.0/v1.4.1 README 含「关联 Contract」段 |
| v1.4.0-archived/ 已删除 | 场景 5 | `ls docs/versions/v1.4.0-archived/` 不存在 |
| v1.3.9 目录存在，关联 contract 正确 | 场景 5 | 目录含 README.md + 关联表覆盖 4 个 contract |
| v1.3.0 README 状态与总表一致 | 场景 4 | 子目录 status = `✅ 完成` = 总表 status |
| v1.4.0 文档 5 → 4 个 | 场景 5 | `ls docs/versions/v1.4.0/` 文件数 = 4 |
| CLAUDE.md 包含 contract 创建/结项/review_pending 规则 | 场景 1 + 场景 2 | 新增 3 条规则可被 grep 定位 |
| 无 CRITICAL 或 HIGH 级别的遗漏 | 全部 | code-reviewer 审查通过 |

## Contract 规范 Schema

```markdown
# Contract: <short-description>

> 日期: YYYY-MM-DD
> 状态: draft | confirmed | in_progress | review_pending | completed
> 类型: Business Task | Platform Task
> 版本: vX.Y.Z
```

- Blockquote 风格（与 9/13 的历史 contract 一致）
- `版本` 字段必填；hotfix 可用 `> 版本: —`
- `状态` 必须使用受控词汇

### Version README 关联 Contract 段模板

```markdown
## 关联 Contract

| Contract | 日期 | 状态 | 范围 |
|----------|------|------|------|
| [YYYY-MM-DD-<slug>](../../contracts/YYYY-MM-DD-<slug>.md) | YYYY-MM-DD | completed | <一句话范围> |
```

位置：README 底部，`---` 分隔符之前。

## review_pending 实操设计

**问题**：`review_pending` 在状态机中定义了，但 13 个 contract 中 0 个使用。它应该是连接"代码写完"和"可以 commit"的关键环节。

**设计**：

```
开发完成 → Contract 状态: review_pending
         → 触发 code-reviewer agent
         → 审查通过 → 创建 .claude/review-passed（含 staged diff hash）
         → Contract 状态: completed
         → pre-commit hook 验证 hash → 允许 commit
```

**规则**：
- Contract 从 `in_progress` → `review_pending` 时，**必须**运行 code-reviewer agent
- 审查通过后 contract 才能 `review_pending` → `completed`
- pre-commit hook 在 `review-passed` hash 匹配时放行（已有机制）
- AI 在 CLAUDE.md 的指导下自动执行此流程

**与现有 hook 的关系**：`scripts/pre-commit-review-check.sh` 已存在，检查 `.claude/review-passed` 的 hash。`review_pending` 状态补上了 contract 层面的语义——让状态机真正反映代码的审查状态，而不是让 `review-passed` 成为凭空出现的文件。

## 功能清单

### 1. Contract 规范化
- [x] Contract frontmatter 统一为 blockquote 风格规范 Schema
- [x] 补齐 13 个 contract 的 `version` 字段
- [x] 统一 13 个 contract 的 `status` 为受控词汇
- [x] 关闭已完成但状态未更新的 contract

### 2. Version 反向引用
- [x] 每个活跃 version 的 README 底部增加「关联 Contract」段
- [x] v1.4.0 作为模板示范

### 3. 清理与一致化
- [x] v1.3.8 contract 归入 v1.3.9（决策 1）
- [x] 为 v1.3.9 创建最小目录（README + 关联 Contract 表）
- [x] 删除 v1.4.0-archived/（审计后可删）
- [x] 统一 versions/README.md 为唯一状态真相源
- [x] 修正 v1.3.0 README 状态矛盾（`待规划` → `✅ 完成`）

### 4. v1.4.0 文档精简
- [x] 合并 `scenario-analysis.md` + `business-scenarios.md` → `user-scenarios.md`
- [x] 保留 `change-impact-map.md` 独立（决策 2）
- [x] 目标：5 → 4 个文件

### 5. 规则沉淀
- [x] CLAUDE.md 增加 Contract 创建规范（version 必填、status 受控词汇）
- [x] CLAUDE.md 增加版本结项规则（关联 contract 全部 completed）
- [x] CLAUDE.md 增加 `review_pending` 与 pre-commit hook 联动规则

## 不做

- 不给已结项的老版本（v1.1.0 ~ v1.3.5）补 contract 反向链接
- 不建自动化校验脚本（Phase 2/3 的事）
- 不改变现有 API 或业务逻辑
- 不动 `sessions/` 目录结构

## 验收标准

- [x] 13 个 contract 的 `version` 字段非空
- [x] 13 个 contract 的 `status` 在受控词汇集合内
- [x] 活跃 version README（v1.3.7, v1.3.9, v1.4.0, v1.4.1）底部有关联 Contract 列表
- [x] v1.4.0-archived/ 已删除
- [x] v1.3.9 目录存在，关联 5 个 contract
- [x] v1.3.0 README 状态与总表一致（`✅ 完成`）
- [x] v1.4.0 文档 5 → 4 个（README + design + user-scenarios + change-impact-map）
- [x] CLAUDE.md 包含 3 条 v1.4.2 沉淀规则（Contract 创建/结项/review_pending）
- [x] 无 CRITICAL 或 HIGH 级别的遗漏

## 关联 Contract

| Contract | 范围 | 状态 |
|----------|------|------|
| (待创建) | Contract 规范化：frontmatter 统一 + 补齐 version/status | — |
| (待创建) | 清理：v1.3.9 目录 + v1.4.0-archived 删除 + v1.3.0 状态修正 | — |
| (待创建) | v1.4.0 文档精简：5 → 4 个文件 | — |
| (待创建) | CLAUDE.md 规则沉淀 + review_pending 实操 | — |

---

*创建于: 2026-05-11*
*架构评审: 2026-05-11, architect + 迭代沟通 agent*
