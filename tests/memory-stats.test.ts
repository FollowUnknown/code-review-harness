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
          expiresAt: yesterday,
          hitCount: 2,
          lastHitAt: "2026-04-29",
          tags: ["execution", "schema"],
        },
      ],
    })
  );

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
