import type { ReviewPlanDetail, PlanSummary, ReviewRecord, SeverityLevel } from "../../shared/types";

export function computePlanSummary(plan: ReviewPlanDetail, records: Map<string, ReviewRecord>): PlanSummary {
  const items = plan.items.map((item) => {
    if (!item.review_id) {
      return { mrUrl: item.mr_url, score: null, passed: null, issueCount: 0 };
    }
    const record = records.get(item.review_id);
    if (!record) {
      return { mrUrl: item.mr_url, score: null, passed: null, issueCount: 0 };
    }
    return {
      mrUrl: item.mr_url,
      score: record.avg_score,
      passed: record.passed,
      issueCount: record.issue_count ?? 0,
    };
  });

  const completedMRs = items.filter((i) => i.passed !== null);
  const passedMRs = items.filter((i) => i.passed === true);
  const failedMRs = items.filter((i) => i.passed === false);
  const scoresWithValues = items.filter((i) => i.score !== null).map((i) => i.score!);
  const avgScore = scoresWithValues.length > 0
    ? Math.round(scoresWithValues.reduce((s, v) => s + v, 0) / scoresWithValues.length * 10) / 10
    : null;

  const issuesBySeverity: Record<SeverityLevel, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const record of records.values()) {
    if (!record.report_json) continue;
    try {
      const report = JSON.parse(record.report_json);
      for (const issue of report.issues || []) {
        const sev = issue.severity as SeverityLevel;
        if (sev in issuesBySeverity) issuesBySeverity[sev]++;
      }
    } catch { /* skip malformed */ }
  }

  const totalIssues = items.reduce((sum, i) => sum + i.issueCount, 0);

  return { totalMRs: items.length, completedMRs: completedMRs.length, passedMRs: passedMRs.length, failedMRs: failedMRs.length, avgScore, totalIssues, issuesBySeverity, items };
}

export function exportPlanMarkdown(plan: ReviewPlanDetail, records: Map<string, ReviewRecord>): string {
  const summary = computePlanSummary(plan, records);
  const passRate = summary.totalMRs > 0 ? Math.round(summary.passedMRs / summary.totalMRs * 100) : 0;
  const date = new Date().toISOString().split("T")[0];

  const lines: string[] = [
    `# ${plan.title}`,
    "",
    `> 评审时间：${date}`,
    `> MR 数量：${summary.totalMRs}`,
    "",
    "## 汇总",
    "",
    "| 指标 | 值 |",
    "|------|-----|",
    `| 通过率 | ${summary.passedMRs}/${summary.totalMRs} (${passRate}%) |`,
    `| 平均分 | ${summary.avgScore?.toFixed(1) ?? "—"} / 5 |`,
    `| 总问题数 | ${summary.totalIssues} |`,
    `| CRITICAL | ${summary.issuesBySeverity.CRITICAL} |`,
    `| HIGH | ${summary.issuesBySeverity.HIGH} |`,
    `| MEDIUM | ${summary.issuesBySeverity.MEDIUM} |`,
    `| LOW | ${summary.issuesBySeverity.LOW} |`,
    "",
    "## MR 详情",
    "",
  ];

  for (const item of summary.items) {
    const mrIid = item.mrUrl.match(/merge_requests\/(\d+)/)?.[1] ?? "?";
    const project = item.mrUrl.split("/").slice(-4, -2).join("/") ?? "";
    const passIcon = item.passed === true ? "✓ 通过" : item.passed === false ? "✗ 未通过" : "—";
    const score = item.score?.toFixed(1) ?? "—";

    lines.push(`### !${mrIid} ${project} — ${passIcon} (${score}分)`);
    lines.push("");

    const record = plan.items
      .filter((i) => i.review_id)
      .find((i) => i.mr_url === item.mrUrl);
    if (record?.review_id) {
      const rec = records.get(record.review_id);
      if (rec?.report_json) {
        try {
          const report = JSON.parse(rec.report_json);
          if (report.issues?.length > 0) {
            lines.push("**问题**:");
            for (const issue of report.issues) {
              const file = issue.file ? ` — \`${issue.file}${issue.line ? `:${issue.line}` : ""}\`` : "";
              lines.push(`- [${issue.severity}] ${issue.message}${file}`);
            }
            lines.push("");
          }
        } catch { /* skip */ }
      }
    }
  }

  return lines.join("\n");
}
