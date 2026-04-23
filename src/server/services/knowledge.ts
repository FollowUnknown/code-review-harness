import { getDb } from "../db";
import type { IssueDisposition, KnowledgeDisposition, ReviewIssue } from "../../shared/types";

// ---- Types ----

export type EntryType = "AP" | "EXP" | "BN" | "CONV" | "RULE";
export type EntrySeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type EntryStatus = "TEMP" | "CONFIRMED" | "DEPRECATED";

export interface KnowledgeEntry {
  id: string;
  type: EntryType;
  project: string;
  module?: string;
  severity?: EntrySeverity;
  title: string;
  pattern?: string;
  impact?: string;
  fix_suggestion?: string;
  content: string;
  status: EntryStatus;
  source_review?: string;
  source_mr?: string;
  source_file?: string;
  parent_id?: string;
  hit_count: number;
  last_hit_at?: string;
  created_at: string;
  updated_at: string;
}

// ---- Numbering ----

export function getProjectAbbr(projectPath: string): string {
  const segments = projectPath.split("/");
  const last = segments[segments.length - 1] || segments[segments.length - 2];
  const cleaned = last.replace(/[^a-zA-Z0-9]/g, "");
  return cleaned.slice(0, 3).toLowerCase();
}

function getNextTempId(type: EntryType): string {
  const db = getDb();
  const row = db.prepare(
    `SELECT id FROM knowledge_entries WHERE id LIKE ? ORDER BY id DESC LIMIT 1`
  ).get(`${type}-TEMP-%`) as { id: string } | undefined;
  const nnn = row ? parseInt(row.id.split("-").pop() || "0", 10) + 1 : 1;
  return `${type}-TEMP-${String(nnn).padStart(3, "0")}`;
}

function getNextFormalId(type: EntryType, projectAbbr: string): string {
  const db = getDb();
  const prefix = `${type}-${projectAbbr}-`;
  const row = db.prepare(
    `SELECT id FROM knowledge_entries WHERE id LIKE ? AND status = 'CONFIRMED' ORDER BY id DESC LIMIT 1`
  ).get(`${prefix}%`) as { id: string } | undefined;
  const nnn = row ? parseInt(row.id.replace(prefix, ""), 10) + 1 : 1;
  return `${prefix}${String(nnn).padStart(3, "0")}`;
}

// ---- CRUD ----

export function addEntry(input: {
  type: EntryType;
  project: string;
  module?: string;
  severity?: EntrySeverity;
  title: string;
  pattern?: string;
  impact?: string;
  fix_suggestion?: string;
  content: string;
  source_review?: string;
  source_mr?: string;
  source_file?: string;
  parent_id?: string;
}): KnowledgeEntry {
  const db = getDb();
  const now = new Date().toISOString();

  const result = db.transaction(() => {
    const id = getNextTempId(input.type);

    db.prepare(
      `INSERT INTO knowledge_entries
       (id, type, project, module, severity, title, pattern, impact, fix_suggestion, content, status, source_review, source_mr, source_file, parent_id, hit_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'TEMP', ?, ?, ?, ?, 0, ?, ?)`
    ).run(
      id, input.type, input.project, input.module ?? null,
      input.severity ?? null, input.title, input.pattern ?? null,
      input.impact ?? null, input.fix_suggestion ?? null, input.content,
      input.source_review ?? null, input.source_mr ?? null,
      input.source_file ?? null, input.parent_id ?? null,
      now, now
    );

    return { ...input, id, status: "TEMP" as EntryStatus, hit_count: 0, created_at: now, updated_at: now } as KnowledgeEntry;
  })();

  return result;
}

export function getEntry(id: string): KnowledgeEntry | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM knowledge_entries WHERE id = ?").get(id) as KnowledgeEntry | undefined;
}

export function updateEntry(id: string, updates: Partial<Pick<KnowledgeEntry, "title" | "pattern" | "impact" | "fix_suggestion" | "content" | "module" | "severity" | "parent_id">>): KnowledgeEntry | undefined {
  const db = getDb();
  const fields: string[] = [];
  const params: unknown[] = [];

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      fields.push(`${key} = ?`);
      params.push(value ?? null);
    }
  }
  if (fields.length === 0) return getEntry(id);

  fields.push("updated_at = ?");
  params.push(new Date().toISOString());
  params.push(id);

  db.prepare(`UPDATE knowledge_entries SET ${fields.join(", ")} WHERE id = ?`).run(...params);
  return getEntry(id);
}

export function confirmEntry(id: string, projectAbbr?: string): KnowledgeEntry | undefined {
  const db = getDb();

  return db.transaction(() => {
    const entry = getEntry(id);
    if (!entry || entry.status !== "TEMP") return undefined;

    const abbr = projectAbbr || getProjectAbbr(entry.project);
    const formalId = getNextFormalId(entry.type, abbr);
    const now = new Date().toISOString();

    db.prepare(
      `UPDATE knowledge_entries SET id = ?, status = 'CONFIRMED', updated_at = ? WHERE id = ?`
    ).run(formalId, now, id);

    return getEntry(formalId);
  })();
}

export function deprecateEntry(id: string): boolean {
  const db = getDb();
  const result = db.prepare(
    "UPDATE knowledge_entries SET status = 'DEPRECATED', updated_at = ? WHERE id = ?"
  ).run(new Date().toISOString(), id);
  return result.changes > 0;
}

export function deleteEntry(id: string): boolean {
  const db = getDb();
  // Only TEMP entries can be deleted
  const entry = getEntry(id);
  if (!entry || entry.status !== "TEMP") return false;
  const result = db.prepare("DELETE FROM knowledge_entries WHERE id = ? AND status = 'TEMP'").run(id);
  return result.changes > 0;
}

export interface ListEntriesFilters {
  type?: EntryType;
  project?: string;
  status?: EntryStatus;
  page?: number;
  pageSize?: number;
}

export function listEntries(filters: ListEntriesFilters = {}): { items: KnowledgeEntry[]; total: number } {
  const db = getDb();
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (filters.type) { clauses.push("type = ?"); params.push(filters.type); }
  if (filters.project) { clauses.push("project = ?"); params.push(filters.project); }
  if (filters.status) { clauses.push("status = ?"); params.push(filters.status); }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;
  const offset = (page - 1) * pageSize;

  const total = (db.prepare(`SELECT COUNT(*) as cnt FROM knowledge_entries ${where}`).get(...params) as { cnt: number }).cnt;
  const items = db.prepare(
    `SELECT * FROM knowledge_entries ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).all(...params, pageSize, offset) as KnowledgeEntry[];

  return { items, total };
}

export function getKnowledgeStats(): Array<{ type: EntryType; status: EntryStatus; project: string; count: number }> {
  const db = getDb();
  return db.prepare(
    "SELECT type, status, project, COUNT(*) as count FROM knowledge_entries GROUP BY type, status, project ORDER BY type, project"
  ).all() as Array<{ type: EntryType; status: EntryStatus; project: string; count: number }>;
}

// ---- Layered Knowledge Injection ----

const KNOWLEDGE_LINE_LIMIT = 2000;

export function getKnowledgeForReview(project: string, module?: string): KnowledgeEntry[] {
  const db = getDb();
  const entries: KnowledgeEntry[] = [];
  let totalLines = 0;

  // Layer 1: Universal AP (HIGH, all projects)
  const layer1 = db.prepare(
    `SELECT * FROM knowledge_entries WHERE type = 'AP' AND severity IN ('CRITICAL', 'HIGH') AND status = 'CONFIRMED'`
  ).all() as KnowledgeEntry[];

  // Layer 2: Project AP
  const layer2 = db.prepare(
    `SELECT * FROM knowledge_entries WHERE type = 'AP' AND project = ? AND status = 'CONFIRMED'`
  ).all(project) as KnowledgeEntry[];

  // Layer 3: Project CONV
  const layer3 = db.prepare(
    `SELECT * FROM knowledge_entries WHERE type = 'CONV' AND project = ? AND status = 'CONFIRMED'`
  ).all(project) as KnowledgeEntry[];

  // Layer 4: Recent EXP (same project, ≤20, module first)
  const layer4 = db.prepare(
    `SELECT * FROM knowledge_entries WHERE type = 'EXP' AND project = ? AND status = 'CONFIRMED'
     ORDER BY created_at DESC LIMIT 20`
  ).all(project) as KnowledgeEntry[];

  // Layer 5: BN (project + module match)
  let layer5: KnowledgeEntry[] = [];
  if (module) {
    layer5 = db.prepare(
      `SELECT * FROM knowledge_entries WHERE type = 'BN' AND project = ? AND (module = ? OR module IS NULL) AND status = 'CONFIRMED'`
    ).all(project, module) as KnowledgeEntry[];
  } else {
    layer5 = db.prepare(
      `SELECT * FROM knowledge_entries WHERE type = 'BN' AND project = ? AND status = 'CONFIRMED'`
    ).all(project) as KnowledgeEntry[];
  }

  // Layer 6: RULE (parent matches Layer 5 BNs)
  const bnIds = layer5.map((e) => e.id);
  let layer6: KnowledgeEntry[] = [];
  if (bnIds.length > 0) {
    const placeholders = bnIds.map(() => "?").join(",");
    layer6 = db.prepare(
      `SELECT * FROM knowledge_entries WHERE type = 'RULE' AND parent_id IN (${placeholders}) AND status = 'CONFIRMED'`
    ).all(...bnIds) as KnowledgeEntry[];
  }

  // Deduplicate and apply line limit
  const seen = new Set<string>();
  const addLayer = (items: KnowledgeEntry[]) => {
    for (const item of items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      const lineCount = item.content.split("\n").length + 2;
      if (totalLines + lineCount > KNOWLEDGE_LINE_LIMIT) return;
      totalLines += lineCount;
      entries.push(item);
    }
  };

  addLayer(layer1);
  addLayer(layer2);
  addLayer(layer3);

  // Layer 4: module-matching first
  if (module) {
    const matched = layer4.filter((e) => e.module === module);
    const rest = layer4.filter((e) => e.module !== module);
    addLayer(matched);
    addLayer(rest);
  } else {
    addLayer(layer4);
  }

  addLayer(layer5);
  addLayer(layer6);

  return entries;
}

// ---- Hit Tracking ----

export function trackKnowledgeHits(ids: string[]): void {
  if (ids.length === 0) return;
  const db = getDb();
  const now = new Date().toISOString();
  const placeholders = ids.map(() => "?").join(",");
  db.prepare(
    `UPDATE knowledge_entries SET hit_count = hit_count + 1, last_hit_at = ? WHERE id IN (${placeholders})`
  ).run(now, ...ids);
}

// ---- Build Knowledge Prompt ----

export function buildKnowledgePrompt(entries: KnowledgeEntry[]): string {
  if (entries.length === 0) return "";

  const typeLabels: Record<EntryType, string> = {
    AP: "反模式",
    EXP: "经验",
    BN: "业务名词",
    CONV: "约定",
    RULE: "业务规则",
  };

  // Group by type
  const grouped: Partial<Record<EntryType, KnowledgeEntry[]>> = {};
  for (const e of entries) {
    (grouped[e.type] ??= []).push(e);
  }

  const sections: string[] = [];

  // Anti-patterns section
  const apEntries = [...(grouped.AP ?? [])];
  if (apEntries.length > 0) {
    const lines = apEntries.map((e) =>
      `[${e.severity || "HIGH"}] ${e.title} — ${e.pattern || e.content}${e.fix_suggestion ? ` → ${e.fix_suggestion}` : ""}`
    );
    sections.push(`### 反模式（必须避免）\n${lines.join("\n")}`);
  }

  // Conventions section
  const convEntries = grouped.CONV ?? [];
  if (convEntries.length > 0) {
    const lines = convEntries.map((e) => `${e.title}: ${e.content}`);
    sections.push(`### 项目约定\n${lines.join("\n")}`);
  }

  // Experiences section
  const expEntries = grouped.EXP ?? [];
  if (expEntries.length > 0) {
    const lines = expEntries.map((e) => `${e.title}: ${e.content}`);
    sections.push(`### 评审经验\n${lines.join("\n")}`);
  }

  // Business context section (BN + RULE)
  const bnEntries = grouped.BN ?? [];
  const ruleEntries = grouped.RULE ?? [];
  if (bnEntries.length > 0 || ruleEntries.length > 0) {
    const lines: string[] = [];
    for (const bn of bnEntries) {
      lines.push(`[${bn.title}] ${bn.content}`);
      const related = ruleEntries.filter((r) => r.parent_id === bn.id);
      for (const rule of related) {
        lines.push(`  ↳ ${rule.title}: ${rule.content}`);
      }
    }
    sections.push(`### 业务上下文\n${lines.join("\n")}`);
  }

  return `\n\n## 项目知识库\n以下是本项目的已知模式和约定，请在评审时参考：\n\n${sections.join("\n\n")}`;
}

// ---- Coverage Gate: Issue Disposition ----

export function suggestDispositions(issues: ReviewIssue[]): KnowledgeDisposition[] {
  const db = getDb();

  // Pre-load existing AP patterns for MERGE detection
  const existingAPs = db.prepare(
    "SELECT id, title, pattern FROM knowledge_entries WHERE type = 'AP' AND status = 'CONFIRMED'"
  ).all() as Array<{ id: string; title: string; pattern: string | null }>;

  return issues.map((issue, index) => {
    const severity = issue.severity as string;

    // CRITICAL with file reference → AP
    if (severity === "CRITICAL" && issue.file) {
      return { issueIndex: index, disposition: "AP" as IssueDisposition, autoSuggested: true };
    }

    // HIGH — check if matches existing AP pattern for MERGE
    if (severity === "HIGH" || severity === "CRITICAL") {
      const match = existingAPs.find((ap) =>
        ap.pattern && issue.message.toLowerCase().includes(ap.pattern.toLowerCase())
      );
      if (match) {
        return { issueIndex: index, disposition: "MERGE" as IssueDisposition, knowledgeId: match.id, autoSuggested: true };
      }
      return { issueIndex: index, disposition: "AP" as IssueDisposition, autoSuggested: true };
    }

    // MEDIUM/LOW — default SKIP
    return { issueIndex: index, disposition: "SKIP" as IssueDisposition, skipReason: "中低严重度，自动跳过", autoSuggested: true };
  });
}

// ---- Extract Learnings from Review ----

export function extractLearnings(
  report: { scores: Array<{ dimension: string; score: number; comment: string }>; issues: Array<{ severity: string; message: string; suggestion?: string; file?: string }> },
  project: string,
  reviewId: string
): KnowledgeEntry[] {
  const created: KnowledgeEntry[] = [];

  // Extract from low-scoring dimensions
  for (const score of report.scores) {
    if (score.score <= 2 && score.comment) {
      created.push(addEntry({
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
      created.push(addEntry({
        type: "AP",
        project,
        severity: issue.severity === "CRITICAL" ? "CRITICAL" : "HIGH",
        title: issue.message.slice(0, 80),
        content: issue.suggestion || issue.message,
        source_review: reviewId,
        source_file: issue.file,
      }));
    }
  }

  return created;
}
