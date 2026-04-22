import { useState } from "react";
import { ReviewResponse, SeverityLevel } from "../../shared/types";
import ReactDiffViewer from "react-diff-viewer-continued";

interface Props {
  data: ReviewResponse;
}

const SEVERITY_COLORS: Record<SeverityLevel, string> = {
  CRITICAL: "#dc2626",
  HIGH: "#ea580c",
  MEDIUM: "#ca8a04",
  LOW: "#16a34a",
};

export function ReviewResult({ data }: Props) {
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const { mr, diffs, report } = data;

  function toggleFile(path: string) {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  return (
    <div style={{ marginTop: 24 }}>
      {/* MR Info */}
      <div style={{ padding: 16, background: "#f6f8fa", borderRadius: 8, marginBottom: 16 }}>
        <h2 style={{ margin: "0 0 8px" }}>{mr.title}</h2>
        <div style={{ color: "#656d76", fontSize: 14 }}>
          {mr.author.name} · {mr.source_branch} → {mr.target_branch} · {mr.changes_count} files
        </div>
      </div>

      {/* Report Summary */}
      <div style={{ padding: 16, border: `2px solid ${report.passed ? "#16a34a" : "#dc2626"}`, borderRadius: 8, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 20 }}>{report.passed ? "✅" : "❌"}</span>
          <span style={{ fontSize: 18, fontWeight: 600 }}>
            {report.passed ? "评审通过" : "评审未通过"}
          </span>
        </div>

        {/* Scores */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8, marginBottom: 12 }}>
          {report.scores.map((s) => (
            <div key={s.dimension} style={{ padding: "6px 10px", background: "#fff", borderRadius: 4, fontSize: 13 }}>
              <span style={{ fontWeight: 500 }}>{s.dimension}</span>:{" "}
              <span style={{ color: s.score >= 4 ? "#16a34a" : s.score >= 3 ? "#ca8a04" : "#dc2626", fontWeight: 700 }}>
                {s.score}
              </span>
            </div>
          ))}
        </div>

        {/* Issues */}
        {report.issues.length > 0 && (
          <div>
            <h3 style={{ fontSize: 15, marginBottom: 8 }}>问题清单</h3>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #d0d7de", textAlign: "left" }}>
                  <th style={{ padding: "4px 8px" }}>级别</th>
                  <th style={{ padding: "4px 8px" }}>问题</th>
                  <th style={{ padding: "4px 8px" }}>位置</th>
                  <th style={{ padding: "4px 8px" }}>建议</th>
                </tr>
              </thead>
              <tbody>
                {report.issues.map((issue, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #e1e4e8" }}>
                    <td style={{ padding: "4px 8px" }}>
                      <span style={{ color: SEVERITY_COLORS[issue.severity], fontWeight: 600 }}>{issue.severity}</span>
                    </td>
                    <td style={{ padding: "4px 8px" }}>{issue.message}</td>
                    <td style={{ padding: "4px 8px", fontFamily: "monospace", fontSize: 12 }}>
                      {issue.file}{issue.line ? `:${issue.line}` : ""}
                    </td>
                    <td style={{ padding: "4px 8px", color: "#656d76" }}>{issue.suggestion || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Summary */}
        {report.summary && (
          <div style={{ marginTop: 12, padding: "8px 10px", background: "#fff", borderRadius: 4, fontSize: 14, color: "#24292f" }}>
            {report.summary}
          </div>
        )}
      </div>

      {/* Diff Viewer */}
      <h3 style={{ marginBottom: 8 }}>代码变更</h3>
      {diffs.map((diff) => (
        <div key={diff.new_path} style={{ marginBottom: 8, border: "1px solid #d0d7de", borderRadius: 6 }}>
          <button
            onClick={() => toggleFile(diff.new_path)}
            style={{
              width: "100%",
              padding: "8px 12px",
              textAlign: "left",
              background: "#f6f8fa",
              border: "none",
              cursor: "pointer",
              fontSize: 13,
              fontFamily: "monospace",
            }}
          >
            {expandedFiles.has(diff.new_path) ? "▼" : "▶"} {diff.new_path}
            {diff.new_file && <span style={{ color: "#16a34a", marginLeft: 8 }}>NEW</span>}
            {diff.deleted_file && <span style={{ color: "#dc2626", marginLeft: 8 }}>DELETED</span>}
          </button>
          {expandedFiles.has(diff.new_path) && (
            <div style={{ overflowX: "auto" }}>
              <ReactDiffViewer
                oldValue={""}
                newValue={diff.diff}
                splitView={false}
                useDarkTheme={false}
                leftTitle={diff.old_path}
                rightTitle={diff.new_path}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
