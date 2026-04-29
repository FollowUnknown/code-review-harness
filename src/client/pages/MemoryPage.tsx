import { useState, useEffect } from "react";
import { motion } from "framer-motion";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3001";

interface MemoryStatsData {
  stats: {
    totalEntries: number;
    byLayer: { session: number; task: number; project: number };
    upgrades: { taskToProject: number; projectRenewed: number };
    archived: { session: number; task: number; project: number };
    lastMaintenance: string | null;
  };
  expiring: {
    id: string;
    layer: string;
    scope: string;
    expiresAt: string;
    hitCount: number;
  }[];
  archiveStats: { session: number; task: number; project: number };
}

function LayerCard({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: string;
}) {
  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 text-center">
      <div className={`text-3xl font-bold ${color}`}>{count}</div>
      <div className="text-sm text-slate-400 mt-1">{label}</div>
    </div>
  );
}

export function MemoryPage() {
  const [data, setData] = useState<MemoryStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    fetch(`${API_BASE}/api/memory/stats`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => {
        if (json.success) {
          setData(json.data);
        } else {
          throw new Error(json.error || "Failed to load memory stats");
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-red-900/20 border border-red-800/50 rounded-xl p-4 text-red-400">
          {error}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { stats, expiring, archiveStats } = data;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-4xl mx-auto p-6 space-y-6"
    >
      <h1 className="text-2xl font-bold text-white">Harness Memory</h1>
      <p className="text-slate-400 text-sm">
        Phase 4 Memory Superpower — 3-layer file-based memory for AI
        orchestration
      </p>

      <div className="grid grid-cols-3 gap-4">
        <LayerCard
          label="Session"
          count={stats.byLayer.session}
          color="text-blue-400"
        />
        <LayerCard
          label="Task"
          count={stats.byLayer.task}
          color="text-green-400"
        />
        <LayerCard
          label="Project"
          count={stats.byLayer.project}
          color="text-purple-400"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <h3 className="text-sm font-medium text-slate-400 mb-3">Upgrades</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Task → Project</span>
              <span className="text-white">{stats.upgrades.taskToProject}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Project Renewed</span>
              <span className="text-white">
                {stats.upgrades.projectRenewed}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <h3 className="text-sm font-medium text-slate-400 mb-3">Archive</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Session</span>
              <span className="text-white">{archiveStats.session}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Task</span>
              <span className="text-white">{archiveStats.task}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Project</span>
              <span className="text-white">{archiveStats.project}</span>
            </div>
          </div>
        </div>
      </div>

      {expiring.length > 0 && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <h3 className="text-sm font-medium text-amber-400 mb-3">
            Expiring Soon
          </h3>
          <div className="space-y-2">
            {expiring.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between text-sm"
              >
                <div>
                  <span className="text-slate-300">{entry.id}</span>
                  <span className="text-slate-500 ml-2">{entry.scope}</span>
                </div>
                <div className="text-slate-400">
                  <span className="text-xs px-2 py-0.5 rounded bg-slate-700/50">
                    {entry.layer}
                  </span>
                  <span className="ml-2 text-amber-400">{entry.expiresAt}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="text-xs text-slate-500">
        Total entries: {stats.totalEntries} · Last maintenance:{" "}
        {stats.lastMaintenance || "Never"}
      </div>
    </motion.div>
  );
}
