import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ReviewResult } from "../components/ReviewResult";
import { LLMHistoryDrawer } from "../components/LLMHistoryDrawer";
import { KnowledgeDetailDrawer } from "../components/KnowledgeDetailDrawer";
import type { ReviewResponse, ReviewRecord, KnowledgeEntrySummary, RequirementReviewReport } from "../../shared/types";

const API_BASE = "";

/** Flatten a RequirementReviewReport into a ReviewReport so ReviewResult can render it */
function flattenRequirementReport(report: RequirementReviewReport): ReviewResponse["report"] {
  const allIssues = report.techStackReports.flatMap((tsr) =>
    tsr.projectReports.flatMap((pr) => pr.report.issues)
  );
  const allScores = report.techStackReports.flatMap((tsr) =>
    tsr.projectReports.flatMap((pr) => pr.report.scores)
  );
  return {
    contractTitle: `Requirement Review — ${report.productLine}`,
    timestamp: new Date().toISOString(),
    passed: report.overallPassed,
    scores: allScores,
    issues: allIssues,
    summary: `${report.totalProjects} projects, ${report.totalFiles} files, ${report.totalIssues} issues (score: ${report.overallScore})`,
  };
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("auth_token");
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

export function ReviewDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [record, setRecord] = useState<ReviewRecord | null>(null);
  const [response, setResponse] = useState<ReviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const [showLogs, setShowLogs] = useState(false);
  const [selectedKnowledge, setSelectedKnowledge] = useState<KnowledgeEntrySummary | null>(null);

  useEffect(() => {
    if (!id) return;
    fetch(`${API_BASE}/api/reviews/${id}`, { headers: authHeaders() })
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then((data: { record: ReviewRecord; response: ReviewResponse }) => {
        setRecord(data.record);
        // Flatten requirement review reports so ReviewResult can render them
        const report = data.response.report as unknown as Record<string, unknown>;
        if (report && "techStackReports" in report) {
          const reqReport = report as unknown as RequirementReviewReport;
          data.response.report = flattenRequirementReport(reqReport);
        }
        setResponse(data.response);
      })
      .catch(() => setError("Review not found"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-5 h-5 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !record || !response) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-red-400">{error || "Review not found"}</p>
        <Link to="/reviews" className="text-xs text-slate-500 hover:text-blue-400 mt-2 inline-block">Back to list</Link>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex justify-between items-center mb-4">
        <Link to="/reviews" className="text-xs text-slate-500 hover:text-blue-400 transition-colors">
          &larr; Back to list
        </Link>
        <div className="flex gap-2">
          <button
            onClick={() => setShowLogs(!showLogs)}
            className={`px-3 py-1.5 text-xs rounded-lg border transition-all ${
              showLogs
                ? "bg-slate-700 border-slate-600 text-white"
                : "bg-slate-800/50 border-slate-700/50 text-slate-400 hover:text-white"
            }`}
          >
            {showLogs ? "Hide Logs" : "LLM Logs"}
          </button>
        </div>
      </div>

      <ReviewResult
        data={response}
        project={record.project}
        onKnowledgeClick={setSelectedKnowledge}
      />

      {selectedKnowledge && (
        <KnowledgeDetailDrawer
          entry={selectedKnowledge}
          onClose={() => setSelectedKnowledge(null)}
        />
      )}

      {/* LLM History Drawer — fixed right-side panel */}
      <AnimatePresence>
        {showLogs && id && (
          <LLMHistoryDrawer reviewId={id} onClose={() => setShowLogs(false)} />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
