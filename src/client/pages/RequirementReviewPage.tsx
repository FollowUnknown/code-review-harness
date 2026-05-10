import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import type { TechStack, ProjectScanResult, ProductLine } from "../../shared/types";

const API_BASE = "";

interface ProductLineOption {
  id: string;
  name: string;
  description: string | null;
}

interface PreviewData {
  projects: ProjectScanResult[];
  totalFiles: number;
  totalDiffChars: number;
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
  const [productLines, setProductLines] = useState<ProductLineOption[]>([]);
  const [productLine, setProductLine] = useState("");
  const [sourceBranch, setSourceBranch] = useState("");
  const [targetBranch, setTargetBranch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [excludedProjects, setExcludedProjects] = useState<Set<string>>(new Set());
  const [steps, setSteps] = useState<string[]>([]);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const jobIdRef = useRef<string | null>(null);

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
          setError(job.errorMessage || "Review failed");
          setLoading(false);
          return;
        }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Check for active job on mount
  useEffect(() => {
    async function checkActiveJob() {
      try {
        const res = await fetch(`${API_BASE}/api/review/requirement/active`, { headers });
        if (!res.ok) return;
        const job = await res.json();
        if (!job) return;

        if (job.status === "running") {
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
    checkActiveJob();

    return () => {
      if (pollingRef.current) clearTimeout(pollingRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handlePreview() {
    if (!productLine || !sourceBranch || !targetBranch) {
      setError("All fields are required");
      return;
    }

    setLoading(true);
    setError(null);
    setPreviewData(null);
    setReviewId(null);
    setExcludedProjects(new Set());

    fetch(`${API_BASE}/api/review/requirement/preview`, {
      method: "POST",
      headers,
      body: JSON.stringify({ productLine, sourceBranch, targetBranch }),
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
        }
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Unknown error");
      })
      .finally(() => setLoading(false));
  }

  function toggleProjectExclusion(project: string) {
    setExcludedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(project)) next.delete(project);
      else next.add(project);
      return next;
    });
  }

  function handleStartReview() {
    if (!previewData) return;

    setLoading(true);
    setError(null);
    setSteps([]);
    setReviewId(null);

    const body = {
      productLine,
      sourceBranch,
      targetBranch,
      excludedProjects: excludedProjects.size > 0 ? Array.from(excludedProjects) : undefined,
    };

    startSSEStream(body);
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
        throw new Error(data.error || "Unknown error");
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
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Requirement Review</h1>
          <p className="text-slate-400 text-sm">Multi-project cross-stack review by product line</p>
        </div>
        <Link to="/local-review" className="text-blue-400 text-xs hover:underline">
          Switch to Local Review &rarr;
        </Link>
      </div>

      {loading && productLine && (
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
        <button
          onClick={handlePreview}
          disabled={loading || !productLine || !sourceBranch || !targetBranch}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
        >
          {loading ? "Analyzing..." : "Preview Changes"}
        </button>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-800/50 rounded-xl p-4 text-red-400 text-sm">{error}</div>
      )}

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
                {previewData.totalFiles} files, {previewData.totalDiffChars.toLocaleString()} chars changed
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="text-left py-2 px-3 text-xs text-slate-500 font-medium w-10">Exclude</th>
                    <th className="text-left py-2 px-3 text-xs text-slate-500 font-medium">Project</th>
                    <th className="text-left py-2 px-3 text-xs text-slate-500 font-medium">Tech Stack</th>
                    <th className="text-right py-2 px-3 text-xs text-slate-500 font-medium">Files</th>
                    <th className="text-right py-2 px-3 text-xs text-slate-500 font-medium">Change Size</th>
                  </tr>
                </thead>
                <tbody>
                  {previewData.projects.map((proj) => {
                    const isExcluded = excludedProjects.has(proj.project);
                    return (
                      <tr
                        key={proj.project}
                        className={`border-b border-slate-700/30 transition-colors ${isExcluded ? "opacity-40" : ""}`}
                      >
                        <td className="py-2 px-3">
                          <input
                            type="checkbox"
                            checked={isExcluded}
                            onChange={() => toggleProjectExclusion(proj.project)}
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

            {excludedProjects.size > 0 && (
              <p className="text-xs text-yellow-400/80">
                {excludedProjects.size} project(s) will be excluded from review
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
