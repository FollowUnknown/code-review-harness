import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ReviewProgress } from "../components/ReviewProgress";
import type { BatchResultItem } from "../components/ReviewProgress";
import type { TechStack, ProjectScanResult, ProductLine } from "../../shared/types";
import { useToast } from "../components/Toast";

const API_BASE = "";

interface ProductLineOption {
  id: string;
  name: string;
  description: string | null;
}

interface PreviewData {
  projects: ProjectScanResult[];
  totalFiles: number;
  totalTokens: number;
}

interface SSEEvent {
  step?: number;
  status?: string;
  label?: string;
  detail?: string;
  jobId?: string;
}

const TECH_STACK_LABELS: Record<TechStack, string> = {
  "java-backend": "Java Backend",
  "vue-frontend": "Vue Frontend",
  mixed: "Mixed",
  unknown: "Unknown",
};

export function RequirementReviewPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const resumeCheckpointParam = searchParams.get("checkpointId");
  const [productLines, setProductLines] = useState<ProductLineOption[]>([]);
  const [productLine, setProductLine] = useState("");
  const [sourceBranch, setSourceBranch] = useState("");
  const [targetBranch, setTargetBranch] = useState("");
  const [gitlabToken, setGitlabToken] = useState("");
  const [gitlabTokenConfigured, setGitlabTokenConfigured] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [includedProjects, setIncludedProjects] = useState<Set<string>>(new Set());
  const [steps, setSteps] = useState<string[]>([]);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const jobIdRef = useRef<string | null>(null);

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

  const pollJobStatus = useCallback(async (jobId: string) => {
    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/review/requirement/${jobId}`, { headers });
        if (!res.ok) { setLoading(false); return; }
        const job = await res.json();

        if (job.stepsJson) {
          try {
            setSteps(JSON.parse(job.stepsJson));
          } catch { /* ignore parse error */ }
        }

        if (job.status === "completed" && job.reviewId) {
          setReviewId(job.reviewId);
          setLoading(false);
          return;
        }

        if (job.status === "failed" || job.status === "aborted") {
          // Check for interrupted checkpoint before showing error
          try {
            const cpRes = await fetch(
              `${API_BASE}/api/review/checkpoints?status=interrupted&review_type=requirement`,
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
                setIsInterrupted(true);
                setIsPaused(false);
                setLoading(false);
                setProductLine(cp.projectId);
                setSourceBranch(cp.sourceBranch || "");
                setTargetBranch(cp.targetBranch || "");
                const saved = JSON.parse(cp.batchResults || "[]");
                setReviewBatchResults(
                  saved.map((r: any) => ({
                    batchIndex: r.batchIndex ?? 0,
                    files: r.files ?? [],
                    issues: r.issues ?? [],
                    scores: r.scores,
                  })),
                );
                return; // stop polling, show interrupted state
              }
            }
          } catch { /* ignore */ }
          setError(job.errorMessage || "Review failed");
          setLoading(false);
          return;
        }

        // v1.4.4: detect pause via polling (SSE may be closed after page reload)
        if (job.status === "paused") {
          try {
            const cpRes = await fetch(
              `${API_BASE}/api/review/checkpoints?status=paused&review_type=requirement`,
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
            `${API_BASE}/api/review/checkpoints?status=running&review_type=requirement`,
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

        pollingRef.current = setTimeout(poll, 2000);
      } catch {
        setError("Failed to check job status");
        setLoading(false);
      }
    };
    poll();
  }, [headers]);

  // Load product lines on mount
  useEffect(() => {
    fetch(`${API_BASE}/api/product-lines`, { headers })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        const list: ProductLine[] = Array.isArray(data) ? data : data?.items ?? [];
        setProductLines(list.map((pl) => ({
          id: pl.id,
          name: pl.name,
          description: pl.description,
        })));
      })
      .catch(() => {});

    // v1.4.5: Check if GITLAB_TOKEN is configured server-side
    fetch(`${API_BASE}/api/review/requirement/gitlab-token-status`, { headers })
      .then((r) => (r.ok ? r.json() : { configured: false }))
      .then((data) => setGitlabTokenConfigured(!!data.configured))
      .catch(() => setGitlabTokenConfigured(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Check for active job on mount
  useEffect(() => {
    // G2: mutual exclusion — if one finds state, the other skips
    let recovered = false;

    async function checkActiveJob() {
      try {
        const res = await fetch(`${API_BASE}/api/review/requirement/active`, { headers });
        if (!res.ok) return;
        const job = await res.json();
        if (!job || recovered) return;

        if (job.status === "running") {
          recovered = true;
          setProductLine(job.productLineId || "");
          setSourceBranch(job.sourceBranch);
          setTargetBranch(job.targetBranch);
          jobIdRef.current = job.id;
          setLoading(true);
          pollJobStatus(job.id);
        } else if (job.status === "completed" && job.reviewId) {
          setReviewId(job.reviewId);
        }
      } catch { /* ignore */ }
    }

    // v1.4.4: check for paused/interrupted checkpoints (page reload detection)
    async function checkRecoverableCheckpoints() {
      try {
        const [pausedRes, interruptedRes] = await Promise.all([
          fetch(`${API_BASE}/api/review/checkpoints?status=paused&review_type=requirement`, { headers }),
          fetch(`${API_BASE}/api/review/checkpoints?status=interrupted&review_type=requirement`, { headers }),
        ]);
        const paused = pausedRes.ok ? await pausedRes.json() : [];
        const interrupted = interruptedRes.ok ? await interruptedRes.json() : [];
        const all = [...(Array.isArray(paused) ? paused : []), ...(Array.isArray(interrupted) ? interrupted : [])];
        if (all.length === 0 || recovered) return;
        all.sort((a: any, b: any) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt));
        recovered = true;
        const cp = all[0];

        setProductLine(cp.projectId);
        setSourceBranch(cp.sourceBranch || "");
        setTargetBranch(cp.targetBranch || "");
        setReviewTotalBatches(cp.totalBatches);
        setReviewTotalFiles(cp.totalFiles);
        setReviewCompletedBatches(cp.currentBatch);
        setReviewReviewedFiles(cp.reviewedCount);
        setShowReviewProgress(true);
        setIsPaused(cp.status === "paused");
        setIsInterrupted(cp.status === "interrupted");
        setCheckpointId(cp.id);
        if (cp.jobId) jobIdRef.current = cp.jobId;
        // Show job error for interrupted checkpoints so user knows why it failed
        if (cp.status === "interrupted" && cp.jobId) {
          try {
            const jobRes = await fetch(`${API_BASE}/api/review/requirement/${cp.jobId}`, { headers });
            if (jobRes.ok) {
              const job = await jobRes.json();
              if (job.errorMessage) setError(job.errorMessage);
            }
          } catch { /* ignore */ }
        }
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

    checkActiveJob();
    checkRecoverableCheckpoints();

    return () => {
      if (pollingRef.current) clearTimeout(pollingRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // v1.4.6: auto-resume from detail page via URL query param
  useEffect(() => {
    if (!resumeCheckpointParam) return;
    const cpId = resumeCheckpointParam;
    (async () => {
      try {
        // Fetch paused/interrupted checkpoints and find the matching one
        const [pausedRes, interruptedRes] = await Promise.all([
          fetch(`${API_BASE}/api/review/checkpoints?status=paused&review_type=requirement`, { headers }),
          fetch(`${API_BASE}/api/review/checkpoints?status=interrupted&review_type=requirement`, { headers }),
        ]);
        const paused = pausedRes.ok ? await pausedRes.json() : [];
        const interrupted = interruptedRes.ok ? await interruptedRes.json() : [];
        const all = [...(Array.isArray(paused) ? paused : []), ...(Array.isArray(interrupted) ? interrupted : [])];
        const cp = all.find((c: any) => c.id === cpId);
        if (!cp) return;

        setProductLine(cp.projectId);
        setSourceBranch(cp.sourceBranch || "");
        setTargetBranch(cp.targetBranch || "");
        setCheckpointId(cp.id);
        setReviewTotalBatches(cp.totalBatches);
        setReviewTotalFiles(cp.totalFiles);
        setReviewCompletedBatches(cp.currentBatch);
        setReviewReviewedFiles(cp.reviewedCount);
        setShowReviewProgress(true);
        setIsPaused(false);
        setIsInterrupted(false);
        if (cp.jobId) jobIdRef.current = cp.jobId;
        const saved = JSON.parse(cp.batchResults || "[]");
        setReviewBatchResults(saved.map((r: any) => ({
          batchIndex: r.batchIndex ?? 0,
          files: r.files ?? [],
          issues: r.issues ?? [],
          scores: r.scores,
        })));

        // Auto-start resume SSE
        setLoading(true);
        setSteps([]);
        await startSSEStream({
          productLine: cp.projectId,
          sourceBranch: cp.sourceBranch || "",
          targetBranch: cp.targetBranch || "",
          checkpointId: cp.id,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "恢复评审失败");
        setIsPaused(false);
        setIsInterrupted(true);
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeCheckpointParam]);

  // v1.4.4: pause/resume/abandon handlers
  const handlePause = async () => {
    const jobId = jobIdRef.current;
    if (!jobId) return;
    // If already pausing, cancel the pause request
    if (isPausing) {
      setIsPausing(false);
      return;
    }
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
    if (!checkpointId || !productLine || !sourceBranch || !targetBranch) return;
    setIsPaused(false);
    setIsInterrupted(false);
    setSteps([]);
    setLoading(true);
    await startSSEStream({
      productLine, sourceBranch, targetBranch,
      checkpointId,
    });
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

  function handlePreview() {
    if (!productLine || !sourceBranch || !targetBranch) {
      setError("All fields are required");
      return;
    }

    setLoading(true);
    setError(null);
    setPreviewData(null);
    setReviewId(null);
    setIncludedProjects(new Set());

    fetch(`${API_BASE}/api/review/requirement/preview`, {
      method: "POST",
      headers,
      body: JSON.stringify({ productLine, sourceBranch, targetBranch, gitlabToken: gitlabToken || undefined }),
    })
      .then(async (r) => {
        if (!r.ok) {
          const data = await r.json().catch(() => ({ error: "Preview failed" }));
          throw new Error(data.error || "Preview failed");
        }
        return r.json();
      })
      .then((raw: unknown) => {
        const wrapper = raw as Record<string, unknown>;
        const preview: PreviewData = (wrapper.data as PreviewData) || (raw as PreviewData);
        if (preview.projects.length === 0) {
          setError("No changed projects found between the branches");
        } else {
          setPreviewData(preview);
          // Default: include all projects
          setIncludedProjects(new Set(preview.projects.map((p) => p.project)));
        }
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Unknown error");
      })
      .finally(() => setLoading(false));
  }

  function toggleProjectInclusion(project: string) {
    setIncludedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(project)) next.delete(project);
      else next.add(project);
      return next;
    });
  }

  async function handleStartReview() {
    if (!previewData) return;

    setLoading(true);
    setError(null);
    setSteps([]);
    setReviewId(null);

    // Compute excluded projects: all projects NOT in includedProjects
    const allProjectNames = previewData.projects.map((p) => p.project);
    const excludedProjects = allProjectNames.filter((p) => !includedProjects.has(p));

    const body = {
      productLine,
      sourceBranch,
      targetBranch,
      excludedProjects: excludedProjects.length > 0 ? excludedProjects : undefined,
      gitlabToken: gitlabToken || undefined,
    };

    try {
      await startSSEStream(body);
    } catch (err) {
      // Should not reach here (startSSEStream catches internally),
      // but as safety net:
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg);
      toast(msg, "error");
      setLoading(false);
    }
  }

  async function startSSEStream(body: Record<string, unknown>) {
    try {
      const response = await fetch(`${API_BASE}/api/review/requirement`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: "Request failed" }));
        if (response.status === 409 && data.jobId) {
          jobIdRef.current = data.jobId;
          pollJobStatus(data.jobId);
          return;
        }
        const errMsg = data.error || "Unknown error";
        setError(errMsg);
        toast(errMsg, "error");
        return;
      }

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
                const event: SSEEvent = JSON.parse(line.slice(6));

                if (event.jobId) {
                  jobIdRef.current = event.jobId;
                }

                // v1.4.4: handle review_start event
                if ((event as any).type === "review_start") {
                  setReviewTotalBatches((event as any).totalBatches ?? 0);
                  setReviewTotalFiles((event as any).totalFiles ?? 0);
                  setShowReviewProgress(true);
                  continue;
                }

                // v1.4.4: handle batch_result event
                if ((event as any).type === "batch_result") {
                  setReviewCompletedBatches((event as any).progress?.completedBatches ?? 0);
                  setReviewReviewedFiles((event as any).progress?.reviewedFiles ?? 0);
                  setReviewBatchResults((prev) => [
                    ...prev,
                    {
                      batchIndex: (event as any).batchIndex ?? prev.length,
                      files: (event as any).files ?? [],
                      issues: (event as any).issues ?? [],
                      scores: (event as any).scores,
                    },
                  ]);
                  continue;
                }

                // v1.4.4: handle paused event
                if ((event as any).type === "paused") {
                  setIsPaused(true);
                  setIsPausing(false);
                  setCheckpointId((event as any).checkpointId ?? null);
                  continue;
                }

                // v1.4.4: handle resumed event
                if ((event as any).type === "resumed") {
                  setIsPaused(false);
                  setIsPausing(false);
                  continue;
                }

                if (event.status === "running") {
                  setSteps((prev) => [...prev, `${event.label || "Processing"}: ${event.detail || ""}`]);
                }
                if (event.status === "done" && event.detail?.startsWith("{")) {
                  try {
                    const data = JSON.parse(event.detail);
                    if (data.reviewId) setReviewId(data.reviewId);
                  } catch { /* last event */ }
                }
              } catch { /* skip malformed event */ }
            }
          }
        }
      }
    } catch (err) {
      if (jobIdRef.current) {
        pollJobStatus(jobIdRef.current);
        return;
      }
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg);
      toast(msg, "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">需求评审</h1>
          <p className="text-slate-400 text-sm">按产品线多项目并行评审，自动分组、知识注入、跨项目检测</p>
          <div className="mt-2 text-xs text-slate-500 space-y-0.5">
            <p>1. 选产品线 + 填分支 → 预览变更（按技术栈分组、显示 diff 统计、可勾选排除项目）</p>
            <p>2. 开始需求评审 → 自动按技术栈分组评审（Java 用 Java 维度集，Vue 用 Vue 维度集）</p>
            <p>3. 每组注入 4 层知识（基础 + 产品线 + 前后端契约 + 项目级），pom.xml 依赖自动检测跨项目影响</p>
            <p>4. 评审完成 → 跳转产品级合并报告</p>
          </div>
        </div>
        <Link to="/local-review" className="text-blue-400 text-xs hover:underline">
          Switch to Local Review &rarr;
        </Link>
      </div>

      {/* Global error banner — always visible at top */}
      {error && (
        <div className="bg-red-900/20 border border-red-800/50 rounded-xl p-4 flex items-start justify-between">
          <p className="text-red-400 text-sm">{error}</p>
          <button onClick={() => setError(null)} className="text-red-500/50 hover:text-red-400 text-xs ml-4 shrink-0">✕</button>
        </div>
      )}

      {loading && !showReviewProgress && productLine && (
        <div className="bg-blue-900/20 border border-blue-800/50 rounded-xl p-4 flex items-center gap-3">
          <div className="w-4 h-4 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          <div>
            <span className="text-blue-400 text-sm font-medium">Review in progress</span>
            <span className="text-slate-400 text-xs ml-2">
              {productLines.find((pl) => pl.id === productLine)?.name || productLine} ({sourceBranch} &rarr; {targetBranch})
            </span>
          </div>
        </div>
      )}

      {(isPaused || isInterrupted) && showReviewProgress && productLine && (
        <div className={`rounded-xl p-4 space-y-2 ${isInterrupted ? "bg-orange-900/20 border border-orange-800/50" : "bg-amber-900/20 border border-amber-800/50"}`}>
          <div className="flex items-center gap-3">
            <span className={`text-sm font-medium ${isInterrupted ? "text-orange-400" : "text-amber-400"}`}>
              {isInterrupted ? "评审中断" : "评审已暂停"}
            </span>
            <span className="text-slate-400 text-xs">
              {productLines.find((pl) => pl.id === productLine)?.name || productLine} ({sourceBranch} &rarr; {targetBranch})
            </span>
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
        </div>
      )}

      {/* Step 1: Input Form */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 space-y-4">
        <div>
          <label className="block text-sm text-slate-400 mb-1">Product Line</label>
          <select
            value={productLine}
            onChange={(e) => setProductLine(e.target.value)}
            disabled={loading}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm disabled:opacity-50"
          >
            <option value="">-- Select product line --</option>
            {productLines.map((pl) => (
              <option key={pl.id} value={pl.id}>
                {pl.name}
              </option>
            ))}
          </select>
          {productLines.length === 0 && (
            <p className="text-xs text-slate-600 mt-1">No product lines configured yet</p>
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
              placeholder="e.g. feature/user-management"
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
        {gitlabTokenConfigured === false && (
          <div>
            <label className="block text-sm text-slate-400 mb-1">
              GitLab Token <span className="text-amber-500">未配置环境变量，需手动输入</span>
            </label>
            <input
              type="password"
              value={gitlabToken}
              onChange={(e) => setGitlabToken(e.target.value)}
              disabled={loading}
              placeholder="glpat-xxxxxxxxxxxxx"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm disabled:opacity-50"
            />
          </div>
        )}
        <button
          onClick={handlePreview}
          disabled={loading || !productLine || !sourceBranch || !targetBranch}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
        >
          {loading ? "Analyzing..." : "Preview Changes"}
        </button>
      </div>

      {/* Step 2: Preview Table */}
      <AnimatePresence>
        {previewData && !reviewId && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-slate-200">Changed Projects</h3>
              <span className="text-xs text-slate-500">
                {previewData.totalFiles} files, {previewData.totalTokens.toLocaleString()} tokens estimated
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="text-left py-2 px-3 text-xs text-slate-500 font-medium w-10">Include</th>
                    <th className="text-left py-2 px-3 text-xs text-slate-500 font-medium">Project</th>
                    <th className="text-left py-2 px-3 text-xs text-slate-500 font-medium">Tech Stack</th>
                    <th className="text-right py-2 px-3 text-xs text-slate-500 font-medium">Files</th>
                    <th className="text-right py-2 px-3 text-xs text-slate-500 font-medium">Change Size</th>
                  </tr>
                </thead>
                <tbody>
                  {previewData.projects.map((proj) => {
                    const isIncluded = includedProjects.has(proj.project);
                    return (
                      <tr
                        key={proj.project}
                        className={`border-b border-slate-700/30 transition-colors ${!isIncluded ? "opacity-40" : ""}`}
                      >
                        <td className="py-2 px-3">
                          <input
                            type="checkbox"
                            checked={isIncluded}
                            onChange={() => toggleProjectInclusion(proj.project)}
                            disabled={loading}
                            className="rounded border-slate-600 bg-slate-900"
                          />
                        </td>
                        <td className="py-2 px-3 text-slate-200 font-mono text-xs">{proj.project}</td>
                        <td className="py-2 px-3">
                          <TechStackBadge techStack={proj.techStack} />
                        </td>
                        <td className="py-2 px-3 text-right text-slate-400">{proj.diffCount}</td>
                        <td className="py-2 px-3 text-right text-slate-400">{proj.diffChars.toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {previewData && includedProjects.size < previewData.projects.length && (
              <p className="text-xs text-yellow-400/80">
                {previewData.projects.length - includedProjects.size} project(s) will be excluded from review
              </p>
            )}

            <button
              onClick={handleStartReview}
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            >
              {loading ? "Reviewing..." : "Start Requirement Review"}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Step 3: Progress */}
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
          reviewType="requirement"
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

      {/* Step 4: Result */}
      {reviewId && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-green-900/20 border border-green-800/50 rounded-xl p-4"
        >
          <span className="text-green-400 text-sm">Requirement review complete. </span>
          <button
            onClick={() => navigate(`/reviews/${reviewId}`)}
            className="text-blue-400 underline text-sm"
          >
            View Report
          </button>
        </motion.div>
      )}
    </motion.div>
  );
}

function TechStackBadge({ techStack }: { techStack: TechStack }) {
  const styles: Record<TechStack, { bg: string; text: string }> = {
    "java-backend": { bg: "bg-orange-500/15", text: "text-orange-400" },
    "vue-frontend": { bg: "bg-emerald-500/15", text: "text-emerald-400" },
    mixed: { bg: "bg-purple-500/15", text: "text-purple-400" },
    unknown: { bg: "bg-slate-500/15", text: "text-slate-400" },
  };
  const style = styles[techStack] || styles.unknown;

  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${style.bg} ${style.text}`}>
      {TECH_STACK_LABELS[techStack] || techStack}
    </span>
  );
}
