# 版本迭代管理

> 本文档管理 CodeReview 项目的版本迭代规划
> 重点：迭代内容定义 + 具体方案预期


---

## 版本概览

| 版本 | 状态 | 核心主题 | Superpower Phase | 前置 | 后置 |
|------|------|----------|------------------|------|------|
| [v1.1.0](./v1.1.0/README.md) | ✅ 完成 | **Phase 3 Execution 完善** | Phase 3 Execution | 无 | v1.1.5 |
| [v1.1.5](./v1.1.5/README.md) | ✅ 完成 | **用户管理与 Knowledge 审核** | Phase 3 Execution (补充) | v1.1.0 | v1.2.0 |
| [v1.2.0](./v1.2.0/README.md) | ✅ 完成 | **Knowledge 精准召回与评审质量提升** | Phase 4 Memory (CodeReview 侧) | v1.1.5 | v1.2.5 |
| [v1.2.5](./v1.2.5/README.md) | ✅ 完成 | **Harness Memory 分层系统** | Phase 4 Memory (Harness 侧) | v1.2.0 | v1.3.0 |
| [v1.3.0](./v1.3.0/README.md) | ✅ 完成 | **本地代码扫描** | Local Scan | v1.2.5 | v1.3.5 |
| [v1.3.5](./v1.3.5/plan.md) | ✅ 完成 | **文件选择过滤器** | Diff Preview + FileSelector | v1.3.0 | v1.3.6 |
| [v1.3.6](./v1.3.6/README.md) | ✅ 完成 | **知识库闭环 + 评审质量** | Knowledge Loop + Quality | v1.3.5 | v1.3.7 |
| [v1.3.7](./v1.3.7/README.md) | ✅ 完成 | **多技术栈评审** | Tech-stack aware review | v1.3.6 | v1.4.0 |
| [v1.4.0](./v1.4.0/README.md) | ⚪ 待规划 | **Phase 5 Capability 高级** | Phase 5 Capability (高级) | v1.3.0 | v2.0.0 |

---

## 版本关系

### Superpower Phase 依赖链

```
Phase 1: Session Superpower
    │ ✅ 已完成（已有 sessions/ 机制）
    ▼
Phase 2: Orchestration Superpower
    │ ✅ 已完成（已有 CLAUDE.md 双轨编排）
    ▼
Phase 3: Execution Superpower
    │ ✅ v1.1.0 + v1.1.5 完成
    │ 产生执行数据（Run/Repair/Checkpoint）
    ▼
Phase 4: Memory Superpower
    │ v1.2.0 CodeReview 侧：Knowledge 精准召回、评审质量提升
    │ v1.2.5 Harness 侧：4 层记忆、跨会话恢复、Repair→Knowledge 桥接
    ▼
Phase 5: Capability Superpower (v1.3.0 + v1.4.0)
    │ 治理与装配（Skill/Provider/Capability）
    ▼
完整的 Harness 框架
```

### Phase 4 拆分说明

Phase 4 Memory 拆为两个版本，分别服务不同用户价值：

| 版本 | 侧 | 存储 | 用户价值 | 边界 |
|------|-----|------|---------|------|
| v1.2.0 | CodeReview | `knowledge_entries` 表 | 评审更准更一致 | 不做 Harness 编排记忆 |
| v1.2.5 | Harness | `sessions/memory/` 文件 | AI 编排更智能、上下文不丢失 | 评审召回由 v1.2.0 负责，不桥接 knowledge_entries |

**两者完全独立**：Harness Memory 服务 AI 编排（记住"什么方案行不通"），Knowledge 服务 LLM 评审 MR（记住"项目禁止什么模式"）。数据来源、存储、服务场景均不同，不应混入同一存储。

### 版本间数据流转

```
v1.1.0 + v1.1.5 (Execution)
    │ 产生：Run / Repair / Checkpoint
    │ 路径：sessions/execution/
    ▼
v1.2.0 (CodeReview 侧 Memory)
    │ 强化：Knowledge 精准召回、自动沉淀增强、评审质量提升
    │ 新增：代码模式匹配、confidence、指纹去重、Token 预算
    ▼
v1.2.5 (Harness 侧 Memory)
    │ 消费：从 Execution 数据提取 3 层记忆（session/task/project）
    │ 新增：跨会话恢复、记忆升级、TTL 清理
    │ 注意：不桥接到 knowledge_entries，两者完全独立
    ▼
v1.3.0 (Capability 基础)
    │ 基于：v1.2.5 Memory 构建 Skill/Provider/Capability
    ▼
v1.4.0 (Capability 高级)
    │ 增强：版本管理、智能路由、依赖治理
```

---

## 各版本详细文档

| 版本 | 文档 | 内容概要 | Superpower Phase |
|------|------|----------|------------------|
| v1.1.0 | [详细规划](./v1.1.0/README.md) | Execution 层补充：Run/Repair/Checkpoint 记录、PreToolUse Hook | Phase 3 Execution |
| v1.1.5 | [详细规划](./v1.1.5/README.md) | 用户管理、Token 刷新、Knowledge 审核流程 | Phase 3 Execution (补充) |
| v1.2.0 | [详细规划](./v1.2.0/README.md) | Knowledge 精准召回、自动沉淀增强、评审 Prompt 增强、质量可量化 | Phase 4 Memory (CodeReview) |
| v1.2.5 | [规划](./v1.2.5/README.md) · [设计](./v1.2.5/design.md) | 3 层记忆模型、Execution→Memory 提取、跨会话恢复、TTL 清理 | Phase 4 Memory (Harness) |
| v1.3.0 | [详细规划](./v1.3.0/README.md) | Capability 基础：Skill/Provider/Capability Registry、Governor、Sandbox | Phase 5 Capability (基础) |
| v1.4.0 | [详细规划](./v1.4.0/README.md) | Capability 高级：Skill 版本管理、Provider 智能路由、Capability 依赖治理 | Phase 5 Capability (高级) |

---

## 进度记录

### 2026-04-28 完成
- [x] v1.1.5 全部 8 个任务完成（Token 刷新/登出、注册页、用户管理、Knowledge 审核）
- [x] Phase 4 Memory 拆分为 v1.2.0（CodeReview 侧）和 v1.2.5（Harness 侧）
- [x] v1.2.0 README 重写：聚焦 Knowledge 精准召回与评审质量提升
- [x] v1.2.5 README 新建：聚焦 Harness Memory 分层系统
- [x] 版本概览表更新

### 2026-04-27 完成
- [x] v1.1.0 详细需求文档更新完成
- [x] 版本关系图更新完成
- [x] 移除旧 v1.1.5（已合并到后续版本）

### Superpower Phase 映射状态

| Phase | 版本 | 状态 |
|-------|------|------|
| Phase 1: Session | - | ✅ 已完成 |
| Phase 2: Orchestration | - | ✅ 已完成 |
| Phase 3: Execution | v1.1.0 + v1.1.5 | ✅ 完成 |
| Phase 4: Memory | v1.2.0 + v1.2.5 | ✅ 完成 |
| Phase 5: Capability | v1.3.0 + v1.4.0 | ⚪ 待规划 |

---

## 文档约定

每个版本目录 `{v}/` 按需包含以下文件：

| 文件 | 用途 | 何时创建 |
|------|------|---------|
| `README.md` | 版本规划（目标、边界、验收标准、风险） | 版本创建时 |
| `design.md` | 详细设计 spec（架构、Schema、流程） | 复杂版本需要设计文档时 |
| `tasks.md` | 任务拆解与进度跟踪 | 进入 Development 阶段时 |

**规则**：
- `docs/contracts/` 只放 Sprint Contract（需求合同，开发前创建）
- `docs/superpowers/` 已废弃，设计文档统一放 `docs/versions/{v}/design.md`
- 历史归档在 `docs/archive/superpowers/`，不再更新

---

*最后更新: 2026-05-02*
