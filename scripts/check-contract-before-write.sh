#!/bin/bash
# PreToolUse Hook - Contract 检查
# 用途：Write/Edit 前检查是否有对应的 confirmed Contract
# 规则：
#   - sessions/execution/ 目录下的文件 → 放行（Execution 记录本身）
#   - docs/ 目录下的文件 → 放行（文档变更）
#   - scripts/ 目录下的文件 → 放行（脚本变更）
#   - .claude/ 目录下的文件 → 放行（配置变更）
#   - 其他 src/ 文件 → 检查是否有活跃的 Contract（v1.1.0 阶段暂放行，记录审计日志）
# 退出码：0=放行, 2=阻止
# 路径规范：日志中只记录相对路径，不暴露本地绝对路径

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // "unknown"')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')

# 将绝对路径转为相对路径
REL_PATH="${FILE_PATH}"
if [ -n "$CWD" ] && [ -n "$FILE_PATH" ]; then
  REL_PATH="${FILE_PATH#"$CWD"/}"
fi

AUDIT_LOG="${CWD}/sessions/execution/audit.log"

# 如果目标文件就是 audit.log 自身，跳过记录（避免 Hook 写入正在被 Hook 监控的文件）
if [ "$REL_PATH" = "sessions/execution/audit.log" ]; then
  exit 0
fi

# 记录审计日志（只写相对路径）
mkdir -p "$(dirname "$AUDIT_LOG")" 2>/dev/null
echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] ${TOOL_NAME} ${REL_PATH} session=${SESSION_ID}" >> "$AUDIT_LOG"

# 白名单目录（放行）
ALLOWED_PATTERNS=(
  "sessions/execution/"
  "docs/"
  "scripts/"
  ".claude/"
)

for pattern in "${ALLOWED_PATTERNS[@]}"; do
  if echo "$REL_PATH" | grep -q "$pattern"; then
    exit 0
  fi
done

# src/ 文件：v1.1.0 阶段暂放行并记录
# 后续版本将增加 Contract 检查逻辑
echo "[AUDIT] ${TOOL_NAME} on ${REL_PATH} - allowed (v1.1.0 phase: audit-only)" >> "$AUDIT_LOG"
exit 0
