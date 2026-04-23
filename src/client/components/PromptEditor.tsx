import { useState, useEffect } from "react";
import { motion } from "framer-motion";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3001";

interface PromptListItem {
  name: string;
  category: string;
  description: string | null;
  variables: string | null;
  isDefault: boolean;
  version: number;
}

interface PromptDetail {
  name: string;
  category: string;
  description: string | null;
  systemTemplate: string;
  userTemplate: string | null;
  variables: string | null;
  version: number;
}

interface Props {
  onClose: () => void;
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("auth_token");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

export function PromptEditor({ onClose }: Props) {
  const [prompts, setPrompts] = useState<PromptListItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<PromptDetail | null>(null);
  const [editText, setEditText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/llm/prompts`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((data) => {
        setPrompts(data);
        if (data.length > 0 && !selected) selectPrompt(data[0].name);
      })
      .catch(() => setMessage("Failed to load prompts"));
  }, []);

  function selectPrompt(name: string) {
    setSelected(name);
    setMessage(null);
    fetch(`${API_BASE}/api/llm/prompts/${name}`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((data: PromptDetail) => {
        setDetail(data);
        setEditText(data.systemTemplate);
      })
      .catch(() => setMessage("Failed to load prompt"));
  }

  async function handleSave() {
    if (!selected) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`${API_BASE}/api/llm/prompts/${selected}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ systemTemplate: editText }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Save failed");
      const updated: PromptDetail = await res.json();
      setDetail(updated);
      setMessage("Saved");
      setTimeout(() => setMessage(null), 2000);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (!selected || !confirm("Reset to default? Your edits will be lost.")) return;
    try {
      const res = await fetch(`${API_BASE}/api/llm/prompts/${selected}/reset`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Reset failed");
      selectPrompt(selected);
      setMessage("Reset to default");
      setTimeout(() => setMessage(null), 2000);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Reset failed");
    }
  }

  // Group by category
  const categories = [...new Set(prompts.map((p) => p.category))];

  return (
    <div className="p-5 bg-slate-800/60 backdrop-blur-sm rounded-xl border border-slate-700/50">
      <div className="flex justify-between items-center mb-5">
        <h3 className="text-base font-semibold text-slate-200">Prompt Management</h3>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors text-lg">
          x
        </button>
      </div>

      <div className="flex gap-4 min-h-[400px]">
        {/* Left: Category + List */}
        <div className="w-48 shrink-0 space-y-3">
          {categories.map((cat) => (
            <div key={cat}>
              <p className="text-xs font-medium text-slate-500 uppercase mb-1.5">{cat}</p>
              <div className="space-y-1">
                {prompts
                  .filter((p) => p.category === cat)
                  .map((p) => (
                    <button
                      key={p.name}
                      onClick={() => selectPrompt(p.name)}
                      className={`w-full text-left px-2.5 py-1.5 text-xs rounded-lg transition-all ${
                        selected === p.name
                          ? "bg-slate-700 text-white"
                          : "text-slate-400 hover:bg-slate-700/50 hover:text-slate-300"
                      }`}
                    >
                      {p.name}
                      <span className="ml-1.5 text-slate-600">v{p.version}</span>
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </div>

        {/* Right: Editor */}
        <div className="flex-1 min-w-0">
          {detail ? (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <p className="text-sm font-medium text-slate-300">
                  {detail.name} <span className="text-slate-600">v{detail.version}</span>
                </p>
                {detail.variables && (
                  <p className="text-xs text-slate-600">
                    Variables: {(() => { try { return JSON.parse(detail.variables).map((v: string) => `{{${v}}}`).join(", "); } catch { return detail.variables; } })()}
                  </p>
                )}
              </div>

              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="w-full h-72 px-3 py-2.5 text-xs font-mono bg-slate-900/50 border border-slate-700/50 rounded-lg text-slate-300 placeholder-slate-700 focus:outline-none focus:border-blue-500/50 resize-y"
                spellCheck={false}
              />

              {message && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={`text-xs px-3 py-2 rounded-lg ${
                    message === "Saved" || message === "Reset to default"
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "bg-red-500/10 text-red-400"
                  }`}
                >
                  {message}
                </motion.p>
              )}

              <div className="flex gap-2">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 text-xs font-medium bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-lg disabled:opacity-50 shadow-lg shadow-blue-500/20"
                >
                  {saving ? "Saving..." : "Save"}
                </motion.button>
                <button
                  onClick={handleReset}
                  className="px-4 py-2 text-xs border border-slate-700/50 rounded-lg text-slate-400 hover:text-white hover:border-slate-600 transition-all"
                >
                  Reset to Default
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-600">Select a prompt to edit</p>
          )}
        </div>
      </div>
    </div>
  );
}
