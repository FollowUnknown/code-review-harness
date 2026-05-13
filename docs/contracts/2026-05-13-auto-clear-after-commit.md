# Contract: git commit 后自动 /clear 上下文

> 日期: 2026-05-13
> 状态: draft
> 类型: Platform Task
> 版本: v1.4.7

## 背景

当前开发闭环缺少"提交后自动清理"的机制。每次 git commit 成功后，上下文仍然残留上一轮任务的状态，导致：

- AI 继续在旧上下文基础上推理，容易产生**上下文继承误判**（把新任务误当作旧任务的延续）
- 用户需要手动 `/clear` 才能干净地开始下一轮
- 违反了 CLAUDE.md 红线第 9 条（Contract 不可越界延续）

需要建立"commit → 自动清理 → 准备好下一轮"的闭环。

## 方案

```
git commit (任何方式)
  └→ post-commit hook
       └→ 写入 .claude/.commit-signal (commit hash + timestamp + session 文件路径)

下一轮对话启动 / PreToolUse 检测到信号
  └→ AI 执行收尾:
       1. session 记录追加（完成项 + Contract 归档）
       2. active-tasks.md 同步
       3. 提示用户 /clear（或自动触发）
       4. 删除信号文件
```

## 范围

1. **git post-commit hook**：commit 成功后写入信号文件
2. **CLAUDE.md 红线第15条**：新增"commit 后自动清理"规则
3. **会话启动检测规则**：检测 `.claude/.commit-signal` 并引导清理
4. **安装脚本**：`scripts/install-hooks.sh` 安装 hooks 路径

## 不做

- 不自动执行 `/clear`（需用户确认，避免丢失未保存状态）
- 不改动已有 PreToolUse/PostToolUse hook 逻辑
- 不影响非 git 场景（如纯文档编辑）

## 影响文件

| 文件 | 改动 |
|------|------|
| `scripts/hooks/post-commit` | **新增** — git post-commit hook，写入 `.claude/.commit-signal` |
| `scripts/install-hooks.sh` | **新增** — 安装 hooks 路径 (`git config core.hooksPath scripts/hooks`) |
| `CLAUDE.md` | 新增红线第15条（commit 后自动 /clear 清理） |

## 验收标准

1. `git commit` 成功后，`.claude/.commit-signal` 文件生成（含 commit hash 和 timestamp）
2. CLAUDE.md 中有明确的规则描述 AI 检测到信号后的行为
3. `scripts/install-hooks.sh` 一键安装 hooks 路径
4. 不影响已有 pre-commit hook（`pre-commit-review-check.sh`）
5. 不影响已有的 PostToolUse hook

## 不做的

- 不修改已有 hooks（`pre-commit-review-check.sh`、`auto-record-session.sh` 等）
- 不做自动 `/clear` 执行，只做信号检测 + 引导
