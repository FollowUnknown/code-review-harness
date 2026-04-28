#!/bin/bash
# PreToolUse Hook 能力测试脚本
# 用途：验证 Claude Code PreToolUse Hook 对 Write/Edit 工具的支持
# 上下文：Claude Code 通过 stdin 传入 JSON，包含 tool_name 和 tool_input
# 输出：/tmp/hook-test.log

LOG_FILE="/tmp/hook-test.log"

# 读取 stdin（Claude Code 传入的工具调用上下文）
INPUT=$(cat)

echo "=== Hook Triggered ===" >> "$LOG_FILE"
echo "Time: $(date -u +"%Y-%m-%dT%H:%M:%SZ")" >> "$LOG_FILE"

# 提取工具名
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // "unknown"')
echo "Tool Name: $TOOL_NAME" >> "$LOG_FILE"

# 提取文件路径
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
echo "File Path: $FILE_PATH" >> "$LOG_FILE"

# 提取完整 tool_input
TOOL_INPUT=$(echo "$INPUT" | jq -c '.tool_input // {}')
echo "Tool Input: $TOOL_INPUT" >> "$LOG_FILE"

# 提取 session_id（如果存在）
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
echo "Session ID: $SESSION_ID" >> "$LOG_FILE"

echo "Raw Input: $INPUT" >> "$LOG_FILE"
echo "=== End Hook ===" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"

# exit 0 = 放行, exit 2 = 阻止执行
exit 0
