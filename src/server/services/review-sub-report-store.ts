import { getDb, getReadDb } from "../db";
import type { ReviewSubReport, SubReportStatus } from "../../shared/types";

export function createSubReport(
  reviewId: string,
  project: string,
  techStack: string,
): number {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO review_sub_reports (review_id, project, tech_stack, status)
    VALUES (?, ?, ?, 'pending')
  `).run(reviewId, project, techStack);
  return result.lastInsertRowid as number;
}

export function updateSubReport(
  id: number,
  patch: Partial<{
    status: SubReportStatus;
    report_json: string;
    classification_json: string;
    score: number | null;
    issue_count: number | null;
    critical_count: number;
    error_message: string | null;
  }>,
): boolean {
  const db = getDb();
  const existing = db.prepare("SELECT id FROM review_sub_reports WHERE id = ?").get(id);
  if (!existing) return false;

  const sets: string[] = [];
  const values: unknown[] = [];

  if (patch.status !== undefined) { sets.push("status = ?"); values.push(patch.status); }
  if (patch.report_json !== undefined) { sets.push("report_json = ?"); values.push(patch.report_json); }
  if (patch.classification_json !== undefined) { sets.push("classification_json = ?"); values.push(patch.classification_json); }
  if (patch.score !== undefined) { sets.push("score = ?"); values.push(patch.score); }
  if (patch.issue_count !== undefined) { sets.push("issue_count = ?"); values.push(patch.issue_count); }
  if (patch.critical_count !== undefined) { sets.push("critical_count = ?"); values.push(patch.critical_count); }
  if (patch.error_message !== undefined) { sets.push("error_message = ?"); values.push(patch.error_message); }

  if (sets.length === 0) return true;

  sets.push("updated_at = datetime('now')");
  values.push(id);
  db.prepare(`UPDATE review_sub_reports SET ${sets.join(", ")} WHERE id = ?`).run(...values);
  return true;
}

export function listSubReports(reviewId: string): ReviewSubReport[] {
  const db = getReadDb();
  const rows = db.prepare(
    "SELECT * FROM review_sub_reports WHERE review_id = ? ORDER BY id ASC"
  ).all(reviewId) as Record<string, unknown>[];
  return rows.map(mapRow);
}

export function findSubReportById(id: number): ReviewSubReport | null {
  const db = getReadDb();
  const row = db.prepare("SELECT * FROM review_sub_reports WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? mapRow(row) : null;
}

export function deleteSubReportsByReviewId(reviewId: string): number {
  const db = getDb();
  const result = db.prepare("DELETE FROM review_sub_reports WHERE review_id = ?").run(reviewId);
  return result.changes;
}

function mapRow(row: Record<string, unknown>): ReviewSubReport {
  return {
    id: row.id as number,
    review_id: row.review_id as string,
    project: row.project as string,
    tech_stack: row.tech_stack as ReviewSubReport["tech_stack"],
    status: row.status as SubReportStatus,
    report_json: row.report_json as string | null,
    classification_json: row.classification_json as string | null,
    score: row.score as number | null,
    issue_count: row.issue_count as number | null,
    critical_count: (row.critical_count as number) ?? 0,
    error_message: row.error_message as string | null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}
