import { getDb } from "../db";
import type { ReviewJob, ReviewJobStatus } from "../../shared/types";

export interface CreateJobParams {
  project: string;
  sourceBranch: string;
  targetBranch: string;
  excludedFilesJson: string | null;
  createdBy: string | null;
}

export interface UpdateJobPatch {
  status?: ReviewJobStatus;
  currentStep?: number;
  currentLabel?: string | null;
  stepsJson?: string;
  reviewId?: string | null;
  errorMessage?: string | null;
}

export function createJob(params: CreateJobParams): ReviewJob {
  const db = getDb();
  const id = `JOB-${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO review_jobs (id, project, source_branch, target_branch, excluded_files_json, status, current_step, steps_json, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'pending', 0, '[]', ?, ?, ?)`
  ).run(id, params.project, params.sourceBranch, params.targetBranch, params.excludedFilesJson, params.createdBy, now, now);

  return {
    id,
    project: params.project,
    sourceBranch: params.sourceBranch,
    targetBranch: params.targetBranch,
    excludedFilesJson: params.excludedFilesJson,
    status: "pending",
    reviewId: null,
    currentStep: 0,
    currentLabel: null,
    stepsJson: "[]",
    errorMessage: null,
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };
}

export function findJobById(id: string): ReviewJob | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM review_jobs WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? mapRowToJob(row) : null;
}

export function findActiveJobByUser(userId: string): ReviewJob | null {
  const db = getDb();
  const row = db.prepare(
    "SELECT * FROM review_jobs WHERE created_by = ? AND status = 'running' ORDER BY created_at DESC LIMIT 1"
  ).get(userId) as Record<string, unknown> | undefined;
  return row ? mapRowToJob(row) : null;
}

export function updateJob(id: string, patch: UpdateJobPatch): boolean {
  const db = getDb();
  const existing = db.prepare("SELECT id FROM review_jobs WHERE id = ?").get(id);
  if (!existing) return false;

  const sets: string[] = [];
  const values: unknown[] = [];
  if (patch.status !== undefined) { sets.push("status = ?"); values.push(patch.status); }
  if (patch.currentStep !== undefined) { sets.push("current_step = ?"); values.push(patch.currentStep); }
  if (patch.currentLabel !== undefined) { sets.push("current_label = ?"); values.push(patch.currentLabel); }
  if (patch.stepsJson !== undefined) { sets.push("steps_json = ?"); values.push(patch.stepsJson); }
  if (patch.reviewId !== undefined) { sets.push("review_id = ?"); values.push(patch.reviewId); }
  if (patch.errorMessage !== undefined) { sets.push("error_message = ?"); values.push(patch.errorMessage); }
  if (sets.length === 0) return true;

  sets.push("updated_at = datetime('now')");
  values.push(id);
  db.prepare(`UPDATE review_jobs SET ${sets.join(", ")} WHERE id = ?`).run(...values);
  return true;
}

export function resetStuckJobs(): number {
  const db = getDb();
  // Reset jobs stuck in running or pending for more than 5 minutes
  const result = db.prepare(`
    UPDATE review_jobs
    SET status = 'failed', error_message = 'Server restarted during review', updated_at = datetime('now')
    WHERE status IN ('running', 'pending')
      AND updated_at < datetime('now', '-5 minutes')
  `).run();
  return result.changes;
}

function mapRowToJob(row: Record<string, unknown>): ReviewJob {
  return {
    id: row.id as string,
    project: row.project as string,
    sourceBranch: row.source_branch as string,
    targetBranch: row.target_branch as string,
    excludedFilesJson: row.excluded_files_json as string | null,
    status: row.status as ReviewJobStatus,
    reviewId: row.review_id as string | null,
    currentStep: row.current_step as number,
    currentLabel: row.current_label as string | null,
    stepsJson: row.steps_json as string | null,
    errorMessage: row.error_message as string | null,
    createdBy: row.created_by as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
