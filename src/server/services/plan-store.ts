import { getDb } from "../db";
import type { ReviewPlan, ReviewPlanItem, ReviewPlanDetail, PlanListItem, PlanFilter, PaginatedResult } from "../../shared/types";

export function createPlan(title: string, description: string | null, createdBy: string): ReviewPlan {
  const db = getDb();
  const id = `PLAN-${crypto.randomUUID().slice(0, 8)}`;
  db.prepare(
    "INSERT INTO review_plans (id, title, description, created_by) VALUES (?, ?, ?, ?)"
  ).run(id, title, description, createdBy);
  return { id, title, description, status: "open", created_by: createdBy, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
}

export function findPlanById(id: string): ReviewPlan | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM review_plans WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? mapRowToPlan(row) : null;
}

export function listPlans(filter: PlanFilter): PaginatedResult<PlanListItem> {
  const db = getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filter.status) { conditions.push("p.status = ?"); params.push(filter.status); }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countRow = db.prepare(`SELECT COUNT(*) as total FROM review_plans p ${where}`).get(...params) as { total: number };
  const total = countRow.total;

  const offset = (filter.page - 1) * filter.pageSize;
  const rows = db.prepare(`
    SELECT p.*, COUNT(i.id) as item_count
    FROM review_plans p LEFT JOIN review_plan_items i ON p.id = i.plan_id
    ${where}
    GROUP BY p.id ORDER BY p.created_at DESC LIMIT ? OFFSET ?
  `).all(...params, filter.pageSize, offset) as Record<string, unknown>[];

  return {
    items: rows.map((r) => ({
      id: r.id as string,
      title: r.title as string,
      status: r.status as ReviewPlan["status"],
      item_count: r.item_count as number,
      created_by: r.created_by as string,
      created_at: r.created_at as string,
    })),
    total,
    page: filter.page,
    pageSize: filter.pageSize,
    totalPages: Math.ceil(total / filter.pageSize),
  };
}

export function updatePlan(id: string, patch: { title?: string; description?: string; status?: string }): boolean {
  const db = getDb();
  const existing = db.prepare("SELECT id FROM review_plans WHERE id = ?").get(id);
  if (!existing) return false;

  const sets: string[] = [];
  const values: unknown[] = [];
  if (patch.title !== undefined) { sets.push("title = ?"); values.push(patch.title); }
  if (patch.description !== undefined) { sets.push("description = ?"); values.push(patch.description); }
  if (patch.status !== undefined) { sets.push("status = ?"); values.push(patch.status); }
  if (sets.length === 0) return true;

  sets.push("updated_at = datetime('now')");
  values.push(id);
  db.prepare(`UPDATE review_plans SET ${sets.join(", ")} WHERE id = ?`).run(...values);
  return true;
}

export function deletePlan(id: string): boolean {
  const db = getDb();
  db.prepare("DELETE FROM review_plan_items WHERE plan_id = ?").run(id);
  const result = db.prepare("DELETE FROM review_plans WHERE id = ?").run(id);
  return result.changes > 0;
}

export function addPlanItems(planId: string, mrUrls: string[]): ReviewPlanItem[] {
  const db = getDb();
  const maxPos = db.prepare("SELECT COALESCE(MAX(position), -1) as pos FROM review_plan_items WHERE plan_id = ?").get(planId) as { pos: number };
  const items: ReviewPlanItem[] = [];

  const stmt = db.prepare("INSERT INTO review_plan_items (id, plan_id, mr_url, status, position) VALUES (?, ?, ?, 'pending', ?)");
  for (let i = 0; i < mrUrls.length; i++) {
    const id = `PI-${crypto.randomUUID().slice(0, 8)}`;
    stmt.run(id, planId, mrUrls[i], maxPos.pos + i + 1);
    items.push({ id, plan_id: planId, mr_url: mrUrls[i], review_id: null, status: "pending", position: maxPos.pos + i + 1, created_at: new Date().toISOString() });
  }
  return items;
}

export function removePlanItem(planId: string, itemId: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM review_plan_items WHERE id = ? AND plan_id = ?").run(itemId, planId);
  return result.changes > 0;
}

export function updatePlanItem(planId: string, itemId: string, patch: { status?: string; review_id?: string; position?: number }): boolean {
  const db = getDb();
  const existing = db.prepare("SELECT id FROM review_plan_items WHERE id = ? AND plan_id = ?").get(itemId, planId);
  if (!existing) return false;

  const sets: string[] = [];
  const values: unknown[] = [];
  if (patch.status !== undefined) { sets.push("status = ?"); values.push(patch.status); }
  if (patch.review_id !== undefined) { sets.push("review_id = ?"); values.push(patch.review_id); }
  if (patch.position !== undefined) { sets.push("position = ?"); values.push(patch.position); }
  if (sets.length === 0) return true;

  values.push(itemId);
  db.prepare(`UPDATE review_plan_items SET ${sets.join(", ")} WHERE id = ?`).run(...values);
  return true;
}

export function getPlanItems(planId: string): ReviewPlanItem[] {
  const db = getDb();
  return db.prepare("SELECT * FROM review_plan_items WHERE plan_id = ? ORDER BY position").all(planId) as ReviewPlanItem[];
}

export function getPlanDetail(id: string): ReviewPlanDetail | null {
  const plan = findPlanById(id);
  if (!plan) return null;
  const items = getPlanItems(id);
  return { ...plan, items };
}

function mapRowToPlan(row: Record<string, unknown>): ReviewPlan {
  return {
    id: row.id as string,
    title: row.title as string,
    description: row.description as string | null,
    status: row.status as ReviewPlan["status"],
    created_by: row.created_by as string,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}
