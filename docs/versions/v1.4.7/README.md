# v1.4.7: 提交后自动清理机制

> 状态: ✅ 已完成
> 前置: v1.4.6
> 后置: v2.0.0

## 目标

git commit 成功后自动触发清理流程，消除上下文继承误判，保证每轮对话从干净状态开始。

## 核心改动

1. **git post-commit hook**：commit 成功后写入 `.claude/.commit-signal`（含 commit hash + timestamp）
2. **会话启动检测**：检测信号文件并引导清理（session 记录追加、active-tasks.md 同步、提示 /clear）
3. **安装脚本**：`scripts/install-hooks.sh` 一键配置 hooks 路径

## 关联 Contract

- `2026-05-13-auto-clear-after-commit.md`
