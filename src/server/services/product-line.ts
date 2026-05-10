import { getDb } from "../db";
import type { ProductLine } from "../../shared/types";

interface ProductLineRow {
  id: string;
  name: string;
  description: string | null;
  knowledge_scope: string | null;
  default_dimension_set_id: string | null;
  config_json: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: ProductLineRow): ProductLine {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    knowledgeScope: row.knowledge_scope,
    defaultDimensionSetId: row.default_dimension_set_id,
    configJson: row.config_json,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CreateProductLineParams {
  id: string;
  name: string;
  description?: string;
  knowledgeScope?: string;
  defaultDimensionSetId?: string;
  configJson?: string;
  createdBy?: string;
}

export function createProductLine(params: CreateProductLineParams): ProductLine {
  const db = getDb();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO product_lines (id, name, description, knowledge_scope, default_dimension_set_id, config_json, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    params.id, params.name, params.description ?? null,
    params.knowledgeScope ?? null, params.defaultDimensionSetId ?? null,
    params.configJson ?? null, params.createdBy ?? null, now, now
  );

  return getProductLine(params.id)!;
}

export function getProductLine(id: string): ProductLine | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM product_lines WHERE id = ?")
    .get(id) as ProductLineRow | undefined;
  return row ? mapRow(row) : null;
}

export function listProductLines(): ProductLine[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM product_lines ORDER BY name")
    .all() as ProductLineRow[];
  return rows.map(mapRow);
}

export interface UpdateProductLineParams {
  name?: string;
  description?: string;
  knowledgeScope?: string;
  defaultDimensionSetId?: string;
  configJson?: string;
}

export function updateProductLine(id: string, params: UpdateProductLineParams): ProductLine | null {
  const db = getDb();
  const existing = getProductLine(id);
  if (!existing) return null;

  const sets: string[] = [];
  const values: unknown[] = [];

  if (params.name !== undefined) { sets.push("name = ?"); values.push(params.name); }
  if (params.description !== undefined) { sets.push("description = ?"); values.push(params.description); }
  if (params.knowledgeScope !== undefined) { sets.push("knowledge_scope = ?"); values.push(params.knowledgeScope); }
  if (params.defaultDimensionSetId !== undefined) { sets.push("default_dimension_set_id = ?"); values.push(params.defaultDimensionSetId); }
  if (params.configJson !== undefined) { sets.push("config_json = ?"); values.push(params.configJson); }

  if (sets.length === 0) return existing;

  sets.push("updated_at = datetime('now')");
  values.push(id);
  db.prepare(`UPDATE product_lines SET ${sets.join(", ")} WHERE id = ?`).run(...values);

  return getProductLine(id);
}

export function deleteProductLine(id: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM product_lines WHERE id = ?").run(id);
  return result.changes > 0;
}

export function addProjectToProductLine(productLineId: string, project: string): boolean {
  const db = getDb();
  const result = db.prepare("UPDATE repo_mappings SET product_line_id = ? WHERE project = ?")
    .run(productLineId, project);
  return result.changes > 0;
}

export function removeProjectFromProductLine(project: string): boolean {
  const db = getDb();
  const result = db.prepare("UPDATE repo_mappings SET product_line_id = NULL WHERE project = ? AND product_line_id IS NOT NULL")
    .run(project);
  return result.changes > 0;
}
