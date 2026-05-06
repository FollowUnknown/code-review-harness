#!/bin/bash
# PostToolUse Hook - 自动记录编辑到 session 文件
# 用途：Edit/Write src/ 文件后，自动在当天 session 追加记录
# 退出码：始终 0（不阻断，只记录）

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // "unknown"')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')

# 将绝对路径转为相对路径
REL_PATH="${FILE_PATH}"
if [ -n "$CWD" ] && [ -n "$FILE_PATH" ]; then
  REL_PATH="${FILE_PATH#"$CWD"/}"
fi

# 只记录 src/ 文件
if ! echo "$REL_PATH" | grep -q "^src/"; then
  exit 0
fi

TODAY=$(date +%Y-%m-%d)
SESSION_FILE="${CWD}/sessions/${TODAY}.md"

# 如果 session 文件不存在，提醒但不阻断
if [ ! -f "$SESSION_FILE" ]; then
  echo ""
  echo "⚠️  自动记录跳过: sessions/${TODAY}.md 不存在"
  echo "   建议创建 session 文件以跟踪变更"
  exit 0
fi

NOW=$(date +%H:%M)

# 检查最近 30 秒内是否已有相同文件的记录（去重）
if grep -q "${REL_PATH}" "$SESSION_FILE" 2>/dev/null; then
  # 已有该文件记录，不重复追加
  exit 0
fi

# 在"会话记录"区块后追加一条
# 找到 ## 会话记录 后的最后一个 ### 条目，在其后追加
TEMP_FILE=$(mktemp)
AWK_SCRIPT="
/^## 会话记录/ { recording=1 }
recording && /^## / && !/^## 会话记录/ { recording=0 }
recording && /^### / { last_section=NR }
{ print }
END {
  if (last_section > 0) {
    # 不追加，只标记提醒
  }
}
"

# 简化：直接在文件末尾（## 今日总结 之前）追加
# 用 sed 在 ## 今日总结 前插入
if grep -q "## 今日总结" "$SESSION_FILE"; then
  sed -i '' "/^## 今日总结/i\\
\\
### ${NOW} - [auto] ${REL_PATH}\
- ${TOOL_NAME} on src/ 文件（自动记录）\
" "$SESSION_FILE"
else
  # 没有 今日总结 区块，追加到末尾
  echo "" >> "$SESSION_FILE"
  echo "### ${NOW} - [auto] ${REL_PATH}" >> "$SESSION_FILE"
  echo "- ${TOOL_NAME} on src/ 文件（自动记录）" >> "$SESSION_FILE"
fi

echo "📝 自动记录: sessions/${TODAY}.md ← ${REL_PATH}"

exit 0
