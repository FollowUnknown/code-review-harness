import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3001";
function authHeaders(): Record<string, string> { const t = localStorage.getItem("auth_token"); return t ? { Authorization: `Bearer ${t}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" }; }

export function PlanNewPage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/plans`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ title, description }) });
      if (!res.ok) throw new Error("Create failed");
      const plan = await res.json();
      navigate(`/plans/${plan.id}`);
    } catch { setSaving(false); }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-lg mx-auto">
      <h2 className="text-lg font-semibold text-slate-200 mb-4">New Review Plan</h2>
      <div className="space-y-4 bg-slate-800/40 rounded-xl border border-slate-700/40 p-5">
        <div>
          <label className="text-xs text-slate-500 block mb-1">Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full px-3 py-2 text-sm bg-slate-900/50 border border-slate-700/50 rounded-lg text-slate-300 focus:outline-none focus:border-blue-500/50" placeholder="Sprint 23 Frontend Review" />
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">Description (optional)</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="w-full px-3 py-2 text-sm bg-slate-900/50 border border-slate-700/50 rounded-lg text-slate-300 focus:outline-none focus:border-blue-500/50 resize-y" placeholder="Review all frontend MRs for Sprint 23" />
        </div>
        <div className="flex gap-2">
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={handleCreate} disabled={saving || !title.trim()} className="px-4 py-2 text-xs font-medium bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-lg disabled:opacity-50">
            {saving ? "Creating..." : "Create Plan"}
          </motion.button>
          <button onClick={() => navigate("/plans")} className="px-4 py-2 text-xs border border-slate-700/50 rounded-lg text-slate-400 hover:text-white">Cancel</button>
        </div>
      </div>
    </motion.div>
  );
}
