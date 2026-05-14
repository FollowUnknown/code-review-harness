#!/bin/bash
# 安装 git hooks 路径
# 用途: 配置 git core.hooksPath 指向 scripts/hooks/，使 post-commit 等 hook 生效
# 用法: bash scripts/install-hooks.sh

set -e

HOOKS_DIR="scripts/hooks"

# 检查 hooks 目录是否存在
if [ ! -d "$HOOKS_DIR" ]; then
  echo "错误: $HOOKS_DIR 目录不存在"
  exit 1
fi

# 确保 hook 脚本可执行
for HOOK in "$HOOKS_DIR"/*; do
  if [ -f "$HOOK" ]; then
    chmod +x "$HOOK"
    echo "  ✓ 设置可执行: $HOOK"
  fi
done

# 配置 git hooks 路径
CURRENT_PATH=$(git config core.hooksPath || echo "")
if [ "$CURRENT_PATH" != "$HOOKS_DIR" ]; then
  git config core.hooksPath "$HOOKS_DIR"
  echo "  ✓ core.hooksPath 已设置为: $HOOKS_DIR"
else
  echo "  - core.hooksPath 已经是: $HOOKS_DIR（无需变更）"
fi

echo ""
echo "安装完成。当前 hooks 路径: $(git config core.hooksPath)"
echo "可用 hooks:"
ls -1 "$HOOKS_DIR"/
