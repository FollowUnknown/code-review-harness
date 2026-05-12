/**
 * Review Pause Controller (v1.4.4).
 *
 * Module-scoped flag registry checked between review batches.
 * Shared by all three review types (MR / Local / Requirement).
 *
 * Flow:
 *   1. POST /api/review/pause { jobId } → requestPause(jobId)
 *   2. Current batch finishes → route calls isPauseRequested(jobId)
 *   3. If true → route saves checkpoint + emits paused SSE event
 *   4. POST /api/review/resume { checkpointId } → route calls clearPause(jobId)
 */

const pauseFlags = new Map<string, boolean>();

export function requestPause(jobId: string): void {
  pauseFlags.set(jobId, true);
}

export function isPauseRequested(jobId: string): boolean {
  return pauseFlags.get(jobId) === true;
}

export function clearPause(jobId: string): void {
  pauseFlags.delete(jobId);
}

/** Cleanup all flags for a job (e.g. on complete/abort/error). */
export function removeJob(jobId: string): void {
  pauseFlags.delete(jobId);
}
