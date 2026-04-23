import { useState } from "react";
import { motion } from "framer-motion";

interface Props {
  onSubmit: (mrUrl: string, lanhuUrl?: string) => void;
  loading: boolean;
}

export function ReviewForm({ onSubmit, loading }: Props) {
  const [mrUrl, setMrUrl] = useState("");
  const [lanhuUrl, setLanhuUrl] = useState("");

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !loading && mrUrl.trim()) {
      onSubmit(mrUrl.trim(), lanhuUrl.trim() || undefined);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <input
          type="text"
          placeholder="Enter GitLab MR URL"
          value={mrUrl}
          onChange={(e) => setMrUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          className="flex-1 px-4 py-3 text-sm bg-slate-800/50 border border-slate-700/50 rounded-lg text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all disabled:opacity-50"
        />
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onSubmit(mrUrl.trim(), lanhuUrl.trim() || undefined)}
          disabled={loading || !mrUrl.trim()}
          className="px-6 py-3 text-sm font-medium bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-500/20"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <motion.span
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
              />
              Reviewing...
            </span>
          ) : (
            "Start Review"
          )}
        </motion.button>
      </div>
      <input
        type="text"
        placeholder="Lanhu design URL (optional)"
        value={lanhuUrl}
        onChange={(e) => setLanhuUrl(e.target.value)}
        disabled={loading}
        className="w-full px-4 py-2.5 text-sm bg-slate-800/30 border border-slate-700/30 rounded-lg text-slate-400 placeholder-slate-700 focus:outline-none focus:border-slate-600 transition-all disabled:opacity-50"
      />
    </div>
  );
}
