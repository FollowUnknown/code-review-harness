# 活跃任务汇总

> 从各 session 文件聚合。AI 每次对话只读本文件了解当前待办。
> Execution 集成：任务可关联 execution run/repair，记录在 executionRunId/executionRepairId 字段。

## 按优先级

### P0 — 紧急
- [x] V110-001~007: Week 1 全部完成 (来源: 2026-04-28, v1.1.0) → **✅ 已完成**
- [x] V110-008: 创建 Hook 能力测试脚本 (来源: 2026-04-28, v1.1.0) → **✅ 已完成**
- [x] V110-009: 测试 PreToolUse Hook Write/Edit 匹配 → **✅ 通过** (`Edit|Write` matcher 生效)
- [x] V110-010: 测试 PreToolUse Hook 阻止执行能力 → **✅ 通过** (`exit 2` 阻止成功)
- [x] V110-011: 测试 PreToolUse Hook 上下文获取能力 → **✅ 通过** (stdin JSON 含 file_path/session_id)
- [x] V110-012: 根据 Hook 验收结果选择实现方案 → **✅ 方案 A 选中**
- [x] V110-013: 方案 A — 扩展 PreToolUse Hook → **✅ 已完成** (check-contract-before-write.sh)
- [x] V110-014~015: 方案 B/C → **⏭ 跳过**
- [x] V110-016: 更新 harness-plan.md → **✅ 已完成**
- [x] V110-017: Week 2 端到端验证 → **✅ 已完成**

### P1 — 重要
- [ ] TASK-002: OpenCodeServer 本地源码扫描（第二期，来源: 2026-04-22）→ **已映射到 v1.3.0**
- [ ] TASK-003: 前端组件测试补充（来源: 2026-04-22）→ **已映射到 v1.0.0**
- [ ] TASK-004: 用户管理模块 — 管理员邀请成员、角色管理、用户列表页（来源: 2026-04-23）→ **已映射到 v1.1.5**

### 版本迭代规划

| 版本 | 周期 | 核心目标 | Superpower Phase | 状态 |
|------|------|----------|------------------|------|
| [v1.1.0](../docs/versions/v1.1.0/README.md) | 04/28-05/09 | Execution 层补充 | Phase 3 Execution | 🔵 开发中 |
| [v1.1.5](../docs/versions/v1.1.5/README.md) | 待定 | 用户管理与分配 | Phase 3 (补充) | ⚪ 待启动 |
| [v1.2.0](../docs/versions/v1.2.0/README.md) | 待定 | Memory 记忆系统 | Phase 4 Memory | ⚪ 待启动 |
| [v1.3.0](../docs/versions/v1.3.0/README.md) | 待定 | Capability 基础 | Phase 5 (基础) | ⚪ 待启动 |
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
