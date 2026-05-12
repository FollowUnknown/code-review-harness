import { randomUUID } from "crypto";
import { getDb } from "../db";
import type {
  ReviewCheckpoint,
  ReviewType,
  CheckpointStatus,
  CheckpointFilter,
} from "../../shared/types";

// ---- Create ----

export interface CreateCheckpointParams {
  reviewType: ReviewType;
  projectId: string;
  sourceBranch?: string;
  targetBranch?: string;
  totalBatches: number;
  totalFiles: number;
  currentBatch: number;
  reviewedCount: number;
  batchResults?: string;
  accumulatedScores?: string;
  accumulatedStats?: string;
  jobId?: string;
  createdBy?: string;
}

export function createCheckpoint(params: CreateCheckpointParams): ReviewCheckpoint {
  const db = getDb();
  const id = `CP-${randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO review_checkpoints
       (id, review_type, project_id, source_branch, target_branch, status,
        current_batch, total_batches, total_files, reviewed_count,
        batch_results, accumulated_scores, accumulated_stats,
        job_id, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'running', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    params.reviewType,
    params.projectId,
    params.sourceBranch ?? null,
    params.targetBranch ?? null,
    params.currentBatch,
    params.totalBatches,
    params.totalFiles,
    params.reviewedCount,
    params.batchResults ?? "[]",
    params.accumulatedScores ?? "[]",
    params.accumulatedStats ?? "{}",
    params.jobId ?? null,
    params.createdBy ?? null,
    now,
    now,
  );

  return findCheckpointById(id)!;
}

// ---- Read ----

export function findCheckpointById(id: string): ReviewCheckpoint | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM review_checkpoints WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? mapRowToCheckpoint(row) : null;
}

export function findCheckpointByJobId(jobId: string): ReviewCheckpoint | null {
  const db = getDb();
  const row = db.prepare(
    "SELECT * FROM review_checkpoints WHERE job_id = ? ORDER BY created_at DESC LIMIT 1",
  ).get(jobId) as Record<string, unknown> | undefined;
  return row ? mapRowToCheckpoint(row) : null;
}

export function listCheckpoints(filter?: CheckpointFilter): ReviewCheckpoint[] {
  const db = getDb();
  const clauses: string[] = [];
  const values: unknown[] = [];

  if (filter?.project) {
    clauses.push("project_id = ?");
    values.push(filter.project);
  }
  if (filter?.status) {
    clauses.push("status = ?");
    values.push(filter.status);
  }
  if (filter?.reviewType) {
    clauses.push("review_type = ?");
    values.push(filter.reviewType);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db.prepare(
    `SELECT * FROM review_checkpoints ${where} ORDER BY created_at DESC`,
  ).all(...values) as Record<string, unknown>[];

  return rows.map(mapRowToCheckpoint);
}

// ---- Update ----

export interface UpdateCheckpointPatch {
  status?: CheckpointStatus;
  currentBatch?: number;
  reviewedCount?: number;
  batchResults?: string;
  accumulatedScores?: string;
  accumulatedStats?: string;
}

export function updateCheckpoint(id: string, patch: UpdateCheckpointPatch): boolean {
  const db = getDb();
  const existing = db.prepare("SELECT id FROM review_checkpoints WHERE id = ?").get(id);
  if (!existing) return false;

  const sets: string[] = [];
  const values: unknown[] = [];

  if (patch.status !== undefined) { sets.push("status = ?"); values.push(patch.status); }
  if (patch.currentBatch !== undefined) { sets.push("current_batch = ?"); values.push(patch.currentBatch); }
  if (patch.reviewedCount !== undefined) { sets.push("reviewed_count = ?"); values.push(patch.reviewedCount); }
  if (patch.batchResults !== undefined) { sets.push("batch_results = ?"); values.push(patch.batchResults); }
  if (patch.accumulatedScores !== undefined) { sets.push("accumulated_scores = ?"); values.push(patch.accumulatedScores); }
  if (patch.accumulatedStats !== undefined) { sets.push("accumulated_stats = ?"); values.push(patch.accumulatedStats); }

  if (sets.length === 0) return true;

  sets.push("updated_at = datetime('now')");
  values.push(id);
  db.prepare(`UPDATE review_checkpoints SET ${sets.join(", ")} WHERE id = ?`).run(...values);
  return true;
}

// ---- Delete ----

export function deleteCheckpoint(id: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM review_checkpoints WHERE id = ?").run(id);
  return result.changes > 0;
}

/** Soft-delete: mark as abandoned instead of deleting. */
export function abandonCheckpoint(id: string): boolean {
  return updateCheckpoint(id, { status: "abandoned" });
}

/** Mark checkpoint as completed. */
export function completeCheckpoint(id: string): boolean {
  return updateCheckpoint(id, { status: "completed" });
}

// ---- Helpers ----

function mapRowToCheckpoint(row: Record<string, unknown>): ReviewCheckpoint {
  return {
    id: row.id as string,
    reviewType: row.review_type as ReviewType,
    projectId: row.project_id as string,
    sourceBranch: (row.source_branch as string) ?? undefined,
    targetBranch: (row.target_branch as string) ?? undefined,
    status: row.status as CheckpointStatus,
    currentBatch: row.current_batch as number,
    totalBatches: row.total_batches as number,
    totalFiles: row.total_files as number,
    reviewedCount: row.reviewed_count as number,
    batchResults: row.batch_results as string,
    accumulatedScores: row.accumulated_scores as string,
    accumulatedStats: row.accumulated_stats as string,
    jobId: (row.job_id as string) ?? undefined,
    createdBy: (row.created_by as string) ?? undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
