#!/bin/bash
# PreToolUse Hook - Contract + Session 强制检查（阻断型）
# 用途：Write/Edit src/ 文件前，强制要求 session 文件和活跃 Contract
# 规则：
#   - sessions/ docs/ scripts/ .claude/ tests/ 目录 → 放行（不阻断）
#   - src/ 文件 → 检查当天 session + 活跃 Contract → 缺失则阻断
# 退出码：0=放行, 2=阻断

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

# 如果目标文件就是 audit.log 自身，跳过
if [ "$REL_PATH" = "sessions/execution/audit.log" ]; then
  exit 0
fi

# 记录审计日志
mkdir -p "$(dirname "$AUDIT_LOG")" 2>/dev/null
echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] ${TOOL_NAME} ${REL_PATH} session=${SESSION_ID}" >> "$AUDIT_LOG"

# 白名单目录（直接放行，不检查 Contract）
ALLOWED_PATTERNS=(
  "sessions/"
  "docs/"
  "scripts/"
  ".claude/"
  "tests/"
  "node_modules/"
  "dist/"
  "knowledge.db"
)

for pattern in "${ALLOWED_PATTERNS[@]}"; do
  if echo "$REL_PATH" | grep -q "^${pattern}"; then
    exit 0
  fi
done

# 非白名单文件（src/ 等）— 强制检查

# 检查 1: 当天 session 文件必须存在
TODAY=$(date +%Y-%m-%d)
SESSION_FILE="${CWD}/sessions/${TODAY}.md"

if [ ! -f "$SESSION_FILE" ]; then
  echo ""
  echo "❌ BLOCKED — 当天 session 文件不存在"
  echo ""
  echo "  缺少: sessions/${TODAY}.md"
  echo ""
  echo "  请先创建 session 文件，记录本次会话目标。"
  echo "  模板见 CLAUDE.md → 会话文件模板。"
  echo ""
  exit 2
fi

# 检查 2: 活跃 Contract（docs/contracts/ 中有 status: confirmed 或 in_progress）
CONTRACT_DIR="${CWD}/docs/contracts"
if [ -d "$CONTRACT_DIR" ]; then
  ACTIVE_CONTRACT=$(grep -rl "confirmed\|in_progress" "$CONTRACT_DIR"/*.md 2>/dev/null | head -1)
  if [ -n "$ACTIVE_CONTRACT" ]; then
    CONTRACT_NAME=$(basename "$ACTIVE_CONTRACT")
    echo "[AUDIT] ${TOOL_NAME} on ${REL_PATH} - allowed (contract: ${CONTRACT_NAME})" >> "$AUDIT_LOG"
    exit 0
  fi
fi

# 无活跃 Contract — 阻断
echo ""
echo "❌ BLOCKED — 没有活跃的 Contract"
echo ""
echo "  要修改 src/ 文件，需要有状态为 confirmed 或 in_progress 的 Contract。"
echo ""
echo "  操作步骤："
echo "  1. 创建 Contract: docs/contracts/YYYY-MM-DD-<task>.md"
echo "  2. 设置状态为 confirmed"
echo "  3. 重新执行编辑操作"
echo ""
echo "  紧急修复（bugfix/hotfix）可在 Contract 中标记 type: hotfix"
echo ""
exit 2
