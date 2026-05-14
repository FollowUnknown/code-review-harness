#!/bin/bash
# Memory Maintenance: TTL cleanup, task→project upgrade, archive
# Usage: ./scripts/memory-maintenance.sh [memory-dir]
# Default memory-dir: sessions/memory

set -euo pipefail

MEMORY_DIR="${1:-docs/sessions/archive/memory}"
INDEX_FILE="$MEMORY_DIR/index.json"
STATS_FILE="$MEMORY_DIR/stats.json"
TODAY=$(date -u +%Y-%m-%d)

if [ ! -f "$INDEX_FILE" ]; then
  echo "index.json not found at $INDEX_FILE"
  exit 1
fi

echo "Memory Maintenance — $TODAY"
echo "   Directory: $MEMORY_DIR"

UPGRADED=0
ARCHIVED_SESSION=0
ARCHIVED_TASK=0
ARCHIVED_PROJECT=0

TOTAL_ENTRIES=$(jq '.entries | length' "$INDEX_FILE")
CURRENT_ARCHIVED_SESSION=$(jq '.archived.session // 0' "$STATS_FILE")
CURRENT_ARCHIVED_TASK=$(jq '.archived.task // 0' "$STATS_FILE")
CURRENT_ARCHIVED_PROJECT=$(jq '.archived.project // 0' "$STATS_FILE")

echo "   Current entries: $TOTAL_ENTRIES"

# Find expired entries
ENTRIES_TO_PROCESS=$(jq -r --arg today "$TODAY" '
  .entries | to_entries[] | select(.value.expiresAt < $today) | "\(.key)|\(.value.layer)|\(.value.file)|\(.value.hitCount)|\(.value.createdAt)|\(.value.id)"
' "$INDEX_FILE")

REMOVE_INDICES=()

if [ -z "$ENTRIES_TO_PROCESS" ]; then
  echo "   No expired entries. Done."
else
  while IFS='|' read -r idx layer file hitcount created id; do
    # Skip empty lines (can occur from trailing newline)
    [ -z "$idx" ] && continue

    SRC_FILE="$MEMORY_DIR/$file"

    if [ ! -f "$SRC_FILE" ]; then
      echo "   WARNING: File not found: $SRC_FILE (removing from index)"
      REMOVE_INDICES+=("$idx")
      continue
    fi

    # Check upgrade: task layer, hitCount >= 3, created >= 1 day ago
    if [ "$layer" = "task" ] && [ "$hitcount" -ge 3 ]; then
      CREATED_SEC=$(date -j -f "%Y-%m-%d" "$created" "+%s" 2>/dev/null || date -d "$created" "+%s" 2>/dev/null || echo 0)
      TODAY_SEC=$(date -j -f "%Y-%m-%d" "$TODAY" "+%s" 2>/dev/null || date -d "$TODAY" "+%s" 2>/dev/null || echo 0)
      AGE_DAYS=$(( (TODAY_SEC - CREATED_SEC) / 86400 ))

      if [ "$AGE_DAYS" -ge 1 ]; then
        echo "   Upgrading: $id (hitCount=$hitcount, age=${AGE_DAYS}d)"
        UPGRADE_FILE="$MEMORY_DIR/project/${id}.json"
        mkdir -p "$MEMORY_DIR/project"
        cp "$SRC_FILE" "$UPGRADE_FILE"
        echo "     -> Copied to project/$id.json"
        rm "$SRC_FILE"
        UPGRADED=$((UPGRADED + 1))
        REMOVE_INDICES+=("$idx")
        continue
      fi
    fi

    # Archive
    ARCHIVE_DIR="$MEMORY_DIR/archive/$layer"
    mkdir -p "$ARCHIVE_DIR"
    mv "$SRC_FILE" "$ARCHIVE_DIR/"
    echo "   Archived: $id -> archive/$layer/"

    case "$layer" in
      session) ARCHIVED_SESSION=$((ARCHIVED_SESSION + 1)) ;;
      task) ARCHIVED_TASK=$((ARCHIVED_TASK + 1)) ;;
      project) ARCHIVED_PROJECT=$((ARCHIVED_PROJECT + 1)) ;;
    esac

    REMOVE_INDICES+=("$idx")
  done <<< "$ENTRIES_TO_PROCESS"
fi

# Update index.json — remove processed entries (highest index first)
if [ ${#REMOVE_INDICES[@]} -gt 0 ]; then
  SORTED_INDICES=($(for i in "${REMOVE_INDICES[@]}"; do echo $i; done | sort -rn))
  FILTER="."
  for i in "${SORTED_INDICES[@]}"; do
    FILTER="$FILTER | del(.entries[$i])"
  done
  jq "$FILTER" "$INDEX_FILE" | jq --arg now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '.lastUpdated = $now' > "${INDEX_FILE}.tmp" && mv "${INDEX_FILE}.tmp" "$INDEX_FILE"
fi

# Update stats.json
NEW_TOTAL=$(jq '.entries | length' "$INDEX_FILE")
jq \
  --argjson total "$NEW_TOTAL" \
  --argjson session "$(jq '[.entries[] | select(.layer=="session")] | length' "$INDEX_FILE")" \
  --argjson task "$(jq '[.entries[] | select(.layer=="task")] | length' "$INDEX_FILE")" \
  --argjson project "$(jq '[.entries[] | select(.layer=="project")] | length' "$INDEX_FILE")" \
  --argjson upgraded "$UPGRADED" \
  --argjson arch_session "$((CURRENT_ARCHIVED_SESSION + ARCHIVED_SESSION))" \
  --argjson arch_task "$((CURRENT_ARCHIVED_TASK + ARCHIVED_TASK))" \
  --argjson arch_project "$((CURRENT_ARCHIVED_PROJECT + ARCHIVED_PROJECT))" \
  --arg now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '.totalEntries = $total |
   .byLayer = { session: $session, task: $task, project: $project } |
   .upgrades.taskToProject += $upgraded |
   .archived = { session: $arch_session, task: $arch_task, project: $arch_project } |
   .lastMaintenance = $now' "$STATS_FILE" > "${STATS_FILE}.tmp" && mv "${STATS_FILE}.tmp" "$STATS_FILE"

echo ""
echo "Maintenance complete:"
echo "   Upgraded: $UPGRADED"
echo "   Archived: session=$ARCHIVED_SESSION, task=$ARCHIVED_TASK, project=$ARCHIVED_PROJECT"
echo "   Remaining entries: $NEW_TOTAL"
