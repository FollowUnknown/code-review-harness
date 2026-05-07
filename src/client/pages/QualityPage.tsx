import { useState, useEffect } from "react";
import { motion } from "framer-motion";

interface QualityStats {
  totalReviews: number;
  avgScore: number | null;
  passRate: number;
  totalIssues: number;
  issuesBySeverity: Record<string, number>;
  knowledgeHitRate: number;
  knowledgeAdoptionRate: number;
  avgKnowledgeUsed: number;
  totalKnowledge: number;
  knowledgeByStatus: Record<string, number>;
  avgConfidence: number;
  recentConsistency: number | null;
}

const API_BASE = "";

export function QualityPage() {
  const [stats, setStats] = useState<QualityStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    fetch(`${API_BASE}/api/quality`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (data.success) setStats(data.data);
        else throw new Error(data.error);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
        Failed to load quality stats: {error}
      </div>
    );
  }

  if (!stats) return null;

  const severityColors: Record<string, string> = {
    CRITICAL: "bg-red-500",
    HIGH: "bg-orange-500",
    MEDIUM: "bg-yellow-500",
    LOW: "bg-blue-500",
  };

  const statusColors: Record<string, string> = {
    CONFIRMED: "bg-green-500",
    TEMP: "bg-yellow-500",
    DEPRECATED: "bg-red-500",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <h2 className="text-xl font-bold text-white">Quality Dashboard</h2>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          label="Total Reviews"
          value={stats.totalReviews}
          suffix=""
        />
        <MetricCard
          label="Avg Score"
          value={stats.avgScore ?? "—"}
          suffix="/ 5"
        />
        <MetricCard
          label="Pass Rate"
          value={`${stats.passRate}%`}
          suffix=""
        />
        <MetricCard
          label="Total Issues"
          value={stats.totalIssues}
          suffix=""
        />
      </div>

      {/* Knowledge Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          label="Knowledge Hit Rate"
          value={`${stats.knowledgeHitRate}%`}
          suffix=""
          highlight
        />
        <MetricCard
          label="Adoption Rate"
          value={`${stats.knowledgeAdoptionRate}%`}
          suffix=""
          highlight
        />
        <MetricCard
          label="Avg Knowledge Used"
          value={stats.avgKnowledgeUsed}
          suffix="/ review"
        />
        <MetricCard
          label="Avg Confidence"
          value={stats.avgConfidence}
          suffix=""
        />
      </div>

      {/* Issues by Severity */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-slate-300 mb-4">Issues by Severity</h3>
        <div className="space-y-3">
          {Object.entries(stats.issuesBySeverity)
            .filter(([, count]) => count > 0)
            .sort(([, a], [, b]) => b - a)
            .map(([severity, count]) => (
              <div key={severity} className="flex items-center gap-3">
                <span className="text-xs w-16 text-slate-400">{severity}</span>
                <div className="flex-1 h-2 bg-slate-700/50 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{
                      width: `${stats.totalIssues > 0 ? (count / stats.totalIssues) * 100 : 0}%`,
                    }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className={`h-full rounded-full ${severityColors[severity] || "bg-slate-500"}`}
                  />
                </div>
                <span className="text-xs text-slate-400 w-8 text-right">{count}</span>
              </div>
            ))}
          {stats.totalIssues === 0 && (
            <p className="text-xs text-slate-500">No issues recorded yet</p>
          )}
        </div>
      </div>

      {/* Knowledge by Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">Knowledge by Status</h3>
          <div className="space-y-3">
            {Object.entries(stats.knowledgeByStatus)
              .filter(([, count]) => count > 0)
              .sort(([, a], [, b]) => b - a)
              .map(([status, count]) => (
                <div key={status} className="flex items-center gap-3">
                  <span className="text-xs w-20 text-slate-400">{status}</span>
                  <div className="flex-1 h-2 bg-slate-700/50 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{
                        width: `${stats.totalKnowledge > 0 ? (count / stats.totalKnowledge) * 100 : 0}%`,
                      }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                      className={`h-full rounded-full ${statusColors[status] || "bg-slate-500"}`}
                    />
                  </div>
                  <span className="text-xs text-slate-400 w-8 text-right">{count}</span>
                </div>
              ))}
            {stats.totalKnowledge === 0 && (
              <p className="text-xs text-slate-500">No knowledge entries yet</p>
            )}
          </div>
        </div>

        {/* Targets */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">v1.2.0 Targets</h3>
          <div className="space-y-4">
            <TargetRow
              label="Knowledge Hit Rate"
              current={stats.knowledgeHitRate}
              target={30}
              unit="%"
            />
            <TargetRow
              label="Adoption Rate"
              current={stats.knowledgeAdoptionRate}
              target={50}
              unit="%"
            />
            <TargetRow
              label="Avg Confidence"
              current={Math.round(stats.avgConfidence * 100)}
              target={70}
              unit="%"
            />
            <TargetRow
              label="Review Consistency"
              current={stats.recentConsistency ? Math.round(stats.recentConsistency * 100) : 0}
              target={85}
              unit="%"
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function MetricCard({
  label,
  value,
  suffix,
  highlight,
}: {
  label: string;
  value: string | number;
  suffix: string;
  highlight?: boolean;
}) {
  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      className={`bg-slate-800/50 border rounded-xl p-4 ${
        highlight
          ? "border-blue-500/30 bg-blue-500/5"
          : "border-slate-700/50"
      }`}
    >
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-white">
        {value}
        <span className="text-sm text-slate-500 font-normal">{suffix}</span>
      </p>
    </motion.div>
  );
}

function TargetRow({
  label,
  current,
  target,
  unit,
}: {
  label: string;
  current: number;
  target: number;
  unit: string;
}) {
  const pct = Math.min(100, Math.round((current / target) * 100));
  const met = current >= target;

  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-slate-400">{label}</span>
        <span className={met ? "text-green-400" : "text-slate-400"}>
          {current}{unit} / {target}{unit}
        </span>
      </div>
      <div className="h-2 bg-slate-700/50 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className={`h-full rounded-full ${met ? "bg-green-500" : "bg-blue-500"}`}
        />
      </div>
    </div>
  );
}
