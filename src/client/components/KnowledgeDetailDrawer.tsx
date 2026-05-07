import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { KnowledgeEntrySummary } from "../../shared/types";

const API_BASE = "";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("auth_token");
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

interface Props {
  entry: KnowledgeEntrySummary;
  onClose: () => void;
}

export function KnowledgeDetailDrawer({ entry, onClose }: Props) {
  const [detail, setDetail] = useState<KnowledgeEntrySummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/api/knowledge/${entry.id}`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setDetail(data))
      .finally(() => setLoading(false));
  }, [entry.id]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/40"
        onClick={onClose}
      >
        <motion.div
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 250 }}
          onClick={(e) => e.stopPropagation()}
          className="fixed top-0 right-0 h-full w-[520px] max-w-[90vw] bg-slate-900 border-l border-slate-700/50 shadow-2xl flex flex-col"
        >
          {/* Header */}
          <div className="flex justify-between items-center px-5 py-3 border-b border-slate-700/50 shrink-0">
            <h3 className="text-sm font-semibold text-slate-200">Knowledge Entry</h3>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-lg">&times;</button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-5">
            {loading ? (
              <div className="flex justify-center py-12">
                <div className="w-5 h-5 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
              </div>
            ) : detail ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 text-xs rounded bg-slate-700 text-slate-300">{detail.type}</span>
                  <span className="text-xs font-mono text-slate-500">{detail.id}</span>
                </div>
                <h4 className="text-lg font-semibold text-slate-200">{detail.title}</h4>
                <p className="text-sm text-slate-400 whitespace-pre-wrap">{detail.content}</p>
                <div className="grid grid-cols-2 gap-4 text-xs text-slate-500">
                  <div>Project: {detail.project}</div>
                  <div>Status: {detail.status}</div>
                  <div>Hits: {detail.hit_count}</div>
                </div>
              </div>
            ) : (
              <p className="text-slate-500 text-center py-8">Failed to load knowledge entry</p>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
