# 版本迭代管理

> 本文档管理 CodeReview 项目的版本迭代规划
> 重点：迭代内容定义 + 具体方案预期


---

## 版本概览

| 版本 | 状态 | 核心主题 | Superpower Phase | 前置 | 后置 |
|------|------|----------|------------------|------|------|
| [v1.1.0](./v1.1.0/README.md) | 🟡 规划中 | **Phase 3 Execution 完善** | Phase 3 Execution | 无 | v1.1.5 |
| [v1.1.5](./v1.1.5/README.md) | ⚪ 待规划 | **用户管理与分配** | Phase 3 Execution (补充) | v1.1.0 | v1.2.0 |
| [v1.2.0](./v1.2.0/README.md) | ⚪ 待规划 | **Phase 4 Memory 记忆系统** | Phase 4 Memory | v1.1.5 | v1.3.0 |
| [v1.3.0](./v1.3.0/README.md) | ⚪ 待规划 | **Phase 5 Capability 基础** | Phase 5 Capability (基础) | v1.2.0 | v1.4.0 |
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
Phase 3: Execution Superpower (v1.1.0) ◄── 当前版本目标
    │ 产生执行数据（Run/Repair/Checkpoint）
    ▼
Phase 4: Memory Superpower (v1.2.0)
    │ 沉淀为记忆（session/task/project/validated）
    ▼
Phase 5: Capability Superpower (v1.3.0 + v1.4.0)
    │ 治理与装配（Skill/Provider/Capability）
    ▼
完整的 Harness 框架
```

### 版本间数据流转

```
v1.1.0 (Execution Superpower)
    │ 产生：Run 记录 / Repair 记录 / Checkpoint 记录
    │ 路径：sessions/execution/
    ▼
v1.2.0 (Memory Superpower)
    │ 消费：从 v1.1.0 Execution 数据提取 4 层记忆
    │ 产出：session/task/project/validated knowledge
    ▼
v1.3.0 (Capability 基础)
    │ 基于：v1.2.0 记忆构建 Skill/Provider/Capability 基础能力
    │ 产出：Skill Registry / Provider Registry / Capability Registry
    ▼
v1.4.0 (Capability 高级)
    │ 增强：在 v1.3.0 基础上增加高级治理功能
    │ 产出：Skill 版本管理 / Provider 智能路由 / Capability 依赖治理
    ▼
v2.0.0 (知识图谱)
    │ 基于：v1.4.0 产生的全部数据构建知识图谱
    │ 反哺：各版本更智能的评审和治理
```

---

## 各版本详细文档

| 版本 | 文档 | 内容概要 | Superpower Phase |
|------|------|----------|------------------|
| v1.1.0 | [详细规划](./v1.1.0/README.md) | Execution 层补充：Run/Repair/Checkpoint 记录、PreToolUse Hook 验收边界、Phase 4/5 预埋 | Phase 3 Execution |
| v1.2.0 | [详细规划](./v1.2.0/README.md) | Memory 记忆系统：4 层记忆模型、记忆召回/写回、AI 评审质量提升 | Phase 4 Memory |
| v1.3.0 | [详细规划](./v1.3.0/README.md) | Capability 基础：Skill/Provider/Capability Registry、Governor、Sandbox、Execution | Phase 5 Capability (基础) |
| v1.4.0 | [详细规划](./v1.4.0/README.md) | Capability 高级：Skill 版本管理、Provider 智能路由、Capability 依赖治理 | Phase 5 Capability (高级) |

### 已归档版本（旧版规划，仅参考）

| 版本 | 状态 | 说明 |
|------|------|------|
| v1.1.5 | ❌ 已合并 | 用户管理功能已合并到后续版本规划 |

---

## 进度记录

### 2026-04-27 完成
- [x] v1.1.0 详细需求文档更新完成（增加 PreToolUse Hook 验收边界、Phase 4/5 预埋说明）
- [x] v1.2.0 详细需求文档更新完成（增加与 v1.1.0 的数据流转关系）
- [x] v1.4.0 详细需求文档编写完成（Skill 版本管理、Provider 智能路由、Capability 依赖治理）
- [x] 版本关系图更新完成（增加 Superpower Phase 依赖链）
- [x] 版本概览表更新完成（增加 v1.4.0、Superpower Phase 列）
- [x] 移除 v1.1.5（已合并到后续版本）

### Superpower Phase 映射状态

| Phase | 版本 | 状态 |
|-------|------|------|
| Phase 1: Session | - | ✅ 已完成（已有 sessions/ 机制） |
| Phase 2: Orchestration | - | ✅ 已完成（已有 CLAUDE.md 双轨编排） |
| Phase 3: Execution | v1.1.0 + v1.1.5 | 🟡 规划中（当前目标） |
| Phase 4: Memory | v1.2.0 | ⚪ 待规划（依赖 v1.1.5） |
| Phase 5: Capability | v1.3.0 + v1.4.0 | ⚪ 待规划（依赖 v1.2.0） |

### 下一步待确认
- [ ] 用户确认 v1.1.0 详细需求（含 PreToolUse Hook 验收边界）
- [ ] 用户确认 Phase 4/5 预埋策略
- [ ] 确认后进入 Harness Planning 阶段
- [ ] 生成 v1.1.0 的 harness-plan.md

---

*最后更新: 2026-04-27*

## 附录：Superpower Roadmap 与版本映射

### 为什么 Phase 4/5 不在 v1.1.0 实现？

**依赖链关系**：
```
v1.1.0 Execution ──► 产生数据 ──► v1.2.0 Memory 消费数据
     │                                      │
     │ 没有 Execution 数据                    │ 基于 Memory
     │ Memory 无原料可提炼                    │ 构建 Capability
     ▼                                      ▼
  无法实现 ◄────────────────────────────────── 依赖 Memory
```

**具体原因**：

| Phase | 依赖 | 为什么现在不能做 |
|-------|------|-----------------|
| Phase 4 Memory | v1.1.0 Execution 数据 | Memory 需要从 Run/Repair/Checkpoint 记录中提取，没有数据无法提炼记忆 |
| Phase 5 Capability | Phase 4 Memory | Capability 需要基于 Memory 构建 Skill Registry，没有记忆无法治理技能 |

**正确时机**：

| 版本 | Superpower Phase | 启动时机 |
|------|------------------|----------|
| v1.1.0 | Phase 3 Execution | **现在** - 已有基础，只需补充 |
| v1.2.0 | Phase 4 Memory | v1.1.0 稳定并产生足够数据后 |
| v1.3.0 | Phase 5 Capability (基础) | v1.2.0 Memory 系统稳定后 |
| v1.4.0 | Phase 5 Capability (高级) | v1.3.0 Capability 基础稳定后 |