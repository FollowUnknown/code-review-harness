import { useState, useEffect, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import type { ReviewPlanDetail, PlanSummary } from "../../shared/types";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3001";
function authHeaders(json = false): Record<string, string> { const t = localStorage.getItem("auth_token"); const h: Record<string, string> = {}; if (t) h["Authorization"] = `Bearer ${t}`; if (json) h["Content-Type"] = "application/json"; return h; }

const ITEM_STATUS: Record<string, string> = { pending: "bg-slate-500/15 text-slate-500", reviewing: "bg-yellow-500/15 text-yellow-400", completed: "bg-emerald-500/15 text-emerald-400", failed: "bg-red-500/15 text-red-400" };

export function PlanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [plan, setPlan] = useState<ReviewPlanDetail | null>(null);
  const [summary, setSummary] = useState<PlanSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [newMrUrls, setNewMrUrls] = useState("");
  const [batchRunning, setBatchRunning] = useState(false);
  const [sseSteps, setSseSteps] = useState<Array<{ step: number; status: string; label: string; detail?: string }>>([]);

  const loadPlan = useCallback(() => {
    if (!id) return;
    fetch(`${API_BASE}/api/plans/${id}`, { headers: authHeaders() })
      .then((r) => r.json()).then(setPlan).catch(() => setPlan(null)).finally(() => setLoading(false));
    fetch(`${API_BASE}/api/plans/${id}/summary`, { headers: authHeaders() })
      .then((r) => r.json()).then(setSummary).catch(() => setSummary(null));
  }, [id]);

  useEffect(() => { loadPlan(); }, [loadPlan]);

  async function addMRs() {
    const urls = newMrUrls.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
    if (urls.length === 0) return;
    await fetch(`${API_BASE}/api/plans/${id}/items`, { method: "POST", headers: authHeaders(true), body: JSON.stringify({ mrUrls: urls }) });
    setNewMrUrls("");
    loadPlan();
  }

  async function removeItem(itemId: string) {
    await fetch(`${API_BASE}/api/plans/${id}/items/${itemId}`, { method: "DELETE", headers: authHeaders() });
    loadPlan();
  }

  async function archivePlan() {
    await fetch(`${API_BASE}/api/plans/${id}`, { method: "PUT", headers: authHeaders(true), body: JSON.stringify({ status: "archived" }) });
    loadPlan();
  }

  const navigate = useNavigate();
  async function deletePlan() {
    if (!confirm("Delete this plan and all its items?")) return;
    await fetch(`${API_BASE}/api/plans/${id}`, { method: "DELETE", headers: authHeaders() });
    navigate("/plans");
  }

  async function exportMd() {
    try {
      const res = await fetch(`${API_BASE}/api/plans/${id}/export`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${plan?.title ?? "review-plan"}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* silent */ }
  }

  async function startBatch() {
    setBatchRunning(true);
    setSseSteps([]);
    try {
      const res = await fetch(`${API_BASE}/api/plans/${id}/start`, { method: "POST", headers: authHeaders(true), body: JSON.stringify({}) });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        setSseSteps([{ step: 1, status: "error" as const, label: err.error || "Start failed" }]);
        return;
      }
      const reader = res.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let buffer = "";
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
              if (event.label === "COMPLETE") { loadPlan(); break; }
              setSseSteps((prev) => [...prev, event]);
            } catch { /* skip */ }
          }
        }
      }
    } finally { setBatchRunning(false); loadPlan(); }
  }

  if (loading) return <div className="flex justify-center py-12"><div className="w-5 h-5 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" /></div>;
  if (!plan) return <div className="py-8 text-center"><p className="text-sm text-red-400">Plan not found</p><Link to="/plans" className="text-xs text-slate-500 hover:text-blue-400 mt-2 inline-block">Back to plans</Link></div>;

  const pendingCount = plan.items.filter((i) => i.status === "pending").length;
  const completedCount = plan.items.filter((i) => i.status === "completed").length;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <Link to="/plans" className="text-xs text-slate-500 hover:text-blue-400">&larr; Back to plans</Link>

      {/* Header */}
      <div className="flex justify-between items-start mt-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-200">{plan.title}</h2>
          {plan.description && <p className="text-xs text-slate-500 mt-1">{plan.description}</p>}
          <span className={`inline-block mt-1.5 px-1.5 py-0.5 rounded text-[10px] ${
            plan.status === "open" ? "bg-blue-500/15 text-blue-400" : plan.status === "reviewing" ? "bg-yellow-500/15 text-yellow-400" : "bg-slate-500/15 text-slate-500"
          }`}>{plan.status}</span>
        </div>
        <div className="flex gap-2">
          {plan.status === "open" && pendingCount > 0 && (
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={startBatch} disabled={batchRunning} className="px-3 py-1.5 text-xs bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-lg disabled:opacity-50">
              {batchRunning ? "Running..." : `Start (${pendingCount} pending)`}
            </motion.button>
          )}
          {completedCount > 0 && <button onClick={exportMd} className="px-3 py-1.5 text-xs border border-slate-700/50 rounded-lg text-slate-400 hover:text-white">Export MD</button>}
          {plan.status === "open" && <button onClick={archivePlan} className="px-3 py-1.5 text-xs border border-slate-700/50 rounded-lg text-slate-400 hover:text-white">Archive</button>}
          {plan.status !== "reviewing" && <button onClick={deletePlan} className="px-3 py-1.5 text-xs border border-red-800/50 rounded-lg text-red-400/70 hover:text-red-400">Delete</button>}
        </div>
      </div>

      {/* Summary */}
      {summary && summary.completedMRs > 0 && (
        <div className="flex gap-4 mb-4 p-3 bg-slate-800/40 rounded-lg border border-slate-700/30 text-xs">
          <span className="text-slate-400">Pass rate: <span className="text-emerald-400 font-semibold">{summary.passedMRs}/{summary.completedMRs}</span></span>
          <span className="text-slate-400">Avg score: <span className="text-slate-200 font-semibold">{summary.avgScore?.toFixed(1) ?? "—"}</span></span>
          <span className="text-slate-400">Issues: <span className="text-red-400 font-semibold">{summary.totalIssues}</span></span>
          {(summary.issuesBySeverity.CRITICAL > 0 || summary.issuesBySeverity.HIGH > 0) && (
            <span className="text-red-400">{summary.issuesBySeverity.CRITICAL}C {summary.issuesBySeverity.HIGH}H</span>
          )}
        </div>
      )}

      {/* SSE Progress */}
      {batchRunning && sseSteps.length > 0 && (
        <div className="mb-4 p-3 bg-slate-800/40 rounded-lg border border-slate-700/30 space-y-1">
          {sseSteps.map((s, i) => (
            <div key={i} className={`text-xs ${s.status === "done" ? "text-emerald-400" : s.status === "error" ? "text-red-400" : "text-slate-400"}`}>
              {s.status === "running" && <span className="inline-block w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin mr-1 align-middle" />}
              {s.label} {s.detail && <span className="text-slate-600 ml-1">{s.detail}</span>}
            </div>
          ))}
        </div>
      )}

      {/* Add MRs */}
      {plan.status === "open" && (
        <div className="mb-4 flex gap-2">
          <textarea value={newMrUrls} onChange={(e) => setNewMrUrls(e.target.value)} rows={1} placeholder="Paste MR URLs (one per line or comma-separated)" className="flex-1 px-3 py-2 text-xs bg-slate-900/50 border border-slate-700/50 rounded-lg text-slate-300 focus:outline-none focus:border-blue-500/50 resize-y" />
          <button onClick={addMRs} className="px-3 py-2 text-xs border border-slate-700/50 rounded-lg text-slate-400 hover:text-white">Add</button>
        </div>
      )}

      {/* Items table */}
      {plan.items.length > 0 && (
        <div className="rounded-lg border border-slate-700/40 overflow-hidden">
          <table className="w-full text-xs">
            <thead><tr className="bg-slate-800/50 text-slate-500">
              <th className="px-3 py-2 text-left">MR</th>
              <th className="px-3 py-2 text-left">分支</th>
              <th className="px-3 py-2 text-left">发起人</th>
              <th className="px-3 py-2 text-center">Status</th>
              <th className="px-3 py-2 text-center">Score</th>
              <th className="px-3 py-2 text-left">评审时间</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr></thead>
            <tbody>
              {plan.items.map((item) => {
                const mrShort = item.mr_url.split("/").slice(-2).join("/").replace(/\/-\/merge_requests\//, " !");
                const scoreEntry = summary?.items.find((s) => s.mrUrl === item.mr_url);
                return (
                  <tr key={item.id} className="border-t border-slate-800/50">
                    <td className="px-3 py-2.5 font-mono text-slate-400">{mrShort}</td>
                    <td className="px-3 py-2.5 text-slate-400">
                      {item.source_branch && item.target_branch ? (
                        <span className="text-[10px]">{item.source_branch} &rarr; {item.target_branch}</span>
                      ) : (
                        <span className="text-[10px] text-slate-600">&mdash;</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-slate-400">
                      {item.author ? (
                        <span className="text-[10px]">{item.author}</span>
                      ) : (
                        <span className="text-[10px] text-slate-600">&mdash;</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${ITEM_STATUS[item.status] || ""}`}>{item.status}</span>
                      {item.error_message && (
                        <p className="text-[10px] text-red-400 mt-1 max-w-[200px] truncate" title={item.error_message}>{item.error_message}</p>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center text-slate-400">{scoreEntry?.score?.toFixed(1) ?? "—"}</td>
                    <td className="px-3 py-2.5 text-slate-400">
                      {item.reviewed_at ? (
                        <span className="text-[10px]" title={item.reviewed_at}>{new Date(item.reviewed_at).toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                      ) : (
                        <span className="text-[10px] text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right space-x-2">
                      {item.review_id && <Link to={`/reviews/${item.review_id}`} className="text-blue-400 hover:text-blue-300">View</Link>}
                      {plan.status === "open" && <button onClick={() => removeItem(item.id)} className="text-slate-600 hover:text-red-400">Remove</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </motion.div>
  );
}
