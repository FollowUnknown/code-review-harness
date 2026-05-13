import type { Response } from "express";
import type {
  ProgressEvent,
  SSEPayload,
  SSEReviewCreated,
  SSEReviewStart,
  SSEBatchResult,
  SSEPaused,
  SSEResumed,
} from "../../shared/types";

/**
 * Shared SSE helpers (v1.4.4).
 *
 * Extracted from three duplicate inline implementations in:
 *   review.ts / review-local.ts / review-requirement.ts
 *
 * Usage:
 *   const { sendSSE, nextStep, completeStep, getStep, sendEvent } = createSSEHelpers(res);
 */

export interface SSEHelpers {
  sendSSE(event: SSEPayload): void;
  nextStep(label: string, detail?: string): void;
  completeStep(detail?: string): void;
  getStep(): number;
  sendEvent(type: "review_created", data: SSEReviewCreated): void;
  sendEvent(type: "review_start", data: SSEReviewStart): void;
  sendEvent(type: "batch_result", data: SSEBatchResult): void;
  sendEvent(type: "paused", data: SSEPaused): void;
  sendEvent(type: "resumed", data: SSEResumed): void;
}

export function createSSEHelpers(res: Response): SSEHelpers {
  let step = 0;

  function sendSSE(event: SSEPayload): void {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  function nextStep(label: string, detail?: string): void {
    step++;
    const payload: ProgressEvent = { step, status: "running", label };
    if (detail !== undefined) payload.detail = detail;
    sendSSE(payload);
  }

  function completeStep(detail?: string): void {
    const payload: ProgressEvent = { step, status: "done", label: "", detail: detail ?? "" };
    sendSSE(payload);
  }

  function getStep(): number {
    return step;
  }

  function sendEvent(
    type: "review_created" | "review_start" | "batch_result" | "paused" | "resumed",
    data: SSEReviewCreated | SSEReviewStart | SSEBatchResult | SSEPaused | SSEResumed,
  ): void {
    sendSSE({ type, ...data } as SSEPayload);
  }

  return { sendSSE, nextStep, completeStep, getStep, sendEvent };
}
