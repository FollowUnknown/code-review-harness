import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { DimensionSet } from "../../shared/types";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3001";

function authHeaders(json = false): Record<string, string> {
  const t = localStorage.getItem("auth_token");
  const h: Record<string, string> = {};
  if (t) h["Authorization"] = `Bearer ${t}`;
  if (json) h["Content-Type"] = "application/json";
  return h;
}

interface FormData {
  name: string;
  project: string;
  dimensions: string;
  focus_areas: string;
}

const EMPTY_FORM: FormData = { name: "", project: "", dimensions: "", focus_areas: "" };

export function DimensionSetPage() {
  const [sets, setSets] = useState<DimensionSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<DimensionSet | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSets = useCallback(() => {
    setLoading(true);
    fetch(`${API_BASE}/api/dimension-sets`, { headers: authHeaders() })
      .then((r) => {
        if (r.status === 403) setIsAdmin(false);
        return r.json();
      })
      .then((d: DimensionSet[]) => setSets(d))
      .catch(() => setSets([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadSets(); }, [loadSets]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError(null);
    setShowModal(true);
  }

  function openEdit(ds: DimensionSet) {
    setEditing(ds);
    setForm({
      name: ds.name,
      project: ds.project ?? "",
      dimensions: ds.dimensions.join("\n"),
      focus_areas: ds.focus_areas?.join("\n") ?? "",
    });
    setError(null);
    setShowModal(true);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);

    const dimensions = form.dimensions.split("\n").map((s) => s.trim()).filter(Boolean);
    const focus_areas = form.focus_areas.split("\n").map((s) => s.trim()).filter(Boolean);

    if (!form.name.trim()) {
      setError("Name is required.");
      setSaving(false);
      return;
    }
    if (dimensions.length === 0) {
      setError("At least one dimension is required.");
      setSaving(false);
      return;
    }

    const body = {
      name: form.name.trim(),
      project: form.project.trim() || null,
      dimensions,
      focus_areas: focus_areas.length > 0 ? focus_areas : null,
    };

    try {
      const url = editing
        ? `${API_BASE}/api/dimension-sets/${editing.id}`
        : `${API_BASE}/api/dimension-sets`;
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: authHeaders(true), body: JSON.stringify(body) });
      if (!res.ok) {
        if (res.status === 403) {
          setIsAdmin(false);
          setError("Admin access required.");
        } else {
          const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
          setError(err.error || "Save failed.");
        }
        return;
      }
      setShowModal(false);
      loadSets();
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(ds: DimensionSet) {
    if (!confirm(`Delete dimension set "${ds.name}"?`)) return;
    const res = await fetch(`${API_BASE}/api/dimension-sets/${ds.id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (res.status === 403) {
      setIsAdmin(false);
      return;
    }
    loadSets();
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-200">Review Dimensions</h2>
        {isAdmin && (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={openCreate}
            className="px-3 py-1.5 text-xs rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 text-white"
          >
            + New Set
          </motion.button>
        )}
      </div>

      {/* Loading */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-5 h-5 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
        </div>
      ) : sets.length === 0 ? (
        <p className="text-sm text-slate-600 py-8 text-center">No dimension sets configured.</p>
      ) : (
        <div className="space-y-3">
          {sets.map((ds) => (
            <motion.div
              key={ds.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 bg-slate-800/40 border border-slate-700/30 rounded-lg"
            >
              {/* Row header */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-slate-200">{ds.name}</span>
                  <span className="text-xs text-slate-500">
                    {ds.project ?? "Default"}
                  </span>
                  {ds.is_default && (
                    <span className="px-1.5 py-0.5 text-[10px] rounded bg-blue-500/15 text-blue-400">
                      default
                    </span>
                  )}
                </div>
                {isAdmin && !ds.is_default && (
                  <div className="flex gap-2 shrink-0 ml-4">
                    <button
                      onClick={() => openEdit(ds)}
                      className="px-2 py-1 text-xs border border-slate-700/50 rounded text-slate-400 hover:text-white transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(ds)}
                      className="px-2 py-1 text-xs border border-red-800/50 rounded text-red-400/70 hover:text-red-400 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>

              {/* Dimension chips */}
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {ds.dimensions.map((d) => (
                  <span
                    key={d}
                    className="px-2 py-0.5 text-[11px] rounded bg-slate-700/50 text-slate-300"
                  >
                    {d}
                  </span>
                ))}
              </div>

              {/* Focus areas */}
              {ds.focus_areas && ds.focus_areas.length > 0 && (
                <div className="mt-2">
                  <span className="text-[10px] text-slate-600 mr-1.5">Focus:</span>
                  {ds.focus_areas.map((fa) => (
                    <span
                      key={fa}
                      className="inline-block px-1.5 py-0.5 text-[10px] rounded bg-cyan-500/10 text-cyan-400/80 mr-1 mb-0.5"
                    >
                      {fa}
                    </span>
                  ))}
                </div>
              )}

              {/* Meta */}
              <div className="mt-2 text-[10px] text-slate-600">
                by {ds.created_by} &middot; {new Date(ds.updated_at).toLocaleDateString()}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
            onClick={() => setShowModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg bg-slate-900 border border-slate-700/50 rounded-xl p-6 shadow-xl"
            >
              <h3 className="text-sm font-semibold text-slate-200 mb-4">
                {editing ? "Edit Dimension Set" : "New Dimension Set"}
              </h3>

              <div className="space-y-3">
                {/* Name */}
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Name</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-800/60 border border-slate-700/50 rounded-lg text-slate-300 focus:outline-none focus:border-blue-500/50"
                    placeholder="e.g. Standard Code Review"
                  />
                </div>

                {/* Project */}
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Project (optional)</label>
                  <input
                    type="text"
                    value={form.project}
                    onChange={(e) => setForm({ ...form, project: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-800/60 border border-slate-700/50 rounded-lg text-slate-300 focus:outline-none focus:border-blue-500/50"
                    placeholder="Leave empty for global default"
                  />
                </div>

                {/* Dimensions */}
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Dimensions <span className="text-slate-600">(one per line)</span>
                  </label>
                  <textarea
                    value={form.dimensions}
                    onChange={(e) => setForm({ ...form, dimensions: e.target.value })}
                    rows={5}
                    className="w-full px-3 py-2 text-xs bg-slate-800/60 border border-slate-700/50 rounded-lg text-slate-300 focus:outline-none focus:border-blue-500/50 resize-y font-mono"
                    placeholder={"Code Quality\nSecurity\nPerformance\nReadability"}
                  />
                </div>

                {/* Focus areas */}
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Focus Areas <span className="text-slate-600">(optional, one per line)</span>
                  </label>
                  <textarea
                    value={form.focus_areas}
                    onChange={(e) => setForm({ ...form, focus_areas: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 text-xs bg-slate-800/60 border border-slate-700/50 rounded-lg text-slate-300 focus:outline-none focus:border-blue-500/50 resize-y font-mono"
                    placeholder={"Error handling\nNaming conventions"}
                  />
                </div>
              </div>

              {/* Error */}
              {error && (
                <p className="mt-3 text-xs text-red-400">{error}</p>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-2 mt-5">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-xs border border-slate-700/50 rounded-lg text-slate-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 text-xs bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-lg disabled:opacity-50"
                >
                  {saving ? "Saving..." : editing ? "Update" : "Create"}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
