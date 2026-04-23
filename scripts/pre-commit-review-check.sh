#!/bin/bash
# PreToolUse hook: 在 git commit 前强制要求代码审查
# 检查 .claude/review-passed 标记文件，验证其中的 hash 是否匹配当前 staged diff
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo ".")"

MARKER=".claude/review-passed"

if [ ! -f "$MARKER" ]; then
  echo ""
  echo "❌ COMMIT BLOCKED — 代码审查未完成"
  echo ""
  echo "提交前必须完成代码审查："
  echo "  1. 运行 Agent(subagent_type=superpowers:code-reviewer) 审查所有变更"
  echo "  2. 修复所有 CRITICAL 和 HIGH 问题"
  echo "  3. 审查通过后创建标记文件:"
  echo "     git diff --cached | md5 > .claude/review-passed"
  echo "     (未 staged 时: git diff | md5 > .claude/review-passed)"
  echo ""
  echo "当前变更文件："
  git diff --cached --name-only 2>/dev/null | sed 's/^/  /'
  git diff --name-only 2>/dev/null | sed 's/^/  (unstaged) /'
  exit 2
fi

# 标记文件存在，检查 hash 是否匹配
STAGED_HASH=$(git diff --cached 2>/dev/null | md5)
MARKED_HASH=$(cat "$MARKER" 2>/dev/null | head -1)

if [ -z "$STAGED_HASH" ] || [ -z "$MARKED_HASH" ]; then
  echo ""
  echo "❌ COMMIT BLOCKED — 标记文件无效（缺少 hash）"
  echo "请重新创建标记文件: git diff --cached | md5 > .claude/review-passed"
  rm -f "$MARKER"
  exit 2
fi

if [ "$STAGED_HASH" != "$MARKED_HASH" ]; then
  echo ""
  echo "❌ COMMIT BLOCKED — 变更已改变，需重新审查"
  echo ""
  echo "审查时的 hash: $MARKED_HASH"
  echo "当前 staged hash: $STAGED_HASH"
  echo ""
  echo "请重新审查后创建标记: git diff --cached | md5 > .claude/review-passed"
  rm -f "$MARKER"
  exit 2
fi

# hash 匹配，允许 commit 并清除标记（一次性使用）
rm -f "$MARKER"
echo "✅ 代码审查已通过，允许提交。标记文件已清除。"
exit 0
