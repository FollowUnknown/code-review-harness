#!/bin/bash
# Stop hook: 强制检查 session 完整性 + 自动 memory 快照
# 在 ~/.claude/settings.local.json Stop hooks 中调用
# 退出码：0=通过, 1=警告, 2=阻断

TODAY=$(date +%Y-%m-%d)
SESSION_FILE="sessions/${TODAY}.md"
CWD="$(git rev-parse --show-toplevel 2>/dev/null || echo ".")"
ERRORS=""

# ========== 检查 1: Session 文件存在 ==========
if [ ! -f "$SESSION_FILE" ]; then
  echo ""
  echo "❌ SESSION BLOCKED — 当天 session 文件不存在"
  echo "   缺少: sessions/${TODAY}.md"
  echo "   请创建 session 文件后再结束会话。"
  ERRORS="${ERRORS} no-session"
fi

# ========== 检查 2: 今日总结 ==========
if [ -f "$SESSION_FILE" ]; then
  if ! grep -q "## 今日总结" "$SESSION_FILE"; then
    echo ""
    echo "❌ SESSION BLOCKED — 缺少今日总结"
    echo "   请在 sessions/${TODAY}.md 中补充 ## 今日总结 区块。"
    echo "   内容：完成了什么、未完成/待跟进、新产生的任务"
    ERRORS="${ERRORS} no-summary"
  fi

  # 检查总结是否为空（只有模板占位符）
  if grep -q "## 今日总结" "$SESSION_FILE"; then
    SUMMARY_LINE=$(grep -n "## 今日总结" "$SESSION_FILE" | head -1 | cut -d: -f1)
    if [ -n "$SUMMARY_LINE" ]; then
      # 获取总结区块下一行到文件末尾的内容
      CONTENT=$(tail -n +"$((SUMMARY_LINE + 1))" "$SESSION_FILE" | head -5 | tr -d '[:space:]')
      if [ -z "$CONTENT" ] || echo "$CONTENT" | grep -q "待会话结束时生成"; then
        echo ""
        echo "❌ SESSION BLOCKED — 今日总结为空"
        echo "   请在 ## 今日总结 下填写实际内容。"
        ERRORS="${ERRORS} empty-summary"
      fi
    fi
  fi
fi

# ========== 检查 3: active-tasks.md 存在 ==========
if [ ! -f "sessions/active-tasks.md" ]; then
  echo ""
  echo "❌ SESSION BLOCKED — sessions/active-tasks.md 不存在"
  ERRORS="${ERRORS} no-active-tasks"
fi

# ========== 自动操作: Memory 快照 ==========
if [ -f "$SESSION_FILE" ] && [ -d "sessions/memory" ]; then
  # 创建 session memory 快照
  MEMORY_DIR="sessions/memory/session"
  mkdir -p "$MEMORY_DIR" 2>/dev/null

  MEMORY_FILE="${MEMORY_DIR}/${TODAY}.json"
  if [ ! -f "$MEMORY_FILE" ]; then
    # 从 session 文件提取关键信息
    COMPLETED=$(grep -c "^\- \[x\]" "$SESSION_FILE" 2>/dev/null || echo 0)
    PENDING=$(grep -c "^\- \[ \]" "$SESSION_FILE" 2>/dev/null || echo 0)

    cat > "$MEMORY_FILE" << EOF
{
  "date": "${TODAY}",
  "context": "Auto-generated from session file",
  "completedCount": ${COMPLETED},
  "pendingCount": ${PENDING},
  "files": $(git diff --name-only HEAD 2>/dev/null | jq -R -s -c 'split("\n") | map(select(length > 0))'),
  "createdAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF
    echo "📝 Memory 快照已保存: ${MEMORY_FILE}"

    # 更新 stats
    STATS_FILE="sessions/memory/stats.json"
    if [ -f "$STATS_FILE" ]; then
      # 增加会话计数
      python3 -c "
import json
with open('$STATS_FILE') as f: data = json.load(f)
data['sessionCount'] = data.get('sessionCount', 0) + 1
data['lastSessionAt'] = '$(date -u +%Y-%m-%dT%H:%M:%SZ)'
with open('$STATS_FILE', 'w') as f: json.dump(data, f, indent=2)
" 2>/dev/null || true
    fi
  fi
fi

# ========== 最终判定 ==========
if [ -n "$ERRORS" ]; then
  echo ""
  echo "=========================================="
  echo "🚫 会话结束被阻断 (${ERRORS})"
  echo "=========================================="
  echo ""
  echo "  请修复以上问题后再结束会话。"
  echo "  或使用 /exit 强制退出。"
  echo ""
  exit 1
fi

echo ""
echo "✅ Session 检查通过"
echo "   - session 文件: sessions/${TODAY}.md"
echo "   - 今日总结: 已填写"
echo "   - active-tasks.md: 存在"
echo "   - memory 快照: 已保存"
echo ""
exit 0
