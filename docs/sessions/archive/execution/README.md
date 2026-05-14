# Execution 记录目录

> Phase 3: Execution Superpower - 执行证据与产物沉淀

## 目录结构

```
execution/
├── runs/                        # 每次 "Run" 的执行记录
│   └── {run-id}/
│       ├── plan.json            # RED: 计划阶段证据
│       ├── implementation.json  # GREEN: 实现阶段证据
│       ├── review.json          # IMPROVE: 评审阶段证据
│       └── artifacts/           # 产物文件
├── repairs/                     # 修复回环记录
│   └── {repair-id}/
│       ├── original-review.json # 原始评审结果
│       ├── fix-plan.json        # 修复计划
│       ├── verification.json    # 验证结果
│       └── retry-result.json    # 重试结果
└── checkpoints/                 # 阶段检查点
    └── {checkpoint-id}.json
```

## 命名规范

- **run-id**: `run-{YYYYMMDD}-{NNN}`，如 `run-20260428-001`
- **repair-id**: `repair-{YYYYMMDD}-{NNN}`，如 `repair-20260428-001`
- **checkpoint-id**: `checkpoint-{YYYYMMDD}-{NNN}`，如 `checkpoint-20260428-001`

## 与 Superpower Roadmap 的关系

| 目录 | Superpower Phase | 说明 |
|------|------------------|------|
| `runs/` | Phase 3: Execution | RED/GREEN/IMPROVE 证据留存 |
| `repairs/` | Phase 3: Execution | Review fail → Generator repair 回环 |
| `checkpoints/` | Phase 3: Execution | 阶段状态快照 |

## Phase 4 预埋

v1.2.0 Memory Superpower 将从这些记录中提取记忆：

- `runs/` → 提取 task memory（`extractedForMemory` 字段）
- `repairs/` → 提取 validated knowledge（`extractedForKnowledge` 字段）
- `checkpoints/` → 提取 session/task memory 边界（`memoryLayer` 字段）
