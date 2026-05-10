import fs from "fs";
import path from "path";
import { getDb } from "../db";
import { getRepoMappingsByProductLine } from "../config/repo-mapping";

// ---- Types ----

export interface DependencyEntry {
  groupId: string;
  artifactId: string;
  version?: string;
  scope: string;
  resolvedProject?: string;
}

export interface DependencyScanResult {
  project: string;
  dependencies: DependencyEntry[];
}

export interface DependencyRecord {
  id: number;
  upstreamProject: string;
  downstreamProject: string;
  depType: string;
  depDetails: string | null;
  source: string;
  createdAt: string;
  updatedAt: string;
}

export interface AffectedDownstream {
  downstream: string;
  reason: string;
  affectedFiles: string[];
}

// ---- Public API patterns (change point 15) ----

const PUBLIC_API_PATTERNS = [
  /\/controller\//i,
  /\/api\//i,
  /\/facade\//i,
  /\/dto\//i,
  /\/vo\//i,
  /\/model\//i,
  /\/service\/I[A-Z]/,
];

// ---- Maven pom.xml scanner ----

/**
 * Parse a single dependency block from pom.xml XML string.
 * Returns null if required fields are missing.
 */
function parseDependencyBlock(block: string): DependencyEntry | null {
  const groupIdMatch = block.match(/<groupId>([^<]+)<\/groupId>/);
  const artifactIdMatch = block.match(/<artifactId>([^<]+)<\/artifactId>/);
  if (!groupIdMatch || !artifactIdMatch) return null;

  const versionMatch = block.match(/<version>([^<]+)<\/version>/);
  const scopeMatch = block.match(/<scope>([^<]+)<\/scope>/);

  return {
    groupId: groupIdMatch[1].trim(),
    artifactId: artifactIdMatch[1].trim(),
    version: versionMatch?.[1]?.trim(),
    scope: scopeMatch?.[1]?.trim() ?? "compile",
  };
}

/**
 * Extract all <dependency> blocks from a pom.xml string using regex.
 * Silently skips malformed entries.
 */
function extractDependenciesFromPom(pomContent: string): DependencyEntry[] {
  const results: DependencyEntry[] = [];
  // Match <dependency>...</dependency> blocks (including nested CDATA edge cases are ignored for simplicity)
  const depRegex = /<dependency>([\s\S]*?)<\/dependency>/g;
  let match: RegExpExecArray | null;

  while ((match = depRegex.exec(pomContent)) !== null) {
    const entry = parseDependencyBlock(match[1]);
    if (entry) {
      results.push(entry);
    }
  }
  return results;
}

/**
 * Scan a Maven project's pom.xml for dependencies and match against known projects.
 * Looks for pom.xml at repoPath root and one level of submodules.
 * Silently returns empty result on failure.
 */
export function scanMavenDependencies(
  project: string,
  repoPath: string,
  knownProjects: string[]
): DependencyScanResult {
  const dependencies: DependencyEntry[] = [];
  const knownSet = new Set(knownProjects.filter((p) => p !== project));

  // Helper: parse a single pom.xml file
  function parsePomFile(pomPath: string): void {
    let content: string;
    try {
      content = fs.readFileSync(pomPath, "utf-8");
    } catch {
      return; // File not found or unreadable — skip silently
    }

    const entries = extractDependenciesFromPom(content);
    for (const entry of entries) {
      // Match artifactId against known project names
      const resolved = knownSet.has(entry.artifactId) ? entry.artifactId : undefined;
      dependencies.push({
        ...entry,
        resolvedProject: resolved,
      });
    }
  }

  // Root pom.xml
  parsePomFile(path.join(repoPath, "pom.xml"));

  // Submodule pom.xml files (one level deep)
  try {
    const entries = fs.readdirSync(repoPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        parsePomFile(path.join(repoPath, entry.name, "pom.xml"));
      }
    }
  } catch {
    // Directory unreadable — skip silently
  }

  return { project, dependencies };
}

/**
 * Scan all projects in a product line for Maven dependencies.
 * Persists results to project_dependencies table.
 * Returns the total count of new dependencies found.
 */
export function scanProductLineDependencies(productLineId: string): number {
  const projects = getRepoMappingsByProductLine(productLineId);
  const knownProjects = projects.map((p) => p.project);

  let newCount = 0;
  for (const proj of projects) {
    const result = scanMavenDependencies(proj.project, proj.localPath, knownProjects);

    for (const dep of result.dependencies) {
      if (!dep.resolvedProject) continue;

      // Insert dependency: upstream = resolved (the library being depended on), downstream = current project
      try {
        const db = getDb();
        db.prepare(
          `INSERT INTO project_dependencies (upstream_project, downstream_project, dep_type, dep_details, source, updated_at)
           VALUES (?, ?, ?, ?, 'pom-scan', datetime('now'))
           ON CONFLICT(upstream_project, downstream_project) DO UPDATE SET
             dep_type = excluded.dep_type,
             dep_details = excluded.dep_details,
             source = 'pom-scan',
             updated_at = datetime('now')`
        ).run(
          dep.resolvedProject,
          proj.project,
          dep.scope,
          JSON.stringify({ groupId: dep.groupId, artifactId: dep.artifactId, version: dep.version })
        );
        newCount++;
      } catch {
        // Skip on DB error (e.g., FK violation if project not in repo_mappings)
      }
    }
  }

  return newCount;
}

// ---- Public API detection (change point 15) ----

/**
 * Determine if a changed file qualifies as a public API surface.
 * Returns true only when the project has downstream dependents AND
 * the file path matches a public API pattern.
 */
export function isPublicAPI(filePath: string, project: string): boolean {
  const db = getDb();

  // Check if this project has any downstream dependents
  const row = db
    .prepare("SELECT COUNT(*) AS cnt FROM project_dependencies WHERE upstream_project = ?")
    .get(project) as { cnt: number } | undefined;

  if (!row || row.cnt === 0) return false;

  return PUBLIC_API_PATTERNS.some((p) => p.test(filePath));
}

// ---- Downstream impact analysis ----

/**
 * Find downstream projects affected by changes in the given project files.
 * Only reports downstream impact for files that match public API patterns.
 */
export function getAffectedDownstreams(
  project: string,
  changedFiles: string[]
): AffectedDownstream[] {
  const db = getDb();
  const downstreams = db
    .prepare(
      `SELECT downstream_project, dep_type FROM project_dependencies WHERE upstream_project = ?`
    )
    .all(project) as Array<{ downstream_project: string; dep_type: string }>;

  if (downstreams.length === 0) return [];

  // Filter changed files to only public API files
  const publicFiles = changedFiles.filter((f) => isPublicAPI(f, project));
  if (publicFiles.length === 0) return [];

  return downstreams.map((dep) => ({
    downstream: dep.downstream_project,
    reason: `改动影响 ${project} 的公共 API (${dep.dep_type} 依赖)`,
    affectedFiles: publicFiles,
  }));
}

/**
 * Build a dependency-aware prompt snippet to inject into review context.
 * Returns a string of at most ~200 tokens.
 * Returns empty string if no downstream impact detected.
 */
export function buildDependencyPrompt(
  project: string,
  changedFiles: string[]
): string {
  const affected = getAffectedDownstreams(project, changedFiles);
  if (affected.length === 0) return "";

  const downstreamList = affected
    .map((a) => `- ${a.downstream} (${a.reason.split("(")[1]?.replace(")", "") ?? "依赖"})`)
    .join("\n");

  const publicFiles = affected[0]?.affectedFiles
    .map((f) => path.basename(f))
    .join(", ");

  return [
    "## 跨项目影响提示",
    `本次评审涉及 ${project} 的改动。以下项目依赖 ${project}:`,
    downstreamList,
    "",
    `改动文件: ${publicFiles ?? "无公共 API 文件"}`,
    "请检查:",
    "1. 接口签名是否向后兼容",
    "2. DTO 字段是否只增不删",
    "3. 是否需要通知下游项目开发者",
  ].join("\n");
}

// ---- CRUD operations ----

/**
 * Add a dependency record. Returns true on success.
 */
export function addDependency(
  upstream: string,
  downstream: string,
  depType: string,
  source: string = "manual"
): boolean {
  const db = getDb();
  try {
    db.prepare(
      `INSERT INTO project_dependencies (upstream_project, downstream_project, dep_type, source, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))`
    ).run(upstream, downstream, depType, source);
    return true;
  } catch {
    return false;
  }
}

/**
 * Remove a dependency by its id. Returns true if a row was deleted.
 */
export function removeDependency(id: number): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM project_dependencies WHERE id = ?").run(id);
  return result.changes > 0;
}

/**
 * Get dependency records, optionally filtered by a project that belongs
 * to a given product line (either as upstream or downstream).
 */
export function getDependencies(productLineId?: string): DependencyRecord[] {
  const db = getDb();

  if (!productLineId) {
    return (db.prepare("SELECT * FROM project_dependencies ORDER BY upstream_project, downstream_project").all() as Array<Record<string, unknown>>).map(mapDepRow);
  }

  // Filter by projects belonging to the product line
  const rows = db.prepare(
    `SELECT pd.* FROM project_dependencies pd
     INNER JOIN repo_mappings rm_up ON pd.upstream_project = rm_up.project
     INNER JOIN repo_mappings rm_down ON pd.downstream_project = rm_down.project
     WHERE rm_up.product_line_id = ? OR rm_down.product_line_id = ?
     ORDER BY pd.upstream_project, pd.downstream_project`
  ).all(productLineId, productLineId) as Array<Record<string, unknown>>;

  return rows.map(mapDepRow);
}

function mapDepRow(row: Record<string, unknown>): DependencyRecord {
  return {
    id: row.id as number,
    upstreamProject: row.upstream_project as string,
    downstreamProject: row.downstream_project as string,
    depType: row.dep_type as string,
    depDetails: row.dep_details as string | null,
    source: row.source as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
