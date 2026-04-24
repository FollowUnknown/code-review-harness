# 实施计划：Harness Superpower 阶段推进

> 来源: `docs/superpowers/specs/2026-04-23-harness-superpower-roadmap.md`
> 创建: 2026-04-23
> 状态: draft

---

## 概览

本计划的目标是让 `harness` 从"写在项目规则里的工作方式"升级为"可独立演进的框架能力"。推进策略分为五个阶段：

1. Session Superpower
2. Orchestration Superpower
3. Execution Superpower
4. Memory Superpower
5. Capability Superpower

原则：

- `harness` 独立推进
- `codeReview` 持续交付业务
- 每个 superpower 都必须先有 spec，再有 plan，再通过 `codeReview` 验证
- 优先建设状态与编排，再抽象记忆与能力治理

---

## Phase 1: Session Superpower 收口

**目标**: 固化会话记录、任务恢复、跨天追踪机制，形成 harness 的状态基础层。

### 步骤

1. **梳理 Session 对象模型**
   - 明确 `Session`、`Task`、`TaskStatus`、`SessionSummary` 四个概念
   - 将"新增 / 进行中 / 已完成 / 已归档"统一成固定状态定义
   - 形成一份轻量状态约定，写回 `session-mechanism-design.md`

2. **补充会话事件分类**
   - 为 session 记录增加最小事件类型建议：
     - `decision`
     - `implementation`
     - `review`
     - `task_update`
     - `knowledge_sync`
   - 约定什么时候必须写入会话记录

3. **收口 `active-tasks.md` 规则**
   - 明确任务命名规则
   - 明确优先级写法
   - 明确跨天迁移规则
   - 明确已归档任务保留策略

4. **补充 Stop hook 校验规则**
   - 现有 hook 只检查"今日总结"
   - 增加对"今日目标"、"任务清单"存在性的约定说明
   - 保持提醒型，不阻断

5. **同步 `CLAUDE.md`**
   - 确认当前会话机制区块与最新 session 规则一致
   - 避免 `docs/` 与 `CLAUDE.md` 两套规则漂移

### 涉及文件

- `docs/superpowers/specs/2026-04-22-session-mechanism-design.md`
- `docs/superpowers/plans/2026-04-22-session-mechanism.md`
- `CLAUDE.md`
- `.claude/settings.local.json`（如需补 hook 说明）

### 验证

- 新开会话时能正确读取 `active-tasks.md`
- 跨天任务能正确从前一天迁移到当天目标
- 会话结束时能自动补出总结和任务状态

---

## Phase 2: Orchestration Superpower 升级

**目标**: 把现有四阶段 harness 升级为可分流、可停点、可扩展的编排协议。

### 步骤

1. **引入任务分流规则**
   - 新增 `Harness Task` 与 `Business Task` 定义
   - 建立关键词和判断标准：
     - 涉及 `session / contract / orchestration / runtime / framework / policy` 的归 harness
     - 涉及 `review / gitlab / knowledge / prompt / plan` 的归业务

2. **定义双轨流程**
   - Business Task:
     - Planning -> Development -> Review -> Commit
   - Platform Task:
     - Contract -> Architecture -> Development -> Evaluation -> Knowledge Sync

3. **补充 Contract 状态机**
   - 明确 `draft -> confirmed -> in_progress -> review_pending -> completed`
   - 定义每个状态允许的下一步动作

4. **升级 `CLAUDE.md` 的 Harness 编排**
   - 从"四阶段通用说明"升级为"双轨编排规则"
   - 明确停点：
     - Contract 确认
     - Architecture 确认
     - Review 确认

5. **更新 framework spec**
   - 在 `harness-framework-design.md` 中补双轨流程和状态流转
   - 明确其作为 Orchestration Superpower 基础规范的定位

### 涉及文件

- `CLAUDE.md`
- `docs/superpowers/specs/2026-04-22-harness-framework-design.md`
- `docs/superpowers/specs/2026-04-23-harness-superpower-roadmap.md`

### 验证

- 任意新任务都能先被正确分类
- `knowledge-platform` 一类任务会走 Platform Task 流程
- 日常功能需求会继续走 Business Task 流程

---

## Phase 3: Execution Superpower 固化

**目标**: 为 Generator / Evaluator 增加执行证据、失败回环和阶段产物约束，让 harness 具备真实执行能力。

### 步骤

1. **补充执行对象模型**
   - 定义 `Run`、`StageRun`、`Artifact`、`VerificationResult`、`ReviewDecision`
   - 先以文档协议形式存在，不急于代码化

2. **升级 Generator 规范**
   - 除 TDD 顺序外，明确每阶段产物：
     - RED：失败测试证据
     - GREEN：通过测试证据
     - IMPROVE：重构说明 + 回归验证
   - 规定验证命令必须留痕

3. **升级 Evaluator 规范**
   - 补充"回到哪个 Grading Criterion 修复"的反馈格式
   - 明确评审不通过后的 repair loop 交接格式

4. **定义 Artifact 清单**
   - 测试结果
   - 关键 diff
   - 评审报告
   - 验证命令输出
   - 重要决策摘要

5. **在 `codeReview` 中选一个迭代做验证**
   - 建议用 `knowledge-platform` 或下一个业务 Contract
   - 按执行证据模板跑完整个回环

### 涉及文件

- `.claude/agents/generator.md`
- `.claude/agents/evaluator.md`
- `docs/superpowers/specs/2026-04-22-harness-framework-design.md`
- 新增：`docs/superpowers/specs/2026-04-23-execution-superpower-design.md`（建议）

### 验证

- 一次完整任务可以留下阶段证据链
- 评审不通过时能明确回到修复点
- 用户无需依赖上下文回忆也能理解执行过程

---

## Phase 4: Memory Superpower 抽象

**目标**: 从 `codeReview` 的知识平台建设中抽出 harness 通用记忆模型。

### 步骤

1. **定义记忆分层**
   - `session memory`
   - `task memory`
   - `project memory`
   - `validated knowledge`

2. **定义记忆治理规则**
   - 自动提取内容不直接等于可信知识
   - 明确 `TEMP / CONFIRMED / DEPRECATED` 的状态流
   - 明确来源、作用域、召回顺序

3. **把 `knowledge-platform-design` 反哺为 Memory Superpower 规范**
   - 提炼其中与业务无关的部分：
     - 写回策略
     - 召回策略
     - 命中追踪
     - 知识状态
   - 把 GitLab/MR 相关语义留在业务实现中

4. **新增 Memory Superpower spec**
   - 将框架层抽象从业务设计中独立出来
   - 形成通用 `Recall Policy` / `Writeback Policy`

5. **同步 `CLAUDE.md` 的 Knowledge Sync 规则**
   - 平台任务完成后，哪些知识要同步到 `docs/`
   - 哪些留在业务数据库

### 涉及文件

- `docs/superpowers/specs/2026-04-23-knowledge-platform-design.md`
- 新增：`docs/superpowers/specs/2026-04-24-memory-superpower-design.md`（建议）
- `CLAUDE.md`

### 验证

- `codeReview` 中的知识平台规则能区分框架层与业务层
- 召回逻辑有明确 scope，不串任务、不串项目
- 自动写回与人工确认边界清楚

---

## Phase 5: Capability Superpower 平台化

**目标**: 建立能力装配与治理模型，为 skill / provider / MCP / approval 提供统一框架。

### 步骤

1. **定义 Capability 对象模型**
   - `Capability`
   - `SkillDescriptor`
   - `ProviderPolicy`
   - `ApprovalRule`
   - `CapabilityRegistry`

2. **梳理现有能力**
   - 当前已有：
     - LLM providers
     - Prompt 管理
     - 认证与权限
   - 未来可能接入：
     - Lanhu MCP
     - 外部 skill
     - 其他 provider

3. **定义 Provider Router 规则**
   - 按任务类型、成本、稳定性、审批要求选择 provider
   - 保持框架层不与某个模型写死

4. **定义 Approval / Sandbox / Policy 边界**
   - 哪些操作要审批
   - 哪些能力只能在特定任务类型中启用
   - 哪些能力属于高风险能力

5. **形成 Capability Registry spec**
   - 先文档化，再考虑是否代码化
   - 不在这个阶段直接做大而全的控制台

### 涉及文件

- 新增：`docs/superpowers/specs/2026-04-24-capability-superpower-design.md`（建议）
- `docs/superpowers/specs/2026-04-23-harness-superpower-roadmap.md`
- `CLAUDE.md`

### 验证

- 对不同任务类型，能说明允许使用哪些能力
- provider 选择有统一原则，而不是写散在业务代码里
- capability 层和业务领域解耦

---

## 推荐执行顺序

```
Phase 1 Session
  ↓
Phase 2 Orchestration
  ↓
Phase 3 Execution
  ↓
Phase 4 Memory
  ↓
Phase 5 Capability
```

并行建议：

- `Phase 1` 与 `codeReview` 业务开发可并行
- `Phase 2` 完成后，再要求新的平台任务统一走双轨编排
- `Phase 3` 与 `knowledge-platform` 可联动验证
- `Phase 4` 依赖 `knowledge-platform` 的业务经验沉淀
- `Phase 5` 放在前四阶段稳定后推进

---

## 与 codeReview 的协作方式

### harness 侧职责

- 定义阶段与流程
- 定义对象模型和协议
- 定义会话、执行、记忆、能力治理规则

### codeReview 侧职责

- 提供真实业务验证场
- 验证 harness 规则是否足够好用
- 将业务中发现的通用模式反哺到 superpower specs

### 协作规则

1. `harness` 改造优先修改 `docs/superpowers/specs/` 和 `CLAUDE.md`
2. `codeReview` 功能迭代优先通过 contract 驱动
3. 发现通用机制时，先上升到 superpower 讨论，再决定是否下沉到业务实现

---

## 最终验收标准

- 存在一条清晰的 harness 路线：Session -> Orchestration -> Execution -> Memory -> Capability
- 每个阶段都有对应的 spec / plan / 验证场
- `CLAUDE.md` 中的 Harness 编排与 superpower 路线一致
- `codeReview` 能继续独立交付，同时作为 harness 的首个业务验证场
