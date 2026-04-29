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
  const cutoff = new Date(now.getTime() - withinDays * 86400000);

  return index.entries.filter((entry: MemoryIndexEntry) => {
    const expiresAt = new Date(entry.expiresAt);
    return expiresAt <= now && expiresAt >= cutoff;
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
