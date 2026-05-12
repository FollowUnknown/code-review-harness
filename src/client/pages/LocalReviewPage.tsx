import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { FileSelectorDialog } from "../components/FileSelectorDialog";
import { ReviewProgress } from "../components/ReviewProgress";
import type { BatchResultItem } from "../components/ReviewProgress";
import type { DiffPreviewResponse } from "../../shared/types";

const API_BASE = "";

export function LocalReviewPage() {
  const navigate = useNavigate();
  const [project, setProject] = useState("");
  const [sourceBranch, setSourceBranch] = useState("");
  const [targetBranch, setTargetBranch] = useState("");
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<string[]>([]);
  const [preview, setPreview] = useState<DiffPreviewResponse | null>(null);
  const [allFilePaths, setAllFilePaths] = useState<string[]>([]);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const jobIdRef = useRef<string | null>(null);
  const [projects, setProjects] = useState<Array<{ project: string; localPath: string }>>([]);

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

  const token = localStorage.getItem("auth_token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  // Poll job status when SSE is disconnected
  const pollJobStatus = useCallback(async (jobId: string) => {
    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/review/local/${jobId}`, { headers });
        if (!res.ok) { setLoading(false); return; }
        const job = await res.json();

        setSteps(job.steps || []);

        if (job.status === "completed" && job.reviewId) {
          setReviewId(job.reviewId);
          setLoading(false);
          return;
        }

        if (job.status === "failed" || job.status === "aborted") {
          setError(job.errorMessage || "Review failed");
          setLoading(false);
          return;
        }

        // v1.4.4: detect pause via polling (SSE may be closed after page reload)
        if (job.status === "paused") {
          try {
            const cpRes = await fetch(
              `${API_BASE}/api/review/checkpoints?status=paused&review_type=local`,
              { headers },
            );
            if (cpRes.ok) {
              const cps = await cpRes.json();
              if (Array.isArray(cps) && cps.length > 0) {
                const cp = cps[0];
                setReviewTotalBatches(cp.totalBatches ?? 0);
                setReviewTotalFiles(cp.totalFiles ?? 0);
                setReviewCompletedBatches(cp.currentBatch ?? 0);
                setReviewReviewedFiles(cp.reviewedCount ?? 0);
                if (cp.totalBatches > 0) setShowReviewProgress(true);
                setCheckpointId(cp.id);
                if (cp.jobId) jobIdRef.current = cp.jobId;
                setIsPaused(true);
                setIsPausing(false);
                setLoading(false);
                const saved = JSON.parse(cp.batchResults || "[]");
                setReviewBatchResults(
                  saved.map((r: any) => ({
                    batchIndex: r.batchIndex ?? 0,
                    files: r.files ?? [],
                    issues: r.issues ?? [],
                    scores: r.scores,
                  })),
                );
                return; // stop polling
              }
            }
          } catch { /* ignore */ }
        }

        // v1.4.4: sync checkpoint progress during polling (page reload recovery)
        try {
          const cpRes = await fetch(
            `${API_BASE}/api/review/checkpoints?status=running&review_type=local`,
            { headers },
          );
          if (cpRes.ok) {
            const cps = await cpRes.json();
            if (Array.isArray(cps) && cps.length > 0) {
              const cp = cps[0];
              setReviewTotalBatches(cp.totalBatches ?? 0);
              setReviewTotalFiles(cp.totalFiles ?? 0);
              setReviewCompletedBatches(cp.currentBatch ?? 0);
              setReviewReviewedFiles(cp.reviewedCount ?? 0);
              if (cp.totalBatches > 0) setShowReviewProgress(true);
              if (cp.checkpointId || cp.id) setCheckpointId(cp.checkpointId || cp.id);
              const saved = JSON.parse(cp.batchResults || "[]");
              setReviewBatchResults(
                saved.map((r: any) => ({
                  batchIndex: r.batchIndex ?? 0,
                  files: r.files ?? [],
                  issues: r.issues ?? [],
                  scores: r.scores,
                })),
              );
            }
          }
        } catch { /* ignore checkpoint fetch error */ }

        // Still running — poll again after 2 seconds
        pollingRef.current = setTimeout(poll, 2000);
      } catch {
        setError("Failed to check job status");
        setLoading(false);
      }
    };
    poll();
  }, [headers]);

  // On mount: load projects from repo-mappings
  useEffect(() => {
    fetch(`${API_BASE}/api/repo-mappings`, { headers })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        const list = Array.isArray(data) ? data : data?.items ?? [];
        setProjects(list.map((m: any) => ({ project: m.project, localPath: m.local_path })));
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // On mount: check for active running job + paused checkpoints
  useEffect(() => {
    // G2: mutual exclusion — if one finds state, the other skips
    let recovered = false;

    async function checkActiveJob() {
      try {
        const res = await fetch(`${API_BASE}/api/review/local/active`, { headers });
        if (!res.ok) return;
        const job = await res.json();
        if (!job || recovered) return;

        if (job.status === "running") {
          recovered = true;
          // Found an in-progress job — restore UI state
          setProject(job.project);
          setSourceBranch(job.sourceBranch);
          setTargetBranch(job.targetBranch);
          setSteps(job.steps || []);
          setCurrentJobId(job.id);
          jobIdRef.current = job.id;
          setLoading(true);

          // Start polling for completion
          pollJobStatus(job.id);
        } else if (job.status === "completed" && job.reviewId) {
          // Found a recently completed job — show the result link
          setReviewId(job.reviewId);
        }
      } catch { /* ignore */ }
    }

    // v1.4.4: check for paused/interrupted checkpoints (page reload detection)
    async function checkRecoverableCheckpoints() {
      try {
        // Query both paused and interrupted, pick the most recent
        const [pausedRes, interruptedRes] = await Promise.all([
          fetch(`${API_BASE}/api/review/checkpoints?status=paused&review_type=local`, { headers }),
          fetch(`${API_BASE}/api/review/checkpoints?status=interrupted&review_type=local`, { headers }),
        ]);
        const paused = pausedRes.ok ? await pausedRes.json() : [];
        const interrupted = interruptedRes.ok ? await interruptedRes.json() : [];
        const all = [...(Array.isArray(paused) ? paused : []), ...(Array.isArray(interrupted) ? interrupted : [])];
        if (all.length === 0 || recovered) return;
        // Pick the most recent by updatedAt
        all.sort((a: any, b: any) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt));
        recovered = true;
        const cp = all[0];

        // Restore form state from checkpoint
        setProject(cp.projectId);
        setSourceBranch(cp.sourceBranch || "");
        setTargetBranch(cp.targetBranch || "");
        // Restore progress state
        setReviewTotalBatches(cp.totalBatches);
        setReviewTotalFiles(cp.totalFiles);
        setReviewCompletedBatches(cp.currentBatch);
        setReviewReviewedFiles(cp.reviewedCount);
        setShowReviewProgress(true);
        setIsPaused(cp.status === "paused");
        setIsInterrupted(cp.status === "interrupted");
        setCheckpointId(cp.id);
        // Restore accumulated batch results
        const saved = JSON.parse(cp.batchResults || "[]");
        setReviewBatchResults(
          saved.map((r: any) => ({
            batchIndex: r.batchIndex ?? 0,
            files: r.files ?? [],
            issues: r.issues ?? [],
            scores: r.scores,
          }))
        );
        if (cp.jobId) {
          setCurrentJobId(cp.jobId);
          jobIdRef.current = cp.jobId;
        }
      } catch { /* ignore */ }
    }

    checkActiveJob();
    checkRecoverableCheckpoints();

    return () => {
      if (pollingRef.current) clearTimeout(pollingRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // v1.4.4: pause/resume/abandon handlers
  const handlePause = async () => {
    const jobId = jobIdRef.current;
    if (!jobId || isPausing) return;
    setIsPausing(true);
    try {
      await fetch(`${API_BASE}/api/review/pause`, {
        method: "POST",
        headers,
        body: JSON.stringify({ jobId }),
      });
    } catch {
      setIsPausing(false);
    }
  };

  const handleResume = async () => {
    if (!checkpointId || !project || !sourceBranch || !targetBranch) return;
    setIsPaused(false);
    setIsInterrupted(false);
    // Re-establish SSE by calling the review endpoint with checkpointId
    await startReview([], checkpointId);
  };

  const handleAbandon = async () => {
    if (!checkpointId) return;
    try {
      await fetch(`${API_BASE}/api/review/checkpoints/${checkpointId}?abandon=true`, {
        method: "DELETE",
        headers,
      });
      setIsPaused(false);
      setIsInterrupted(false);
      setCheckpointId(null);
    } catch { /* ignore */ }
  };

  const handleSubmit = async () => {
    if (!project || !sourceBranch || !targetBranch) {
      setError("All fields are required");
      return;
    }

    setLoading(true);
    setError(null);
    setSteps([]);
    setReviewId(null);

    try {
      // Step 1: Get file preview
      const previewRes = await fetch(`${API_BASE}/api/review/preview`, {
        method: "POST",
        headers,
        body: JSON.stringify({ project, sourceBranch, targetBranch }),
      });

      if (!previewRes.ok) {
        const data = await previewRes.json().catch(() => ({ error: "Preview failed" }));
        setError(data.error || "Preview failed");
        setLoading(false);
        return;
      }

      const rawPreview = await previewRes.json();
      const previewData: DiffPreviewResponse = rawPreview.data || rawPreview;

      if (previewData.totalFiles === 0) {
        setError("No diff files found between the branches");
        setLoading(false);
        return;
      }

      if (previewData.triggerThreshold) {
        // Collect all file paths for computing excludedFiles later
        const allPaths = previewData.groups.flatMap((g) => g.files.map((f) => f.path));
        setAllFilePaths(allPaths);
        setPreview(previewData);
        setLoading(false);
        return;
      }

      // Below threshold — review directly
      await startReview([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setLoading(false);
    }
  };

  const handleFileSelect = async (selectedFiles: string[]) => {
    setPreview(null);
    const excludedFiles = allFilePaths.filter((p) => !selectedFiles.includes(p));
    await startReview(excludedFiles);
  };

  const startReview = async (excludedFiles: string[], resumeCheckpointId?: string) => {
    const isResume = !!resumeCheckpointId;
    if (!isResume) {
      // Fresh review: reset accumulated state
      setReviewBatchResults([]);
      setReviewCompletedBatches(0);
      setReviewReviewedFiles(0);
    }
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/api/review/local`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          project, sourceBranch, targetBranch, excludedFiles,
          ...(resumeCheckpointId ? { checkpointId: resumeCheckpointId } : {}),
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: "Request failed" }));
        if (response.status === 409 && data.jobId) {
          // Already have a running job — switch to polling it
          setCurrentJobId(data.jobId);
          jobIdRef.current = data.jobId;
          pollJobStatus(data.jobId);
          return;
        }
        setError(data.error || "Unknown error");
        setLoading(false);
        return;
      }

      // Read SSE stream
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      if (reader) {
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

                // Capture jobId from first event for recovery
                if (event.jobId) {
                  setCurrentJobId(event.jobId);
                  jobIdRef.current = event.jobId;
                }

                // v1.4.4: handle review_start event
                if (event.type === "review_start") {
                  setReviewTotalBatches(event.totalBatches ?? 0);
                  setReviewTotalFiles(event.totalFiles ?? 0);
                  setShowReviewProgress(true);
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

                if (event.status === "running") {
                  setSteps((prev) => [...prev, `${event.label}: ${event.detail || ""}`]);
                }
                if (event.status === "done" && event.detail?.startsWith("{")) {
                  try {
                    const data = JSON.parse(event.detail);
                    if (data.reviewId) setReviewId(data.reviewId);
                  } catch { /* last event */ }
                }
              } catch { /* skip */ }
            }
          }
        }
      }
    } catch (err) {
      // SSE connection lost — fall back to polling if we have a jobId
      if (jobIdRef.current) {
        pollJobStatus(jobIdRef.current);
        return;
      }
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold text-white">单项目评审</h1>
      <p className="text-slate-400 text-sm">
        评审单个本地 Git 仓库的分支变更
        <Link to="/requirement-review" className="text-blue-400 text-xs hover:underline ml-3">
          切换到需求评审 →
        </Link>
      </p>
      <div className="text-xs text-slate-500 space-y-0.5">
        <p>1. 选项目（从已配置的项目中选择）+ 填源分支 / 目标分支</p>
        <p>2. 预览变更 → 确认文件范围 → 开始评审</p>
        <p>3. 自动注入 4 层知识（基础 + 产品线 + 前后端契约 + 项目级）+ AST 语义分析</p>
        <p>4. 评审完成 → 查看报告</p>
      </div>

      {loading && !showReviewProgress && project && (
        <div className="bg-blue-900/20 border border-blue-800/50 rounded-xl p-4 flex items-center gap-3">
          <div className="w-4 h-4 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          <div>
            <span className="text-blue-400 text-sm font-medium">Review in progress</span>
            <span className="text-slate-400 text-xs ml-2">{project} ({sourceBranch} → {targetBranch})</span>
          </div>
        </div>
      )}

      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 space-y-4">
        <div>
          <label className="block text-sm text-slate-400 mb-1">Project</label>
          <select
            value={project}
            onChange={(e) => setProject(e.target.value)}
            disabled={loading}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm disabled:opacity-50"
          >
            <option value="">-- 选择项目 --</option>
            {projects.map((p) => (
              <option key={p.project} value={p.project}>
                {p.project}
              </option>
            ))}
          </select>
          {projects.length === 0 && (
            <p className="text-xs text-slate-600 mt-1">暂无项目，请先在 Settings 中添加</p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Source Branch</label>
            <input
              type="text"
              value={sourceBranch}
              onChange={(e) => setSourceBranch(e.target.value)}
              disabled={loading}
              placeholder="e.g. feature/login"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Target Branch</label>
            <input
              type="text"
              value={targetBranch}
              onChange={(e) => setTargetBranch(e.target.value)}
              disabled={loading}
              placeholder="e.g. main"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm disabled:opacity-50"
            />
          </div>
        </div>
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
        >
          {loading ? "Analyzing..." : "Start Review"}
        </button>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-800/50 rounded-xl p-4 text-red-400 text-sm">{error}</div>
      )}

      {steps.length > 0 && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <h3 className="text-sm font-medium text-slate-400 mb-2">Progress</h3>
          <div className="space-y-1">
            {steps.map((s, i) => (
              <div key={i} className="text-sm text-slate-300">{s}</div>
            ))}
          </div>
        </div>
      )}

      {/* v1.4.4: incremental review progress */}
      {showReviewProgress && reviewTotalBatches > 0 && (
        <ReviewProgress
          reviewType="local"
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
      )}

      {reviewId && (
        <div className="bg-green-900/20 border border-green-800/50 rounded-xl p-4">
          <span className="text-green-400 text-sm">Review complete: </span>
          <button
            onClick={() => navigate(`/reviews/${reviewId}`)}
            className="text-blue-400 underline text-sm"
          >
            View Report
          </button>
        </div>
      )}

      <AnimatePresence>
        {preview && (
          <FileSelectorDialog
            preview={preview}
            onConfirm={handleFileSelect}
            onCancel={() => { setPreview(null); setLoading(false); }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
