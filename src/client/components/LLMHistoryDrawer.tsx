import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { LLMLog } from "../../shared/types";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3001";

interface Props {
  reviewId: string;
  onClose: () => void;
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("auth_token");
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="text-[10px] px-2 py-0.5 rounded border border-slate-700/50 text-slate-500 hover:text-slate-300 transition-colors"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function CollapsibleSection({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-slate-700/30 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-3 py-2 flex justify-between items-center bg-slate-800/40 hover:bg-slate-800/60 transition-colors text-xs"
      >
        <span className="text-slate-400 font-medium">{title}</span>
        <span className="text-slate-600 text-[10px]">{open ? "▼" : "▶"}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function LLMHistoryDrawer({ reviewId, onClose }: Props) {
  const [logs, setLogs] = useState<LLMLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/api/reviews/${reviewId}/logs`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((data) => setLogs(data))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, [reviewId]);

  const totalTokens = logs.reduce((sum, l) => sum + (l.input_tokens || 0) + (l.output_tokens || 0), 0);
  const totalDuration = logs.reduce((sum, l) => sum + l.duration_ms, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-6 bg-slate-800/60 backdrop-blur-sm rounded-xl border border-slate-700/50 p-5"
    >
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-semibold text-slate-200">LLM Communication History</h3>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-xs">Close</button>
      </div>

      {/* Summary bar */}
      <div className="flex gap-4 mb-4 text-xs text-slate-500">
        <span>{logs.length} calls</span>
        <span>{totalDuration.toLocaleString()}ms total</span>
        <span>{totalTokens.toLocaleString()} tokens</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <div className="w-4 h-4 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
        </div>
      ) : logs.length === 0 ? (
        <p className="text-xs text-slate-600 text-center py-4">No LLM logs recorded</p>
      ) : (
        <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
          {logs.map((log) => (
            <div key={log.id} className="space-y-2">
              <div className="flex items-center gap-3 text-xs">
                <span className="text-slate-300 font-medium">Batch {log.batch_index + 1}</span>
                {log.risk_level && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-700/50 text-slate-400">{log.risk_level}</span>
                )}
                <span className="text-slate-600">|</span>
                <span className="text-slate-500">{log.duration_ms}ms</span>
                {log.input_tokens != null && log.output_tokens != null && (
                  <span className="text-slate-500">{log.input_tokens}+{log.output_tokens} tokens</span>
                )}
                {log.provider && <span className="text-slate-600">{log.provider}/{log.model}</span>}
              </div>

              <CollapsibleSection title="System Prompt" defaultOpen={false}>
                <pre className="p-3 text-[11px] font-mono text-slate-400 whitespace-pre-wrap break-words max-h-60 overflow-y-auto">
                  {log.system_prompt}
                </pre>
                <div className="px-3 pb-2"><CopyButton text={log.system_prompt} /></div>
              </CollapsibleSection>

              <CollapsibleSection title="User Message" defaultOpen={false}>
                <pre className="p-3 text-[11px] font-mono text-slate-400 whitespace-pre-wrap break-words max-h-60 overflow-y-auto">
                  {log.user_message}
                </pre>
                <div className="px-3 pb-2"><CopyButton text={log.user_message} /></div>
              </CollapsibleSection>

              <CollapsibleSection title="AI Response" defaultOpen={false}>
                <pre className="p-3 text-[11px] font-mono text-slate-400 whitespace-pre-wrap break-words max-h-60 overflow-y-auto">
                  {log.response_text}
                </pre>
                <div className="px-3 pb-2"><CopyButton text={log.response_text} /></div>
              </CollapsibleSection>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
