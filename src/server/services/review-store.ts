import { getDb } from "../db";
import type { ReviewRecord, ReviewListItem, ReviewFilter, PaginatedResult, ReviewReport } from "../../shared/types";

export function saveReviewRecord(record: Omit<ReviewRecord, "created_at" | "updated_at"> & { knowledge_dispositions_json?: string }): string {
  const db = getDb();
  db.prepare(`
    INSERT INTO reviews (
      id, mr_url, project, product_line_id, author, status,
      report_json, classification_json, requirement_json, mr_meta_json,
      reviewed_commit_sha, passed, avg_score, issue_count, critical_count,
      created_by, knowledge_dispositions_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.id, record.mr_url, record.project, record.product_line_id ?? null, record.author, record.status,
    record.report_json, record.classification_json, record.requirement_json, record.mr_meta_json,
    record.reviewed_commit_sha, record.passed ? 1 : 0, record.avg_score, record.issue_count,
    record.critical_count, record.created_by, record.knowledge_dispositions_json ?? null
  );
  return record.id;
}

export function findReviewById(id: string): ReviewRecord | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM reviews WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  return mapRowToRecord(row);
}

export function listReviews(filter: ReviewFilter): PaginatedResult<ReviewListItem> {
  const db = getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filter.project) { conditions.push("project = ?"); params.push(filter.project); }
  if (filter.product_line_id) { conditions.push("product_line_id = ?"); params.push(filter.product_line_id); }
  if (filter.createdBy) { conditions.push("created_by = ?"); params.push(filter.createdBy); }
  if (filter.status) { conditions.push("status = ?"); params.push(filter.status); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countRow = db.prepare(`SELECT COUNT(*) as total FROM reviews ${where}`).get(...params) as { total: number };
  const total = countRow.total;

  const offset = (filter.page - 1) * filter.pageSize;
  const rows = db.prepare(
    `SELECT id, mr_url, project, product_line_id, author, status, passed, avg_score, issue_count, critical_count, created_by, created_at
     FROM reviews ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).all(...params, filter.pageSize, offset) as Record<string, unknown>[];

  return {
    items: rows.map(mapRowToListItem),
    total,
    page: filter.page,
    pageSize: filter.pageSize,
    totalPages: Math.ceil(total / filter.pageSize),
  };
}

export function updateReview(id: string, patch: Partial<Pick<ReviewRecord, "status" | "report_json" | "classification_json" | "requirement_json" | "reviewed_commit_sha" | "passed" | "avg_score" | "issue_count" | "critical_count">>): boolean {
  const db = getDb();
  const existing = db.prepare("SELECT id FROM reviews WHERE id = ?").get(id);
  if (!existing) return false;

  const sets: string[] = [];
  const values: unknown[] = [];

  if (patch.status !== undefined) { sets.push("status = ?"); values.push(patch.status); }
  if (patch.report_json !== undefined) { sets.push("report_json = ?"); values.push(patch.report_json); }
  if (patch.classification_json !== undefined) { sets.push("classification_json = ?"); values.push(patch.classification_json); }
  if (patch.requirement_json !== undefined) { sets.push("requirement_json = ?"); values.push(patch.requirement_json); }
  if (patch.reviewed_commit_sha !== undefined) { sets.push("reviewed_commit_sha = ?"); values.push(patch.reviewed_commit_sha); }
  if (patch.passed !== undefined) { sets.push("passed = ?"); values.push(patch.passed ? 1 : 0); }
  if (patch.avg_score !== undefined) { sets.push("avg_score = ?"); values.push(patch.avg_score); }
  if (patch.issue_count !== undefined) { sets.push("issue_count = ?"); values.push(patch.issue_count); }
  if (patch.critical_count !== undefined) { sets.push("critical_count = ?"); values.push(patch.critical_count); }

  if (sets.length === 0) return true;

  sets.push("updated_at = datetime('now')");
  values.push(id);
  db.prepare(`UPDATE reviews SET ${sets.join(", ")} WHERE id = ?`).run(...values);
  return true;
}

export function deleteReview(id: string): boolean {
  const db = getDb();
  db.prepare("DELETE FROM review_knowledge_usage WHERE review_id = ?").run(id);
  db.prepare("DELETE FROM llm_logs WHERE review_id = ?").run(id);
  const result = db.prepare("DELETE FROM reviews WHERE id = ?").run(id);
  return result.changes > 0;
}

export function computeReviewStats(report: ReviewReport): { avgScore: number | null; issueCount: number; criticalCount: number } {
  const avgScore = report.scores.length > 0
    ? Math.round(report.scores.reduce((sum, s) => sum + s.score, 0) / report.scores.length * 10) / 10
    : null;
  return {
    avgScore,
    issueCount: report.issues.length,
    criticalCount: report.issues.filter((i) => i.severity === "CRITICAL").length,
  };
}

function mapRowToRecord(row: Record<string, unknown>): ReviewRecord {
  return {
    id: row.id as string,
    mr_url: row.mr_url as string,
    project: row.project as string | null,
    product_line_id: row.product_line_id as string | null,
    author: row.author as string | null,
    status: row.status as "completed" | "draft",
    report_json: row.report_json as string,
    classification_json: row.classification_json as string | null,
    requirement_json: row.requirement_json as string | null,
    mr_meta_json: row.mr_meta_json as string | null,
    reviewed_commit_sha: row.reviewed_commit_sha as string | null,
    passed: row.passed === 1,
    avg_score: row.avg_score as number | null,
    issue_count: row.issue_count as number | null,
    critical_count: row.critical_count as number,
    knowledge_dispositions_json: (row.knowledge_dispositions_json as string) || null,
    created_by: row.created_by as string | null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function mapRowToListItem(row: Record<string, unknown>): ReviewListItem {
  return {
    id: row.id as string,
    mr_url: row.mr_url as string,
    project: row.project as string | null,
    product_line_id: row.product_line_id as string | null,
    author: row.author as string | null,
    status: row.status as "completed" | "draft",
    passed: row.passed === null ? null : row.passed === 1,
    avg_score: row.avg_score as number | null,
    issue_count: row.issue_count as number | null,
    critical_count: (row.critical_count as number) ?? 0,
    created_by: row.created_by as string | null,
    created_at: row.created_at as string,
  };
}
