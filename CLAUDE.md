# CodeReview 项目规则

> 本文件为每次对话自动加载的底线规则。详细规范见 docs/ 目录。

---

## 红线（任何情况不可违反）

1. **改之前先说清楚** — 要改什么、为什么改、边界在哪。不允许直接动手写代码
2. **高风险路径专项审查** — SQL、配置文件、密钥、权限相关改动必须单独审查
3. **proposal 边界不对就废弃重来** — 第一版 proposal 通常只是草案，不要硬着头皮执行
4. **审查步骤必须分离** — verify、review、架构审查、SQL 审查各司其职，不能混在一起
5. **隐性约定必须记录** — 发现口头约定或业务隐含规则，立即写入 `docs/architecture/implicit-contracts.md`
6. **禁止硬编码密钥** — 密码、token、API key 必须走环境变量或密钥管理

---

## 当前阶段：Phase 0

> 裸奔但有安全带。保持 vibe coding 流畅度，只加载最低约束。

- 对话式开发，不强制 OpenSpec 流程
- 只保护绝对不能碰的路径（密钥、生产配置）
- 知识边做边沉淀到 docs/
- 项目进入成型期后升级到 Phase 1

---

## 会话机制

AI 每次对话自动遵循以下规则，记录会话内容和任务清单。

**规则 1：对话开始时**
1. 读取 `sessions/active-tasks.md`（了解当前待办）
2. 读取 `sessions/YYYY-MM-DD.md`（当天文件，如存在）
3. 当天文件不存在时，基于模板创建，从 active-tasks.md 填写"今日目标"

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

当用户提出业务需求时，按以下四阶段流程执行。每个阶段完成后**主动暂停**，等用户说"继续"。

### 阶段 1: Planning（Planner Agent）

1. 切换到 Planner 角色（参考 `.claude/agents/planner.md`）
2. 理解需求，创建 Sprint Contract → `docs/contracts/YYYY-MM-DD-<task>.md`
3. 展示 Contract 给用户，等待确认
4. 用户确认后，Contract 状态改为 confirmed

### 阶段 2: Development（Generator Agent）

1. 切换到 Generator 角色（参考 `.claude/agents/generator.md`）
2. 读取 confirmed 的 Contract，按 TDD 流程开发
3. RED → GREEN → IMPROVE 循环
4. 测试全部通过 + 覆盖率 ≥ 80% 后展示代码，等待确认

### 阶段 3: Review（Evaluator Agent）

1. 切换到 Evaluator 角色（参考 `.claude/agents/evaluator.md`）
2. 对照 Contract 的 Grading Criteria 逐项评分
3. 输出评审报告（通过/不通过）
4. 不通过时回到阶段 2 修复，最多循环 2 次
5. 通过后展示报告，等待确认

### 阶段 4: Commit

1. 确认无 CRITICAL/HIGH 问题
2. git commit（conventional commits 格式）
3. Contract 状态改为 completed
4. 更新当天会话记录

### 方法论参考

详见 `docs/methodology.md`（Anthropic harness 方法论）。

### Agent 规范

- Planner: `.claude/agents/planner.md`
- Generator: `.claude/agents/generator.md`
- Evaluator: `.claude/agents/evaluator.md`

---

## 知识组织

```
sessions/                       # 会话机制（运营日志，与 docs/ 分离）
├── active-tasks.md          # 跨天活跃任务汇总
└── YYYY-MM-DD.md            # 每日会话记录

docs/                            # 项目知识（参考型）
├── contracts/
│   └── YYYY-MM-DD-<task>.md  # Sprint Contract
├── methodology.md             # Harness 方法论
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

- [ ] 改之前有没有说清楚范围？
- [ ] 有没有碰到高风险路径？碰了有没有专项审查？
- [ ] 改完有没有验证实现和意图一致？
- [ ] 有没有混入非本次变更范围的改动？
- [ ] 有没有发现新的隐性约定需要记录？

---

## 阶段升级条件

| 升级到 | 触发条件 | 新增约束 |
|--------|----------|----------|
| Phase 1 | 功能开始稳定，需要管"改了什么" | OpenSpec 轻量版 + verify |
| Phase 2 | 进入迭代模式，需要自动化 | hooks + skills + 自动检查 |
| Phase 3 | 多人协作 | reviewer 子代理 + 完整 OpenSpec |
