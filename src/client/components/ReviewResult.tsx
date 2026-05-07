import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ReviewResponse, SeverityLevel, RiskLevel, KnowledgeDisposition, KnowledgeEntrySummary, ReviewIssue } from "../../shared/types";
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

const SEVERITY_STYLES: Record<SeverityLevel, { bg: string; text: string; border: string; icon: string }> = {
  CRITICAL: { bg: "bg-red-500/20", text: "text-red-400", border: "border-red-500/50", icon: "text-red-500" },
  HIGH: { bg: "bg-orange-500/20", text: "text-orange-400", border: "border-orange-500/50", icon: "text-orange-500" },
  MEDIUM: { bg: "bg-yellow-500/20", text: "text-yellow-400", border: "border-yellow-500/50", icon: "text-yellow-500" },
  LOW: { bg: "bg-emerald-500/20", text: "text-emerald-400", border: "border-emerald-500/50", icon: "text-emerald-500" },
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
          {mr.author?.name || "Local Review"} · {mr.source_branch} → {mr.target_branch} · {mr.changes_count} files
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

        {/* Enhanced Issues Section */}
        {report.issues.length > 0 && (
          <IssuesSection
            issues={report.issues}
            reviewId={data.reviewId}
            project={project || undefined}
          />
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
                    </button>
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
                  const sev = SEVERITY_STYLES[issue.severity as SeverityLevel] || SEVERITY_STYLES.LOW;
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

// ---- Icon Components ----

function AlertCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="12"/>
      <line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  );
}

function AlertTriangleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  );
}

function InfoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="16" x2="12" y2="12"/>
      <line x1="12" y1="8" x2="12.01" y2="8"/>
    </svg>
  );
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="m9 12 2 2 4-4"/>
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6"/>
    </svg>
  );
}

function FileIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
      <polyline points="14 2 14 8 20 8"/>
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/>
      <path d="m21 21-4.3-4.3"/>
    </svg>
  );
}

function FilterIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
    </svg>
  );
}

function getSeverityIcon(severity: SeverityLevel) {
  switch (severity) {
    case "CRITICAL":
    case "HIGH":
      return AlertCircleIcon;
    case "MEDIUM":
      return AlertTriangleIcon;
    case "LOW":
      return InfoIcon;
    default:
      return InfoIcon;
  }
}

// ---- Enhanced Issues Section Component ----

interface IssuesSectionProps {
  issues: ReviewIssue[];
  reviewId?: string;
  project?: string;
}

type FilterSeverity = "ALL" | SeverityLevel;
type GroupBy = "none" | "file" | "severity";

function IssuesSection({ issues, reviewId, project }: IssuesSectionProps) {
  const [filterSeverity, setFilterSeverity] = useState<FilterSeverity>("ALL");
  const [groupBy, setGroupBy] = useState<GroupBy>("file");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedIssues, setExpandedIssues] = useState<Set<number>>(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Export issues grouped by file as Markdown
  function exportByFile() {
    const filtered = filteredIssues;
    const groups: Record<string, ReviewIssue[]> = {};
    filtered.forEach((issue) => {
      const key = issue.file || "Unknown File";
      if (!groups[key]) groups[key] = [];
      groups[key].push(issue);
    });

    const date = new Date().toISOString().split("T")[0];
    const lines: string[] = [
      `# Code Review Issues — ${project || "Project"}`,
      "",
      `> Review ID: ${reviewId || "—"}`,
      `> Date: ${date}`,
      `> Total Issues: ${filtered.length}`,
      "",
      "---",
      "",
    ];

    // Summary table
    const severityCounts: Record<string, number> = {};
    filtered.forEach((i) => { severityCounts[i.severity] = (severityCounts[i.severity] || 0) + 1; });
    lines.push("## Summary", "");
    lines.push("| Severity | Count |", "|----------|-------|");
    for (const sev of ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const) {
      if (severityCounts[sev]) lines.push(`| ${sev} | ${severityCounts[sev]} |`);
    }
    lines.push("", `**Files affected: ${Object.keys(groups).length}**`, "", "---", "");

    // Issues by file
    const sortedFiles = Object.keys(groups).sort();
    for (const file of sortedFiles) {
      const fileIssues = groups[file];
      lines.push(`## \`${file}\``, "");
      lines.push(`**${fileIssues.length} issue(s)**`, "");

      for (let i = 0; i < fileIssues.length; i++) {
        const issue = fileIssues[i];
        const location = issue.line ? `L${issue.line}` : "";
        lines.push(`### ${i + 1}. [${issue.severity}] ${issue.message}`);
        lines.push("");
        if (location) lines.push(`- **Location**: ${location}`);
        if (issue.suggestion) lines.push(`- **Suggestion**: ${issue.suggestion}`);
        // Checkbox for re-review tracking
        lines.push("", `- [ ] Fixed`, "");
      }

      lines.push("---", "");
    }

    // Re-review section
    lines.push("## Re-review Checklist", "");
    lines.push("After fixing all issues, fill in this section and re-import for re-review:", "");
    lines.push("```json");
    lines.push(JSON.stringify({
      reviewId,
      project,
      fileFixes: sortedFiles.map((f) => ({
        file: f,
        fixedIssues: groups[f].map((i) => ({ severity: i.severity, message: i.message, fixed: false })),
      })),
    }, null, 2));
    lines.push("```");

    const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `review-${reviewId || "issues"}-by-file.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Filter and search issues
  const filteredIssues = useMemo(() => {
    return issues.filter((issue) => {
      const matchesSeverity = filterSeverity === "ALL" || issue.severity === filterSeverity;
      const matchesSearch = searchQuery === "" ||
        issue.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
        issue.file?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesSeverity && matchesSearch;
    });
  }, [issues, filterSeverity, searchQuery]);

  // Group issues
  const groupedIssues = useMemo(() => {
    if (groupBy === "none") {
      return { "All Issues": filteredIssues };
    }

    const groups: Record<string, ReviewIssue[]> = {};
    filteredIssues.forEach((issue) => {
      const key = groupBy === "file" ? (issue.file || "Unknown File") : issue.severity;
      if (!groups[key]) groups[key] = [];
      groups[key].push(issue);
    });
    return groups;
  }, [filteredIssues, groupBy]);

  // Severity counts for filter badges
  const severityCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: issues.length };
    issues.forEach((issue) => {
      counts[issue.severity] = (counts[issue.severity] || 0) + 1;
    });
    return counts;
  }, [issues]);

  function toggleIssueExpanded(index: number) {
    setExpandedIssues((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function toggleGroupCollapsed(groupKey: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  }

  // Empty state
  if (issues.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
          <CheckCircleIcon className="w-8 h-8 text-emerald-500" />
        </div>
        <h3 className="text-lg font-semibold text-slate-300 mb-2">No Issues Found</h3>
        <p className="text-sm text-slate-500 max-w-sm">
          Great job! The code review didn&apos;t find any issues that match the current criteria.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <div className="flex flex-col gap-3 p-4 bg-slate-800/40 rounded-lg border border-slate-700/30">
        {/* Search and Filter Row */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search issues..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-sm bg-slate-900/50 border border-slate-700/50 rounded-lg text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-slate-600"
            />
          </div>

          {/* Group By */}
          <div className="flex items-center gap-2">
            <FilterIcon className="text-slate-500" />
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as GroupBy)}
              className="px-2 py-1.5 text-sm bg-slate-900/50 border border-slate-700/50 rounded-lg text-slate-300 focus:outline-none focus:border-slate-600"
            >
              <option value="none">No Grouping</option>
              <option value="file">Group by File</option>
              <option value="severity">Group by Severity</option>
            </select>
          </div>

          {/* Export by File */}
          <button
            onClick={exportByFile}
            className="px-3 py-1.5 text-xs border border-slate-700/50 rounded-lg text-slate-400 hover:text-white transition-all"
          >
            Export by File
          </button>
        </div>

        {/* Severity Filter Pills */}
        <div className="flex flex-wrap items-center gap-2">
          {(["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map((sev) => {
            const count = severityCounts[sev] || 0;
            const isActive = filterSeverity === sev;
            const style = sev === "ALL" ? { text: "text-slate-400", bg: "bg-slate-700/30", border: "border-slate-600" } : SEVERITY_STYLES[sev as SeverityLevel];

            return (
              <button
                key={sev}
                onClick={() => setFilterSeverity(sev)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border transition-all ${
                  isActive
                    ? `${style.bg} ${style.text} ${style.border}`
                    : "bg-slate-800/30 text-slate-500 border-slate-700/30 hover:border-slate-600"
                }`}
              >
                <span>{sev === "ALL" ? "All" : sev}</span>
                <span className={`px-1 py-0.5 rounded-full text-[10px] ${isActive ? "bg-black/20" : "bg-slate-700/50"}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Results Count */}
        <div className="text-xs text-slate-500">
          Showing {filteredIssues.length} of {issues.length} issues
          {searchQuery && ` matching "${searchQuery}"`}
        </div>
      </div>

      {/* Issues List */}
      <div className="space-y-3">
        {Object.entries(groupedIssues).map(([groupKey, groupIssues]) => {
          const isCollapsed = collapsedGroups.has(groupKey);

          return (
            <div key={groupKey} className="space-y-2">
              {/* Group Header */}
              {groupBy !== "none" && (
                <button
                  onClick={() => toggleGroupCollapsed(groupKey)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-300 bg-slate-800/30 hover:bg-slate-800/50 rounded-lg transition-colors"
                >
                  <motion.span animate={{ rotate: isCollapsed ? -90 : 0 }} transition={{ duration: 0.15 }}>
                    <ChevronDownIcon />
                  </motion.span>
                  <FileIcon />
                  <span className="flex-1 text-left truncate">{groupKey}</span>
                  <span className="px-2 py-0.5 text-xs bg-slate-700/50 text-slate-400 rounded-full">
                    {groupIssues.length}
                  </span>
                </button>
              )}

              {/* Group Issues */}
              <AnimatePresence>
                {!isCollapsed && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-2 overflow-hidden"
                  >
                    {groupIssues.map((issue, idx) => {
                      const globalIndex = issues.indexOf(issue);
                      const isExpanded = expandedIssues.has(globalIndex);
                      const style = SEVERITY_STYLES[issue.severity as SeverityLevel] || SEVERITY_STYLES.LOW;
                      const Icon = getSeverityIcon(issue.severity);

                      return (
                        <motion.div
                          key={`${groupKey}-${idx}`}
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.03 }}
                          className={`relative overflow-hidden rounded-lg border-l-4 ${style.border} bg-slate-800/40 hover:bg-slate-800/60 transition-all`}
                        >
                          {/* Main Content */}
                          <div
                            onClick={() => toggleIssueExpanded(globalIndex)}
                            className="flex items-start gap-3 p-4 cursor-pointer"
                          >
                            {/* Icon */}
                            <div className={`shrink-0 w-8 h-8 rounded-full ${style.bg} flex items-center justify-center`}>
                              <Icon className={style.icon} />
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <span className={`inline-flex items-center px-2 py-0.5 text-xs font-bold rounded ${style.bg} ${style.text}`}>
                                  {issue.severity}
                                </span>
                                {issue.file && (
                                  <span className="flex items-center gap-1 text-xs text-slate-500 font-mono">
                                    <FileIcon className="w-3 h-3" />
                                    {issue.file}{issue.line ? `:${issue.line}` : ""}
                                  </span>
                                )}
                              </div>

                              <p className="mt-2 text-sm text-slate-200 leading-relaxed">{issue.message}</p>

                              {/* Preview of suggestion if available */}
                              {issue.suggestion && (
                                <div className="mt-2 text-xs text-slate-500 bg-slate-900/50 rounded px-2 py-1.5 border-l-2 border-slate-700 truncate">
                                  <span className="text-slate-600">Suggestion:</span> {issue.suggestion}
                                </div>
                              )}
                            </div>

                            {/* Expand Icon */}
                            <motion.div
                              animate={{ rotate: isExpanded ? 180 : 0 }}
                              className="shrink-0 text-slate-500"
                            >
                              <ChevronDownIcon />
                            </motion.div>
                          </div>

                          {/* Expanded Content */}
                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden border-t border-slate-700/30"
                              >
                                <div className="p-4 space-y-3">
                                  {/* Full suggestion */}
                                  {issue.suggestion && (
                                    <div className="p-3 bg-slate-900/50 rounded-lg border border-slate-700/50">
                                      <h5 className="text-xs font-semibold text-slate-400 mb-2">Suggestion</h5>
                                      <p className="text-sm text-slate-300">{issue.suggestion}</p>
                                    </div>
                                  )}

                                  {/* Action buttons */}
                                  <div className="flex items-center justify-between pt-2">
                                    <div className="text-xs text-slate-500">
                                      Click &quot;+ Knowledge&quot; to add this issue to the knowledge base
                                    </div>
                                    {/* Note: CreateKnowledgeButton would go here if needed */}
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.div>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
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
  const [error, setError] = useState<string | null>(null);
  const [createdType, setCreatedType] = useState<"BN" | "RULE" | null>(null);

  function handleCreate(type: "BN" | "RULE") {
    setCreating(true);
    setError(null);
    const body = {
      type,
      project: project || "unknown",
      title: issue.message.slice(0, 80),
      content: issue.suggestion || issue.message,
      source_review: reviewId,
      source_type: "交叉评审",
      source_file: issue.file ? JSON.stringify([issue.file]) : undefined,
      severity: issue.severity === "CRITICAL" ? "CRITICAL" : "HIGH",
    };
    fetch(`${API_BASE}/api/knowledge`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(async (r) => {
        if (!r.ok) {
          if (r.status === 401) throw new Error("请先登录");
          let msg = "创建失败";
          try { const d = await r.json(); if (d.error) msg = d.error; } catch { /* ignore */ }
          throw new Error(msg);
        }
        return r.json();
      })
      .then(() => {
        setCreatedType(type);
        setCreating(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "创建失败");
        setCreating(false);
      });
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="px-1.5 py-0.5 text-[10px] bg-slate-700/30 text-slate-500 hover:text-slate-300 hover:bg-slate-700/50 rounded transition-all"
      >
        {createdType ? "✓ Knowledge" : "+ Knowledge"}
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
              {error && <p className="text-xs text-red-400 bg-red-500/10 rounded p-2">{error}</p>}
              {createdType ? (
                <div className="flex items-center gap-2 px-3 py-2 text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-lg">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  <span>{createdType === "BN" ? "Business Noun" : "Business Rule"} created</span>
                </div>
              ) : (
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
              )}
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
