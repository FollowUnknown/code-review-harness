# Harness Superpower 阶段推进方案

> 创建时间: 2026-04-23
> 状态: draft
> 目标: 让 harness 独立迭代，codeReview 作为首个业务验证场持续推进

---

## 1. 定位

当前项目需要同时推进两条主线：

1. **Harness 框架线**：建设可复用的会话、编排、执行、记忆、能力治理框架
2. **CodeReview 业务线**：持续交付代码评审平台能力，验证 harness 是否可用

约束原则：

- harness 负责定义"怎么做事"
- codeReview 负责定义"做什么事"
- 两条线通过 Contract、Session、Review 和 Knowledge Sync 对接
- 不把 GitLab/MR/ReviewReport 等业务概念固化进 harness 核心

---

## 2. Superpower 视角

本项目中的 superpower 不等于业务功能，而是 harness 的可复用能力包。每个 superpower 都满足四个条件：

1. 有清晰的输入输出
2. 可独立演进
3. 可被多个业务项目复用
4. 能在 codeReview 中得到真实验证

当前建议拆为五个 superpower：

| Superpower | 核心问题 | 对应层 |
|------------|----------|--------|
| Session | 长任务如何记录、恢复、跨天延续 | State Layer |
| Orchestration | 任务如何分流、分阶段、停点确认 | Routing / Runtime Policy |
| Execution | 阶段如何被可靠执行、验证、回环修复 | Execution Layer |
| Memory | 知识如何沉淀、召回、分层治理 | Memory Layer |
| Capability | skill / provider / approval 如何装配与治理 | Capability Layer |

---

## 3. 阶段推进总览

```
Phase 1: Session Superpower
    ↓
Phase 2: Orchestration Superpower
    ↓
Phase 3: Execution Superpower
    ↓
Phase 4: Memory Superpower
    ↓
Phase 5: Capability Superpower
```

推荐顺序遵循"先稳状态和编排，再抽象知识和能力"：

- 没有 Session，长任务不可恢复
- 没有 Orchestration，阶段流转依赖人工脑补
- 没有 Execution，流程只是文档而不是运行机制
- 没有 Memory，知识沉淀只能停留在业务技巧
- 没有 Capability，框架无法装配不同 skill/provider

---

## 4. 分阶段设计

### Phase 1: Session Superpower

**目标**

把 Agent 从单轮对话升级成可追踪、可恢复、可跨天延续的长任务会话。

**范围**

- `sessions/active-tasks.md`
- `sessions/YYYY-MM-DD.md`
- 会话摘要与活跃任务聚合
- Stop hook 提醒机制

**输出物**

- Session 文件模板稳定版
- Task 状态定义（新增 / 进行中 / 已完成 / 已归档）
- 会话事件分类规则
- Session Resume 规则

**完成标准**

- 任意跨天任务都能从 `active-tasks.md` 恢复
- 每次会话都能沉淀总结
- 新任务、已完成任务不会丢失
- 历史会话不默认污染当前上下文

**由 codeReview 验证的场景**

- 需求讨论
- 日常任务追踪
- Contract 推进记录

### Phase 2: Orchestration Superpower

**目标**

把四阶段 harness 从流程说明升级为真正的任务编排协议。

**范围**

- Sprint Contract 状态机
- Planner / Generator / Evaluator 角色协作
- 用户确认停点
- 任务分流规则

**关键设计**

任务分为两类：

1. **Business Task**
   - 功能开发、bugfix、局部改造
   - 流程：Planning -> Development -> Review -> Commit
2. **Platform Task**
   - 架构设计、知识平台、运行时升级、编排规则
   - 流程：Contract -> Architecture -> Development -> Evaluation -> Knowledge Sync

**输出物**

- `CLAUDE.md` 的 Harness 编排升级版
- Contract 状态流转定义
- 阶段输入 / 输出 / 停止条件表
- Harness Task / Business Task 判定规则

**完成标准**

- 任意任务都能先分类再进入固定流程
- 每个阶段都有明确产物
- Contract 不再只是文档，而是阶段间唯一协议

**由 codeReview 验证的场景**

- `v2-platform-upgrade`
- `knowledge-platform`
- 日常功能迭代

### Phase 3: Execution Superpower

**目标**

让 harness 不只是规定流程，而是能稳定驱动执行、验证和修复回环。

**范围**

- RED / GREEN / IMPROVE 证据要求
- Review fail -> Generator repair 回环
- 验证命令和执行记录
- Artifact 产物沉淀

**建议抽象对象**

- `Run`
- `StageRun`
- `Artifact`
- `VerificationResult`
- `ReviewDecision`

**输出物**

- Generator / Evaluator 增强规范
- 阶段证据模板
- 失败重试与修复规则
- 验证命令约定

**完成标准**

- 每个阶段都有证据链
- 评审失败可回到明确阶段修复
- 执行过程可复盘，而非只看最终代码

**由 codeReview 验证的场景**

- TDD 开发流程
- 代码评审回环
- 评审不通过后的修复重跑

### Phase 4: Memory Superpower

**目标**

把"知识沉淀"从业务技巧抽象成 harness 的通用记忆能力。

**范围**

- 记忆分层
- 知识写回策略
- 召回策略
- 来源可信度与状态流

**建议分层**

1. `session memory`：当前会话临时状态
2. `task memory`：某份 Contract 的上下文
3. `project memory`：项目规则、约定、背景
4. `validated knowledge`：已确认、可复用知识

**输出物**

- Memory 模型文档
- Recall Policy
- Writeback Policy
- Scope / Status / Source 规则

**完成标准**

- 自动抽取内容不直接等于可信知识
- 知识召回有作用域，不串项目和任务
- 业务项目可以复用记忆机制，而不是复制业务实现

**由 codeReview 验证的场景**

- 评审知识库
- Prompt 注入
- TEMP -> CONFIRMED 的知识治理

### Phase 5: Capability Superpower

**目标**

把 skill、MCP、provider、approval 等能力装配成可治理的框架层能力。

**范围**

- Skill Registry
- Provider Routing
- MCP / 外部能力挂载
- Approval / Sandbox / Policy

**建议抽象对象**

- `Capability`
- `SkillDescriptor`
- `ProviderPolicy`
- `ApprovalRule`
- `CapabilityRegistry`

**输出物**

- Capability Registry 设计
- Provider Router 策略
- 安全与审批边界
- 能力分类和挂载规则

**完成标准**

- Harness 可以按任务装配能力
- 不同业务项目可以使用不同能力组合
- 框架层不和具体 provider/skill 写死耦合

**由 codeReview 验证的场景**

- LLM provider 切换
- Prompt 管理
- 未来的 Lanhu MCP / 其他集成能力

---

## 5. 与现有文档的映射

| 文档 | 角色 | 对应阶段 |
|------|------|----------|
| `2026-04-22-session-mechanism-design.md` | 会话状态基础 | Phase 1 |
| `2026-04-22-harness-framework-design.md` | 编排协议基础 | Phase 2 |
| `2026-04-22-review-iteration-design.md` | 业务验证场 | Phase 3 / Phase 4 |
| `2026-04-23-knowledge-platform-design.md` | 记忆治理验证场 | Phase 4 |

---

## 6. 对 codeReview 的约束

为了保证 harness 独立演进，codeReview 侧遵循以下规则：

1. `codeReview` 只实现业务领域能力，不在业务代码中再发明自己的通用流程框架
2. 业务级大迭代必须先有 Contract，再进入开发
3. 涉及架构、知识、运行时升级的任务，必须走 Platform Task 流程
4. 业务中沉淀出来的通用机制，优先回写到 superpowers specs，而不是只留在实现代码里

---

## 7. 推荐落地顺序

### 近两周

- 收口 Session Superpower
- 升级 `CLAUDE.md` 的 Harness 编排
- 明确 Harness Task / Business Task 双轨分流

### 接下来一个月

- 固化 Execution Superpower
- 在 codeReview 中验证 repair loop、阶段证据、artifact 留存

### 中期

- 将知识平台建设抽象为 Memory Superpower
- 再往上推进 Capability Registry 和 Provider Policy

---

## 8. 不在本次范围内

- 独立仓库拆分
- 通用 UI 平台
- 多 Agent 并行调度引擎
- 跨项目统一权限中心
- 完整的 MCP 生态治理
