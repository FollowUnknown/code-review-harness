import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileSelectorDialog } from "../components/FileSelectorDialog";
import type { DiffPreviewResponse } from "../../shared/types";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3001";

export function LocalReviewPage() {
  const [project, setProject] = useState("");
  const [sourceBranch, setSourceBranch] = useState("");
  const [targetBranch, setTargetBranch] = useState("");
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<string[]>([]);
  const [preview, setPreview] = useState<DiffPreviewResponse | null>(null);
  const [allFilePaths, setAllFilePaths] = useState<string[]>([]);

  const token = localStorage.getItem("auth_token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

  const startReview = async (excludedFiles: string[]) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/api/review/local`, {
        method: "POST",
        headers,
        body: JSON.stringify({ project, sourceBranch, targetBranch, excludedFiles }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: "Request failed" }));
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
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold text-white">Local Code Review</h1>
      <p className="text-slate-400 text-sm">Scan a local git repository branch diff for AI review</p>

      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 space-y-4">
        <div>
          <label className="block text-sm text-slate-400 mb-1">Project</label>
          <input
            type="text"
            value={project}
            onChange={(e) => setProject(e.target.value)}
            placeholder="e.g. qiqiao-console"
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Source Branch</label>
            <input
              type="text"
              value={sourceBranch}
              onChange={(e) => setSourceBranch(e.target.value)}
              placeholder="e.g. feature/login"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Target Branch</label>
            <input
              type="text"
              value={targetBranch}
              onChange={(e) => setTargetBranch(e.target.value)}
              placeholder="e.g. main"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"
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

      {reviewId && (
        <div className="bg-green-900/20 border border-green-800/50 rounded-xl p-4">
          <span className="text-green-400 text-sm">Review complete: </span>
          <a href={`#/reviews/${reviewId}`} className="text-blue-400 underline text-sm">View Report</a>
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
