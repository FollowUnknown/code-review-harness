import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ReviewProgress } from "./ReviewProgress";
import type { BatchResultItem } from "./ReviewProgress";

const API_BASE = "";

interface ProgressStep {
  step: number;
  status: "running" | "done" | "error";
  label: string;
  detail?: string;
  progress?: number;
}

interface Props {
  mrUrl: string;
  lanhuUrl?: string;
  onComplete: (data: unknown) => void;
  onError: (message: string) => void;
}

export function ProgressStepper({ mrUrl, lanhuUrl, onComplete, onError }: Props) {
  const [steps, setSteps] = useState<ProgressStep[]>([]);
  const [failed, setFailed] = useState(false);
  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);
  onCompleteRef.current = onComplete;
  onErrorRef.current = onError;

  // v1.4.4: incremental review state
  const [reviewTotalBatches, setReviewTotalBatches] = useState(0);
  const [reviewTotalFiles, setReviewTotalFiles] = useState(0);
  const [reviewCompletedBatches, setReviewCompletedBatches] = useState(0);
  const [reviewReviewedFiles, setReviewReviewedFiles] = useState(0);
  const [reviewBatchResults, setReviewBatchResults] = useState<BatchResultItem[]>([]);
  const [showReviewProgress, setShowReviewProgress] = useState(false);

  // v1.4.4: pause/resume state
  const [isPaused, setIsPaused] = useState(false);
  const [isPausing, setIsPausing] = useState(false);
  const [isInterrupted, setIsInterrupted] = useState(false);
  const [checkpointId, setCheckpointId] = useState<string | null>(null);
  const jobIdRef = useRef<string | null>(null);

  const headers = (): Record<string, string> => {
    const token = localStorage.getItem("auth_token");
    return {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  };

  // v1.4.4: on mount, check for paused/interrupted checkpoints (page reload detection)
  useEffect(() => {
    async function checkRecoverableCheckpoints() {
      try {
        const [pausedRes, interruptedRes] = await Promise.all([
          fetch(`${API_BASE}/api/review/checkpoints?status=paused&review_type=mr`, { headers: headers() }),
          fetch(`${API_BASE}/api/review/checkpoints?status=interrupted&review_type=mr`, { headers: headers() }),
        ]);
        const paused = pausedRes.ok ? await pausedRes.json() : [];
        const interrupted = interruptedRes.ok ? await interruptedRes.json() : [];
        const all = [...(Array.isArray(paused) ? paused : []), ...(Array.isArray(interrupted) ? interrupted : [])];
        if (all.length === 0) return;
        all.sort((a: any, b: any) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt));
        const cp = all[0];

        setReviewTotalBatches(cp.totalBatches);
        setReviewTotalFiles(cp.totalFiles);
        setReviewCompletedBatches(cp.currentBatch);
        setReviewReviewedFiles(cp.reviewedCount);
        setShowReviewProgress(true);
        setIsPaused(cp.status === "paused");
        setIsInterrupted(cp.status === "interrupted");
        setCheckpointId(cp.id);
        if (cp.jobId) jobIdRef.current = cp.jobId;
        const saved = JSON.parse(cp.batchResults || "[]");
        setReviewBatchResults(
          saved.map((r: any) => ({
            batchIndex: r.batchIndex ?? 0,
            files: r.files ?? [],
            issues: r.issues ?? [],
            scores: r.scores,
          }))
        );
      } catch { /* ignore */ }
    }
    checkRecoverableCheckpoints();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function startReview() {
      try {
        const token = localStorage.getItem("auth_token");
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const res = await fetch(`${API_BASE}/api/review`, {
          method: "POST",
          headers,
          body: JSON.stringify({ mrUrl, lanhuUrl }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const body = await res.json();
          onErrorRef.current(body.error || `HTTP ${res.status}`);
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) {
          onErrorRef.current("No response stream");
          return;
        }

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const event = JSON.parse(line.slice(6));

                // v1.4.4: handle review_start event
                if (event.type === "review_start") {
                  setReviewTotalBatches(event.totalBatches ?? 0);
                  setReviewTotalFiles(event.totalFiles ?? 0);
                  setShowReviewProgress(true);
                  if (event.jobId) jobIdRef.current = event.jobId;
                  continue;
                }

                // v1.4.4: handle batch_result event
                if (event.type === "batch_result") {
                  setReviewCompletedBatches(event.progress?.completedBatches ?? 0);
                  setReviewReviewedFiles(event.progress?.reviewedFiles ?? 0);
                  setReviewBatchResults((prev) => [
                    ...prev,
                    {
                      batchIndex: event.batchIndex ?? prev.length,
                      files: event.files ?? [],
                      issues: event.issues ?? [],
                      scores: event.scores,
                    },
                  ]);
                  continue;
                }

                // v1.4.4: handle paused event
                if (event.type === "paused") {
                  setIsPaused(true);
                  setIsPausing(false);
                  setCheckpointId(event.checkpointId ?? null);
                  continue;
                }

                // v1.4.4: handle resumed event
                if (event.type === "resumed") {
                  setIsPaused(false);
                  setIsPausing(false);
                  continue;
                }

                if (event.label === "COMPLETE" && event.detail) {
                  onCompleteRef.current(JSON.parse(event.detail));
                  return;
                }

                if (event.status === "error") {
                  setFailed(true);
                  onErrorRef.current(event.label);
                  return;
                }

                setSteps((prev) => {
                  const next = [...prev];
                  const idx = next.findIndex((s) => s.step === event.step);
                  if (idx >= 0) {
                    next[idx] = { ...next[idx], ...event };
                  } else {
                    next.push(event);
                  }
                  return next;
                });
              } catch {
                // skip malformed lines
              }
            }
          }
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          onErrorRef.current(err instanceof Error ? err.message : "Connection failed");
        }
      }
    }

    startReview();

    return () => controller.abort();
  }, [mrUrl, lanhuUrl]);

  // v1.4.4: pause/resume/abandon handlers
  const handlePause = async () => {
    const jobId = jobIdRef.current;
    if (!jobId || isPausing) return;
    setIsPausing(true);
    try {
      await fetch(`${API_BASE}/api/review/pause`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ jobId }),
      });
    } catch {
      setIsPausing(false);
    }
  };

  const handleResume = async () => {
    if (!checkpointId) return;
    setIsPaused(false);
    setIsPausing(false);
    setIsInterrupted(false);

    try {
      const res = await fetch(`${API_BASE}/api/review`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ mrUrl, lanhuUrl, checkpointId }),
      });

      if (!res.ok) {
        onErrorRef.current(`HTTP ${res.status}`);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) { onErrorRef.current("No response stream"); return; }
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));

            if (event.type === "resumed") continue;

            if (event.type === "batch_result") {
              setReviewCompletedBatches(event.progress?.completedBatches ?? 0);
              setReviewReviewedFiles(event.progress?.reviewedFiles ?? 0);
              setReviewBatchResults((prev) => [
                ...prev,
                {
                  batchIndex: event.batchIndex ?? prev.length,
                  files: event.files ?? [],
                  issues: event.issues ?? [],
                  scores: event.scores,
                },
              ]);
              continue;
            }

            if (event.type === "paused") {
              setIsPaused(true);
              setCheckpointId(event.checkpointId ?? null);
              return;
            }

            if (event.label === "COMPLETE" && event.detail) {
              onCompleteRef.current(JSON.parse(event.detail));
              return;
            }

            if (event.status === "error") {
              setFailed(true);
              onErrorRef.current(event.label);
              return;
            }
          } catch { /* skip */ }
        }
      }
    } catch (err) {
      onErrorRef.current(err instanceof Error ? err.message : "Connection failed");
    }
  };

  const handleAbandon = async () => {
    if (!checkpointId) return;
    try {
      await fetch(`${API_BASE}/api/review/checkpoints/${checkpointId}?abandon=true`, {
        method: "DELETE",
        headers: headers(),
      });
      setIsPaused(false);
      setIsInterrupted(false);
      setCheckpointId(null);
    } catch { /* ignore */ }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-slate-800/80 backdrop-blur-sm rounded-xl border border-slate-700/50 p-6 shadow-2xl"
    >
      <h3 className="text-lg font-semibold text-slate-100 mb-4">Review Progress</h3>

      <div className="space-y-3">
        <AnimatePresence mode="popLayout">
          {steps.map((step, i) => (
            <motion.div
              key={step.step}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="flex items-start gap-3"
            >
              {/* Status icon */}
              <div className="mt-0.5 flex-shrink-0">
                {step.status === "done" && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center"
                  >
                    <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </motion.div>
                )}
                {step.status === "running" && (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    className="w-5 h-5 rounded-full border-2 border-blue-400 border-t-transparent"
                  />
                )}
                {step.status === "error" && (
                  <div className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center">
                    <svg className="w-3 h-3 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {step.status === "running" && step.label && (
                    <span className="text-sm text-slate-200">{step.label}</span>
                  )}
                </div>
                {step.detail && step.status === "done" && step.label !== "COMPLETE" && (
                  <span className={`text-xs ${step.status === "done" ? "text-slate-400" : "text-slate-500"}`}>
                    {step.detail}
                  </span>
                )}
                {step.status === "running" && step.progress !== undefined && (
                  <div className="mt-1.5 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${step.progress}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {showReviewProgress && reviewTotalBatches > 0 && (
        <div className="mt-4">
          <ReviewProgress
            reviewType="mr"
            totalBatches={reviewTotalBatches}
            totalFiles={reviewTotalFiles}
            completedBatches={reviewCompletedBatches}
            reviewedFiles={reviewReviewedFiles}
            batchResults={reviewBatchResults}
            isPaused={isPaused}
            isPausing={isPausing}
            isInterrupted={isInterrupted}
            onPause={handlePause}
            onResume={handleResume}
            onAbandon={handleAbandon}
          />
        </div>
      )}

      {failed && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-4 text-sm text-red-400"
        >
          Review failed. Please check your configuration and try again.
        </motion.p>
      )}
    </motion.div>
  );
}
