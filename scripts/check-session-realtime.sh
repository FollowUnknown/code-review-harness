#!/bin/bash
# PostToolUse hook: 实时检查 session 记录
# 在 Edit|Write 操作后调用，确保关键节点被记录

TODAY=$(date +%Y-%m-%d)
SESSION_FILE="sessions/${TODAY}.md"

# 如果 session 文件不存在，提醒创建
if [ ! -f "$SESSION_FILE" ]; then
  echo ""
  echo "⚠️  未找到当天 session 文件: $SESSION_FILE"
  echo "   请创建并记录本次代码修改"
  exit 0  # 不阻塞，仅提醒
fi

# 检查最近 10 分钟内是否有记录
NOW=$(date +%s)
LAST_RECORD=$(grep -E "^### [0-9]{2}:[0-9]{2}" "$SESSION_FILE" | tail -1 | grep -oE "[0-9]{2}:[0-9]{2}")

if [ -n "$LAST_RECORD" ]; then
  LAST_HOUR=${LAST_RECORD%%:*}
  LAST_MIN=${LAST_RECORD#*:}
  LAST_TIME=$((LAST_HOUR * 3600 + LAST_MIN * 60))
  CURRENT_TIME=$(date +%H | sed 's/^0//')
  CURRENT_MIN=$(date +%M | sed 's/^0//')
  CURRENT_TOTAL=$((CURRENT_TIME * 3600 + CURRENT_MIN * 60))

  # 处理跨天情况
  DIFF=$((CURRENT_TOTAL - LAST_TIME))
  if [ $DIFF -lt 0 ]; then
    DIFF=$((DIFF + 86400))
  fi

  # 如果超过 10 分钟没有新记录，提醒
  if [ $DIFF -gt 600 ]; then
    echo ""
    echo "⚠️  已 $((DIFF / 60)) 分钟未更新 session 记录"
    echo "   当前做了代码修改，请在 $SESSION_FILE 中追加记录"
  fi
fi

exit 0
