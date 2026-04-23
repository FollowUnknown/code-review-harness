import { getDb } from "../db";

// ---- Types ----

export type EntryType = "AP" | "EXP" | "BN" | "CONV";
export type EntrySeverity = "HIGH" | "MEDIUM" | "LOW";
export type EntryStatus = "TEMP" | "CONFIRMED";

export interface KnowledgeEntry {
  id: string;
  type: EntryType;
  project: string;
  module?: string;
  severity?: EntrySeverity;
  title: string;
  content: string;
  status: EntryStatus;
  source_review?: string;
  created_at: string;
}

export interface ReviewRecord {
  id: string;
  mr_url: string;
  project?: string;
  report: string;
  created_at: string;
}

// Deprecated: use saveReviewRecord from review-store.ts for full records
export function saveReview(record: Omit<ReviewRecord, "created_at">): void {
  const db = getDb();
  db.prepare(
    "INSERT INTO reviews (id, mr_url, project, report_json) VALUES (?, ?, ?, ?)"
  ).run(record.id, record.mr_url, record.project ?? null, record.report);
}

// ---- Knowledge Entry CRUD ----

export function addEntry(entry: Omit<KnowledgeEntry, "status" | "created_at">): KnowledgeEntry {
  const db = getDb();
  const status: EntryStatus = "TEMP";
  db.prepare(
    `INSERT INTO entries (id, type, project, module, severity, title, content, status, source_review)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    entry.id, entry.type, entry.project, entry.module ?? null,
    entry.severity ?? null, entry.title, entry.content, status, entry.source_review ?? null
  );
  return { ...entry, status, created_at: new Date().toISOString() };
}

export function getEntry(id: string): KnowledgeEntry | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM entries WHERE id = ?").get(id) as KnowledgeEntry | undefined;
}

export function confirmEntry(id: string): boolean {
  const db = getDb();
  const result = db.prepare("UPDATE entries SET status = 'CONFIRMED' WHERE id = ?").run(id);
  return result.changes > 0;
}

export function deleteEntry(id: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM entries WHERE id = ?").run(id);
  return result.changes > 0;
}

export function listEntries(filters: {
  type?: EntryType;
  project?: string;
  status?: EntryStatus;
  limit?: number;
}): KnowledgeEntry[] {
  const db = getDb();
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (filters.type) { clauses.push("type = ?"); params.push(filters.type); }
  if (filters.project) { clauses.push("project = ?"); params.push(filters.project); }
  if (filters.status) { clauses.push("status = ?"); params.push(filters.status); }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const limit = filters.limit ?? 100;

  return db.prepare(`SELECT * FROM entries ${where} ORDER BY created_at DESC LIMIT ?`).all(
    ...params, limit
  ) as KnowledgeEntry[];
}

// ---- Review Records (legacy, see review-store.ts for full records) ----

export function getReview(id: string): ReviewRecord | undefined {
  const db = getDb();
  const row = db.prepare("SELECT id, mr_url, project, report_json as report, created_at FROM reviews WHERE id = ?").get(id) as ReviewRecord | undefined;
  return row;
}

// ---- Knowledge Query for Review ----

export function getKnowledgeForReview(project: string, module?: string): KnowledgeEntry[] {
  const db = getDb();
  const entries: KnowledgeEntry[] = [];

  // AP (shared) - severity >= HIGH
  entries.push(...db.prepare(
    `SELECT * FROM entries WHERE type = 'AP' AND severity = 'HIGH' AND status = 'CONFIRMED'`
  ).all() as KnowledgeEntry[]);

  // AP (project-specific)
  entries.push(...db.prepare(
    `SELECT * FROM entries WHERE type = 'AP' AND project = ? AND status = 'CONFIRMED'`
  ).all(project) as KnowledgeEntry[]);

  // CONV - all confirmed
  entries.push(...db.prepare(
    `SELECT * FROM entries WHERE type = 'CONV' AND status = 'CONFIRMED'`
  ).all() as KnowledgeEntry[]);

  // EXP - same project, up to 20 most recent, prefer module match
  const expEntries = db.prepare(
    `SELECT * FROM entries WHERE type = 'EXP' AND project = ? AND status = 'CONFIRMED'
     ORDER BY created_at DESC LIMIT 20`
  ).all(project) as KnowledgeEntry[];

  if (module) {
    // Move module-matching entries to front
    const matched = expEntries.filter((e) => e.module === module);
    const rest = expEntries.filter((e) => e.module !== module);
    entries.push(...matched, ...rest);
  } else {
    entries.push(...expEntries);
  }

  // Deduplicate by id
  const seen = new Set<string>();
  return entries.filter((e) => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });
}

// ---- Build Knowledge Prompt ----

export function buildKnowledgePrompt(entries: KnowledgeEntry[]): string {
  if (entries.length === 0) return "";

  const typeLabels: Record<EntryType, string> = {
    AP: "反模式",
    EXP: "经验",
    BN: "业务名词",
    CONV: "约定",
  };

  const lines = entries.map((e) =>
    `[${typeLabels[e.type]}] ${e.title}: ${e.content}`
  );

  return `\n\n## 项目知识库\n以下是本项目的已知模式和约定，请在评审时参考：\n${lines.join("\n")}`;
}

// ---- Extract Learnings from Review ----

export function extractLearnings(
  report: { scores: Array<{ dimension: string; score: number; comment: string }>; issues: Array<{ severity: string; message: string; suggestion?: string }> },
  project: string,
  reviewId: string
): KnowledgeEntry[] {
  const entries: KnowledgeEntry[] = [];
  let counter = 0;

  // Extract from low-scoring dimensions
  for (const score of report.scores) {
    if (score.score <= 2 && score.comment) {
      counter++;
      entries.push(addEntry({
        id: `EXP-${reviewId}-${counter}`,
        type: "EXP",
        project,
        severity: "MEDIUM",
        title: `${score.dimension}得分偏低`,
        content: score.comment,
        source_review: reviewId,
      }));
    }
  }

  // Extract from CRITICAL/HIGH issues
  for (const issue of report.issues) {
    if (issue.severity === "CRITICAL" || issue.severity === "HIGH") {
      counter++;
      const severity: EntrySeverity = issue.severity === "CRITICAL" ? "HIGH" : issue.severity as EntrySeverity;
      entries.push(addEntry({
        id: `AP-${reviewId}-${counter}`,
        type: "AP",
        project,
        severity,
        title: issue.message.slice(0, 80),
        content: issue.suggestion || issue.message,
        source_review: reviewId,
      }));
    }
  }

  return entries;
}
