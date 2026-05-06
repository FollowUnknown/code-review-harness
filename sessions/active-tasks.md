# 活跃任务汇总

> 从各 session 文件聚合。AI 每次对话只读本文件了解当前待办。
> Execution 集成：任务可关联 execution run/repair，记录在 executionRunId/executionRepairId 字段。

## 按优先级

### P0 — 紧急
- [x] V110-001~007: Week 1 全部完成 (来源: 2026-04-28, v1.1.0) → **✅ 已完成**
- [x] V110-008~017: v1.1.0 全部完成 (Hook 测试/方案选择/实现/验证) → **✅ 已完成**
- [x] V120-001: v1.2.0 Contract 确认 → **已完成**
- [x] V120-Phase1: 核心召回 + 沉淀基础 (TASK-201/202/203/205/206)
- [x] V120-Phase2: Prompt 增强 + 反馈闭环 (TASK-204/208/209)
- [x] V120-Phase3: 生命周期 + 质量量化 (TASK-207/210/211)

### P1 — 重要
- [ ] TASK-002: OpenCodeServer 本地源码扫描（第二期，来源: 2026-04-22）→ **已映射到 v1.3.0**
- [ ] TASK-003: 前端组件测试补充（来源: 2026-04-22）→ **已映射到 v1.0.0**
- [ ] TASK-004: 用户管理模块 — 管理员邀请成员、角色管理、用户列表页（来源: 2026-04-23）→ **已映射到 v1.1.5**

### 版本迭代规划

| 版本 | 周期 | 核心目标 | Superpower Phase | 状态 |
|------|------|----------|------------------|------|
| [v1.1.0](../docs/versions/v1.1.0/README.md) | 04/28 | Execution 层补充 | Phase 3 Execution | ✅ 已完成 |
| [v1.1.5](../docs/versions/v1.1.5/README.md) | 04/28 | 用户管理与 Knowledge 审核 | Phase 3 (补充) | ✅ 已完成 |
| [v1.2.0](../docs/versions/v1.2.0/README.md) | 04/28 | Knowledge 精准召回 + 评审质量 | Phase 4 Memory (CodeReview) | ✅ 已完成 (11/11 tasks) |
| [v1.2.5](../docs/versions/v1.2.5/README.md) | 待定 | Harness Memory 分层系统 | Phase 4 Memory (Harness) | ⚪ 待启动 |
| [v1.3.0](../docs/versions/v1.3.0/README.md) | 待定 | Capability 基础 | Phase 5 (基础) | ⚪ 待启动 |
| [v1.3.5](../docs/versions/v1.3.5/plan.md) | 05/02 | 文件选择过滤器 | Diff Preview + FileSelector | ✅ 已完成 |
| [v1.3.6](../docs/versions/v1.3.6/README.md) | 05/06 | 知识库闭环 + 评审质量 | Knowledge Loop + Quality | ✅ 已完成 |
| [v1.3.7](../docs/versions/v1.3.7/README.md) | 05/06 | 多技术栈评审 | Tech-stack aware review | ✅ 已完成 |
| [v1.4.0](../docs/versions/v1.4.0/README.md) | 待定 | Capability 高级 | Phase 5 (高级) | ⚪ 待启动 |

### P2 — 一般
（暂无）

## Execution 关联规范

任务可通过以下字段关联到 Execution 记录：

```yaml
# 示例：任务关联 Execution
- taskId: "V110-005"
  executionRunId: "run-20260428-001"      # 关联到 execution/runs/
  executionRepairId: null                 # 如有修复回环则填写
  checkpointId: "checkpoint-20260428-001"  # 状态变更检查点
```

## 已归档

- [x] TASK-Phase0-1: 定义三代理角色文件 .claude/agents/ (来源: 2026-04-22)
- [x] TASK-Phase0-2: 评审标准具体化 .claude/agents/evaluator.md (来源: 2026-04-22)
- [x] TASK-Phase0-3: Sprint Contract 模板 docs/contracts/ (来源: 2026-04-22)
- [x] TASK-Story-001: Story Code Review 可视化评审 Web 应用 (来源: 2026-04-22)
- [x] TASK-005: Harness Phase 2 编排升级（双轨编排 + Contract 状态机） (来源: 2026-04-23)
