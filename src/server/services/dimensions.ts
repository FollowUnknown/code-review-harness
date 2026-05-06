import { getDb } from "../db";
import type { DimensionSet } from "../../shared/types";
import type { TechStack } from "./techstack";

export function getDimensionsForProject(projectPath: string | null, techStack?: TechStack): string[] {
  const db = getDb();

  // 1. Tech-stack match (highest priority for auto-detected stacks)
  if (techStack && techStack !== "unknown") {
    const tsMatch = db.prepare(
      "SELECT dimensions FROM review_dimension_sets WHERE project = ? LIMIT 1"
    ).get(techStack) as { dimensions: string } | undefined;
    if (tsMatch) return JSON.parse(tsMatch.dimensions);
  }

  // 2. Exact project path match
  if (projectPath) {
    const exact = db.prepare(
      "SELECT dimensions FROM review_dimension_sets WHERE project = ? LIMIT 1"
    ).get(projectPath) as { dimensions: string } | undefined;
    if (exact) return JSON.parse(exact.dimensions);

    // 3. Prefix match
    const parts = projectPath.split("/");
    for (let i = parts.length - 1; i >= 1; i--) {
      const prefix = parts.slice(0, i).join("/");
      const match = db.prepare(
        "SELECT dimensions FROM review_dimension_sets WHERE project = ? LIMIT 1"
      ).get(prefix) as { dimensions: string } | undefined;
      if (match) return JSON.parse(match.dimensions);
    }
  }

  // 4. Fallback: default set
  const def = db.prepare(
    "SELECT dimensions FROM review_dimension_sets WHERE is_default = 1 LIMIT 1"
  ).get() as { dimensions: string } | undefined;
  if (def) return JSON.parse(def.dimensions);

  // Ultimate fallback (should not happen after seed)
  return [];
}

export function listDimensionSets(): DimensionSet[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM review_dimension_sets ORDER BY is_default DESC, name").all() as Array<Record<string, unknown>>;
  return rows.map(formatDimensionSet);
}

export function createDimensionSet(input: { name: string; project?: string; dimensions: string[]; focus_areas?: string[]; created_by: string }): DimensionSet {
  const db = getDb();
  const id = `DS-${Date.now().toString(36)}`;
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO review_dimension_sets (id, name, project, dimensions, focus_areas, is_default, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`
  ).run(id, input.name, input.project ?? null, JSON.stringify(input.dimensions), input.focus_areas ? JSON.stringify(input.focus_areas) : null, input.created_by, now, now);

  return { id, name: input.name, project: input.project ?? null, dimensions: input.dimensions, focus_areas: input.focus_areas ?? null, is_default: false, created_by: input.created_by, created_at: now, updated_at: now };
}

export function updateDimensionSet(id: string, input: Partial<Pick<DimensionSet, "name" | "project" | "dimensions" | "focus_areas">>): DimensionSet | undefined {
  const db = getDb();
  const fields: string[] = [];
  const params: unknown[] = [];

  if (input.name !== undefined) { fields.push("name = ?"); params.push(input.name); }
  if (input.project !== undefined) { fields.push("project = ?"); params.push(input.project); }
  if (input.dimensions !== undefined) { fields.push("dimensions = ?"); params.push(JSON.stringify(input.dimensions)); }
  if (input.focus_areas !== undefined) { fields.push("focus_areas = ?"); params.push(JSON.stringify(input.focus_areas)); }

  if (fields.length === 0) {
    const row = db.prepare("SELECT * FROM review_dimension_sets WHERE id = ?").get(id);
    return row ? formatDimensionSet(row as Record<string, unknown>) : undefined;
  }

  fields.push("updated_at = ?");
  params.push(new Date().toISOString());
  params.push(id);

  db.prepare(`UPDATE review_dimension_sets SET ${fields.join(", ")} WHERE id = ?`).run(...params);

  const row = db.prepare("SELECT * FROM review_dimension_sets WHERE id = ?").get(id);
  return row ? formatDimensionSet(row as Record<string, unknown>) : undefined;
}

export function deleteDimensionSet(id: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM review_dimension_sets WHERE id = ? AND is_default = 0").run(id);
  return result.changes > 0;
}

function formatDimensionSet(row: Record<string, unknown>): DimensionSet {
  return {
    id: row.id as string,
    name: row.name as string,
    project: (row.project as string) || null,
    dimensions: JSON.parse(row.dimensions as string),
    focus_areas: row.focus_areas ? JSON.parse(row.focus_areas as string) : null,
    is_default: Boolean(row.is_default),
    created_by: row.created_by as string,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}
