import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ReviewIssue, ReviewScore, SSEBatchProgress } from "../../shared/types";

// ---- Types ----

export interface BatchResultItem {
  batchIndex: number;
  files: string[];
  issues: ReviewIssue[];
  scores?: ReviewScore[];
}

export interface ReviewProgressProps {
  reviewType: "mr" | "local" | "requirement";
  totalBatches: number;
  totalFiles: number;
  completedBatches: number;
  reviewedFiles: number;
  batchResults: BatchResultItem[];
  isPaused?: boolean;
  isPausing?: boolean;
  isComplete?: boolean;
  onPause?: () => void;
  onResume?: () => void;
  onAbandon?: () => void;
}

// ---- Helpers ----

function severityCounts(issues: ReviewIssue[]): { critical: number; high: number; medium: number; low: number } {
  let critical = 0, high = 0, medium = 0, low = 0;
  for (const issue of issues) {
    switch (issue.severity) {
      case "CRITICAL": critical++; break;
      case "HIGH": high++; break;
      case "MEDIUM": medium++; break;
      case "LOW": low++; break;
    }
  }
  return { critical, high, medium, low };
}

function avgScore(scores?: ReviewScore[]): number | null {
  if (!scores || scores.length === 0) return null;
  const sum = scores.reduce((acc, s) => acc + s.score, 0);
  return Math.round((sum / scores.length) * 10) / 10;
}

// ---- Component ----

export function ReviewProgress({
  totalBatches,
  totalFiles,
  completedBatches,
  reviewedFiles,
  batchResults,
  isPaused,
  isPausing,
  isComplete,
  onPause,
  onResume,
  onAbandon,
}: ReviewProgressProps) {
  const [expandedBatches, setExpandedBatches] = useState<Set<number>>(new Set());

  const toggleBatch = (index: number) => {
    setExpandedBatches((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  // Cumulative stats across all batches
  const cumulative = useMemo(() => {
    const allIssues = batchResults.flatMap((b) => b.issues);
    const counts = severityCounts(allIssues);
    // Average of all batch average scores
    const scores: number[] = [];
    for (const b of batchResults) {
      const a = avgScore(b.scores);
      if (a !== null) scores.push(a);
    }
    const overallAvg = scores.length > 0
      ? Math.round((scores.reduce((s, v) => s + v, 0) / scores.length) * 10) / 10
      : null;
    return { counts, overallAvg, totalIssues: allIssues.length };
  }, [batchResults]);

  const progressPct = totalFiles > 0 ? Math.round((reviewedFiles / totalFiles) * 100) : 0;

  // ---- Render ----

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-slate-800/80 backdrop-blur-sm rounded-xl border border-slate-700/50 p-6 shadow-2xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-100">Review Progress</h3>
        <div className="flex items-center gap-2">
          {!isComplete && onPause && !isPaused && !isPausing && (
            <button
              onClick={onPause}
              className="px-3 py-1.5 text-xs rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-colors"
            >
              Pause ⏸
            </button>
          )}
          {isPausing && !isPaused && (
            <button
              disabled
              className="px-3 py-1.5 text-xs rounded-lg bg-amber-500/5 text-amber-400/50 border border-amber-500/10 cursor-not-allowed"
            >
              暂停中...
            </button>
          )}
          {isPaused && onResume && (
            <button
              onClick={onResume}
              className="px-3 py-1.5 text-xs rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
            >
              Resume ▶
            </button>
          )}
          {isPaused && onAbandon && (
            <button
              onClick={onAbandon}
              className="px-3 py-1.5 text-xs rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors"
            >
              Abandon
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex justify-between text-sm text-slate-400 mb-1.5">
          <span>
            {reviewedFiles}/{totalFiles} files reviewed
          </span>
          <span>{progressPct}%</span>
        </div>
        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progressPct}%` }}
            transition={{ duration: 0.4 }}
          />
        </div>
        {isPaused && (
          <p className="mt-2 text-xs text-amber-400">Review paused — you can resume or abandon</p>
        )}
      </div>

      {/* Cumulative stats */}
      {cumulative.totalIssues > 0 && (
        <div className="flex flex-wrap gap-3 mb-4 p-3 rounded-lg bg-slate-900/40 border border-slate-700/30">
          <StatBadge label="CRITICAL" count={cumulative.counts.critical} color="red" />
          <StatBadge label="HIGH" count={cumulative.counts.high} color="orange" />
          <StatBadge label="MEDIUM" count={cumulative.counts.medium} color="yellow" />
          <StatBadge label="LOW" count={cumulative.counts.low} color="slate" />
          {cumulative.overallAvg !== null && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-700/50 text-slate-300">
              Avg: {cumulative.overallAvg}/5
            </span>
          )}
        </div>
      )}

      {/* Batch list */}
      <div className="space-y-2 max-h-[50vh] overflow-y-auto">
        <AnimatePresence mode="popLayout">
          {batchResults.map((batch) => {
            const isExpanded = expandedBatches.has(batch.batchIndex);
            const counts = severityCounts(batch.issues);
            const batchAvg = avgScore(batch.scores);

            return (
              <motion.div
                key={batch.batchIndex}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="border border-slate-700/40 rounded-lg overflow-hidden"
              >
                {/* Batch header */}
                <button
                  onClick={() => toggleBatch(batch.batchIndex)}
                  className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-slate-700/30 transition-colors text-left"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-mono text-slate-500">
                      #{batch.batchIndex + 1}/{totalBatches}
                    </span>
                    <span className="text-sm text-slate-300 truncate">
                      {batch.files.length} file{batch.files.length > 1 ? "s" : ""}
                    </span>
                    <span className="text-xs text-slate-500">
                      {batch.issues.length} issue{batch.issues.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {batchAvg !== null && (
                      <span className="text-xs text-slate-400">{batchAvg}/5</span>
                    )}
                    <svg
                      className={`w-4 h-4 text-slate-500 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {/* Batch details (collapsible) */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-3 pb-3 space-y-1.5 border-t border-slate-700/30 pt-2">
                        {/* File list */}
                        <div className="mb-1">
                          {batch.files.map((f) => (
                            <div key={f} className="text-xs text-slate-500 font-mono truncate">
                              {f}
                            </div>
                          ))}
                        </div>
                        {/* Issue list */}
                        {batch.issues.map((issue, j) => (
                          <div
                            key={j}
                            className="flex items-start gap-2 py-1 text-xs"
                          >
                            <SeverityTag level={issue.severity} />
                            <span className="text-slate-300">{issue.message}</span>
                          </div>
                        ))}
                        {batch.issues.length === 0 && (
                          <p className="text-xs text-slate-500">No issues found</p>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ---- Sub-components ----

function StatBadge({ label, count, color }: { label: string; count: number; color: "red" | "orange" | "yellow" | "slate" }) {
  const colorMap = {
    red: "bg-red-500/10 text-red-400 border-red-500/20",
    orange: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    yellow: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    slate: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  };

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${colorMap[color]}`}>
      {label} <span className="font-mono">{count}</span>
    </span>
  );
}

function SeverityTag({ level }: { level: ReviewIssue["severity"] }) {
  const map = {
    CRITICAL: "bg-red-500/10 text-red-400 border-red-500/20",
    HIGH: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    MEDIUM: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    LOW: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  };

  return (
    <span className={`inline-flex px-1.5 py-0 text-[10px] font-medium rounded border flex-shrink-0 ${map[level]}`}>
      {level.slice(0, 2)}
    </span>
  );
}
