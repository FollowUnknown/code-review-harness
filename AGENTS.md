# CodeReview 项目规则

> 本文件为每次对话自动加载的底线规则。详细规范见 docs/ 目录。

---

## 红线（任何情况不可违反）

1. **改之前必须先建 Contract** — 任何 `src/` 下的代码变更（新增/修改/删除），无论多小，先创建 Contract 明确范围再动手。没有"小改动不值得建 Contract"的豁免。即使是一行删除、一个变量改名、一段顺手清理，也必须先建 Contract
2. **高风险路径专项审查** — SQL、配置文件、密钥、权限相关改动必须单独审查
3. **proposal 边界不对就废弃重来** — 第一版 proposal 通常只是草案，不要硬着头皮执行
4. **审查步骤必须分离** — verify、review、架构审查、SQL 审查各司其职，不能混在一起
5. **隐性约定必须记录** — 发现口头约定或业务隐含规则，立即写入 `docs/architecture/implicit-contracts.md`
6. **禁止硬编码密钥** — 密码、token、API key 必须走环境变量或密钥管理
7. **数据库变更红线** — 禁止 DROP TABLE、DELETE 无 WHERE、TRUNCATE 等破坏性 SQL；禁止删除 .db 文件；ALTER TABLE 必须经过审查；数据库路径必须用环境变量，不允许依赖 cwd
8. **Agent 流程不可跳过** — 任何 `src/` 下的代码变更，无论大小，必须走完整三阶段：Planner(创建Contract → 停等确认) → Generator(TDD实现 → 停等确认) → Evaluator(对照Contract评审 → 停等确认)。跳过任何阶段直接写代码视为违规
9. **Contract 不可越界延续** — 每个 Contract 只覆盖明确声明的范围。上下文继承/对话压缩后，新出现的需求（即使是原任务的衍生问题）必须创建新 Contract，不得以"同一轮任务"为由直接追加改动。紧急问题可走简化 Contract（标注 hotfix 类型、最小范围），但不能跳过
10. **语言优先级** — 除代码和专有名词外，所有内容必须使用**简体中文 (zh-CN)**。禁止输出完整英文句子，技术解释须翻译为中文，仅保留专有名词（如 API, Mutex, LLM）。禁止输出无意义的客套话
11. **状态闭环红线** — 任何创建持久记录（review、job、checkpoint）的操作，必须保证**所有异常退出路径都更新最终状态**。审查方法：列出所有 `res.end()` / `return` 的退出点，逐一确认是否更新了关联记录的状态。遗漏任何一个退出路径的状态更新视为违规

12. **旧数据兼容红线** — 任何涉及读取旧数据格式的 Contract，必须包含：① 旧数据样本（构造方式或真实数据路径）；② 兼容测试用例（至少 1 条旧格式 + 1 条新格式）；③ 降级行为说明（数据不完整时展示什么）。缺少任何一项视为 Contract 不完整

13. **DB Migration 红线** — DB 结构变更（建表、ALTER TABLE、加列、修 FK）必须使用带版本号的 Migration 文件，不得手动插入 `initialize()` 函数链或直接修改 `.db` 文件结构。Migration 文件必须可重入（重复执行不报错）

14. **Session 闭环红线** — Contract 状态变更或代码提交后，必须在当天 session 文件的"会话记录"区块追加记录并同步更新 `active-tasks.md`。禁止出现"代码已提交但 session/active-tasks 无记录"或"Contract 已 completed 但 session 未归档"的状态漂移。对话结束时自动生成"今日总结"并更新所有待办状态

15. **提交后自动清理红线** — git commit 成功后，post-commit hook 会在 `.Codex/.commit-signal` 写入提交记录。下一轮对话启动时，AI 必须：
    ① 检测 `.Codex/.commit-signal` 是否存在
    ② 如存在，读取内容并引导清理：追加 session 记录、同步 active-tasks.md
    ③ 提示用户 `/clear` 开始新任务
    ④ 完成后删除信号文件
    禁止跳过清理流程直接进入新任务

---
## 当前阶段：Phase 2

> 强制 Agent 流程 + PreEdit 拦截。任何 src/ 变更不可绕过 Contract → 实现 → 评审。

- **强制**走 Planner → Generator → Evaluator 三阶段，不允许跳过
- 改动前 Planner 先创建 Contract，明确范围、验收标准、不改边界
- PreEdit hook 拦截直接编辑 `src/` 的行为，检查是否有 confirmed/in_progress 状态的 Contract
- 每个阶段完成后**必须暂停**，等用户说"继续"才能进入下一阶段
- 关键决策、隐性约定持续沉淀到 `docs/`
- 会话过程写入 `sessions/`，保证任务、上下文和结论可追溯
---

## 会话机制

AI 每次对话自动遵循以下规则，记录会话内容和任务清单。

**规则 1：对话开始时**
1. 读取 `sessions/active-tasks.md`（了解当前待办）
2. 读取 `sessions/YYYY-MM-DD.md`（当天文件，如存在）
3. 当天文件不存在时，基于模板创建，从 active-tasks.md 填写"今日目标"
4. **检测提交信号** — 检查 `.Codex/.commit-signal` 是否存在：
   - 如存在，按红线第15条执行清理流程
   - 如不存在，正常继续

**规则 2：关键节点记录任务**
满足以下任一条件时，在当天 session 的"会话记录"区块追加一条，同步更新 active-tasks.md：
- 写了/改了代码
- 做出了技术决策
- 产生了新任务或完成任务
- 发现了隐性约定

**重要：会话中产出的任务只记录不自动执行，等用户说"开始"才动手。**

**规则 3：对话结束时**
1. 生成"今日总结"
2. 新产生的任务同步到 active-tasks.md
3. 已完成的任务从 active-tasks.md 移除（标记归档）

**上下文控制：只读当天 session + active-tasks.md。历史文件按需 grep。**

### 会话文件模板

```markdown
# YYYY-MM-DD 会话

## 今日目标
<!-- AI 从 active-tasks.md 读取待办，填写这里 -->

## 会话记录
<!-- 关键节点实时追加 -->

### HH:MM - [事件标题]
- 做了什么
- 决策/结论
- 产出文件

## 任务清单
### 新增
- [ ] TASK-NNN: 描述 (P0/P1/P2)

### 进行中
- [ ] TASK-NNN: 描述 (Pn, 来自 YYYY-MM-DD)

### 已完成
- [x] TASK-NNN: 描述

## 今日总结
<!-- 对话结束时 AI 自动生成 -->
- 完成了什么
- 未完成/待跟进
- 新产生的任务（已同步到 active-tasks.md）
```

---

## Harness 编排

所有中大型任务先走 `Contract`，再进入对应编排流。每个阶段完成后**主动暂停**，等用户说"继续"。

### 任务分流

先判断任务类型，再选择流程：

- **Business Task**：功能开发、bugfix、局部改造、测试补充
- **Platform Task**：架构设计、知识平台、运行时升级、编排规则、会话机制、能力治理

判断优先级：

1. 涉及 `session / contract / orchestration / runtime / framework / policy / superpower` 的，优先视为 Platform Task
2. 涉及 `review / gitlab / knowledge / prompt / plan / users` 的，优先视为 Business Task
3. 同时命中两类时，按 Platform Task 处理，先做边界和架构确认

### Contract 状态机

所有任务共享以下状态：

- `draft`：刚创建，待用户确认
- `confirmed`：范围已确认，可进入开发
- `in_progress`：正在开发或补设计
- `review_pending`：开发完成，待评审或待用户确认
- `completed`：评审通过，任务结束

状态流转规则：

- `draft -> confirmed`
- `confirmed -> in_progress`
- `in_progress -> review_pending`
- `review_pending -> in_progress`（评审不通过，回到修复）
- `review_pending -> completed`

**Contract 创建规范（v1.4.2 沉淀）**：

创建新 Contract 时必须：
- 文件名：`docs/contracts/YYYY-MM-DD-<slug>.md`
- 采用 blockquote 风格 frontmatter，必须包含以下字段：

```markdown
# Contract: <简短描述>

> 日期: YYYY-MM-DD
> 状态: draft | confirmed | in_progress | review_pending | completed
> 类型: Business Task | Platform Task
> 版本: vX.Y.Z
```

- `版本` 必填，hotfix 可用 `> 版本: —`
- `状态` 必须使用受控词汇（`draft` / `confirmed` / `in_progress` / `review_pending` / `completed`）

**review_pending → pre-commit hook 联动规则（v1.4.2 沉淀）**：

```
in_progress → review_pending  →  code-reviewer agent 自动触发
                                    ↓
                              审查通过 → .Codex/review-passed 写入 hash
                                    ↓
                              completed → git commit（hook 验证 hash）
```

- Contract 状态 `in_progress → review_pending` 时，**必须**触发 code-reviewer agent
- 审查通过后创建 `.Codex/review-passed`（`git diff --cached | md5 > .Codex/review-passed`）
- `scripts/pre-commit-review-check.sh` 自动验证 hash，匹配后放行 commit
- Contract 状态 `review_pending → completed` 在 commit 成功后更新

**版本结项规则（v1.4.2 沉淀）**：

- 版本标记 `✅ 完成` 前，必须确认该版本所有关联 contract 的 status 均为 `completed`
- 版本 README 底部必须有「关联 Contract」段，列出所有属于该版本的 contract
- `docs/versions/README.md` 总表是唯一状态真相源，子目录 README 状态必须与总表一致

### Business Task 流程

#### 阶段 1: Planning（Planner Agent）

1. 切换到 Planner 角色（参考 `.Codex/agents/planner.md`）
2. 理解需求，创建 Sprint Contract → `docs/contracts/YYYY-MM-DD-<task>.md`
3. 明确范围、Grading Criteria、文件影响范围
4. 展示 Contract 给用户，等待确认
5. 用户确认后，Contract 状态改为 `confirmed`

#### 阶段 2: Development（Generator Agent）

1. 切换到 Generator 角色（参考 `.Codex/agents/generator.md`）
2. 读取 `confirmed` Contract，状态改为 `in_progress`
3. 按 TDD 流程开发：RED → GREEN → IMPROVE
4. 测试全部通过后展示代码与验证结果，等待确认
5. 进入评审前，Contract 状态改为 `review_pending`

#### 阶段 3: Review（Evaluator Agent）

1. 切换到 Evaluator 角色（参考 `.Codex/agents/evaluator.md`）
2. 对照 Contract 的 Grading Criteria 逐项评分
3. 输出评审报告（通过/不通过）
4. 不通过时回到阶段 2 修复，Contract 状态回退为 `in_progress`
5. 通过后展示报告，等待确认

#### 阶段 4: Commit

1. 确认无 CRITICAL/HIGH 问题
2. git commit（conventional commits 格式）
3. Contract 状态改为 `completed`
4. 更新当天会话记录

### Platform Task 流程

#### 阶段 1: Contract（Planner Agent）

1. 创建平台级 Contract，明确背景、范围、边界、不做内容
2. 标记影响文档、影响模块、验证场
3. 展示 Contract 给用户，等待确认
4. 确认后，Contract 状态改为 `confirmed`

#### 阶段 2: Architecture

1. 先补架构与对象模型，再进入实现
2. 至少明确：对象、状态流、作用域、接口边界、文档影响范围
3. 需要时更新：
   - `docs/architecture/`
   - `docs/versions/{v}/design.md`（对应版本的设计文档）
   - 对应 contract
4. 架构确认后进入开发，Contract 状态改为 `in_progress`

#### 阶段 3: Development（Generator Agent）

1. 基于已确认的 Contract + Architecture 落地
2. 优先实现协议、规则、最小验证场
3. 完成后展示改动与验证结果
4. 进入评审前，Contract 状态改为 `review_pending`

#### 阶段 4: Evaluation（Evaluator Agent）

1. 对照 Contract 检查边界、规则一致性、文档同步情况
2. 对照实现检查是否可被业务项目复用
3. 不通过时回到 Development 修复，Contract 状态回退为 `in_progress`
4. 通过后等待用户确认

#### 阶段 5: Knowledge Sync

1. 将通用结论回写到 `docs/versions/{v}/design.md` 或相关 architecture 文档
2. 更新会话记录、活跃任务和相关计划
3. 如需提交代码或文档，最后将 Contract 状态改为 `completed`

### 停点规则

以下节点必须主动暂停：

1. Contract 创建完成后
2. Platform Task 的 Architecture 完成后
3. Development 完成后
4. Review / Evaluation 完成后

### Agent 规范

- Planner：`.Codex/agents/planner.md`
- Generator：`.Codex/agents/generator.md`
- Evaluator：`.Codex/agents/evaluator.md`

---

## 知识组织

```
docs/sessions/                   # 会话机制（运营日志）
├── active-tasks.md          # 跨天活跃任务汇总
├── YYYY-MM-DD.md            # 每日会话记录
└── archive/                 # 归档（history/memory/execution）

docs/                            # 项目知识（参考型）
├── contracts/
│   └── YYYY-MM-DD-<task>.md  # Sprint Contract（需求合同）
├── versions/
│   ├── README.md              # 版本迭代概览
│   └── {v}/                   # 版本级聚合
│       ├── README.md          # 版本规划（目标、验收、风险）
│       ├── design.md          # 详细设计 spec
│       └── tasks.md           # 任务拆解
├── architecture/
│   ├── index.md              # 项目架构总览
│   └── implicit-contracts.md # 隐性业务约定
├── product/
│   └── index.md              # 产品规则
└── standards/
    ├── testing.md             # 测试规范
    └── database.md            # 数据库规范
```

**规则：AGENTS.md 只做导航，知识放 docs/。AGENTS.md 超过 150 行说明知识没拆对。**

---

## 自检（每次变更后快速过一遍）

- [ ] 改之前有没有走 Planner → Contract → 停等确认？
- [ ] 改之前有没有说清楚范围？
- [ ] 有没有碰到高风险路径？碰了有没有专项审查？
- [ ] 改完有没有走 Evaluator 评审？
- [ ] 改完有没有验证实现和意图一致？
- [ ] 有没有混入非本次变更范围的改动？
- [ ] 有没有发现新的隐性约定需要记录？
- [ ] Contract 状态是否正确流转到 completed？
- [ ] 版本相关文档改动后，`docs/versions/README.md` 是否同步更新？

---

## 阶段升级条件

| 升级到 | 触发条件 | 新增约束 |
|--------|----------|----------|
| Phase 1 | 功能开始稳定，需要管"改了什么" | OpenSpec 轻量版 + verify |
| Phase 2 | 进入迭代模式，需要自动化 | hooks + skills + 自动检查 |
| Phase 3 | 多人协作 | reviewer 子代理 + 完整 OpenSpec |
