# Harness 工程提升代码评审能力专题设计

> 日期：2026-04-23
> 状态：draft
> 主题：基于当前 `codeReview` 项目，规划如何通过 harness 工程持续提高代码评审能力

---

## 1. 背景

当前项目已经完成代码评审平台的基础闭环：

- 文件风险分级 + 分批评审
- 需求驱动评审
- 知识库积累
- 评审持久化与继续评审
- Review Plan 批量评审
- LLM 模块抽离与 Prompt 管理

但从工程视角看，这些能力还主要停留在**业务功能层**，尚未完全抽象为 harness 的可复用工程能力。

因此，当前课题不是继续单纯堆功能，而是回答：

**如何通过 harness 工程，把 `codeReview` 从一个"能评审"的业务应用，推进为一个"持续提高评审质量、稳定性、可解释性"的评审运行时样板。**

---

## 2. 课题定义

本专题聚焦两个事项：

1. **Harness 工程主线**
   - 通过会话、编排、执行、记忆、能力治理五类 superpower，提升代码评审系统的稳定性和可复用性
2. **当前未完成任务主线**
   - 将现有未完成任务作为验证场，反向驱动 harness 能力落地，而不是把它们当成孤立需求

最终目标：

- 让 harness 能系统性提高代码评审质量
- 让未完成任务服务于这个目标，而不是分散主线注意力

---

## 3. 当前现状

### 3.1 已具备的评审能力

`codeReview` 已经具备以下能力基础：

- **风险感知**：按文件风险等级决定评审策略
- **需求感知**：评审不仅看 diff，也看需求背景
- **知识感知**：可从历史评审中注入知识
- **过程留痕**：评审结果、LLM 日志、批量评审过程可追踪
- **Prompt 可治理**：Prompt 从硬编码升级为可配置、可管理

这些能力已经证明：项目具备成为 harness 验证场的条件。

### 3.2 仍然缺失的工程能力

从 harness 工程角度，当前真正缺的不是更多页面，而是四类底座能力：

1. **执行证据**
   - 当前编排已存在，但缺少每个阶段的证据链
2. **修复回环**
   - 当前有 review，但缺少明确的 repair loop 协议
3. **知识治理抽象**
   - 当前有 knowledge 业务实现，但尚未上升为 Memory Superpower 规范
4. **能力治理**
   - 当前 provider/prompt 已抽离，但还没有 capability registry 和 policy 模型

---

## 4. 为什么 harness 能提高代码评审

代码评审质量不是靠单次模型调用提升的，而是靠一套工程机制提升的。

### 4.1 从"会不会评"升级到"如何稳定评"

harness 的价值，不在于替代评审逻辑，而在于把评审能力放到稳定运行机制中：

- 会话不中断
- 任务有状态
- 阶段可追踪
- 失败可回环
- 知识可沉淀
- 结果可解释

### 4.2 从"评审结论"升级到"评审系统"

如果没有 harness，评审能力通常只表现为：

- 一次报告
- 一组 issue
- 一次模型响应

而有了 harness，评审能力会扩展成：

- 为什么这样评
- 评审基于什么上下文
- 哪个阶段失败了
- 如何修复后重跑
- 哪些知识被写回
- 哪些能力需要审批或限制

这才是"代码评审工程化"的关键。

---

## 5. 提升代码评审的五个工程方向

### 方向 A：Session Superpower 收口

**要解决的问题**

- 评审任务跨天后上下文容易断裂
- 设计决策、review 结论、后续待办容易散落在聊天中

**对代码评审的提升**

- 能连续追踪一个评审能力课题的演进
- 能从 `active-tasks.md` 恢复未完成评审任务
- 能把评审设计与业务实现关联起来

**当前落地点**

- 统一 `Session / Task / TaskStatus / SessionSummary`
- 补会话事件分类：`decision / review / task_update / knowledge_sync`

### 方向 B：Execution Superpower 固化

**要解决的问题**

- 当前有编排，但没有统一执行证据
- 当前有 review，但没有正式的 repair loop 协议

**对代码评审的提升**

- 评审结论可复盘，不依赖口头解释
- 评审不通过后，能明确回到哪个 criterion 修复
- 让评审从"一次判断"升级为"可迭代纠偏过程"

**当前落地点**

- 定义 `Run / StageRun / Artifact / VerificationResult / ReviewDecision`
- 为 Generator / Evaluator 补证据要求

### 方向 C：Memory Superpower 抽象

**要解决的问题**

- 当前 knowledge 已有业务实现，但知识状态、作用域、可信度尚未平台化

**对代码评审的提升**

- 评审知识不再只是"越积越多"，而是"越积越可信"
- 能避免错误知识污染后续评审
- 能按项目、任务、模块精准召回评审知识

**当前落地点**

- 从 `knowledge-platform` 提炼 Recall Policy / Writeback Policy
- 区分 `TEMP / CONFIRMED / DEPRECATED`

### 方向 D：Capability Superpower 平台化

**要解决的问题**

- 当前 provider 和 prompt 已治理，但 capability 还没统一注册和边界控制

**对代码评审的提升**

- 不同评审任务可按风险和成本选择 provider
- 高风险任务可启用更严格能力策略
- Prompt / MCP / Provider 不再散落在业务实现里

**当前落地点**

- Provider Policy
- Skill / Capability Registry
- Approval / Sandbox 边界

### 方向 E：Review Effectiveness 闭环

**要解决的问题**

- 当前项目有评审能力，但缺少“评审是否真的在变好”的工程闭环

**对代码评审的提升**

- 可以比较不同 prompt、不同 provider、不同 review 策略的效果
- 可以基于真实未完成任务建立验证样本
- 可以为后续 Capability Phase 提供决策依据

**当前落地点**

- 先不做完整评测平台
- 先在 `codeReview` 中建立最小闭环：
  - 阶段证据
  - repair loop
  - knowledge writeback 结果
  - 关键任务复盘

---

## 6. 当前未完成任务如何纳入这个课题

当前项目已有未完成任务，不建议把它们看成独立 backlog，而应看成评审能力提升课题的验证场。

### 6.1 Harness 侧未完成阶段

| 项目 | 当前状态 | 对评审课题的意义 |
|------|----------|------------------|
| Phase 1: Session 收口 | 进行中 | 保证评审任务、设计决策和跟踪闭环 |
| Phase 3: Execution | 待开始 | 是提升评审稳定性和可复盘性的核心 |
| Phase 4: Memory | 进行中 | 是提升评审知识质量的核心 |
| Phase 5: Capability | 待开始 | 是提升评审能力装配和治理的核心 |

### 6.2 codeReview 侧未完成任务

| 任务 | 来源 | 用作什么验证场 |
|------|------|----------------|
| `knowledge-platform` | 业务主线 | 验证 Memory Superpower 是否足够好用 |
| Prompt Preview + prompt tests | V2 Phase 4 尾项 | 验证 Prompt 治理是否可调试、可验证 |
| Review Plan 测试补齐 | V2 Phase 3 尾项 | 验证评审流程的稳定性和可回归性 |
| `TASK-004` 用户管理模块 | active-tasks | 作为 Business Task 验证双轨编排和 Execution 证据 |
| `TASK-003` 前端组件测试补充 | active-tasks | 作为评审质量样本，验证 Review 与测试联动 |
| `TASK-002` OpenCodeServer 第二期 | active-tasks | 作为未来 Capability / 扫描能力验证场 |
| Phase 5 MySQL 迁移 | V2 长尾 | 验证平台在存储替换下是否保持评审行为一致 |

---

## 7. 具体推进计划

### Stage 1：先补执行层，让评审过程可复盘

**目标**

优先完成 `Phase 3: Execution Superpower`，因为当前最缺的是"评审如何稳定执行"而不是更多功能点。

**具体任务**

1. 新增 `execution-superpower` 设计文档
2. 升级 `.claude/agents/generator.md`
3. 升级 `.claude/agents/evaluator.md`
4. 定义最小执行对象模型：
   - `Run`
   - `StageRun`
   - `Artifact`
   - `VerificationResult`
   - `ReviewDecision`
5. 为评审失败场景定义 repair loop 协议

**验证场**

- `TASK-004` 用户管理模块
- Prompt Preview / prompt tests

**完成标准**

- 一次业务任务能留下阶段证据链
- 评审不通过能明确回到修复阶段
- Review 不再只输出"通过/不通过"，而是输出可执行修复信息

### Stage 2：推进 knowledge-platform，把知识提升为评审资产

**目标**

让知识平台不只是一个业务模块，而是 Memory Superpower 的首个落地样板。

**具体任务**

1. 将 `knowledge-platform` 补齐为完整 contract / plan / implementation 路线
2. 定义知识作用域：
   - project
   - module
   - task
   - global convention
3. 定义知识状态流：
   - `TEMP`
   - `CONFIRMED`
   - `DEPRECATED`
4. 定义 Recall Policy / Writeback Policy
5. 明确哪些知识进入 docs，哪些留在业务数据库

**验证场**

- 当前评审知识库
- 历史 review 结果
- Prompt 注入逻辑

**完成标准**

- 自动抽取知识不再直接进入可信知识层
- 评审召回的知识可解释、可追踪来源
- 业务知识和框架知识边界清晰

### Stage 3：补齐 Prompt 与测试尾项，建立最小质量回归

**目标**

利用 V2 尾项把"Prompt 可治理"从配置能力推进到可验证能力。

**具体任务**

1. 完成 Prompt Preview
2. 为 prompt 渲染函数补测试
3. 补齐 Review Plan 相关测试：
   - `plan-store`
   - `exporter`
   - routes integration
4. 把这些测试作为评审能力回归基线

**验证场**

- Phase 4 Prompt 管理尾项
- Phase 3 Review Plan 尾项

**完成标准**

- Prompt 修改后可预览和验证
- Plan 核心能力有自动化回归保护
- 评审能力的关键路径不再只依赖手工验证

### Stage 4：用用户管理模块验证 Business Task 执行链

**目标**

用一个典型业务任务验证：

- Phase 2 双轨编排是否好用
- Phase 3 Execution 证据是否可落地
- review repair loop 是否顺畅

**具体任务**

1. 为 `TASK-004` 创建或补齐 contract
2. 按 Business Task 流程推进：
   - Planning
   - Development
   - Review
   - Commit
3. 用该任务产出完整 artifact 样本

**完成标准**

- 能作为后续业务任务模板复用
- 能为 Execution Superpower 提供第一批真实例子

### Stage 5：为 Capability Phase 留接口，不急着全做

**目标**

在前四步稳定后，再开始 capability 平台化，避免抽象过早。

**具体任务**

1. 梳理 provider 选择规则
2. 梳理未来 MCP / 扫描能力挂载位置
3. 将 `TASK-002 OpenCodeServer 第二期` 作为 Capability 候选验证场

**完成标准**

- 明确 capability registry 要解决什么问题
- 不把扫描、provider、审批逻辑继续写散在业务层

---

## 8. 优先级建议

### Now

- Execution Superpower spec
- `knowledge-platform` 落地方案
- Prompt Preview + prompt tests

### Next

- Review Plan 测试补齐
- `TASK-004` 用户管理模块

### Later

- `TASK-002` OpenCodeServer 第二期
- Phase 5 MySQL 迁移
- Capability Registry

---

## 9. 文件落点建议

本课题推进时，建议按以下文档边界落地：

### specs

- `2026-04-23-harness-code-review-effectiveness-design.md`（本文）
- `2026-04-24-execution-superpower-design.md`（下一步建议新增）
- `2026-04-24-memory-superpower-design.md`（下一步建议新增）

### plans

- 为 Execution / Memory 分别补实施计划

### contracts

- 业务任务继续放在 `docs/contracts/`
- `knowledge-platform` 需补 contract 或将现有设计转为 contract 驱动

---

## 10. 范围边界

本专题聚焦"如何通过 harness 工程提高代码评审能力"。以下不在本次范围内：

- 立即拆分独立仓库
- 完整的多 Agent 并行系统
- 通用可视化运营后台
- 全量 MCP 生态接入
- 提前启动 MySQL 迁移

---

## 11. 结论

对当前项目而言，提升代码评审能力的正确路径不是继续堆更多评审功能，而是：

1. 先补执行层，让评审过程可复盘
2. 再把知识平台抽象为可信记忆机制
3. 再通过测试、Prompt 预览和业务任务建立最小质量闭环
4. 最后再推进 capability 平台化

换句话说：

- `codeReview` 负责交付评审业务能力
- `harness` 负责把这些能力变成稳定、可追踪、可复用的工程系统
- 当前所有未完成任务，都应该围绕这个目标重新编排，而不是各自分散推进
