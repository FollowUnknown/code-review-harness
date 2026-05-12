import { getDb } from "../db";
import type { RepoMapping, TechStack } from "../../shared/types";

interface RepoMappingRow {
  id: number;
  project: string;
  local_path: string;
  product_line_id: string | null;
  tech_stack: string | null;
  gitlab_host: string | null;
  gitlab_project_path: string | null;
  created_at: string;
}

function mapRow(row: RepoMappingRow): RepoMapping {
  return {
    id: row.id,
    project: row.project,
    localPath: row.local_path,
    productLineId: row.product_line_id ?? null,
    techStack: (row.tech_stack as TechStack) ?? "unknown",
    gitlabHost: row.gitlab_host ?? null,
    gitlabProjectPath: row.gitlab_project_path ?? null,
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

export function getRepoMappingsByProductLine(productLineId: string): RepoMapping[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM repo_mappings WHERE product_line_id = ? ORDER BY project")
    .all(productLineId) as RepoMappingRow[];
  return rows.map(mapRow);
}

export function setRepoMappingTechStack(project: string, techStack: TechStack): void {
  const db = getDb();
  db.prepare("UPDATE repo_mappings SET tech_stack = ? WHERE project = ?")
    .run(techStack, project);
}

export function setRepoMappingProductLine(project: string, productLineId: string | null): void {
  const db = getDb();
  db.prepare("UPDATE repo_mappings SET product_line_id = ? WHERE project = ?")
    .run(productLineId, project);
}

// v1.4.5: Set GitLab configuration for a project
export function setRepoMappingGitlab(
  project: string,
  gitlabHost: string | null,
  gitlabProjectPath: string | null,
): void {
  const db = getDb();
  db.prepare(
    "UPDATE repo_mappings SET gitlab_host = ?, gitlab_project_path = ? WHERE project = ?"
  ).run(gitlabHost, gitlabProjectPath, project);
}
