# v1.1.0 Implementation Tasks

> 状态说明：⬜ 待开始 | 🔄 进行中 | ✅ 完成 | ❌ 阻塞 | ⏭ 跳过
> 周期: 2026-04-28 ~ 2026-05-09

---

## Week 1: Execution 层基础设施

### TASK-001: 创建 Execution 目录结构
- **状态**: ✅
- **优先级**: P0
- **依赖**: 无
- **描述**:
  - 创建 `sessions/execution/` 目录及子目录 `runs/`、`repairs/`、`checkpoints/`
  - 添加 `.gitkeep` 保持目录结构
  - 创建 README 说明目录用途和文件规范
- **验收**:
  - [ ] 目录结构就位
  - [ ] README 说明清晰

### TASK-002: 定义 Run 记录格式
- **状态**: ✅
- **优先级**: P0
- **依赖**: TASK-001
- **描述**:
  - 定义 `sessions/execution/runs/{run-id}/plan.json` 格式（RED 阶段证据）
  - 定义 `sessions/execution/runs/{run-id}/implementation.json` 格式（GREEN 阶段证据）
  - 定义 `sessions/execution/runs/{run-id}/review.json` 格式（IMPROVE 阶段证据）
  - 定义 `sessions/execution/runs/{run-id}/artifacts/` 产物目录规范
  - 包含 Phase 4 预埋字段：`extractedForMemory: false`
- **验收**:
  - [ ] JSON Schema 定义完成
  - [ ] 示例文件可解析
  - [ ] `extractedForMemory` 字段存在

### TASK-003: 定义 Repair 记录格式
- **状态**: ✅
- **优先级**: P0
- **依赖**: TASK-001
- **描述**:
  - 定义 `sessions/execution/repairs/{repair-id}/original-review.json` 格式
  - 定义 `sessions/execution/repairs/{repair-id}/fix-plan.json` 格式
  - 定义 `sessions/execution/repairs/{repair-id}/verification.json` 格式
  - 定义 `sessions/execution/repairs/{repair-id}/retry-result.json` 格式
  - 包含 Phase 4 预埋字段：`extractedForKnowledge: false`
- **验收**:
  - [ ] JSON Schema 定义完成
  - [ ] 示例文件可解析
  - [ ] `extractedForKnowledge` 字段存在

### TASK-004: 定义 Checkpoint 记录格式
- **状态**: ✅
- **优先级**: P1
- **依赖**: TASK-001
- **描述**:
  - 定义 `sessions/execution/checkpoints/{checkpoint-id}.json` 格式
  - 支持类型：`contract-state-change`、`agent-switch`、`phase-transition`
  - 包含 Phase 4 预埋字段：`memoryLayer: "task"`
- **验收**:
  - [ ] JSON Schema 定义完成
  - [ ] 支持至少 3 种检查点类型
  - [ ] `memoryLayer` 字段存在

### TASK-005: Execution 记录与 Sessions 集成
- **状态**: ✅
- **优先级**: P0
- **依赖**: TASK-002, TASK-003, TASK-004
- **描述**:
  - 更新 `sessions/active-tasks.md` 格式，增加 `executionRunId`、`executionRepairId` 关联
  - Contract 状态变更时自动生成 Checkpoint
  - Agent 切换时自动写入 Run 阶段记录
- **验收**:
  - [ ] active-tasks.md 可关联到 execution run
  - [ ] Contract 状态变更生成 checkpoint
  - [ ] Agent 切换写入 run 阶段

### TASK-006: 更新 CLAUDE.md 会话机制规则
- **状态**: ✅
- **优先级**: P1
- **依赖**: TASK-005
- **描述**:
  - 在 CLAUDE.md 会话机制中增加 Execution 记录规则
  - 规则：写了/改了代码 → 记录到 execution/runs/
  - 规则：评审失败修复 → 记录到 execution/repairs/
  - 规则：状态变更 → 记录到 execution/checkpoints/
- **验收**:
  - [ ] CLAUDE.md 包含 Execution 记录规则
  - [ ] AI 对话时自动遵循

### TASK-007: Week 1 端到端验证
- **状态**: ✅
- **优先级**: P0
- **依赖**: TASK-005, TASK-006
- **描述**:
  - 模拟一次完整 Run：plan → implementation → review
  - 验证 Repair 回环：review fail → fix → retry
  - 验证 Checkpoint 自动生成
  - 验证 Phase 4 预埋字段存在且可提取
- **验收**:
  - [ ] 完整 Run 记录生成成功
  - [ ] Repair 回环记录生成成功
  - [ ] Checkpoint 记录生成成功
  - [ ] 所有记录包含 Phase 4 预埋字段

---

## Week 2: Hook 机制增强

### TASK-008: 创建 Hook 能力测试脚本
- **状态**: ✅
- **优先级**: P0
- **依赖**: 无（可 Week 1 并行准备）
- **描述**:
  - 创建 `scripts/test-hook-capability.sh`
  - 功能：记录触发时间、参数、工作目录、环境变量
  - 输出到 `/tmp/hook-test.log`
  - 默认 exit 0（不阻止执行）
- **验收**:
  - [ ] 脚本可执行
  - [ ] 输出日志可读

### TASK-009: 测试 PreToolUse Hook Write/Edit 匹配
- **状态**: ✅
- **优先级**: P0
- **依赖**: TASK-008
- **描述**:
  - 在 `.claude/settings.local.json` 临时添加 Write/Edit matcher
  - 执行 Write 操作，检查 `/tmp/hook-test.log` 是否有记录
  - 执行 Edit 操作，检查 `/tmp/hook-test.log` 是否有记录
  - 记录测试结果
- **验收**:
  - [ ] Write matcher 测试完成（通过/失败）
  - [ ] Edit matcher 测试完成（通过/失败）

### TASK-010: 测试 PreToolUse Hook 阻止执行能力
- **状态**: ✅
- **优先级**: P0
- **依赖**: TASK-009
- **描述**:
  - 配置 Hook `exit 1`，尝试 Write 到测试文件
  - 验证文件是否被阻止创建
  - 配置 Hook `exit 1`，尝试 Edit 测试文件
  - 验证文件是否被阻止修改
- **验收**:
  - [ ] 阻止 Write 测试完成（通过/失败）
  - [ ] 阻止 Edit 测试完成（通过/失败）

### TASK-011: 测试 PreToolUse Hook 上下文获取能力
- **状态**: ✅
- **优先级**: P1
- **依赖**: TASK-009
- **描述**:
  - Hook 脚本中输出 `$@`、`$PWD`、`env`
  - 执行 Write/Edit 后检查日志
  - 确认能否获取被修改的文件路径
- **验收**:
  - [ ] 上下文获取测试完成（通过/失败）
  - [ ] 记录可获取的上下文字段

### TASK-012: 根据 Hook 验收结果选择实现方案
- **状态**: ✅
- **优先级**: P0
- **依赖**: TASK-009, TASK-010, TASK-011
- **结论**: 方案 A — PreToolUse Hook 完整支持 Write/Edit
  - ✅ 匹配：`"Edit|Write"` matcher 正确触发
  - ✅ 阻止：`exit 2` 成功阻止工具执行
  - ✅ 上下文：stdin JSON 包含 tool_name, tool_input.file_path, session_id, cwd
  - ✅ 放行：`exit 0` 正常放行

### TASK-013: 方案 A — 扩展 PreToolUse Hook（条件执行）
- **状态**: ✅
- **优先级**: P0
- **依赖**: TASK-012（方案 A 选中时）
- **条件**: 仅 TASK-012 判定方案 A 时执行
- **描述**:
  - 创建 `scripts/check-contract-before-write.js`
  - 检查当前是否有 confirmed Contract
  - 检查 Write/Edit 目标文件是否在 Contract 范围内
  - 范围外 → exit 1 阻止
  - 范围内 → exit 0 放行
  - 更新 `.claude/settings.local.json` PreToolUse 配置
- **验收**:
  - [ ] Contract 范围内 Write/Edit 正常执行
  - [ ] Contract 范围外 Write/Edit 被阻止
  - [ ] Hook 配置更新到 settings.local.json

### TASK-014: 方案 B — 审计日志 + Stop Hook（条件执行）
- **状态**: ⏭ 跳过（方案 A 选中）
- **优先级**: P0
- **依赖**: TASK-012（方案 B 选中时）
- **条件**: 仅 TASK-012 判定方案 B 时执行
- **描述**:
  - 创建 `scripts/audit-check.js`
  - 扫描 `sessions/execution/` 记录
  - 检查 Write/Edit 操作是否有 Contract 检查记录
  - 生成违规报告
  - 更新 Stop Hook 配置
- **验收**:
  - [ ] audit-check.js 可扫描 execution/ 记录
  - [ ] 可检测到无 Contract 的 Write/Edit 操作
  - [ ] 违规报告格式清晰
  - [ ] Stop Hook 配置更新

### TASK-015: 方案 C — 纯审计 + 人工复盘（条件执行）
- **状态**: ⏭ 跳过（方案 A 选中）
- **优先级**: P1
- **依赖**: TASK-012（方案 C 选中时）
- **条件**: 仅 TASK-012 判定方案 C 时执行
- **描述**:
  - 在 CLAUDE.md 增加自律规则：Write/Edit 前检查 Contract
  - Stop Hook 增加复盘提醒
  - 记录违规到 `sessions/execution/audit/`
- **验收**:
  - [ ] CLAUDE.md 包含自律规则
  - [ ] Stop Hook 包含复盘提醒
  - [ ] 违规记录格式定义

### TASK-016: 更新 harness-plan.md
- **状态**: ✅
- **优先级**: P1
- **依赖**: TASK-012
- **描述**:
  - 将 harness-plan.md 与 README.md 对齐
  - 移除已过时的旧版目标（Agent 上下文管理、Contract 拆分等）
  - 更新为当前 Phase 3 Execution 方向
- **验收**:
  - [ ] harness-plan.md 与 README.md 内容一致

### TASK-017: Week 2 端到端验证
- **状态**: ✅
- **优先级**: P0
- **依赖**: TASK-012 + (TASK-013 或 TASK-014 或 TASK-015)
- **描述**:
  - 验证 Hook 机制生效
  - 尝试一次违规操作，验证是否被拦截/记录/提醒
  - 验证 execution/ 记录与 Hook 机制联动
- **验收**:
  - [ ] Hook 检查拦截至少一次违规操作（方案 A/B）
  - [ ] 或 Hook 提醒至少一次违规操作（方案 C）
  - [ ] 所有记录可查询、可复盘

---

## 跨周验收（v1.1.0 Release Gate）

- [ ] **RG-001**: 一次完整 Run 记录生成（plan → implementation → review）
- [ ] **RG-002**: 一次 Repair 回环完成（review fail → fix → retry）
- [ ] **RG-003**: Hook 机制生效（拦截或记录违规操作）
- [ ] **RG-004**: Phase 4 预埋字段存在（`extractedForMemory`、`extractedForKnowledge`、`memoryLayer`）
- [ ] **RG-005**: 所有记录可查询、可复盘
- [ ] **RG-006**: harness-plan.md 与 README.md 对齐

---

## 任务依赖图

```
TASK-001 (目录结构)
    ├──→ TASK-002 (Run 格式) ──→ TASK-005 (集成) ──→ TASK-006 (CLAUDE.md) ──→ TASK-007 (Week1 验证)
    ├──→ TASK-003 (Repair 格式) ─↗
    └──→ TASK-004 (Checkpoint) ─↗

TASK-008 (测试脚本) ──→ TASK-009 (匹配测试) ──┬──→ TASK-012 (选方案) ──┬──→ TASK-013 (方案A)
    │                                          ├──→ TASK-010 (阻止测试) ┘   ├──→ TASK-014 (方案B)
    │                                          └──→ TASK-011 (上下文测试)    └──→ TASK-015 (方案C)
    │                                                                        │
    └────────────────────────────────────────────────────────────────────────┘
                                                                    │
TASK-012 ──→ TASK-016 (更新 plan)                                    │
TASK-012 + (013/014/015) ──→ TASK-017 (Week2 验证)                  │
                                                                    │
TASK-007 + TASK-017 ──→ Release Gate                                ▼
```
