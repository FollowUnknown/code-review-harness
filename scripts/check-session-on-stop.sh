#!/bin/bash
# Stop hook: 检查当天 session 记录是否完整
# 在 ~/.claude/settings.local.json Stop hooks 中调用

TODAY=$(date +%Y-%m-%d)
SESSION_FILE="docs/sessions/${TODAY}.md"

# 1. 检查 session 文件是否存在
if [ ! -f "$SESSION_FILE" ]; then
  echo ""
  echo "⚠️  SESSION CHECK FAILED"
  echo "   当天 session 文件不存在: $SESSION_FILE"
  echo "   请创建并记录本次会话的关键节点"
  exit 1
fi

# 2. 检查是否有今日总结
if ! grep -q "## 今日总结" "$SESSION_FILE"; then
  echo ""
  echo "⚠️  SESSION CHECK FAILED"
  echo "   $SESSION_FILE 缺少 ## 今日总结 区块"
  echo "   请在总结中记录：完成了什么、未完成项、新产生的任务"
  exit 1
fi

# 3. 检查 active-tasks.md 是否存在
if [ ! -f "docs/sessions/active-tasks.md" ]; then
  echo ""
  echo "⚠️  SESSION CHECK FAILED"
  echo "   docs/sessions/active-tasks.md 不存在"
  exit 1
fi

exit 0
