import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import type { PlanListItem, PaginatedResult, PlanStatus } from "../../shared/types";

const API_BASE = "";
function authHeaders(): Record<string, string> { const t = localStorage.getItem("auth_token"); return t ? { Authorization: `Bearer ${t}` } : {}; }

const STATUS_STYLE: Record<PlanStatus, string> = {
  open: "bg-blue-500/15 text-blue-400",
  reviewing: "bg-yellow-500/15 text-yellow-400",
  archived: "bg-slate-500/15 text-slate-500",
};

export function PlanListPage() {
  const [data, setData] = useState<PaginatedResult<PlanListItem> | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (status) params.set("status", status);
    fetch(`${API_BASE}/api/plans?${params}`, { headers: authHeaders() })
      .then((r) => r.json()).then((d) => setData(d)).catch(() => setData(null)).finally(() => setLoading(false));
  }, [page, status]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-lg font-semibold text-slate-200">Review Plans</h2>
        <Link to="/plans/new" className="px-3 py-1.5 text-xs rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 text-white">+ New Plan</Link>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="px-2 py-1 text-xs bg-slate-800 border border-slate-700/50 rounded text-slate-400">
          <option value="">All status</option>
          <option value="open">Open</option>
          <option value="reviewing">Reviewing</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-5 h-5 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" /></div>
      ) : !data || data.items.length === 0 ? (
        <p className="text-sm text-slate-600 py-8 text-center">No plans yet</p>
      ) : (
        <>
          <div className="rounded-lg border border-slate-700/40 overflow-hidden">
            <table className="w-full text-xs">
              <thead><tr className="bg-slate-800/50 text-slate-500">
                <th className="px-3 py-2 text-left">Title</th>
                <th className="px-3 py-2 text-center">Status</th>
                <th className="px-3 py-2 text-center">MRs</th>
                <th className="px-3 py-2 text-right">Created</th>
              </tr></thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id} className="border-t border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                    <td className="px-3 py-2.5"><Link to={`/plans/${item.id}`} className="text-slate-300 hover:text-blue-400 transition-colors">{item.title}</Link></td>
                    <td className="px-3 py-2.5 text-center"><span className={`px-1.5 py-0.5 rounded text-[10px] ${STATUS_STYLE[item.status]}`}>{item.status}</span></td>
                    <td className="px-3 py-2.5 text-center text-slate-400">{item.item_count}</td>
                    <td className="px-3 py-2.5 text-right text-slate-600">{new Date(item.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-4">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 py-1 text-xs rounded border border-slate-700/50 text-slate-400 disabled:opacity-30 hover:text-white">Prev</button>
              <span className="px-3 py-1 text-xs text-slate-500">{page} / {data.totalPages}</span>
              <button disabled={page >= data.totalPages} onClick={() => setPage(page + 1)} className="px-3 py-1 text-xs rounded border border-slate-700/50 text-slate-400 disabled:opacity-30 hover:text-white">Next</button>
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}
