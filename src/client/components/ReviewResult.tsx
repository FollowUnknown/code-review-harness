import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ReviewResponse, SeverityLevel, RiskLevel, KnowledgeDisposition, KnowledgeEntrySummary } from "../../shared/types";
import ReactDiffViewer from "react-diff-viewer-continued";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3001";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("auth_token");
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

const TYPE_STYLES: Record<string, { bg: string; text: string }> = {
  AP: { bg: "bg-red-500/15", text: "text-red-400" },
  EXP: { bg: "bg-blue-500/15", text: "text-blue-400" },
  CONV: { bg: "bg-purple-500/15", text: "text-purple-400" },
  BN: { bg: "bg-cyan-500/15", text: "text-cyan-400" },
  RULE: { bg: "bg-amber-500/15", text: "text-amber-400" },
  TERM: { bg: "bg-teal-500/15", text: "text-teal-400" },
};

interface Props {
  data: ReviewResponse;
  project?: string | null;
  onReset?: () => void;
  onKnowledgeClick?: (entry: KnowledgeEntrySummary) => void;
}

const RISK_STYLES: Record<RiskLevel, { bg: string; text: string; border: string; pulse?: string }> = {
  S: { bg: "bg-red-500/15", text: "text-red-400", border: "border-red-500/30", pulse: "animate-pulse" },
  A: { bg: "bg-orange-500/15", text: "text-orange-400", border: "border-orange-500/30" },
  B: { bg: "bg-yellow-500/15", text: "text-yellow-400", border: "border-yellow-500/30" },
  C: { bg: "bg-slate-500/15", text: "text-slate-400", border: "border-slate-500/30" },
};

const RISK_LABELS: Record<RiskLevel, string> = { S: "High Risk", A: "Mid-High", B: "Mid-Low", C: "Low" };

const SEVERITY_STYLES: Record<SeverityLevel, { bg: string; text: string }> = {
  CRITICAL: { bg: "bg-red-500/20", text: "text-red-400" },
  HIGH: { bg: "bg-orange-500/20", text: "text-orange-400" },
  MEDIUM: { bg: "bg-yellow-500/20", text: "text-yellow-400" },
  LOW: { bg: "bg-emerald-500/20", text: "text-emerald-400" },
};

function ScoreCircle({ score, label }: { score: number; label: string }) {
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 5) * circumference;
  const color = score >= 4 ? "#22c55e" : score >= 3 ? "#eab308" : "#ef4444";

  return (
    <div className="flex flex-col items-center gap-2 p-3 bg-slate-800/40 rounded-lg border border-slate-700/30">
      <svg width="64" height="64" className="-rotate-90">
        <circle cx="32" cy="32" r={radius} fill="none" stroke="#1e293b" strokeWidth="5" />
        <motion.circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </svg>
      <span className="text-lg font-bold" style={{ color }}>{score}</span>
      <span className="text-xs text-slate-500 text-center leading-tight">{label}</span>
    </div>
  );
}

function RiskBadge({ level }: { level: RiskLevel }) {
  const style = RISK_STYLES[level];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full ${style.bg} ${style.text} ${style.border} border ${style.pulse ?? ""}`}>
      {level}
    </span>
  );
}

export function ReviewResult({ data, project, onReset, onKnowledgeClick }: Props) {
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [showDiffModal, setShowDiffModal] = useState(false);
  const { mr, diffs, report, classification, requirement, tokenUsage, batchDetails } = data;

  function toggleFile(path: string) {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  return (
    <div className="space-y-6 mt-6">
      {/* Header with reset */}
      <div className="flex justify-between items-center">
        <div className="text-sm text-slate-500">
          {mr.author.name} · {mr.source_branch} → {mr.target_branch} · {mr.changes_count} files
          {tokenUsage && (
            <span className="ml-3 text-xs text-slate-600">
              Tokens: {tokenUsage.inputTokens.toLocaleString()} in + {tokenUsage.outputTokens.toLocaleString()} out
              ({(tokenUsage.inputTokens + tokenUsage.outputTokens).toLocaleString()} total)
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {diffs.length > 0 && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setShowDiffModal(true)}
              className="px-3 py-1.5 text-xs border border-slate-700/50 rounded-lg text-slate-400 hover:text-white transition-all"
            >
              Code Changes ({diffs.length})
            </motion.button>
          )}
          {onReset && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onReset}
              className="px-4 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg text-slate-400 hover:text-white transition-all"
            >
              New Review
            </motion.button>
          )}
        </div>
      </div>

      {/* Requirement Understanding */}
      {requirement && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-5 bg-slate-800/40 backdrop-blur-sm rounded-xl border border-slate-700/40"
        >
          <h3 className="text-sm font-semibold text-slate-300 mb-3">Requirement Understanding</h3>
          <div className="space-y-2 text-sm text-slate-400">
            <div className="flex flex-wrap gap-3">
              <span className="px-2.5 py-1 bg-blue-500/10 text-blue-400 rounded text-xs font-medium">{requirement.type}</span>
              <span className="px-2.5 py-1 bg-purple-500/10 text-purple-400 rounded text-xs font-medium">{requirement.module}</span>
              <span className="px-2.5 py-1 bg-slate-700/50 text-slate-400 rounded text-xs">
                {requirement.source === "lanhu" ? "Lanhu Design" : "MR Inference"}
              </span>
            </div>
            {requirement.features.length > 0 && (
              <ul className="space-y-1 text-xs text-slate-500">
                {requirement.features.slice(0, 8).map((f, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-slate-700 mt-0.5">-</span> {f}
                  </li>
                ))}
              </ul>
            )}
            {requirement.conflicts.length > 0 && (
              <div className="p-3 bg-yellow-500/5 border border-yellow-500/20 rounded-lg">
                {requirement.conflicts.map((c, i) => (
                  <p key={i} className="text-xs text-yellow-400">{c}</p>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* File Classification */}
      {classification && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="p-5 bg-slate-800/40 backdrop-blur-sm rounded-xl border border-slate-700/40"
        >
          <h3 className="text-sm font-semibold text-slate-300 mb-3">File Classification</h3>
          <div className="flex flex-wrap gap-2 mb-4 text-xs">
            <span className="text-slate-500">{classification.stats.total} files</span>
            {(Object.entries(classification.stats.byLevel) as [RiskLevel, number][])
              .filter(([, c]) => c > 0)
              .map(([level, count]) => (
                <RiskBadge key={level} level={level} />
              ))}
            {classification.stats.skipped > 0 && (
              <span className="px-2 py-0.5 text-xs bg-slate-700/30 text-slate-600 rounded-full">
                skipped({classification.stats.skipped})
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
            {classification.batches.flatMap((batch) =>
              batch.files.map((file) => (
                <div key={file.path} className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/30 rounded text-xs">
                  <RiskBadge level={file.level} />
                  <span className="font-mono text-slate-500 truncate">{file.path}</span>
                  {file.riskFlags.length > 0 && (
                    <span className="text-slate-700 ml-auto" title={file.riskFlags.join(", ")}>
                      {file.riskFlags.length} flags
                    </span>
                  )}
                </div>
              ))
            )}
            {classification.skipped.map((file) => (
              <div key={file.path} className="flex items-center gap-2 px-3 py-1.5 bg-slate-900/20 rounded text-xs text-slate-700">
                <span className="text-slate-700">skip</span>
                <span className="font-mono truncate">{file.path}</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Report Card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className={`p-5 rounded-xl border-2 backdrop-blur-sm ${
          report.passed
            ? "bg-emerald-500/5 border-emerald-500/30"
            : "bg-red-500/5 border-red-500/30"
        }`}
      >
        {/* Pass/Fail Header */}
        <div className="flex items-center gap-3 mb-5">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 200, delay: 0.3 }}
            className={`w-10 h-10 rounded-full flex items-center justify-center ${
              report.passed ? "bg-emerald-500/20" : "bg-red-500/20"
            }`}
          >
            <span className="text-lg">{report.passed ? "✓" : "✗"}</span>
          </motion.div>
          <div>
            <h2 className={`text-lg font-bold ${report.passed ? "text-emerald-400" : "text-red-400"}`}>
              {report.passed ? "Review Passed" : "Review Failed"}
            </h2>
            <p className="text-xs text-slate-500">{report.timestamp}</p>
          </div>
        </div>

        {/* Score Circles */}
        {report.scores.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {report.scores.map((s) => (
              <ScoreCircle key={s.dimension} score={s.score} label={s.dimension} />
            ))}
          </div>
        )}

        {/* Issues Table */}
        {report.issues.length > 0 && (
          <div className="mb-5">
            <h3 className="text-sm font-semibold text-slate-300 mb-3">
              Issues ({report.issues.length})
            </h3>
            <div className="space-y-2">
              {report.issues.map((issue, i) => {
                const sev = SEVERITY_STYLES[issue.severity];
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 + i * 0.05 }}
                    className={`flex items-start gap-3 p-3 rounded-lg border-l-2 ${
                      issue.severity === "CRITICAL"
                        ? "border-l-red-500 bg-red-500/5"
                        : issue.severity === "HIGH"
                          ? "border-l-orange-500 bg-orange-500/5"
                          : "border-l-slate-600 bg-slate-800/30"
                    }`}
                  >
                    <span className={`px-2 py-0.5 text-xs font-semibold rounded ${sev.bg} ${sev.text}`}>
                      {issue.severity}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-300">{issue.message}</p>
                      <div className="flex gap-3 mt-1 text-xs text-slate-600">
                        {issue.file && <span className="font-mono">{issue.file}{issue.line ? `:${issue.line}` : ""}</span>}
                      </div>
                      {issue.suggestion && (
                        <p className="mt-1.5 text-xs text-slate-500 bg-slate-800/40 rounded px-2 py-1">
                          {issue.suggestion}
                        </p>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}

        {/* Summary */}
        {report.summary && (
          <div className="p-4 bg-slate-800/30 rounded-lg text-sm text-slate-400 leading-relaxed">
            {report.summary}
          </div>
        )}
      </motion.div>

      {/* Knowledge Section */}
      {(data.knowledgeUsed?.length || data.knowledgeProduced?.length || data.knowledgeDispositions?.length) && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="p-5 bg-slate-800/40 backdrop-blur-sm rounded-xl border border-slate-700/40"
        >
          <h3 className="text-sm font-semibold text-slate-300 mb-4">Knowledge</h3>

          {/* A. Injected Knowledge */}
          {data.knowledgeUsed && data.knowledgeUsed.length > 0 && (
            <div className="mb-4">
              <h4 className="text-xs text-slate-500 uppercase tracking-wider mb-2">Injected into prompt ({data.knowledgeUsed.length})</h4>
              <div className="flex flex-wrap gap-1.5">
                {data.knowledgeUsed.map((entry) => {
                  const style = TYPE_STYLES[entry.type] || { bg: "bg-slate-700/30", text: "text-slate-400" };
                  return (
                    <button
                      key={entry.id}
                      onClick={() => onKnowledgeClick?.(entry)}
                      className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded-lg border border-slate-700/30 hover:border-slate-600 transition-all ${style.bg} ${style.text}`}
                    >
                      <span className="font-semibold">{entry.type}</span>
                      <span className="text-slate-500">{entry.id}</span>
                      <span className="text-slate-400 truncate max-w-32">{entry.title}</span>
                    </a>
                  );
                })}
              </div>
            </div>
          )}

          {/* B. Produced Knowledge */}
          {data.knowledgeProduced && data.knowledgeProduced.length > 0 && (
            <div className="mb-4">
              <h4 className="text-xs text-slate-500 uppercase tracking-wider mb-2">Extracted from review ({data.knowledgeProduced.length})</h4>
              <div className="flex flex-wrap gap-1.5">
                {data.knowledgeProduced.map((entry) => {
                  const style = TYPE_STYLES[entry.type] || { bg: "bg-slate-700/30", text: "text-slate-400" };
                  return (
                    <button
                      key={entry.id}
                      onClick={() => onKnowledgeClick?.(entry)}
                      className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded-lg border border-dashed border-slate-600/50 hover:border-slate-500 transition-all ${style.bg} ${style.text}`}
                    >
                      <span className="font-semibold">{entry.type}</span>
                      <span className="text-slate-500">{entry.id}</span>
                      <span className="text-slate-400 truncate max-w-32">{entry.title}</span>
                      {entry.status === "TEMP" && <span className="text-[10px] text-yellow-500">TEMP</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* C. Issue Dispositions + Create BN/RULE */}
          {data.knowledgeDispositions && data.knowledgeDispositions.length > 0 && (
            <div>
              <h4 className="text-xs text-slate-500 uppercase tracking-wider mb-2">Issue disposition mapping</h4>
              <div className="space-y-1.5">
                {data.knowledgeDispositions.map((disp, i) => {
                  const issue = report.issues[disp.issueIndex];
                  if (!issue) return null;
                  const sev = SEVERITY_STYLES[issue.severity];
                  return (
                    <div key={i} className="flex items-center gap-2 px-3 py-2 bg-slate-800/30 rounded-lg text-xs">
                      <span className={`px-1.5 py-0.5 rounded font-semibold ${sev.bg} ${sev.text}`}>{issue.severity}</span>
                      <span className="text-slate-400 truncate flex-1 max-w-64">{issue.message}</span>
                      <span className={`px-1.5 py-0.5 rounded font-semibold ${
                        disp.disposition === "AP" ? "bg-red-500/10 text-red-400" :
                        disp.disposition === "MERGE" ? "bg-blue-500/10 text-blue-400" :
                        disp.disposition === "RULE" ? "bg-amber-500/10 text-amber-400" :
                        "bg-slate-700/30 text-slate-500"
                      }`}>
                        {disp.disposition}
                      </span>
                      {disp.knowledgeId && <span className="text-slate-600">{disp.knowledgeId}</span>}
                      {(issue.severity === "CRITICAL" || issue.severity === "HIGH" || issue.severity === "MEDIUM") && (
                        <CreateKnowledgeButton issue={issue} reviewId={data.reviewId} project={project || undefined} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* Diff Modal */}
      <AnimatePresence>
        {showDiffModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setShowDiffModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="w-full max-w-5xl max-h-[85vh] bg-slate-900 border border-slate-700/50 rounded-xl shadow-2xl flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700/50">
                <h3 className="text-sm font-semibold text-slate-300">Code Changes ({diffs.length} files)</h3>
                <button onClick={() => setShowDiffModal(false)} className="text-slate-500 hover:text-slate-300 text-lg leading-none">&times;</button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {diffs.map((diff) => {
                  const fileClass = classification?.batches
                    .flatMap((b) => b.files)
                    .find((f) => f.path === diff.new_path);
                  const isExpanded = expandedFiles.has(diff.new_path);

                  return (
                    <div key={diff.new_path} className="rounded-lg border border-slate-700/40 overflow-hidden">
                      <button
                        onClick={() => toggleFile(diff.new_path)}
                        className="w-full px-4 py-3 text-left bg-slate-800/40 hover:bg-slate-800/60 transition-all flex items-center gap-3"
                      >
                        <motion.span animate={{ rotate: isExpanded ? 90 : 0 }} className="text-slate-600 text-xs">▶</motion.span>
                        <span className="font-mono text-xs text-slate-400">{diff.new_path}</span>
                        {fileClass && <RiskBadge level={fileClass.level} />}
                        {diff.new_file && <span className="px-1.5 py-0.5 text-[10px] bg-emerald-500/15 text-emerald-400 rounded">NEW</span>}
                        {diff.deleted_file && <span className="px-1.5 py-0.5 text-[10px] bg-red-500/15 text-red-400 rounded">DEL</span>}
                      </button>
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="bg-slate-900/50 overflow-x-auto">
                              <ReactDiffViewer
                                oldValue={""}
                                newValue={diff.diff}
                                splitView={false}
                                useDarkTheme={true}
                                leftTitle={diff.old_path}
                                rightTitle={diff.new_path}
                              />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---- Create Knowledge from Issue ----

function CreateKnowledgeButton({ issue, reviewId, project }: {
  issue: { severity: string; message: string; suggestion?: string; file?: string };
  reviewId?: string;
  project?: string;
}) {
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);

  function handleCreate(type: "BN" | "RULE") {
    setCreating(true);
    fetch(`${API_BASE}/api/knowledge`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        type,
        project: project || "unknown",
        title: issue.message.slice(0, 80),
        content: issue.suggestion || issue.message,
        source_review: reviewId,
        source_type: "交叉评审",
        source_file: issue.file ? JSON.stringify([issue.file]) : undefined,
        severity: issue.severity === "CRITICAL" ? "CRITICAL" : "HIGH",
      }),
    })
      .then((r) => {
        if (!r.ok) throw new Error("create failed");
        return r.json();
      })
      .then(() => {
        setShowModal(false);
        setCreating(false);
      })
      .catch(() => setCreating(false));
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="px-1.5 py-0.5 text-[10px] bg-slate-700/30 text-slate-500 hover:text-slate-300 hover:bg-slate-700/50 rounded transition-all"
      >
        + Knowledge
      </button>
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setShowModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md bg-slate-900 border border-slate-700/50 rounded-xl shadow-2xl p-5 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h4 className="text-sm font-semibold text-slate-200">Create Knowledge from Issue</h4>
              <p className="text-xs text-slate-400 bg-slate-800/40 rounded p-2">{issue.message}</p>
              <div className="flex gap-3">
                <button
                  onClick={() => handleCreate("BN")}
                  disabled={creating}
                  className="flex-1 px-3 py-2 text-xs bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 rounded-lg hover:bg-cyan-500/20 transition-all disabled:opacity-50"
                >
                  Business Noun (BN)
                </button>
                <button
                  onClick={() => handleCreate("RULE")}
                  disabled={creating}
                  className="flex-1 px-3 py-2 text-xs bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded-lg hover:bg-amber-500/20 transition-all disabled:opacity-50"
                >
                  Business Rule (RULE)
                </button>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="w-full px-3 py-1.5 text-xs text-slate-500 hover:text-slate-300 transition-all"
              >
                Cancel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
