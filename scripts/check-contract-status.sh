#!/bin/bash
# PostToolUse Hook - Contract 状态变更引导
# 用途：Edit/Write docs/contracts/*.md 后，检测状态变更并输出 Agent 引导
# 退出码：始终 0（非阻断，只提示）

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // "unknown"')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')

# 将绝对路径转为相对路径
REL_PATH="${FILE_PATH}"
if [ -n "$CWD" ] && [ -n "$FILE_PATH" ]; then
  REL_PATH="${FILE_PATH#"$CWD"/}"
fi

# 只检测 docs/contracts/ 下的 markdown 文件
if ! echo "$REL_PATH" | grep -q "^docs/contracts/.*\.md$"; then
  exit 0
fi

# 读取文件中的状态行
STATUS_LINE=$(grep "^> 状态:" "$FILE_PATH" 2>/dev/null | head -1)

if [ -z "$STATUS_LINE" ]; then
  exit 0
fi

# 提取状态值
STATUS=$(echo "$STATUS_LINE" | sed 's/^> 状态: *//')

# 读取 Contract 标题
TITLE_LINE=$(grep "^# Contract:" "$FILE_PATH" 2>/dev/null | head -1)
TITLE=$(echo "$TITLE_LINE" | sed 's/^# Contract: *//')
CONTRACT_NAME=$(basename "$REL_PATH")

echo ""
echo "📋 Contract: ${TITLE}"

case "$STATUS" in
  "draft")
    echo "├─ 状态: draft（草稿）"
    echo "└─ 💡 建议: 启动 Planner agent 完善范围和验收标准"
    echo "   Planner: ~/.claude/agents/planner.md"
    ;;
  "confirmed")
    echo "├─ 状态: confirmed（已确认）"
    echo "└─ 💡 建议: 启动 Generator agent 开始实现"
    echo "   Generator: ~/.claude/agents/generator.md"
    ;;
  "in_progress")
    echo "├─ 状态: in_progress（开发中）"
    echo "└─ 💡 开发中，继续推进"
    ;;
  "review_pending")
    echo "├─ 状态: review_pending（待评审）"
    echo "└─ ⚠️  建议: 启动 code-reviewer agent 审查变更"
    echo "   code-reviewer: ~/.claude/agents/code-reviewer.md"
    echo "   审查通过后: git diff --cached | md5 > .claude/review-passed"
    ;;
  "completed")
    echo "├─ 状态: completed（已完成）"
    echo "└─ 💡 建议: 更新版本记录和 active-tasks.md"
    echo "   docs/versions/README.md  ← 状态同步"
    echo "   docs/sessions/active-tasks.md ← 待办移除"
    ;;
  *)
    echo "├─ 状态: ${STATUS}"
    ;;
esac
echo ""

exit 0
