import { useState } from "react";
import { ReviewResponse, SeverityLevel, RiskLevel } from "../../shared/types";
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

const RISK_COLORS: Record<RiskLevel, string> = {
  S: "#dc2626",
  A: "#ea580c",
  B: "#ca8a04",
  C: "#6b7280",
};

const RISK_LABELS: Record<RiskLevel, string> = {
  S: "高风险",
  A: "中高风险",
  B: "中低风险",
  C: "低风险",
};

export function ReviewResult({ data }: Props) {
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const { mr, diffs, report, classification, requirement } = data;

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

      {/* Requirement Understanding */}
      {requirement && (
        <div style={{ padding: 16, border: "1px solid #d0d7de", borderRadius: 8, marginBottom: 16 }}>
          <h3 style={{ margin: "0 0 8px", fontSize: 15 }}>需求理解</h3>
          <div style={{ fontSize: 13, color: "#24292f" }}>
            <div>
              <span style={{ fontWeight: 500 }}>类型:</span> {requirement.type}
              <span style={{ marginLeft: 16, fontWeight: 500 }}>模块:</span> {requirement.module}
              <span style={{ marginLeft: 16, fontWeight: 500 }}>来源:</span>
              {requirement.source === "lanhu" ? "蓝湖设计稿" : "MR 推断"}
            </div>
            {requirement.features.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <span style={{ fontWeight: 500 }}>功能点:</span>
                <ul style={{ margin: "4px 0", paddingLeft: 20 }}>
                  {requirement.features.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </div>
            )}
            {requirement.conflicts.length > 0 && (
              <div style={{ marginTop: 8, padding: 8, background: "#fef3c7", borderRadius: 4 }}>
                <span style={{ fontWeight: 500 }}>待确认:</span>
                <ul style={{ margin: "4px 0", paddingLeft: 20 }}>
                  {requirement.conflicts.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>
            )}
            {requirement.lanhuSummary && (
              <div style={{ marginTop: 8 }}>
                <span style={{ fontWeight: 500 }}>设计稿:</span> {requirement.lanhuSummary}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Classification Summary */}
      {classification && (
        <div style={{ padding: 16, border: "1px solid #d0d7de", borderRadius: 8, marginBottom: 16 }}>
          <h3 style={{ margin: "0 0 8px", fontSize: 15 }}>文件分级</h3>
          <div style={{ display: "flex", gap: 12, fontSize: 13, marginBottom: 8 }}>
            <span>共 {classification.stats.total} 文件</span>
            {(Object.entries(classification.stats.byLevel) as [RiskLevel, number][]).map(([level, count]) =>
              count > 0 ? (
                <span key={level} style={{ color: RISK_COLORS[level], fontWeight: 600 }}>
                  {level}级({count})
                </span>
              ) : null
            )}
            {classification.stats.skipped > 0 && (
              <span style={{ color: "#6b7280" }}>跳过({classification.stats.skipped})</span>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 4 }}>
            {classification.batches.flatMap((batch) =>
              batch.files.map((file) => (
                <div key={file.path} style={{ padding: "4px 8px", background: "#fff", borderRadius: 4, fontSize: 12 }}>
                  <span style={{ color: RISK_COLORS[file.level], fontWeight: 600, marginRight: 6 }}>
                    [{file.level}]
                  </span>
                  <span style={{ fontFamily: "monospace" }}>{file.path}</span>
                  {file.riskFlags.length > 0 && (
                    <span style={{ marginLeft: 4, color: "#6b7280" }} title={file.riskFlags.join(", ")}>
                      ({file.riskFlags.length} 风险标记)
                    </span>
                  )}
                </div>
              ))
            )}
            {classification.skipped.map((file) => (
              <div key={file.path} style={{ padding: "4px 8px", background: "#f9fafb", borderRadius: 4, fontSize: 12, color: "#9ca3af" }}>
                <span style={{ marginRight: 6 }}>[跳过]</span>
                <span style={{ fontFamily: "monospace" }}>{file.path}</span>
                <span style={{ marginLeft: 4 }}>({file.skipReason})</span>
              </div>
            ))}
          </div>
        </div>
      )}

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
      {diffs.map((diff) => {
        const fileClass = classification?.batches
          .flatMap((b) => b.files)
          .find((f) => f.path === diff.new_path);
        return (
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
              {fileClass && (
                <span style={{ marginLeft: 8, color: RISK_COLORS[fileClass.level], fontWeight: 600, fontSize: 11 }}>
                  [{RISK_LABELS[fileClass.level]}]
                </span>
              )}
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
        );
      })}
    </div>
  );
}
