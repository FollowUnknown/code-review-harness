# Contract: Agent 自动触发 — PostToolUse hook 监听 Contract 状态变更

> 日期: 2026-05-13
> 类型: Platform Task
> 版本: v1.4.7
> 状态: completed

## 背景

当前 Agent 触发完全依赖 AI 自觉，没有 hook 层面的保障。CLAUDE.md 规定的 `in_progress → review_pending → code-reviewer agent 自动触发` 流程中，"自动触发"环节缺失。同样，`draft → confirmed` 后也没有提示启动 Generator agent。

排查发现根本原因：hook 系统只有被动防御（阻止无 Contract 的编辑、阻止无 review 的 commit）和日志记录（auto-record-session），没有任何状态变更驱动的 Agent 触发机制。

## 方案

在 PostToolUse 新增一个 hook 脚本 `scripts/check-contract-status.sh`：

- 触发条件：Edit/Write 操作且文件路径为 `docs/contracts/*.md`
- 非阻断型（exit 0），只输出引导提示
- 读取文件中的 `> 状态:` 行，根据状态值输出对应引导

### 状态 → 引导映射

| 状态 | 引导 |
|------|------|
| `draft` | Contract 已创建，建议启动 Planner agent 完善范围 |
| `confirmed` | Contract 已确认，建议启动 Generator agent 开始实现 |
| `review_pending` | ⚠️ 代码待评审，建议启动 code-reviewer agent 审查 |
| `in_progress` | 开发中，继续推进 |
| `completed` | Contract 已归档，建议更新版本记录 |

## 影响文件

| 文件 | 改动 |
|------|------|
| `scripts/check-contract-status.sh` | **新增** — PostToolUse hook，检测 Contract 状态并输出引导 |
| `.claude/settings.local.json` | PostToolUse 中新增 matcher，检测 Edit 且文件路径含 docs/contracts/ |

## 不做

- 不自动执行 Agent（hook 是 bash 脚本，无法直接调用 Agent Tool）
- 不改动已有 hook 脚本逻辑
- 不做 PreToolUse 检测（只做 PostToolUse 提示，不阻断）
- 不涉及 `.claude/review-passed` 机制

## 验收标准

1. 编辑 Contract 文件并设置 `> 状态: review_pending` 后，自动输出"建议启动 code-reviewer agent"提示
2. 编辑 Contract 文件并设置 `> 状态: confirmed` 后，自动输出"建议启动 Generator agent"提示
3. `draft`、`in_progress`、`completed` 状态各有对应引导
4. 编辑非 Contract 文件时不触发该 hook
5. hook 退出码始终为 0（不阻断编辑流程）
