import { Router, Request, Response } from "express";
import { requestPause } from "../services/review-pause-controller";
import {
  findCheckpointById,
  listCheckpoints,
  deleteCheckpoint,
  abandonCheckpoint,
} from "../services/review-checkpoint-store";
import { updateJob } from "../services/review-job-store";
import { updateReview } from "../services/review-store";
import type { PauseRequest, ResumeRequest, CheckpointFilter } from "../../shared/types";

const router = Router();

// ---- POST /pause — request a running review to pause ----

router.post("/pause", (req: Request, res: Response) => {
  const { jobId }: PauseRequest = req.body;

  if (!jobId) {
    res.status(400).json({ error: "jobId is required" });
    return;
  }

  requestPause(jobId);
  res.json({ success: true, message: "Pause requested", jobId });
});

// ---- POST /resume — restore from checkpoint ----

router.post("/resume", (req: Request, res: Response) => {
  const { checkpointId }: ResumeRequest = req.body;

  if (!checkpointId) {
    res.status(400).json({ error: "checkpointId is required" });
    return;
  }

  const checkpoint = findCheckpointById(checkpointId);
  if (!checkpoint) {
    res.status(404).json({ error: "Checkpoint not found" });
    return;
  }

  if (checkpoint.status !== "paused") {
    res.status(400).json({ error: `Checkpoint status is "${checkpoint.status}", expected "paused"` });
    return;
  }

  res.json({ checkpoint });
});

// ---- GET /checkpoints — list checkpoints with optional filters ----

router.get("/checkpoints", (req: Request, res: Response) => {
  const filter: CheckpointFilter = {};

  if (typeof req.query.project === "string") filter.project = req.query.project;
  if (typeof req.query.status === "string") filter.status = req.query.status as CheckpointFilter["status"];
  if (typeof req.query.review_type === "string") filter.reviewType = req.query.review_type as CheckpointFilter["reviewType"];

  const checkpoints = listCheckpoints(filter);
  res.json(checkpoints);
});

// ---- DELETE /checkpoints/:id — delete or abandon a checkpoint ----

router.delete("/checkpoints/:id", (req: Request, res: Response) => {
  const id = req.params.id as string;
  const abandon = req.query.abandon === "true";

  const checkpoint = findCheckpointById(id);
  if (!checkpoint) {
    res.status(404).json({ error: "Checkpoint not found" });
    return;
  }

  if (abandon) {
    abandonCheckpoint(id);
    // Sync: mark the associated job as failed so it doesn't trigger paused UI on reload
    if (checkpoint.jobId) {
      updateJob(checkpoint.jobId, { status: "failed", errorMessage: "评审已放弃" });
    }
    // Sync: mark the associated review as interrupted so it doesn't show as active
    if (checkpoint.accumulatedStats) {
      try {
        const stats = JSON.parse(checkpoint.accumulatedStats as string || "{}");
        if (stats.reviewId) updateReview(stats.reviewId, { status: "interrupted" });
      } catch { /* ignore */ }
    }
    res.json({ success: true, action: "abandoned", id });
  } else {
    deleteCheckpoint(id);
    res.json({ success: true, action: "deleted", id });
  }
});

export default router;
