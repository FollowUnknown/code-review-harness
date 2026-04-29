# v1.2.5 Harness Memory 分层系统 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 3 层文件记忆系统（session/task/project），含提取规则、TTL 维护脚本、统计 API 和前端页面。

**Architecture:** 纯文件系统存储（sessions/memory/），TypeScript 服务层提供只读统计 API，shell 脚本处理 TTL 清理和升级，CLAUDE.md 规则驱动提取和召回。记忆写入由 AI 按 CLAUDE.md 规则手动执行，代码只负责读取统计。

**Tech Stack:** TypeScript (Express)、Vitest、Shell (bash+jq)、React + Tailwind + Framer Motion

---

## File Structure

| 操作 | 文件 | 职责 |
|------|------|------|
| 新建 | `sessions/memory/index.json` | 全局索引（空初始） |
| 新建 | `sessions/memory/stats.json` | 统计数据（空初始） |
| 新建 | `sessions/memory/session/.gitkeep` | Session memory 目录 |
| 新建 | `sessions/memory/task/.gitkeep` | Task memory 目录 |
| 新建 | `sessions/memory/project/.gitkeep` | Project memory 目录 |
| 新建 | `sessions/memory/archive/session/.gitkeep` | 归档目录 |
| 新建 | `sessions/memory/archive/task/.gitkeep` | 归档目录 |
| 新建 | `sessions/memory/archive/project/.gitkeep` | 归档目录 |
| 新建 | `sessions/memory/schemas/session-memory.json` | Session Memory JSON Schema |
| 新建 | `sessions/memory/schemas/task-memory.json` | Task Memory JSON Schema |
| 新建 | `sessions/memory/schemas/project-memory.json` | Project Memory JSON Schema |
| 新建 | `sessions/memory/README.md` | Memory 目录说明 |
| 修改 | `src/shared/types.ts` | 新增 Memory 相关类型 |
| 新建 | `src/server/services/memory-stats.ts` | Memory 统计服务（读取文件） |
| 新建 | `src/server/routes/memory.ts` | Memory API 路由 |
| 修改 | `src/server/index.ts` | 挂载 memory 路由 |
| 新建 | `src/client/pages/MemoryPage.tsx` | 记忆统计前端页 |
| 修改 | `src/client/App.tsx` | 新增 Memory 导航和路由 |
| 新建 | `scripts/memory-maintenance.sh` | TTL 清理 + 升级 + 归档脚本 |
| 新建 | `tests/memory-stats.test.ts` | 统计服务测试 |
| 修改 | `CLAUDE.md` | 新增规则 4：记忆召回 |
| 修改 | `sessions/active-tasks.md` | 新增 v1.2.5 任务 |

---

### Task 1: Storage Foundation — 目录结构、Schema、初始数据

**Files:**
- Create: `sessions/memory/index.json`
- Create: `sessions/memory/stats.json`
- Create: `sessions/memory/session/.gitkeep`
- Create: `sessions/memory/task/.gitkeep`
- Create: `sessions/memory/project/.gitkeep`
- Create: `sessions/memory/archive/session/.gitkeep`
- Create: `sessions/memory/archive/task/.gitkeep`
- Create: `sessions/memory/archive/project/.gitkeep`
- Create: `sessions/memory/schemas/session-memory.json`
- Create: `sessions/memory/schemas/task-memory.json`
- Create: `sessions/memory/schemas/project-memory.json`
- Create: `sessions/memory/README.md`

- [ ] **Step 1: Create directory structure and empty files**

```bash
mkdir -p sessions/memory/{session,task,project,archive/session,archive/task,archive/project,schemas}
touch sessions/memory/session/.gitkeep
touch sessions/memory/task/.gitkeep
touch sessions/memory/project/.gitkeep
touch sessions/memory/archive/session/.gitkeep
touch sessions/memory/archive/task/.gitkeep
touch sessions/memory/archive/project/.gitkeep
```

- [ ] **Step 2: Create index.json**

```json
{
  "lastUpdated": "2026-04-29T00:00:00Z",
  "entries": []
}
```

- [ ] **Step 3: Create stats.json**

```json
{
  "totalEntries": 0,
  "byLayer": {
    "session": 0,
    "task": 0,
    "project": 0
  },
  "upgrades": {
    "taskToProject": 0,
    "projectRenewed": 0
  },
  "archived": {
    "session": 0,
    "task": 0,
    "project": 0
  },
  "lastMaintenance": null
}
```

- [ ] **Step 4: Create session-memory.json schema**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "SessionMemory",
  "type": "object",
  "required": ["id", "sessionDate", "activeTasks", "contextSnapshot", "pendingDecisions", "createdAt", "expiresAt"],
  "properties": {
    "id": { "type": "string", "description": "Date string, e.g. 2026-04-29" },
    "sessionDate": { "type": "string", "format": "date" },
    "activeTasks": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["taskId", "description", "priority"],
        "properties": {
          "taskId": { "type": "string" },
          "description": { "type": "string" },
          "priority": { "type": "string", "enum": ["P0", "P1", "P2"] }
        }
      }
    },
    "contextSnapshot": {
      "type": "object",
      "required": ["currentContract", "currentPhase", "lastAction"],
      "properties": {
        "currentContract": { "type": ["string", "null"], "description": "Contract ID or null" },
        "currentPhase": { "type": ["string", "null"] },
        "lastAction": { "type": "string" }
      }
    },
    "pendingDecisions": { "type": "array", "items": { "type": "string" } },
    "createdAt": { "type": "string", "format": "date-time" },
    "expiresAt": { "type": "string", "format": "date-time", "description": "createdAt + 1 day" }
  }
}
```

- [ ] **Step 5: Create task-memory.json schema**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "TaskMemory",
  "type": "object",
  "required": ["id", "contractId", "scope", "approach", "risks", "decisions", "reviewResult", "keyIssues", "createdAt", "expiresAt"],
  "properties": {
    "id": { "type": "string", "description": "Run ID, e.g. run-20260428-001" },
    "contractId": { "type": "string" },
    "scope": { "type": "string" },
    "approach": { "type": "string" },
    "risks": { "type": "array", "items": { "type": "string" } },
    "decisions": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["decision", "rationale"],
        "properties": {
          "decision": { "type": "string" },
          "rationale": { "type": "string" }
        }
      }
    },
    "reviewResult": { "type": "string", "enum": ["passed", "failed"] },
    "keyIssues": { "type": "array", "items": { "type": "string" } },
    "repairPattern": { "type": "string", "description": "If associated repair exists" },
    "createdAt": { "type": "string", "format": "date-time" },
    "expiresAt": { "type": "string", "format": "date-time", "description": "createdAt + 7 days" }
  }
}
```

- [ ] **Step 6: Create project-memory.json schema**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ProjectMemory",
  "type": "object",
  "required": ["id", "projectName", "type", "content", "sourceTaskIds", "confidence", "createdAt", "expiresAt", "lastHitAt"],
  "properties": {
    "id": { "type": "string" },
    "projectName": { "type": "string" },
    "type": { "type": "string", "enum": ["conventions", "risks", "best-practices"] },
    "content": { "type": "string" },
    "sourceTaskIds": { "type": "array", "items": { "type": "string" } },
    "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
    "createdAt": { "type": "string", "format": "date-time" },
    "expiresAt": { "type": "string", "format": "date-time", "description": "lastHitAt + 30 days" },
    "lastHitAt": { "type": "string", "format": "date-time" }
  }
}
```

- [ ] **Step 7: Create sessions/memory/README.md**

```markdown
# Harness Memory 分层系统

> Phase 4: Memory Superpower（Harness 侧）
> 与 v1.2.0 Knowledge 系统完全独立，不桥接。

## 目录结构

- `session/` — 每日会话记忆（1d TTL）
- `task/` — Run 级记忆，一个 run 一个文件（7d TTL）
- `project/` — 聚合后的项目级记忆（30d TTL）
- `archive/` — 过期记忆归档（永久保留）
- `schemas/` — JSON Schema 定义
- `index.json` — 全局索引
- `stats.json` — 统计数据

## 记忆升级路径

```
session (1d) → 归档
task (7d) → hitCount≥3 且 ≥1d → project，否则归档
project (30d) → 命中续命，未命中归档
```

## 写入规则

AI 按 CLAUDE.md 规则 4 执行写入和召回，不通过代码写入。
```

- [ ] **Step 8: Commit**

```bash
git add sessions/memory/
git commit -m "feat(v1.2.5): add memory directory structure, schemas, and seed files"
```

---

### Task 2: Types — Memory 类型定义

**Files:**
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Add Memory types to types.ts**

在文件末尾追加：

```typescript
// ---- Harness Memory (v1.2.5) ----

export type MemoryLayer = "session" | "task" | "project";

export type ProjectMemoryType = "conventions" | "risks" | "best-practices";

export interface MemoryIndexEntry {
  id: string;
  layer: MemoryLayer;
  file: string;
  scope: string;
  createdAt: string;
  expiresAt: string;
  hitCount: number;
  lastHitAt: string;
  tags: string[];
}

export interface MemoryIndex {
  lastUpdated: string;
  entries: MemoryIndexEntry[];
}

export interface MemoryStats {
  totalEntries: number;
  byLayer: Record<MemoryLayer, number>;
  upgrades: {
    taskToProject: number;
    projectRenewed: number;
  };
  archived: Record<MemoryLayer, number>;
  lastMaintenance: string | null;
}

export interface SessionMemory {
  id: string;
  sessionDate: string;
  activeTasks: { taskId: string; description: string; priority: string }[];
  contextSnapshot: {
    currentContract: string | null;
    currentPhase: string | null;
    lastAction: string;
  };
  pendingDecisions: string[];
  createdAt: string;
  expiresAt: string;
}

export interface TaskMemory {
  id: string;
  contractId: string;
  scope: string;
  approach: string;
  risks: string[];
  decisions: { decision: string; rationale: string }[];
  reviewResult: "passed" | "failed";
  keyIssues: string[];
  repairPattern?: string;
  createdAt: string;
  expiresAt: string;
}

export interface ProjectMemory {
  id: string;
  projectName: string;
  type: ProjectMemoryType;
  content: string;
  sourceTaskIds: string[];
  confidence: number;
  createdAt: string;
  expiresAt: string;
  lastHitAt: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat(v1.2.5): add Memory types to shared types"
```

---

### Task 3: Memory Stats Service — 读取统计

**Files:**
- Create: `src/server/services/memory-stats.ts`
- Create: `tests/memory-stats.test.ts`

- [ ] **Step 1: Write failing tests**

`tests/memory-stats.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { getMemoryStats, getExpiringEntries, getArchiveStats } from "../src/server/services/memory-stats";

const TEST_MEMORY_DIR = path.join(os.tmpdir(), `memory-test-${Date.now()}`);

beforeEach(() => {
  fs.mkdirSync(path.join(TEST_MEMORY_DIR, "session"), { recursive: true });
  fs.mkdirSync(path.join(TEST_MEMORY_DIR, "task"), { recursive: true });
  fs.mkdirSync(path.join(TEST_MEMORY_DIR, "project"), { recursive: true });
  fs.mkdirSync(path.join(TEST_MEMORY_DIR, "archive/session"), { recursive: true });
  fs.mkdirSync(path.join(TEST_MEMORY_DIR, "archive/task"), { recursive: true });
  fs.mkdirSync(path.join(TEST_MEMORY_DIR, "archive/project"), { recursive: true });

  // Write stats.json
  fs.writeFileSync(
    path.join(TEST_MEMORY_DIR, "stats.json"),
    JSON.stringify({
      totalEntries: 2,
      byLayer: { session: 1, task: 1, project: 0 },
      upgrades: { taskToProject: 0, projectRenewed: 0 },
      archived: { session: 0, task: 0, project: 0 },
      lastMaintenance: null,
    })
  );

  // Write index.json
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
  fs.writeFileSync(
    path.join(TEST_MEMORY_DIR, "index.json"),
    JSON.stringify({
      lastUpdated: new Date().toISOString(),
      entries: [
        {
          id: "2026-04-29",
          layer: "session",
          file: "session/2026-04-29.json",
          scope: "daily session",
          createdAt: "2026-04-29",
          expiresAt: tomorrow,
          hitCount: 0,
          lastHitAt: "2026-04-29",
          tags: ["session"],
        },
        {
          id: "run-20260428-001",
          layer: "task",
          file: "task/run-20260428-001.json",
          scope: "v1.1.0 Execution",
          createdAt: "2026-04-28",
          expiresAt: yesterday, // expired
          hitCount: 2,
          lastHitAt: "2026-04-29",
          tags: ["execution", "schema"],
        },
      ],
    })
  );

  // Write one archive file
  fs.writeFileSync(
    path.join(TEST_MEMORY_DIR, "archive/session/2026-04-27.json"),
    JSON.stringify({ id: "2026-04-27", archived: true })
  );
});

afterEach(() => {
  fs.rmSync(TEST_MEMORY_DIR, { recursive: true, force: true });
});

describe("memory-stats", () => {
  it("getMemoryStats reads stats.json", () => {
    const stats = getMemoryStats(TEST_MEMORY_DIR);
    expect(stats.totalEntries).toBe(2);
    expect(stats.byLayer.session).toBe(1);
    expect(stats.byLayer.task).toBe(1);
    expect(stats.byLayer.project).toBe(0);
  });

  it("getExpiringEntries returns entries expiring within N days", () => {
    const expiring = getExpiringEntries(TEST_MEMORY_DIR, 3);
    // The task entry has expiresAt = yesterday, so it's within 3 days
    expect(expiring.length).toBe(1);
    expect(expiring[0].id).toBe("run-20260428-001");
  });

  it("getArchiveStats counts archived files", () => {
    const archiveStats = getArchiveStats(TEST_MEMORY_DIR);
    expect(archiveStats.session).toBe(1);
    expect(archiveStats.task).toBe(0);
    expect(archiveStats.project).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/memory-stats.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

`src/server/services/memory-stats.ts`:

```typescript
import fs from "fs";
import path from "path";
import type { MemoryStats, MemoryIndexEntry, MemoryLayer } from "../../shared/types";

const DEFAULT_MEMORY_DIR = path.resolve(process.cwd(), "sessions/memory");

export function getMemoryStats(memoryDir = DEFAULT_MEMORY_DIR): MemoryStats {
  const statsPath = path.join(memoryDir, "stats.json");
  if (!fs.existsSync(statsPath)) {
    return {
      totalEntries: 0,
      byLayer: { session: 0, task: 0, project: 0 },
      upgrades: { taskToProject: 0, projectRenewed: 0 },
      archived: { session: 0, task: 0, project: 0 },
      lastMaintenance: null,
    };
  }
  return JSON.parse(fs.readFileSync(statsPath, "utf-8"));
}

export function getExpiringEntries(memoryDir = DEFAULT_MEMORY_DIR, withinDays = 3): MemoryIndexEntry[] {
  const indexPath = path.join(memoryDir, "index.json");
  if (!fs.existsSync(indexPath)) return [];

  const index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
  const now = new Date();
  const cutoff = new Date(now.getTime() + withinDays * 86400000);

  return index.entries.filter((entry: MemoryIndexEntry) => {
    const expiresAt = new Date(entry.expiresAt);
    return expiresAt <= cutoff;
  });
}

export function getArchiveStats(memoryDir = DEFAULT_MEMORY_DIR): Record<MemoryLayer, number> {
  const layers: MemoryLayer[] = ["session", "task", "project"];
  const result = {} as Record<MemoryLayer, number>;

  for (const layer of layers) {
    const archiveDir = path.join(memoryDir, "archive", layer);
    if (!fs.existsSync(archiveDir)) {
      result[layer] = 0;
      continue;
    }
    const files = fs.readdirSync(archiveDir).filter((f) => f.endsWith(".json"));
    result[layer] = files.length;
  }

  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/memory-stats.test.ts`
Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/services/memory-stats.ts tests/memory-stats.test.ts
git commit -m "feat(v1.2.5): add memory stats service with tests"
```

---

### Task 4: Memory API Route

**Files:**
- Create: `src/server/routes/memory.ts`
- Modify: `src/server/index.ts`

- [ ] **Step 1: Create memory route**

`src/server/routes/memory.ts`:

```typescript
import { Router } from "express";
import { getMemoryStats, getExpiringEntries, getArchiveStats } from "../services/memory-stats";

const router = Router();

router.get("/stats", (_req, res) => {
  try {
    const stats = getMemoryStats();
    const expiring = getExpiringEntries(7);
    const archiveStats = getArchiveStats();
    res.json({
      success: true,
      data: { stats, expiring, archiveStats },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to read memory stats",
    });
  }
});

export default router;
```

- [ ] **Step 2: Mount route in index.ts**

In `src/server/index.ts`, add import near other route imports:

```typescript
import memoryRouter from "./routes/memory";
```

After the existing `app.use("/api/quality", qualityRouter)` line, add:

```typescript
app.use("/api/memory", memoryRouter);
```

- [ ] **Step 3: Verify API starts**

Run: `npx tsx src/server/index.ts &` then `curl http://localhost:3001/api/memory/stats`
Expected: `{"success":true,"data":{"stats":{...},"expiring":[],"archiveStats":{...}}}`

- [ ] **Step 4: Commit**

```bash
git add src/server/routes/memory.ts src/server/index.ts
git commit -m "feat(v1.2.5): add /api/memory/stats route"
```

---

### Task 5: Maintenance Script — TTL 清理、升级、归档

**Files:**
- Create: `scripts/memory-maintenance.sh`

- [ ] **Step 1: Write the maintenance script**

`scripts/memory-maintenance.sh`:

```bash
#!/bin/bash
# Memory Maintenance: TTL cleanup, task→project upgrade, archive
# Usage: ./scripts/memory-maintenance.sh [memory-dir]
# Default memory-dir: sessions/memory

set -euo pipefail

MEMORY_DIR="${1:-sessions/memory}"
INDEX_FILE="$MEMORY_DIR/index.json"
STATS_FILE="$MEMORY_DIR/stats.json"
TODAY=$(date -u +%Y-%m-%d)

if [ ! -f "$INDEX_FILE" ]; then
  echo "❌ index.json not found at $INDEX_FILE"
  exit 1
fi

echo "🔧 Memory Maintenance — $TODAY"
echo "   Directory: $MEMORY_DIR"

UPGRADED=0
ARCHIVED_SESSION=0
ARCHIVED_TASK=0
ARCHIVED_PROJECT=0

# Read current stats
TOTAL_ENTRIES=$(cat "$INDEX_FILE" | jq '.entries | length')
CURRENT_ARCHIVED_SESSION=$(cat "$STATS_FILE" | jq '.archived.session // 0')
CURRENT_ARCHIVED_TASK=$(cat "$STATS_FILE" | jq '.archived.task // 0')
CURRENT_ARCHIVED_PROJECT=$(cat "$STATS_FILE" | jq '.archived.project // 0')

echo "   Current entries: $TOTAL_ENTRIES"

# Process expired entries
ENTRIES_TO_PROCESS=$(cat "$INDEX_FILE" | jq -r --arg today "$TODAY" '
  .entries | to_entries[] | select(.value.expiresAt < $today) | "\(.key)|\(.value.layer)|\(.value.file)|\(.value.hitCount)|\(.value.createdAt)|\(.value.id)"
')

if [ -z "$ENTRIES_TO_PROCESS" ]; then
  echo "   No expired entries. Done."
fi

# Arrays to track entries to remove from index
declare -a REMOVE_INDICES=()

while IFS='|' read -r idx layer file hitcount created id; do
  SRC_FILE="$MEMORY_DIR/$file"

  if [ ! -f "$SRC_FILE" ]; then
    echo "   ⚠️  File not found: $SRC_FILE (removing from index)"
    REMOVE_INDICES+=("$idx")
    continue
  fi

  # Check upgrade condition: task layer, hitCount >= 3, created >= 1 day ago
  if [ "$layer" = "task" ] && [ "$hitcount" -ge 3 ]; then
    CREATED_EPOCH=$(date -j -f "%Y-%m-%d" "$created" "+%s" 2>/dev/null || date -d "$created" "+%s" 2>/dev/null || echo 0)
    TODAY_EPOCH=$(date -j -f "%Y-%m-%d" "$TODAY" "+%s" 2>/dev/null || date -d "$TODAY" "+%s" 2>/dev/null || echo 0)
    AGE_DAYS=$(( (TODAY_EPOCH - CREATED_EPOCH) / 86400 ))

    if [ "$AGE_DAYS" -ge 1 ]; then
      echo "   ⬆️  Upgrading: $id (hitCount=$hitcount, age=${AGE_DAYS}d)"
      # Mark for upgrade — AI will handle the actual aggregation
      # Move to project dir with upgrade marker
      UPGRADE_FILE="$MEMORY_DIR/project/${id}.json"
      cp "$SRC_FILE" "$UPGRADE_FILE"
      echo "     → Copied to project/$id.json (needs AI aggregation)"
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
  echo "   📦 Archived: $id → archive/$layer/"

  case "$layer" in
    session) ARCHIVED_SESSION=$((ARCHIVED_SESSION + 1)) ;;
    task) ARCHIVED_TASK=$((ARCHIVED_TASK + 1)) ;;
    project) ARCHIVED_PROJECT=$((ARCHIVED_PROJECT + 1)) ;;
  esac

  REMOVE_INDICES+=("$idx")

done <<< "$ENTRIES_TO_PROCESS"

# Update index.json — remove archived entries
if [ ${#REMOVE_INDICES[@]} -gt 0 ]; then
  # Build jq filter to delete by index
  FILTER=""
  for i in "${REMOVE_INDICES[@]}"; do
    FILTER="del(.entries[$i])$FILTER"
  done
  # Apply from highest index to lowest to avoid shifting
  SORTED_INDICES=($(for i in "${REMOVE_INDICES[@]}"; do echo $i; done | sort -rn))
  FILTER=""
  for i in "${SORTED_INDICES[@]}"; do
    FILTER="$FILTER | del(.entries[$i])"
  done
  FILTER="${FILTER# | }"

  cat "$INDEX_FILE" | jq --arg today "$TODAY" "$FILTER" > "${INDEX_FILE}.tmp" && mv "${INDEX_FILE}.tmp" "$INDEX_FILE"
  # Update lastUpdated
  cat "$INDEX_FILE" | jq --arg now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '.lastUpdated = $now' > "${INDEX_FILE}.tmp" && mv "${INDEX_FILE}.tmp" "$INDEX_FILE"
fi

# Update stats.json
NEW_TOTAL=$(cat "$INDEX_FILE" | jq '.entries | length')
cat "$STATS_FILE" | jq --argjson total "$NEW_TOTAL" \
  --argjson session "$(cat "$INDEX_FILE" | jq '[.entries[] | select(.layer=="session")] | length')" \
  --argjson task "$(cat "$INDEX_FILE" | jq '[.entries[] | select(.layer=="task")] | length')" \
  --argjson project "$(cat "$INDEX_FILE" | jq '[.entries[] | select(.layer=="project")] | length')" \
  --argjson upgraded "$UPGRADED" \
  --argjson arch_session "$((CURRENT_ARCHIVED_SESSION + ARCHIVED_SESSION))" \
  --argjson arch_task "$((CURRENT_ARCHIVED_TASK + ARCHIVED_TASK))" \
  --argjson arch_project "$((CURRENT_ARCHIVED_PROJECT + ARCHIVED_PROJECT))" \
  --arg now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '.totalEntries = $total |
   .byLayer = { session: $session, task: $task, project: $project } |
   .upgrades.taskToProject += $upgraded |
   .archived = { session: $arch_session, task: $arch_task, project: $arch_project } |
   .lastMaintenance = $now' > "${STATS_FILE}.tmp" && mv "${STATS_FILE}.tmp" "$STATS_FILE"

echo ""
echo "✅ Maintenance complete:"
echo "   Upgraded: $UPGRADED"
echo "   Archived: session=$ARCHIVED_SESSION, task=$ARCHIVED_TASK, project=$ARCHIVED_PROJECT"
echo "   Remaining entries: $NEW_TOTAL"
```

- [ ] **Step 2: Make executable**

```bash
chmod +x scripts/memory-maintenance.sh
```

- [ ] **Step 3: Test with dry run**

```bash
./scripts/memory-maintenance.sh sessions/memory
```

Expected: Output showing "No expired entries" (no real data yet) or processes any expired entries.

- [ ] **Step 4: Commit**

```bash
git add scripts/memory-maintenance.sh
git commit -m "feat(v1.2.5): add memory maintenance script for TTL cleanup and upgrade"
```

---

### Task 6: Frontend — MemoryPage 统计页

**Files:**
- Create: `src/client/pages/MemoryPage.tsx`
- Modify: `src/client/App.tsx`

- [ ] **Step 1: Create MemoryPage.tsx**

`src/client/pages/MemoryPage.tsx`:

```tsx
import { useState, useEffect } from "react";
import { motion } from "framer-motion";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3001";

interface MemoryStatsData {
  stats: {
    totalEntries: number;
    byLayer: { session: number; task: number; project: number };
    upgrades: { taskToProject: number; projectRenewed: number };
    archived: { session: number; task: number; project: number };
    lastMaintenance: string | null;
  };
  expiring: { id: string; layer: string; scope: string; expiresAt: string; hitCount: number }[];
  archiveStats: { session: number; task: number; project: number };
}

function LayerCard({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 text-center">
      <div className={`text-3xl font-bold ${color}`}>{count}</div>
      <div className="text-sm text-slate-400 mt-1">{label}</div>
    </div>
  );
}

export function MemoryPage() {
  const [data, setData] = useState<MemoryStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    fetch(`${API_BASE}/api/memory/stats`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          setData(json.data);
        } else {
          setError(json.error || "Failed to load memory stats");
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-red-900/20 border border-red-800/50 rounded-xl p-4 text-red-400">{error}</div>
      </div>
    );
  }

  if (!data) return null;

  const { stats, expiring, archiveStats } = data;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold text-white">Harness Memory</h1>
      <p className="text-slate-400 text-sm">Phase 4 Memory Superpower — 3-layer file-based memory for AI orchestration</p>

      {/* Layer counts */}
      <div className="grid grid-cols-3 gap-4">
        <LayerCard label="Session" count={stats.byLayer.session} color="text-blue-400" />
        <LayerCard label="Task" count={stats.byLayer.task} color="text-green-400" />
        <LayerCard label="Project" count={stats.byLayer.project} color="text-purple-400" />
      </div>

      {/* Stats summary */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <h3 className="text-sm font-medium text-slate-400 mb-3">Upgrades</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Task → Project</span>
              <span className="text-white">{stats.upgrades.taskToProject}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Project Renewed</span>
              <span className="text-white">{stats.upgrades.projectRenewed}</span>
            </div>
          </div>
        </div>

        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <h3 className="text-sm font-medium text-slate-400 mb-3">Archive</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Session</span>
              <span className="text-white">{archiveStats.session}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Task</span>
              <span className="text-white">{archiveStats.task}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Project</span>
              <span className="text-white">{archiveStats.project}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Expiring entries */}
      {expiring.length > 0 && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <h3 className="text-sm font-medium text-amber-400 mb-3">Expiring Soon</h3>
          <div className="space-y-2">
            {expiring.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between text-sm">
                <div>
                  <span className="text-slate-300">{entry.id}</span>
                  <span className="text-slate-500 ml-2">{entry.scope}</span>
                </div>
                <div className="text-slate-400">
                  <span className="text-xs px-2 py-0.5 rounded bg-slate-700/50">{entry.layer}</span>
                  <span className="ml-2 text-amber-400">{entry.expiresAt}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Last maintenance */}
      <div className="text-xs text-slate-500">
        Total entries: {stats.totalEntries} · Last maintenance: {stats.lastMaintenance || "Never"}
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Add route and nav in App.tsx**

In `src/client/App.tsx`:

a) Add import (near other page imports):
```typescript
import { MemoryPage } from "./pages/MemoryPage";
```

b) Add Route (inside `<Routes>` block):
```tsx
<Route path="/memory" element={<MemoryPage />} />
```

c) Add nav link (in header nav section, after the Quality link):
```tsx
<Link to="/memory" className="text-xs px-3 py-1.5 rounded-lg border bg-slate-800/50 border-slate-700/50 text-slate-400 hover:text-white hover:border-slate-600 transition-all">
  Memory
</Link>
```

- [ ] **Step 3: Verify frontend builds**

Run: `npx vite build`
Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/client/pages/MemoryPage.tsx src/client/App.tsx
git commit -m "feat(v1.2.5): add MemoryPage with stats dashboard"
```

---

### Task 7: CLAUDE.md — 规则 4 记忆召回

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add Rule 4 to session mechanism**

在 CLAUDE.md 的"规则 3"之后、"Execution 记录规则"之前，新增：

```markdown
**规则 4：记忆召回**
- 对话启动时：
  1. 读取 `sessions/memory/session/{today}.json`，如存在则恢复活跃任务和上下文
  2. 读取 `sessions/memory/project/*.json`，注入项目规则到规划上下文
  3. 如 `sessions/memory/session/{today}.json` 不存在，基于 session 文件和 active-tasks.md 创建
- 创建新 Contract 时：
  1. 读取 `sessions/memory/project/conventions.json`，检查是否与已有规则冲突
  2. 扫描 `sessions/memory/index.json` 按 tags 匹配相似 task memory，参考历史方案
- 命中记忆时：
  1. 更新 `sessions/memory/index.json` 中对应条目 `hitCount++` 和 `lastHitAt`
  2. 如 `hitCount ≥ 3` 且距创建 ≥ 1d，执行 task → project 升级
- Run/Repair 完成后：
  1. 从 execution 数据提取 TaskMemory，写入 `sessions/memory/task/{run-id}.json`
  2. 更新 `sessions/memory/index.json` 添加条目
  3. 标记 execution 记录 `extractedForMemory: true`
- 会话结束时：
  1. 更新当日 `sessions/memory/session/{date}.json` 的上下文快照
  2. 更新 `sessions/memory/stats.json` 中的计数
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "feat(v1.2.5): add CLAUDE.md Rule 4 — memory recall and extraction"
```

---

### Task 8: Seed Existing Data — 从现有 Execution 数据提取

**Files:**
- Modify: `sessions/memory/index.json`
- Create: `sessions/memory/task/run-20260428-001.json`
- Modify: `sessions/memory/stats.json`

- [ ] **Step 1: Extract task memory from existing run**

读取现有 execution 数据 `sessions/execution/runs/run-20260428-001/` 的 plan.json、implementation.json、review.json，写入 `sessions/memory/task/run-20260428-001.json`：

```json
{
  "id": "run-20260428-001",
  "contractId": "2026-04-28-v110-execution-layer",
  "scope": "v1.1.0 Execution 层基础设施 — 目录结构、记录格式定义、Sessions 集成",
  "approach": "基于现有 sessions/ 机制扩展 execution/ 子目录，定义 Run/Repair/Checkpoint 三类记录格式，更新 CLAUDE.md 会话规则集成 Execution 记录",
  "risks": [
    "PreToolUse Hook 对 Write/Edit 的支持能力未验证",
    "execution/ 记录可能随时间膨胀需要清理策略"
  ],
  "decisions": [
    { "decision": "记录格式使用 JSON Schema 定义", "rationale": "可验证、可生成文档、支持 IDE 自动补全" },
    { "decision": "Phase 4 预埋字段放在每条记录的顶层", "rationale": "方便 v1.2.0 Memory Extractor 扫描识别，不需要深层解析" }
  ],
  "reviewResult": "passed",
  "keyIssues": [
    "Execution 记录无验证脚本，建议增加 JSON Schema 验证工具",
    "README 缺少清理和归档策略说明"
  ],
  "repairPattern": "review failed on missing validation script → added repair → passed",
  "createdAt": "2026-04-28T00:00:00Z",
  "expiresAt": "2026-05-05T00:00:00Z"
}
```

- [ ] **Step 2: Update index.json**

```json
{
  "lastUpdated": "2026-04-29T12:00:00Z",
  "entries": [
    {
      "id": "run-20260428-001",
      "layer": "task",
      "file": "task/run-20260428-001.json",
      "scope": "v1.1.0 Execution 层基础设施",
      "createdAt": "2026-04-28",
      "expiresAt": "2026-05-05",
      "hitCount": 1,
      "lastHitAt": "2026-04-29",
      "tags": ["execution", "schema", "v1.1.0"]
    }
  ]
}
```

- [ ] **Step 3: Update stats.json**

```json
{
  "totalEntries": 1,
  "byLayer": {
    "session": 0,
    "task": 1,
    "project": 0
  },
  "upgrades": {
    "taskToProject": 0,
    "projectRenewed": 0
  },
  "archived": {
    "session": 0,
    "task": 0,
    "project": 0
  },
  "lastMaintenance": null
}
```

- [ ] **Step 4: Mark execution records as extracted**

更新 `sessions/execution/runs/run-20260428-001/plan.json`：
将 `"extractedForMemory": false` 改为 `"extractedForMemory": true`

同样更新 implementation.json 和 review.json 的 `extractedForMemory` 字段。

- [ ] **Step 5: Commit**

```bash
git add sessions/memory/ sessions/execution/
git commit -m "feat(v1.2.5): seed task memory from existing execution data"
```

---

### Task 9: Final Verification — 全量测试

**Files:**
- No new files

- [ ] **Step 1: Run all tests**

```bash
npx vitest run
```

Expected: All tests pass (existing 182 + 3 new memory-stats tests = 185).

- [ ] **Step 2: Verify API endpoint**

```bash
curl http://localhost:3001/api/memory/stats
```

Expected: `{"success":true,"data":{"stats":{"totalEntries":1,...},"expiring":[...],"archiveStats":{...}}}`

- [ ] **Step 3: Verify maintenance script**

```bash
./scripts/memory-maintenance.sh sessions/memory
```

Expected: Shows 1 task entry, no expired entries (expiresAt is 2026-05-05).

- [ ] **Step 4: Verify frontend**

Open browser to `/memory`, confirm:
- "Session: 0", "Task: 1", "Project: 0" displayed
- Stats summary shows correct data
- No console errors

- [ ] **Step 5: Update versions/README.md status**

In `docs/versions/README.md`, change v1.2.5 status from "⚪ 待规划" to "🔄 进行中".

In `docs/versions/v1.2.5/README.md`, update status line.

- [ ] **Step 6: Final commit**

```bash
git add docs/versions/
git commit -m "docs: update v1.2.5 status to in-progress"
```

---

## Self-Review

### 1. Spec Coverage

| Spec Section | Task |
|---|---|
| 3.1 Directory structure | Task 1 |
| 3.2 index.json | Task 1 |
| 3.3-3.5 Schemas | Task 1 (JSON Schema files) + Task 2 (TypeScript types) |
| 4.1-4.4 Extraction | Task 7 (CLAUDE.md rules) + Task 8 (seed data) |
| 5.1-5.3 Recall | Task 7 (CLAUDE.md rules) |
| 6.1-6.2 Upgrade | Task 5 (maintenance script) + Task 7 (CLAUDE.md rules) |
| 6.3 TTL cleanup | Task 5 (maintenance script) |
| 6.4 stats.json | Task 1 (initial) + Task 5 (updated by script) |
| 6.5 Frontend stats page | Task 6 |
| 7. File list | All tasks |

### 2. Placeholder Scan

No TBD, TODO, or "implement later" found. All steps contain actual code.

### 3. Type Consistency

- `MemoryLayer` used consistently across types.ts, memory-stats.ts, and maintenance script
- `ProjectMemoryType` matches design spec: "conventions" | "risks" | "best-practices"
- `MemoryIndexEntry` fields match index.json structure from Task 1
- `MemoryStats` fields match stats.json structure from Task 1
- API route returns `{ stats, expiring, archiveStats }` matching frontend `MemoryStatsData` interface

---

*Plan saved: 2026-04-29*
