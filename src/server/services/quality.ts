import { getDb } from "../db";

export interface QualityStats {
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

export function getQualityStats(): QualityStats {
  const db = getDb();

  // Review stats
  const reviewStats = db.prepare(`
    SELECT
      COUNT(*) as total,
      AVG(avg_score) as avg_score,
      SUM(CASE WHEN passed = 1 THEN 1 ELSE 0 END) as passed,
      SUM(issue_count) as issues,
      SUM(critical_count) as critical
    FROM reviews
    WHERE status = 'completed'
  `).get() as {
    total: number;
    avg_score: number | null;
    passed: number;
    issues: number;
    critical: number;
  };

  // Issues by severity (parse from report_json)
  const issueSeverityCounts: Record<string, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  const allReports = db.prepare(
    "SELECT report_json FROM reviews WHERE status = 'completed'"
  ).all() as Array<{ report_json: string }>;

  for (const { report_json } of allReports) {
    try {
      const report = JSON.parse(report_json);
      for (const issue of report.issues || []) {
        const sev = issue.severity || "LOW";
        issueSeverityCounts[sev] = (issueSeverityCounts[sev] || 0) + 1;
      }
    } catch {
      // Skip invalid JSON
    }
  }

  // Knowledge usage stats
  const usageStats = db.prepare(`
    SELECT
      COUNT(DISTINCT review_id) as reviews_with_knowledge,
      COUNT(*) as total_usages,
      SUM(adopted) as adopted
    FROM review_knowledge_usage
  `).get() as {
    reviews_with_knowledge: number;
    total_usages: number;
    adopted: number;
  };

  const knowledgeStats = db.prepare(`
    SELECT
      COUNT(*) as total,
      AVG(confidence) as avg_confidence,
      SUM(CASE WHEN status = 'CONFIRMED' THEN 1 ELSE 0 END) as confirmed,
      SUM(CASE WHEN status = 'TEMP' THEN 1 ELSE 0 END) as temp,
      SUM(CASE WHEN status = 'DEPRECATED' THEN 1 ELSE 0 END) as deprecated
    FROM knowledge_entries
  `).get() as {
    total: number;
    avg_confidence: number | null;
    confirmed: number;
    temp: number;
    deprecated: number;
  };

  const passRate = reviewStats.total > 0
    ? Math.round((reviewStats.passed / reviewStats.total) * 100)
    : 0;

  const knowledgeHitRate = reviewStats.total > 0
    ? Math.round((usageStats.reviews_with_knowledge / reviewStats.total) * 100)
    : 0;

  const knowledgeAdoptionRate = usageStats.total_usages > 0
    ? Math.round((usageStats.adopted / usageStats.total_usages) * 100)
    : 0;

  const avgKnowledgeUsed = reviewStats.total > 0
    ? Math.round((usageStats.total_usages / reviewStats.total) * 10) / 10
    : 0;

  return {
    totalReviews: reviewStats.total,
    avgScore: reviewStats.avg_score ? Math.round(reviewStats.avg_score * 10) / 10 : null,
    passRate,
    totalIssues: reviewStats.issues,
    issuesBySeverity: issueSeverityCounts,
    knowledgeHitRate,
    knowledgeAdoptionRate,
    avgKnowledgeUsed,
    totalKnowledge: knowledgeStats.total,
    knowledgeByStatus: {
      CONFIRMED: knowledgeStats.confirmed,
      TEMP: knowledgeStats.temp,
      DEPRECATED: knowledgeStats.deprecated,
    },
    avgConfidence: knowledgeStats.avg_confidence
      ? Math.round(knowledgeStats.avg_confidence * 100) / 100
      : 0,
    recentConsistency: null, // Would require multiple reviews of same MR
  };
}
