import { getDb } from "../db";
import type { RepoMapping } from "../../shared/types";

interface RepoMappingRow {
  id: number;
  project: string;
  local_path: string;
  created_at: string;
}

function mapRow(row: RepoMappingRow): RepoMapping {
  return {
    id: row.id,
    project: row.project,
    localPath: row.local_path,
    createdAt: row.created_at,
  };
}

export function getRepoMapping(project: string): RepoMapping | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM repo_mappings WHERE project = ?")
    .get(project) as RepoMappingRow | undefined;
  return row ? mapRow(row) : null;
}

export function setRepoMapping(project: string, localPath: string): void {
  const db = getDb();
  db.prepare(
    "INSERT INTO repo_mappings (project, local_path) VALUES (?, ?) ON CONFLICT(project) DO UPDATE SET local_path = excluded.local_path"
  ).run(project, localPath);
}

export function listRepoMappings(): RepoMapping[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM repo_mappings ORDER BY project")
    .all() as RepoMappingRow[];
  return rows.map(mapRow);
}

export function deleteRepoMapping(project: string): void {
  const db = getDb();
  db.prepare("DELETE FROM repo_mappings WHERE project = ?").run(project);
}

export function ensureRepoMappingsTable(): void {
  const db = getDb();
  db.exec(`CREATE TABLE IF NOT EXISTS repo_mappings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project TEXT NOT NULL UNIQUE,
    local_path TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
}
