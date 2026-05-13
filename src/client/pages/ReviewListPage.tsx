import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import type { ReviewListItem, PaginatedResult } from "../../shared/types";

const API_BASE = "";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("auth_token");
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

function isRequirementReview(item: ReviewListItem): boolean {
  return item.mr_url.startsWith("requirement://");
}

function parseRequirementUrl(mrUrl: string): { productLine: string; branches: string } {
  try {
    const withoutProtocol = mrUrl.replace("requirement://", "");
    const [productLine, branchPart] = withoutProtocol.split("/");
    const branches = branchPart?.replace("..", " → ") || "";
    return { productLine, branches };
  } catch {
    return { productLine: mrUrl, branches: "" };
  }
}

export function ReviewListPage() {
  const [data, setData] = useState<PaginatedResult<ReviewListItem> | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [project, setProject] = useState("");
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (project) params.set("project", project);
    if (status) params.set("status", status);

    fetch(`${API_BASE}/api/reviews?${params}`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [page, project, status]);

  const renderStatusBadge = (item: ReviewListItem) => {
    if (isRequirementReview(item)) {
      switch (item.status) {
        case "reviewing":
          return <span className="px-1.5 py-0.5 text-[10px] rounded bg-blue-500/15 text-blue-400">评审中</span>;
        case "paused":
          return <span className="px-1.5 py-0.5 text-[10px] rounded bg-amber-500/15 text-amber-400">已暂停</span>;
        case "interrupted":
          return <span className="px-1.5 py-0.5 text-[10px] rounded bg-orange-500/15 text-orange-400">已中断</span>;
        case "completed":
          return item.passed
            ? <span className="px-1.5 py-0.5 text-[10px] rounded bg-emerald-500/15 text-emerald-400">PASS</span>
            : <span className="px-1.5 py-0.5 text-[10px] rounded bg-red-500/15 text-red-400">FAIL</span>;
        default:
          return <span className="text-slate-600">—</span>;
      }
    }
    if (item.passed === null) return <span className="text-slate-600">—</span>;
    return item.passed
      ? <span className="px-1.5 py-0.5 text-[10px] rounded bg-emerald-500/15 text-emerald-400">PASS</span>
      : <span className="px-1.5 py-0.5 text-[10px] rounded bg-red-500/15 text-red-400">FAIL</span>;
  };

  const scoreColor = (score: number | null) => {
    if (score === null) return "text-slate-600";
    if (score >= 4) return "text-emerald-400";
    if (score >= 3) return "text-yellow-400";
    return "text-red-400";
  };

  const renderProgress = (item: ReviewListItem) => {
    if (!item.subReportStats || item.subReportStats.total === 0) return null;
    const { completed, total, failed } = item.subReportStats;
    const pct = Math.round((completed + failed) / total * 100);
    return (
      <div className="flex items-center gap-1.5 min-w-[80px]">
        <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-[10px] text-slate-500">{completed + failed}/{total}</span>
      </div>
    );
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-lg font-semibold text-slate-200">Review History</h2>
        <select
          value={project}
          onChange={(e) => { setProject(e.target.value); setPage(1); }}
          className="px-2 py-1 text-xs bg-slate-800 border border-slate-700/50 rounded text-slate-400"
        >
          <option value="">All projects</option>
        </select>
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="px-2 py-1 text-xs bg-slate-800 border border-slate-700/50 rounded text-slate-400"
        >
          <option value="">All status</option>
          <option value="reviewing">评审中</option>
          <option value="paused">已暂停</option>
          <option value="interrupted">已中断</option>
          <option value="completed">已完成</option>
          <option value="draft">草稿</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-5 h-5 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
        </div>
      ) : !data || data.items.length === 0 ? (
        <p className="text-sm text-slate-600 py-8 text-center">No reviews yet</p>
      ) : (
        <>
          <div className="rounded-lg border border-slate-700/40 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-800/50 text-slate-500">
                  <th className="px-3 py-2 text-left">类型</th>
                  <th className="px-3 py-2 text-left">名称</th>
                  <th className="px-3 py-2 text-center">评分</th>
                  <th className="px-3 py-2 text-center">状态</th>
                  <th className="px-3 py-2 text-center">Issues</th>
                  <th className="px-3 py-2 text-left">进度</th>
                  <th className="px-3 py-2 text-right">时间</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => {
                  const isReq = isRequirementReview(item);
                  const { productLine, branches } = isReq ? parseRequirementUrl(item.mr_url) : { productLine: "", branches: "" };

                  const detailPath = isReq
                    ? `/requirement-review/${item.id}`
                    : `/reviews/${item.id}`;

                  return (
                    <tr key={item.id} className="border-t border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                      <td className="px-3 py-2.5">
                        {isReq
                          ? <span className="px-1.5 py-0.5 text-[10px] rounded bg-purple-500/15 text-purple-400">需求</span>
                          : <span className="px-1.5 py-0.5 text-[10px] rounded bg-cyan-500/15 text-cyan-400">MR</span>
                        }
                      </td>
                      <td className="px-3 py-2.5">
                        <Link to={detailPath} className="text-slate-300 hover:text-blue-400 transition-colors">
                          {isReq
                            ? (
                              <div>
                                <span className="font-medium">{productLine}</span>
                                <span className="text-slate-500 ml-1.5 text-[10px]">{branches}</span>
                              </div>
                            )
                            : (
                              <span className="font-mono text-xs">
                                {item.mr_url.split("/").slice(-2).join("/").replace(/\/-\/merge_requests\//, " !")}
                              </span>
                            )
                          }
                        </Link>
                      </td>
                      <td className={`px-3 py-2.5 text-center font-semibold ${scoreColor(item.avg_score)}`}>
                        {item.avg_score?.toFixed(1) ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-center">{renderStatusBadge(item)}</td>
                      <td className="px-3 py-2.5 text-center text-slate-400">
                        {item.issue_count ?? 0}
                        {item.critical_count > 0 && <span className="text-red-400 ml-1">({item.critical_count}C)</span>}
                      </td>
                      <td className="px-3 py-2.5">{renderProgress(item)}</td>
                      <td className="px-3 py-2.5 text-right text-slate-600">{new Date(item.created_at + "Z").toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data.totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-4">
              <button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="px-3 py-1 text-xs rounded border border-slate-700/50 text-slate-400 disabled:opacity-30 hover:text-white transition-colors"
              >
                Prev
              </button>
              <span className="px-3 py-1 text-xs text-slate-500">
                {page} / {data.totalPages}
              </span>
              <button
                disabled={page >= data.totalPages}
                onClick={() => setPage(page + 1)}
                className="px-3 py-1 text-xs rounded border border-slate-700/50 text-slate-400 disabled:opacity-30 hover:text-white transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}
