#!/bin/bash
# Stop hook: 检查是否有未审查的代码变更
# 安全网 — 会话结束时提醒进行代码审查
set -e
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo ".")"

# 1. 检查未提交的代码变更
STAGED=$(git diff --cached --name-only -- '*.ts' '*.tsx' '*.sql' 2>/dev/null | wc -l | tr -d ' ')
UNSTAGED=$(git diff --name-only -- '*.ts' '*.tsx' '*.sql' 2>/dev/null | wc -l | tr -d ' ')
UNTRACKED=$(git ls-files --others --exclude-standard -- '*.ts' '*.tsx' 2>/dev/null | wc -l | tr -d ' ')

CHANGED=$((STAGED + UNSTAGED + UNTRACKED))

if [ "$CHANGED" -gt 0 ]; then
  echo ""
  echo "=========================================="
  echo "⚠️  CODE REVIEW SAFETY NET TRIGGERED"
  echo "=========================================="
  echo ""
  echo "发现 ${CHANGED} 个未提交的代码文件 (${STAGED} staged, ${UNSTAGED} unstaged, ${UNTRACKED} untracked)"
  echo ""
  echo "请先完成以下步骤再结束会话："
  echo "  1. 使用 Agent(subagent_type=superpowers:code-reviewer) 审查所有变更"
  echo "  2. 修复 CRITICAL 和 HIGH 问题"
  echo "  3. 运行测试确保通过"
  echo "  4. 提交代码"
  echo ""
  echo "变更文件列表："
  git diff --cached --name-only -- '*.ts' '*.tsx' '*.sql' 2>/dev/null | sed 's/^/  [staged] /'
  git diff --name-only -- '*.ts' '*.tsx' '*.sql' 2>/dev/null | sed 's/^/  [modified] /'
  git ls-files --others --exclude-standard -- '*.ts' '*.tsx' 2>/dev/null | sed 's/^/  [new] /'
  echo ""
  echo "=========================================="
  exit 1
fi

# 2. 检查最近的提交是否可能未审查（最近 3 个提交包含 src/ 变更）
RECENT_SRC_COMMITS=$(git log --oneline -5 --name-only -- 'src/**/*.ts' 'src/**/*.tsx' 2>/dev/null | grep '^[a-f0-9]' | head -3)
if [ -n "$RECENT_SRC_COMMITS" ]; then
  echo ""
  echo "ℹ️  最近提交涉及 src/ 代码变更，请确认已审查："
  echo "$RECENT_SRC_COMMITS" | sed 's/^/  /'
  echo ""
fi
