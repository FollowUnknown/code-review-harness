# v1.1.0 - Execution 层补充与强制机制增强

> 版本周期: 2026-04-28 ~ 2026-05-09（2周）
> 状态: 规划中
> 前置: Phase 1 Session ✅, Phase 2 Orchestration ✅
> 目标: 补充 Phase 3 Execution，增强现有 Hook 机制

---

## 背景分析

### 现有机制（已验证可用）

| 机制 | 位置 | 状态 | Superpower Phase |
|------|------|------|------------------|
| Sessions | `sessions/` | ✅ 运行中 | Phase 1: Session |
| Contracts | `docs/contracts/` | ✅ 文件存在 | Phase 2: Orchestration |
| Agents | `.claude/agents/` | ✅ 定义完成 | Phase 2: Orchestration |
| PreToolUse Hook | `.claude/settings.local.json:29-40` | ⚠️ 只拦截 git commit | Phase 3: Execution（部分） |
| Stop Hook | `.claude/settings.local.json:41-60` | ✅ 检查会话总结 | Phase 1: Session |

### 缺失的 Phase 3 Execution 能力

根据 `2026-04-23-harness-superpower-roadmap.md` Phase 3 定义：

| 能力 | 状态 | 说明 |
|------|------|------|
| RED/GREEN/IMPROVE 证据要求 | ❌ 缺失 | 无证据留存机制 |
| Review fail → Generator repair 回环 | ❌ 缺失 | 评审失败后无自动修复流程 |
| Artifact 产物沉淀 | ❌ 缺失 | 无阶段产物保存 |
| PreToolUse 拦截 Write/Edit | ❌ 缺失 | 当前只拦截 git commit |

---

## v1.1.0 目标

### 目标 1: 补充 Phase 3 Execution 核心能力（Week 1）

基于现有 Sessions 机制扩展：

```
sessions/
├── YYYY-MM-DD.md                    # 已有：每日会话记录
├── active-tasks.md                  # 已有：活跃任务
└── execution/                       # NEW: Phase 3 Execution 证据
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

### 目标 2: 增强 Hook 机制（Week 2）

#### PreToolUse Hook 验收计划边界

**当前状态（从 `settings.local.json` 发现）**：
```json
"PreToolUse": [
  {
    "matcher": "Bash(git commit*)",  // ← 只匹配工具名
    "hooks": [{ "command": "bash scripts/pre-commit-review-check.sh" }]
  }
]
```

**验收边界定义**：

| 测试项 | 预期 | 验收标准 |
|--------|------|----------|
| 匹配 `Write` 工具 | ❓ 未知 | 尝试 `"matcher": "Write(**/*)"`，验证是否触发 |
| 匹配 `Edit` 工具 | ❓ 未知 | 尝试 `"matcher": "Edit(**/*)"`，验证是否触发 |
| 匹配工具时获取上下文 | ❓ 未知 | 测试脚本能否获取被修改的文件路径 |
| 阻止工具执行（exit 1） | ❓ 未知 | 测试 exit 1 是否能阻止 Write/Edit 执行 |
| 返回值给 Claude | ❓ 未知 | 测试 stdout/stderr 是否能被 Claude 接收 |

**验收策略（Week 2 Day 1-2）**：

```bash
# 测试脚本：scripts/test-hook-capability.sh
#!/bin/bash
echo "Hook triggered at $(date)" >> /tmp/hook-test.log
echo "Args: $@" >> /tmp/hook-test.log
echo "PWD: $PWD" >> /tmp/hook-test.log
ls -la >> /tmp/hook-test.log 2>&1 || echo "ls failed" >> /tmp/hook-test.log
# 不退出 1，观察是否能继续执行
exit 0
```

```json
// settings.local.json 测试配置
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write(**/*)",
        "hooks": [{ "command": "bash scripts/test-hook-capability.sh write" }]
      },
      {
        "matcher": "Edit(**/*)", 
        "hooks": [{ "command": "bash scripts/test-hook-capability.sh edit" }]
      }
    ]
  }
}
```

**验收结果处理**：

| 结果 | 处理方案 |
|------|----------|
| Write/Edit Hook 可触发且能阻止执行 | ✅ 方案 A：扩展 PreToolUse Hook 到 Write/Edit |
| Write/Edit Hook 可触发但不能阻止执行 | ⚠️ 方案 B：Hook 记录 + Stop Hook 事后检查 |
| Write/Edit Hook 不可触发 | ❌ 方案 C：纯审计日志 + 人工复盘 |

**方案 A: 扩展 PreToolUse Hook（验收通过时）**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write(**/*)|Edit(**/*)",
        "hooks": [
          {
            "type": "command",
            "command": "node scripts/check-contract-before-write.js"
          }
        ]
      }
    ]
  }
}
```

**方案 B: 审计日志 + 事后检查（验收部分通过或失败时）**


由于 Hook 可能不支持 Write/Edit，强化审计机制：

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "node scripts/audit-check.js"
          }
        ]
      }
    ]
  }
}
```

`audit-check.js` 功能：
- 扫描 `sessions/execution/` 中的记录
- 检查是否有 Write/Edit 操作但没有 Contract 检查记录
- 生成违规报告

---

## v1.1.0 与 Superpower Roadmap 映射

| v1.1.0 内容 | Superpower Phase | 对应 Roadmap 章节 |
|------------|------------------|-------------------|
| `sessions/execution/runs/` | Phase 3: Execution | 4.3 Execution Superpower - Run/StageRun/Artifact |
| `sessions/execution/repairs/` | Phase 3: Execution | 4.3 - Review fail → Generator repair 回环 |
| `sessions/execution/checkpoints/` | Phase 3: Execution | 4.3 - 阶段检查点 |
| PreToolUse Hook 扩展 | Phase 3: Execution | 4.3 - RED/GREEN/IMPROVE 证据要求 |
| Stop Hook 审计检查 | Phase 3: Execution | 4.3 - 验证命令和执行记录 |
| 现有 Sessions 复用 | Phase 1: Session | 4.1 - Session 文件模板、Task 状态定义 |
| 现有 Contracts 复用 | Phase 2: Orchestration | 4.2 - Contract 状态流转定义 |
| 现有 Agents 复用 | Phase 2: Orchestration | 4.2 - Planner/Generator/Evaluator 角色 |

---

## 验收标准

### Week 1: Execution 层基础设施

- [ ] `sessions/execution/` 目录结构创建完成
- [ ] Run 记录格式定义完成（plan/implementation/review/artifacts）
- [ ] Repair 记录格式定义完成（original-review/fix-plan/verification/retry-result）
- [ ] Checkpoint 记录格式定义完成
- [ ] 与现有 Sessions 机制集成完成（自动写入 execution/ 子目录）

### Week 2: Hook 机制增强

- [ ] 验证 PreToolUse Hook 是否支持 Write/Edit 匹配
- [ ] 如果支持：扩展 Hook 到 Write/Edit
- [ ] 如果不支持：强化 Stop Hook 审计检查
- [ ] audit-check.js 脚本完成：扫描 execution/ 记录，检测违规
- [ ] 违规报告生成和输出完成

### 跨周验收

- [ ] 一次完整的 Run 记录生成（从 plan 到 review）
- [ ] 一次 Repair 回环完成（review fail → fix → retry）
- [ ] Hook 检查拦截至少一次违规操作
- [ ] 所有记录可查询、可复盘

---

## 关键依赖与风险

### 依赖

1. **PreToolUse Hook 能力边界** - 是否支持 Write/Edit 匹配
2. **Sessions 机制稳定性** - 现有 `sessions/` 机制是否可扩展
3. **存储空间** - `sessions/execution/` 可能产生大量记录

### 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| PreToolUse 不支持 Write/Edit | 高 |  fallback 到 Stop Hook 审计检查；提前验证 Hook 能力 |
| execution/ 记录过多 | 中 | 定期归档或清理；只保留最近 N 次 Run |
| 与现有 Sessions 机制冲突 | 中 | 小范围测试；逐步迁移；保留回滚方案 |
| Hook 执行失败但不阻塞 | 中 | 脚本添加严格错误处理；失败时明确退出非 0 |

---

## 附录：与现有机制的集成点

### 复用现有 Sessions 机制

```typescript
// 现有：sessions/active-tasks.md
// 扩展：自动关联 execution/run-{id}

interface ActiveTask {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed';
  // NEW: 关联到 Execution Run
  executionRunId?: string;
  executionRepairId?: string;
}
```

### 复用现有 Contracts 机制

```typescript
// 现有：docs/contracts/YYYY-MM-DD-{task}.md
// 扩展：Contract 状态变更自动记录到 execution/checkpoint-{id}

interface Contract {
  id: string;
  status: 'draft' | 'confirmed' | 'in_progress' | 'review_pending' | 'completed';
  // NEW: 变更历史自动写入 execution/checkpoints/
  checkpointIds: string[];
}
```

### 复用现有 Agents 机制

```typescript
// 现有：.claude/agents/{planner,generator,evaluator}.md
// 扩展：Agent 切换时自动记录 Run 阶段

interface AgentRun {
  agentType: 'planner' | 'generator' | 'evaluator';
  runId: string; // 关联到 execution/runs/{run-id}
  phase: 'plan' | 'implement' | 'review';
}
```

---

## PreToolUse Hook 验收计划边界

### 当前已知约束

从 `settings.local.json` 已验证：
- ✅ Hook 机制存在且可配置
- ✅ `matcher` 支持工具名匹配（如 `Bash(git commit*)`）
- ⚠️ `Write`/`Edit` 工具是否可被匹配 **未验证**
- ❓ Hook 是否能阻止工具执行（exit 1 是否生效）**未验证**
- ❓ Hook 是否能获取工具调用的上下文（如文件路径）**未验证**

### 验收测试计划（Week 2 Day 1-2）

**测试 1: Write/Edit 工具匹配能力**
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write(**/*)",
        "hooks": [{ "command": "echo 'Write hook triggered' >> /tmp/hook-test.log" }]
      },
      {
        "matcher": "Edit(**/*)",
        "hooks": [{ "command": "echo 'Edit hook triggered' >> /tmp/hook-test.log" }]
      }
    ]
  }
}
```
**通过标准**: 执行 Write/Edit 后 `/tmp/hook-test.log` 有记录

**测试 2: 阻止工具执行能力**
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write(**/test-block.txt)",
        "hooks": [{ "command": "exit 1" }]
      }
    ]
  }
}
```
**通过标准**: 尝试 Write 到 `test-block.txt` 时操作被阻止

**测试 3: 获取上下文能力**
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write(**/*)",
        "hooks": [{ "command": "env > /tmp/hook-env.log" }]
      }
    ]
  }
}
```
**通过标准**: `/tmp/hook-env.log` 中包含文件路径等上下文信息

### 验收结果处理

| 测试结果 | 处理方案 | 影响 |
|---------|---------|------|
| 测试 1+2+3 全部通过 | **方案 A**: 扩展 PreToolUse Hook 到 Write/Edit，实现硬拦截 | 最大保障，可阻止违规操作 |
| 测试 1 通过，2 不通过 | **方案 B**: Hook 记录审计日志 + Stop Hook 事后检查，无法阻止但可发现 | 中等保障，事后追责 |
| 测试 1 不通过 | **方案 C**: 纯审计日志 + 人工复盘，依赖 AI 自觉和事后检查 | 最小保障，依赖自律 |

---

## Memory Superpower (Phase 4) 和 Capability Superpower (Phase 5) 的体现

### 在 v1.1.0 中的定位

v1.1.0 的核心目标是 **补充 Phase 3 Execution**，不直接实现 Phase 4 Memory 和 Phase 5 Capability，但为它们奠定基础：

```
Phase 3 Execution (v1.1.0 核心)
    │
    ├── Run/StageRun/Artifact 记录 → 为 Phase 4 提供"记忆原料"
    │
    ├── Repair 回环记录 → 为 Phase 4 提供"模式学习数据"
    │
    └── Checkpoint 检查点 → 为 Phase 4 提供"状态快照"
    │
    ▼
Phase 4 Memory (v1.2.0 或后续)
    │
    ├── 从 Execution 记录中提取知识
    ├── 建立分层记忆（session/task/project/validated）
    └── 实现召回策略和写回策略
    │
    ▼
Phase 5 Capability (v1.3.0 或后续)
    │
    ├── 基于 Memory 构建 Skill Registry
    ├── Provider Routing 策略
    └── Capability Governance
```

### Memory Superpower (Phase 4) 在 v1.1.0 中的预埋

**1. 记忆原料收集（Execution 记录即原始记忆）**

v1.1.0 的 `sessions/execution/` 记录本身就是 Phase 4 的"原始记忆"：

```typescript
// sessions/execution/runs/{run-id}/plan.json
// 这是 Phase 4 的 "task memory" 原料
{
  "runId": "run-20260428-001",
  "contractId": "2026-04-28-story-code-review",
  "phase": "plan",
  "agentType": "planner",
  "timestamp": 1745904000000,
  "content": {
    "scope": "优化 Issues 列表显示...",
    "approach": "添加虚拟滚动...",
    "risks": ["大数据量测试不足"]
  },
  // Phase 4 将提取：scope, approach, risks → 形成 "task memory"
  "extractedForMemory": false  // Phase 4 处理时标记
}
```

**2. 模式学习数据（Repair 记录即错误模式）**

v1.1.0 的 Repair 回环记录为 Phase 4 提供"错误模式学习"数据：

```typescript
// sessions/execution/repairs/{repair-id}/original-review.json
// 这是 Phase 4 的 "validated knowledge" 原料
{
  "repairId": "repair-20260428-001",
  "runId": "run-20260428-001",
  "originalReview": {
    "issues": [{
      "level": "critical",
      "type": "sql-injection",
      "pattern": "string-concatenation-in-query",
      "message": "检测到字符串拼接 SQL"
    }]
  },
  "fix": {
    "approach": "使用参数化查询",
    "before": "db.query('SELECT * FROM users WHERE id = ' + userId)",
    "after": "db.query('SELECT * FROM users WHERE id = ?', [userId])"
  },
  // Phase 4 将提取：sql-injection + string-concatenation → 形成 "validated knowledge"
  "extractedForKnowledge": false  // Phase 4 处理时标记
}
```

**3. 状态快照（Checkpoint 检查点）**

v1.1.0 的 Checkpoint 为 Phase 4 提供"状态恢复"能力：

```typescript
// sessions/execution/checkpoints/{checkpoint-id}.json
// 这是 Phase 4 的 "session memory" 和 "task memory" 边界
{
  "checkpointId": "checkpoint-20260428-001",
  "type": "contract-state-change",
  "fromState": "draft",
  "toState": "confirmed",
  "timestamp": 1745904000000,
  "context": {
    "contractId": "2026-04-28-story-code-review",
    "confirmedBy": "user-explicit-confirmation",
    "scope": "优化 Issues 列表显示"
  },
  // Phase 4 将提取：contract state + scope → 形成 "task memory"
  "memoryLayer": "task"  // Phase 4 处理时分类
}
```

### Capability Superpower (Phase 5) 在 v1.1.0 中的预埋

v1.1.0 为 Phase 5 预埋的是**执行能力基础**：

```
Phase 5 Capability 核心问题：
- Skill Registry：技能如何注册和发现？
- Provider Routing：不同 provider 如何路由？
- Capability Governance：能力如何治理和装配？

v1.1.0 预埋的基础：
- Execution Run 记录 → 展示"什么技能被调用、调用顺序、调用结果"
- Repair 回环记录 → 展示"什么技能失败、如何修复、修复结果"
- Agent 执行记录 → 展示"Planner/Generator/Evaluator 如何协作"

Phase 5 将基于这些记录建立：
- Skill Registry：从 Execution Run 中提取常用技能模式
- Provider Routing：从 Repair 记录中学习最佳 provider 选择
- Capability Governance：从 Agent 协作记录中提炼治理规则
```

---

## 更新后的验收标准

### PreToolUse Hook 验收（Week 2 Day 1-2）

**必做测试**：
- [ ] 测试 1: Write 工具匹配能力（验证 `"matcher": "Write(**/*)"` 是否触发）
- [ ] 测试 2: Edit 工具匹配能力（验证 `"matcher": "Edit(**/*)"` 是否触发）
- [ ] 测试 3: 阻止工具执行能力（验证 `exit 1` 是否能阻止 Write/Edit）
- [ ] 测试 4: 获取上下文能力（验证是否能获取被修改的文件路径）

**测试结果处理**：
- [ ] 全部通过 → 执行方案 A：扩展 PreToolUse Hook 到 Write/Edit
- [ ] 部分通过 → 执行方案 B：Hook 记录 + Stop Hook 事后检查
- [ ] 全部失败 → 执行方案 C：纯审计日志 + 人工复盘

### Phase 4/5 预埋验收（跨 Week 1-2）

- [ ] `sessions/execution/runs/` 记录包含可被 Phase 4 提取的字段（`extractedForMemory`）
- [ ] `sessions/execution/repairs/` 记录包含可被 Phase 4 提取的字段（`extractedForKnowledge`）
- [ ] `sessions/execution/checkpoints/` 记录包含可被 Phase 4 分类的字段（`memoryLayer`）
- [ ] Execution Run 记录展示技能调用顺序（为 Phase 5 Skill Registry 提供数据）
- [ ] Repair 回环记录展示技能失败模式（为 Phase 5 Provider Routing 提供数据）

---

**确认：此方案完整回答了 PreToolUse Hook 验收边界、Phase 4 Memory 和 Phase 5 Capability 的预埋定位。**

