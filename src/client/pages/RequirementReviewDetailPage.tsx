import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import type { ReviewSubReport, ReviewRecord } from "../../shared/types";

const API_BASE = "";

interface CheckpointInfo {
  id: string;
  status: string;
  currentBatch: number;
  totalBatches: number;
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("auth_token");
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

export function RequirementReviewDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [record, setRecord] = useState<ReviewRecord | null>(null);
  const [subReports, setSubReports] = useState<ReviewSubReport[]>([]);
  const [checkpoint, setCheckpoint] = useState<CheckpointInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resuming, setResuming] = useState(false);
  const [abandoning, setAbandoning] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      fetch(`${API_BASE}/api/reviews/${id}`, { headers: authHeaders() }).then((r) => r.json()),
      fetch(`${API_BASE}/api/reviews/${id}/sub-reports`, { headers: authHeaders() }).then((r) => {
        if (r.ok) return r.json();
        return [];
      }),
      fetch(`${API_BASE}/api/reviews/${id}/checkpoint`, { headers: authHeaders() }).then((r) => {
        if (r.ok) return r.json();
        return null;
      }),
    ])
      .then(([detailData, subs, cp]) => {
        setRecord(detailData.record);
        setSubReports(Array.isArray(subs) ? subs : []);
        setCheckpoint(cp);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  // Poll for updates when review is active
  useEffect(() => {
    if (!id || !record) return;
    const isActive = record.status === "reviewing";
    if (!isActive) return;

    const interval = setInterval(() => {
      Promise.all([
        fetch(`${API_BASE}/api/reviews/${id}`, { headers: authHeaders() }).then((r) => r.json()),
        fetch(`${API_BASE}/api/reviews/${id}/sub-reports`, { headers: authHeaders() }).then((r) => {
          if (r.ok) return r.json();
          return [];
        }),
      ]).then(([detailData, subs]) => {
        setRecord(detailData.record);
        setSubReports(Array.isArray(subs) ? subs : []);
      }).catch(() => {});
    }, 5000);

    return () => clearInterval(interval);
  }, [id, record?.status]);

  const handleResume = () => {
    if (!checkpoint || resuming) return;
    setResuming(true);
    // Navigate to requirement review page with checkpoint resume
    navigate(`/requirement-review?checkpointId=${checkpoint.id}`);
  };

  const handleAbandon = async () => {
    if (!checkpoint || abandoning) return;
    setAbandoning(true);
    try {
      await fetch(`${API_BASE}/api/review/checkpoints/${checkpoint.id}?abandon=true`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      setCheckpoint(null);
      // Refresh record
      const detailData = await fetch(`${API_BASE}/api/reviews/${id}`, { headers: authHeaders() }).then((r) => r.json());
      setRecord(detailData.record);
    } catch { /* ignore */ }
    setAbandoning(false);
  };

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
        <Link to="/reviews" className="text-blue-400 text-xs mt-2 inline-block">← 返回列表</Link>
      </div>
    );
  }

  const report = JSON.parse(record.report_json);
  const isActive = record.status === "reviewing" || record.status === "paused" || record.status === "interrupted";
  const completedCount = subReports.filter((s) => s.status === "completed").length;
  const failedCount = subReports.filter((s) => s.status === "failed").length;

  const statusBadge = () => {
    switch (record.status) {
      case "reviewing":
        return <span className="px-2 py-1 text-xs rounded bg-blue-500/15 text-blue-400">评审中</span>;
      case "paused":
        return <span className="px-2 py-1 text-xs rounded bg-amber-500/15 text-amber-400">已暂停</span>;
      case "interrupted":
        return <span className="px-2 py-1 text-xs rounded bg-orange-500/15 text-orange-400">已中断</span>;
      case "completed":
        return record.passed
          ? <span className="px-2 py-1 text-xs rounded bg-emerald-500/15 text-emerald-400">通过</span>
          : <span className="px-2 py-1 text-xs rounded bg-red-500/15 text-red-400">未通过</span>;
      default:
        return <span className="text-slate-400">{record.status}</span>;
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex items-center gap-3 mb-4">
        <Link to="/reviews" className="text-slate-400 hover:text-white transition-colors text-sm">← 列表</Link>
        <h2 className="text-lg font-semibold text-slate-200">需求评审详情</h2>
      </div>

      {/* Header */}
      <div className="bg-slate-800/60 rounded-lg border border-slate-700/50 p-4 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-slate-200 font-medium">{report.productLine || record.project}</div>
            <div className="text-xs text-slate-500 mt-1">
              {report.sourceBranch} → {report.targetBranch}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {statusBadge()}
            {record.avg_score !== null && (
              <span className={`font-semibold ${record.avg_score >= 4 ? "text-emerald-400" : record.avg_score >= 3 ? "text-yellow-400" : "text-red-400"}`}>
                {record.avg_score.toFixed(1)}
              </span>
            )}
          </div>
        </div>

        {/* Progress */}
        {isActive && subReports.length > 0 && (
          <div className="mt-3">
            <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
              <span>项目进度</span>
              <span>{completedCount + failedCount}/{subReports.length}</span>
            </div>
            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${(completedCount + failedCount) / subReports.length * 100}%` }} />
            </div>
          </div>
        )}

        {/* Summary stats */}
        {!isActive && (
          <div className="flex gap-6 mt-3 text-xs text-slate-400">
            <span>总项目: {report.totalProjects ?? subReports.length}</span>
            <span>总文件: {report.totalFiles ?? "—"}</span>
            <span>Issues: {record.issue_count ?? report.totalIssues ?? 0}</span>
            {report.criticalCount > 0 && <span className="text-red-400">严重: {report.criticalCount}</span>}
          </div>
        )}

        {/* v1.4.6: Resume/Abandon actions */}
        {(record.status === "paused" || record.status === "interrupted") && checkpoint && (
          <div className="flex items-center gap-3 mt-4 pt-3 border-t border-slate-700/50">
            <button
              onClick={handleResume}
              disabled={resuming}
              className="px-3 py-1.5 text-xs rounded bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 transition-colors"
            >
              {resuming ? "恢复中..." : "恢复评审"}
            </button>
            <button
              onClick={handleAbandon}
              disabled={abandoning}
              className="px-3 py-1.5 text-xs rounded border border-slate-600 text-slate-400 hover:text-red-400 hover:border-red-400/50 disabled:opacity-50 transition-colors"
            >
              {abandoning ? "放弃中..." : "放弃评审"}
            </button>
          </div>
        )}
      </div>

      {/* Sub-reports table */}
      {(() => {
        // v1.4.6: fallback — when no sub_reports (pre-v1.4.6 records),
        // extract project data from report_json.techStackReports
        type ProjectRow = {
          project: string;
          techStack: string;
          status: string;
          score: number | null;
          issueCount: number;
          criticalCount: number;
        };

        const rows: ProjectRow[] = subReports.length > 0
          ? subReports.map((s) => ({
              project: s.project,
              techStack: s.tech_stack,
              status: s.status,
              score: s.score,
              issueCount: s.issue_count ?? 0,
              criticalCount: s.critical_count,
            }))
          : (report.techStackReports ?? []).flatMap((tsr: any) =>
              (tsr.projectReports ?? []).map((pr: any) => ({
                project: pr.project,
                techStack: tsr.techStack,
                status: pr.error ? "failed" : "completed",
                score: pr.report?.scores?.length
                  ? Math.round(pr.report.scores.reduce((s: number, sc: any) => s + sc.score, 0) / pr.report.scores.length * 10) / 10
                  : null,
                issueCount: pr.report?.issues?.length ?? 0,
                criticalCount: pr.report?.issues?.filter((i: any) => i.severity === "CRITICAL").length ?? 0,
              }))
            );

        if (rows.length === 0) {
          return (
            <p className="text-sm text-slate-600 text-center py-6">
              {isActive ? "评审正在进行中，子项目即将开始处理..." : "暂无子项目记录"}
            </p>
          );
        }

        return (
          <div className="rounded-lg border border-slate-700/40 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-800/50 text-slate-500">
                  <th className="px-3 py-2 text-left">项目</th>
                  <th className="px-3 py-2 text-center">技术栈</th>
                  <th className="px-3 py-2 text-center">状态</th>
                  <th className="px-3 py-2 text-center">评分</th>
                  <th className="px-3 py-2 text-center">Issues</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const statusBadge = () => {
                    switch (row.status) {
                      case "pending":
                        return <span className="text-slate-500">等待中</span>;
                      case "reviewing":
                        return (
                          <span className="flex items-center justify-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                            <span className="text-blue-400">评审中</span>
                          </span>
                        );
                      case "completed":
                        return <span className="text-emerald-400">完成</span>;
                      case "failed":
                        return <span className="text-red-400">失败</span>;
                      default:
                        return <span className="text-slate-500">{row.status}</span>;
                    }
                  };

                  return (
                    <tr key={`${row.project}-${idx}`} className="border-t border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                      <td className="px-3 py-2.5 text-slate-300">{row.project}</td>
                      <td className="px-3 py-2.5 text-center text-slate-500">{row.techStack}</td>
                      <td className="px-3 py-2.5 text-center">{statusBadge()}</td>
                      <td className="px-3 py-2.5 text-center text-slate-400">{row.score?.toFixed(1) ?? "—"}</td>
                      <td className="px-3 py-2.5 text-center text-slate-400">
                        {row.issueCount}
                        {row.criticalCount > 0 && <span className="text-red-400 ml-1">({row.criticalCount}C)</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })()}
    </motion.div>
  );
}
