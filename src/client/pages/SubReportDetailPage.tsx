import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { LLMHistoryDrawer } from "../components/LLMHistoryDrawer";
import { KnowledgeDetailDrawer } from "../components/KnowledgeDetailDrawer";
import type {
  ReviewRecord,
  ReviewSubReport,
  ReviewReport,
  TechStackGroupReport,
  KnowledgeEntrySummary,
} from "../../shared/types";

const API_BASE = "";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("auth_token");
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

function severityColor(severity: string): string {
  switch (severity) {
    case "CRITICAL":
      return "text-red-400 font-semibold";
    case "HIGH":
      return "text-orange-400 font-semibold";
    case "MEDIUM":
      return "text-yellow-400";
    default:
      return "text-slate-400";
  }
}

export function SubReportDetailPage() {
  const { reviewId, projectName } = useParams<{
    reviewId: string;
    projectName: string;
  }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [record, setRecord] = useState<ReviewRecord | null>(null);
  const [report, setReport] = useState<ReviewReport | null>(null);
  const [meta, setMeta] = useState<{
    techStack: string;
    status: string;
    score: number | null;
  } | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [knowledgeUsed, setKnowledgeUsed] = useState<KnowledgeEntrySummary[]>([]);
  const [knowledgeProduced, setKnowledgeProduced] = useState<KnowledgeEntrySummary[]>([]);
  const [selectedKnowledge, setSelectedKnowledge] = useState<KnowledgeEntrySummary | null>(null);

  useEffect(() => {
    if (!reviewId || !projectName) return;
    setLoading(true);
    const decodedProject = decodeURIComponent(projectName);

    Promise.all([
      fetch(`${API_BASE}/api/reviews/${reviewId}`, {
        headers: authHeaders(),
      }).then((r) => r.json()),
      fetch(`${API_BASE}/api/reviews/${reviewId}/sub-reports`, {
        headers: authHeaders(),
      }).then((r) => {
        if (r.ok) return r.json();
        return [];
      }),
    ])
      .then(([detailData, subs]) => {
        setRecord(detailData.record);

        // Extract knowledge data from full response
        const resp = detailData.response;
        if (resp) {
          setKnowledgeUsed(resp.knowledgeUsed ?? []);
          setKnowledgeProduced(resp.knowledgeProduced ?? []);
        }

        const reportJson: any = JSON.parse(detailData.record.report_json);

        // Try sub-reports first (v1.4.6+)
        if (Array.isArray(subs) && subs.length > 0) {
          const match = subs.find(
            (s: ReviewSubReport) => s.project === decodedProject
          );
          if (match) {
            let subReport: ReviewReport | null = null;
            if (match.report_json) {
              try {
                subReport = JSON.parse(match.report_json);
              } catch {
                /* ignore */
              }
            }
            setReport(subReport);
            setMeta({
              techStack: match.tech_stack,
              status: match.status,
              score: match.score,
            });
            return;
          }
        }

        // Fallback: extract from report_json.techStackReports (pre-v1.4.6)
        const techStackReports: TechStackGroupReport[] =
          reportJson.techStackReports ?? [];
        for (const tsr of techStackReports) {
          const match = (tsr.projectReports ?? []).find(
            (pr: any) => pr.project === decodedProject
          );
          if (match) {
            setReport(match.report ?? null);
            setMeta({
              techStack: tsr.techStack,
              status: match.error ? "failed" : "completed",
              score: match.report?.scores?.length
                ? Math.round(
                    (match.report.scores.reduce(
                      (s: number, sc: any) => s + sc.score,
                      0
                    ) /
                      match.report.scores.length) *
                      10
                  ) / 10
                : null,
            });
            return;
          }
        }

        // Not found
        setReport(null);
        setMeta(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [reviewId, projectName]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-5 h-5 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !record) {
    return (
      <div className="text-center py-12">
        <p className="text-red-400 text-sm">{error || "未找到评审记录"}</p>
        <Link
          to={`/requirement-review/${reviewId}`}
          className="text-blue-400 text-xs mt-2 inline-block"
        >
          ← 返回
        </Link>
      </div>
    );
  }

  const decodedProject = decodeURIComponent(projectName ?? "");

  return (
    <>
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {/* Header with back button and LLM Logs */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link
            to={`/requirement-review/${reviewId}`}
            className="text-slate-400 hover:text-white transition-colors text-sm"
          >
            ← 返回列表
          </Link>
          <h2 className="text-lg font-semibold text-slate-200">项目详情</h2>
        </div>
        <button
          onClick={() => setShowLogs(!showLogs)}
          className={`px-3 py-1.5 text-xs rounded-lg border transition-all ${
            showLogs
              ? "bg-slate-700 border-slate-600 text-white"
              : "bg-slate-800/50 border-slate-700/50 text-slate-400 hover:text-white"
          }`}
        >
          {showLogs ? "Hide Logs" : "LLM Logs"}
        </button>
      </div>

      {/* Project info card */}
      <div className="bg-slate-800/60 rounded-lg border border-slate-700/50 p-4 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-slate-200 font-medium">{decodedProject}</div>
            {meta && (
              <div className="text-xs text-slate-500 mt-1">
                {meta.techStack} ·{" "}
                {meta.status === "completed"
                  ? "已完成"
                  : meta.status === "failed"
                  ? "失败"
                  : meta.status === "reviewing"
                  ? "评审中"
                  : "等待中"}
              </div>
            )}
          </div>
          {meta?.score !== null && meta?.score !== undefined && (
            <span
              className={`font-semibold ${
                meta.score >= 4
                  ? "text-emerald-400"
                  : meta.score >= 3
                  ? "text-yellow-400"
                  : "text-red-400"
              }`}
            >
              {meta.score.toFixed(1)}
            </span>
          )}
        </div>
      </div>

      {/* Empty state */}
      {!report && (
        <div className="bg-slate-800/60 rounded-lg border border-slate-700/50 p-8 text-center text-sm text-slate-500">
          {meta?.status === "pending" || meta?.status === "reviewing"
            ? "评审尚未完成，暂无数据"
            : meta?.status === "failed"
            ? "该子项目评审失败"
            : "暂无评审报告数据"}
        </div>
      )}

      {/* Issues list */}
      {report && report.issues.length > 0 && (
        <div className="bg-slate-800/60 rounded-lg border border-slate-700/50 p-4 mb-4">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
            Issues ({report.issues.length})
          </h3>
          <div className="space-y-2">
            {report.issues.map((issue, i) => (
              <div key={i} className="bg-slate-900/50 rounded p-3 text-xs">
                <div className="flex items-center gap-2 mb-1">
                  <span className={severityColor(issue.severity)}>
                    {issue.severity}
                  </span>
                  <span className="text-slate-300">{issue.message}</span>
                </div>
                <div className="text-slate-500 mt-0.5">
                  {issue.file}
                  {issue.line != null ? `:${issue.line}` : ""}
                </div>
                {issue.suggestion && (
                  <div className="text-slate-400 mt-1 border-t border-slate-800 pt-1">
                    {issue.suggestion}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scores breakdown */}
      {report && report.scores.length > 0 && (
        <div className="bg-slate-800/60 rounded-lg border border-slate-700/50 p-4 mb-4">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
            评分明细
          </h3>
          <div className="space-y-2">
            {report.scores.map((sc, i) => (
              <div key={i} className="flex items-start gap-3">
                <span
                  className={`text-sm font-semibold shrink-0 ${
                    sc.score >= 4
                      ? "text-emerald-400"
                      : sc.score >= 3
                      ? "text-yellow-400"
                      : "text-red-400"
                  }`}
                >
                  {sc.score.toFixed(1)}
                </span>
                <div className="min-w-0">
                  <div className="text-xs text-slate-300">{sc.dimension}</div>
                  {sc.comment && (
                    <div className="text-xs text-slate-500 mt-0.5">
                      {sc.comment}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary */}
      {report && report.summary && (
        <div className="bg-slate-800/60 rounded-lg border border-slate-700/50 p-4">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
            总结
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            {report.summary}
          </p>
        </div>
      )}

      {/* Knowledge Used */}
      {knowledgeUsed.length > 0 && (
        <div className="bg-slate-800/60 rounded-lg border border-slate-700/50 p-4 mt-4">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
            知识库引用 ({knowledgeUsed.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {knowledgeUsed.map((entry) => (
              <button
                key={entry.id}
                onClick={() => setSelectedKnowledge(entry)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded bg-slate-700/40 border border-slate-600/30 text-slate-300 hover:bg-slate-700/60 hover:border-slate-500/50 transition-colors"
              >
                <span className="px-1 py-0.5 rounded text-[10px] bg-slate-600/50 text-slate-400">{entry.type}</span>
                <span>{entry.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Knowledge Produced */}
      {knowledgeProduced.length > 0 && (
        <div className="bg-slate-800/60 rounded-lg border border-slate-700/50 p-4 mt-4">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
            评审输出知识 ({knowledgeProduced.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {knowledgeProduced.map((entry) => (
              <button
                key={entry.id}
                onClick={() => setSelectedKnowledge(entry)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded bg-emerald-900/20 border border-emerald-700/30 text-emerald-300 hover:bg-emerald-900/30 hover:border-emerald-600/50 transition-colors"
              >
                <span className="px-1 py-0.5 rounded text-[10px] bg-emerald-800/40 text-emerald-400">{entry.type}</span>
                <span>{entry.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </motion.div>

      {/* LLM History Drawer */}
      <AnimatePresence>
        {showLogs && reviewId && (
          <LLMHistoryDrawer reviewId={reviewId} onClose={() => setShowLogs(false)} />
        )}
      </AnimatePresence>

      {/* Knowledge Detail Drawer */}
      {selectedKnowledge && (
        <KnowledgeDetailDrawer
          entry={selectedKnowledge}
          onClose={() => setSelectedKnowledge(null)}
        />
      )}
    </>
  );
}
