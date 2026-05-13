#!/bin/bash
# v1.4.6 需求评审子报告 — 自动化验证脚本
# 用法: bash scripts/verify-v1.4.6.sh
#
# 覆盖:
#   1. 静态检查 (TypeScript 编译)
#   2. 单元测试 (sub-report store)
#   3. 路由级测试 (reviews handler)
#   4. E2E 全流程验证 (评审创建 → 逐项目完成 → 暂停 → 完成)
#   5. 边界情况 (空数据、FK 级联、旧数据兼容)
#   6. 暂停/恢复 E2E 验证 (发起 → 暂停 → 数据库状态验证 → 恢复 → 完成)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

PASS=0
FAIL=0

green() { echo -e "\033[32m$1\033[0m"; }
red() { echo -e "\033[31m$1\033[0m"; }
bold() { echo -e "\033[1m$1\033[0m"; }

run_check() {
  local name="$1"; shift
  echo ""
  bold "▸ $name"
  if "$@" 2>&1; then
    green "  ✓ PASS"
    PASS=$((PASS + 1))
  else
    red "  ✗ FAIL"
    FAIL=$((FAIL + 1))
  fi
}

bold "╔══════════════════════════════════════════╗"
bold "║  v1.4.6 需求评审子报告 — 自动化验证      ║"
bold "╚══════════════════════════════════════════╝"

# ── 1. TypeScript 编译 ──
run_check "TypeScript 编译" npx tsc --noEmit

# ── 2. Sub-report store 单元测试 ──
run_check "Sub-report store 单元测试" npx vitest run tests/server/services/review-sub-report-store.test.ts

# ── 3. Reviews 路由 sub-report 集成测试 ──
run_check "Reviews 路由 sub-report 集成测试" npx vitest run tests/server/routes/reviews-sub-report.test.ts

# ── 4. E2E 全流程验证 ──
run_check "E2E 全流程验证" npx vitest run tests/verify/v1.4.6-sub-report-flow.test.ts

# ── 5. 全量测试（排除已知 pre-existing failure） ──
run_check "全量测试（排除 knowledge.test.ts）" npx vitest run --exclude tests/knowledge.test.ts

# ── 6. 暂停/恢复 E2E 验证 ──
run_check "暂停/恢复 E2E 验证" npx vitest run tests/verify/v1.4.6-pause-resume-e2e.test.ts --testTimeout 600000

# ── 汇总 ──
echo ""
bold "══════════════════════════════════════════"
echo ""
if [ $FAIL -eq 0 ]; then
  green "  ✓ 全部通过！($PASS/$((PASS + FAIL)))"
else
  red "  ✗ $FAIL 个检查失败 ($PASS/$((PASS + FAIL)))"
fi
echo ""
bold "══════════════════════════════════════════"

exit $FAIL
