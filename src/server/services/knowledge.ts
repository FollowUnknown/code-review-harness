import { getDb } from "../db";
import type { IssueDisposition, KnowledgeDisposition, ReviewIssue } from "../../shared/types";

// ---- Types ----

export type EntryType = "AP" | "EXP" | "BN" | "CONV" | "RULE" | "TERM";
export type EntrySeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type EntryStatus = "TEMP" | "CONFIRMED" | "DEPRECATED";
export type ReviewStatus = "pending" | "approved" | "rejected";

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
  product_line?: string;
  engineering?: string;
  source_story?: string;
  source_type?: string;
  review_pass?: number;
  scope?: string;
  data_structure?: string;
  default_value?: string;
  first_seen_in?: string;
  derivation?: string;
  suggested_by?: string;
  reviewed_by?: string;
  review_status: ReviewStatus;
  review_comment?: string;
  fingerprint?: string;
  confidence: number;
  last_verified_at?: string;
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
  product_line?: string;
  engineering?: string;
  source_story?: string;
  source_type?: string;
  review_pass?: number;
  scope?: string;
  data_structure?: string;
  default_value?: string;
  first_seen_in?: string;
  derivation?: string;
  suggested_by?: string;
  review_status?: ReviewStatus;
  fingerprint?: string;
}): KnowledgeEntry {
  const db = getDb();
  const now = new Date().toISOString();
  const reviewStatus = input.review_status ?? "approved";
  const fingerprint = input.fingerprint ?? generateFingerprint(input.type, input.project, input.title, input.pattern);

  // Default confidence: 0.3 for auto-extracted, 0.7 for manual
  const confidence = input.source_type === "LLM提取" ? 0.3 : 0.7;

  const result = db.transaction(() => {
    const id = getNextTempId(input.type);

    db.prepare(
      `INSERT INTO knowledge_entries
       (id, type, project, module, severity, title, pattern, impact, fix_suggestion, content, status,
        source_review, source_mr, source_file, parent_id, hit_count,
        product_line, engineering, source_story, source_type, review_pass,
        scope, data_structure, default_value, first_seen_in, derivation,
        suggested_by, review_status, fingerprint, confidence, last_verified_at,
        created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'TEMP', ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id, input.type, input.project, input.module ?? null,
      input.severity ?? null, input.title, input.pattern ?? null,
      input.impact ?? null, input.fix_suggestion ?? null, input.content,
      input.source_review ?? null, input.source_mr ?? null,
      input.source_file ?? null, input.parent_id ?? null,
      input.product_line ?? null, input.engineering ?? null,
      input.source_story ?? null, input.source_type ?? null,
      input.review_pass ?? null,
      input.scope ?? null, input.data_structure ?? null,
      input.default_value ?? null, input.first_seen_in ?? null,
      input.derivation ?? null,
      input.suggested_by ?? null, reviewStatus,
      fingerprint,
      confidence,
      now,
      now, now
    );

    return { ...input, id, status: "TEMP" as EntryStatus, hit_count: 0, review_status: reviewStatus, fingerprint, confidence, last_verified_at: now, created_at: now, updated_at: now } as KnowledgeEntry;
  })();

  return result;
}

export function getEntry(id: string): KnowledgeEntry | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM knowledge_entries WHERE id = ?").get(id) as KnowledgeEntry | undefined;
}

const ALLOWED_UPDATE_FIELDS: ReadonlySet<string> = new Set([
  "title", "pattern", "impact", "fix_suggestion", "content", "module", "severity", "parent_id",
  "product_line", "engineering", "source_story", "source_type", "review_pass",
  "scope", "data_structure", "default_value", "first_seen_in", "derivation",
]);

export function updateEntry(id: string, updates: Partial<Pick<KnowledgeEntry, "title" | "pattern" | "impact" | "fix_suggestion" | "content" | "module" | "severity" | "parent_id" | "product_line" | "engineering" | "source_story" | "source_type" | "review_pass" | "scope" | "data_structure" | "default_value" | "first_seen_in" | "derivation">>): KnowledgeEntry | undefined {
  const db = getDb();
  const fields: string[] = [];
  const params: unknown[] = [];

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined && ALLOWED_UPDATE_FIELDS.has(key)) {
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
      `UPDATE knowledge_entries SET id = ?, status = 'CONFIRMED', confidence = MAX(confidence, 0.7), last_verified_at = ?, updated_at = ? WHERE id = ?`
    ).run(formalId, now, now, id);

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
  review_status?: ReviewStatus;
  suggested_by?: string;
  page?: number;
  pageSize?: number;
}

export function listEntries(filters: ListEntriesFilters = {}): { items: KnowledgeEntry[]; total: number; page: number; pageSize: number; totalPages: number } {
  const db = getDb();
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (filters.type) { clauses.push("type = ?"); params.push(filters.type); }
  if (filters.project) { clauses.push("project = ?"); params.push(filters.project); }
  if (filters.status) { clauses.push("status = ?"); params.push(filters.status); }
  if (filters.review_status) { clauses.push("review_status = ?"); params.push(filters.review_status); }
  if (filters.suggested_by) { clauses.push("suggested_by = ?"); params.push(filters.suggested_by); }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;
  const offset = (page - 1) * pageSize;

  const total = (db.prepare(`SELECT COUNT(*) as cnt FROM knowledge_entries ${where}`).get(...params) as { cnt: number }).cnt;
  const items = db.prepare(
    `SELECT * FROM knowledge_entries ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).all(...params, pageSize, offset) as KnowledgeEntry[];

  return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

export function listPendingEntries(page = 1, pageSize = 20): { items: KnowledgeEntry[]; total: number; page: number; pageSize: number; totalPages: number } {
  return listEntries({ review_status: "pending", page, pageSize });
}

export function reviewEntry(id: string, action: "approved" | "rejected", reviewedBy: string, comment?: string): KnowledgeEntry | undefined {
  const db = getDb();
  const entry = getEntry(id);
  if (!entry) return undefined;
  if (entry.review_status !== "pending") return undefined;

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE knowledge_entries SET review_status = ?, reviewed_by = ?, review_comment = ?, updated_at = ? WHERE id = ?`
  ).run(action, reviewedBy, comment ?? null, now, id);

  return getEntry(id);
}

export function getKnowledgeStats(): Array<{ type: EntryType; status: EntryStatus; project: string; count: number }> {
  const db = getDb();
  return db.prepare(
    "SELECT type, status, project, COUNT(*) as count FROM knowledge_entries GROUP BY type, status, project ORDER BY type, project"
  ).all() as Array<{ type: EntryType; status: EntryStatus; project: string; count: number }>;
}

// ---- Lifecycle Management ----

export function deprecateStaleEntries(): { deprecated: number; flagged: number } {
  const db = getDb();
  const now = new Date().toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  // Auto-deprecate: confidence < 0.2 AND no hit in 30 days
  const deprecatedResult = db.prepare(
    `UPDATE knowledge_entries
     SET status = 'DEPRECATED', updated_at = ?
     WHERE status IN ('TEMP', 'CONFIRMED')
       AND confidence < 0.2
       AND (last_hit_at IS NULL OR last_hit_at < ?)`
  ).run(now, thirtyDaysAgo);

  // Flag for re-verification: CONFIRMED AND no hit in 90 days
  const flaggedResult = db.prepare(
    `UPDATE knowledge_entries
     SET review_status = 'pending', updated_at = ?
     WHERE status = 'CONFIRMED'
       AND review_status = 'approved'
       AND (last_hit_at IS NULL OR last_hit_at < ?)`
  ).run(now, ninetyDaysAgo);

  return {
    deprecated: deprecatedResult.changes,
    flagged: flaggedResult.changes,
  };
}

export function refreshEntryVerification(id: string): KnowledgeEntry | undefined {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(
    "UPDATE knowledge_entries SET last_verified_at = ?, updated_at = ? WHERE id = ?"
  ).run(now, now, id);
  return getEntry(id);
}

// ---- Pattern Matching ----

function matchesChangedFiles(entry: KnowledgeEntry, changedFiles?: string[]): boolean {
  if (!changedFiles || changedFiles.length === 0 || !entry.pattern) return false;
  return changedFiles.some((file) => file.includes(entry.pattern!));
}

function sortByPatternMatch(items: KnowledgeEntry[], changedFiles?: string[]): KnowledgeEntry[] {
  if (!changedFiles || changedFiles.length === 0) return items;
  return [...items].sort((a, b) => {
    const aMatch = matchesChangedFiles(a, changedFiles) ? 1 : 0;
    const bMatch = matchesChangedFiles(b, changedFiles) ? 1 : 0;
    return bMatch - aMatch;
  });
}

// ---- Relevance Scoring ----

export function scoreKnowledgeRelevance(
  entry: KnowledgeEntry,
  project: string,
  changedFiles?: string[]
): number {
  let score = 0;

  // Project match: +20
  if (entry.project === project) score += 20;

  // Pattern match against changed files: +30
  if (matchesChangedFiles(entry, changedFiles)) score += 30;

  // Severity: CRITICAL=25, HIGH=20, MEDIUM=10, LOW=5
  const severityMap: Record<string, number> = {
    CRITICAL: 25,
    HIGH: 20,
    MEDIUM: 10,
    LOW: 5,
  };
  score += severityMap[entry.severity ?? ""] || 0;

  // Hit rate: +2 per hit, capped at 20
  score += Math.min((entry.hit_count || 0) * 2, 20);

  // Confidence bonus: >0.8 = +15, >0.5 = +5
  if ((entry.confidence || 0) > 0.8) score += 15;
  else if ((entry.confidence || 0) > 0.5) score += 5;

  // Module / file path match (for BN, RULE, EXP)
  if (changedFiles && entry.module && changedFiles.some((f) => f.includes(entry.module!))) {
    score += 15;
  }

  return score;
}

// ---- Token Budget ----

const KNOWLEDGE_TOKEN_BUDGET = 4000;

function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4);
}

// ---- Layered Knowledge Injection ----

export function getKnowledgeForReview(project: string, module?: string, changedFiles?: string[]): KnowledgeEntry[] {
  const db = getDb();

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

  // Combine all layers, deduplicate
  const allEntries: KnowledgeEntry[] = [];
  const seen = new Set<string>();
  const addUnique = (items: KnowledgeEntry[]) => {
    for (const item of items) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        allEntries.push(item);
      }
    }
  };

  addUnique(layer1);
  addUnique(layer2);
  addUnique(layer3);
  addUnique(layer4);
  addUnique(layer5);
  addUnique(layer6);

  // Sort by relevance score (descending)
  allEntries.sort((a, b) =>
    scoreKnowledgeRelevance(b, project, changedFiles) - scoreKnowledgeRelevance(a, project, changedFiles)
  );

  // Apply token budget: keep high-scoring entries, truncate low-scoring ones
  let totalTokens = 0;
  const result: KnowledgeEntry[] = [];
  for (const item of allEntries) {
    const tokens = estimateTokens(item.content);
    if (totalTokens + tokens > KNOWLEDGE_TOKEN_BUDGET) break;
    totalTokens += tokens;
    result.push(item);
  }

  return result;
}

// ---- Hit Tracking ----

export function determineAdoptedKnowledge(
  issues: Array<{ severity: string; message: string; suggestion?: string; file?: string }>,
  knowledge: KnowledgeEntry[]
): string[] {
  const adopted: string[] = [];
  for (const entry of knowledge) {
    const keywords: string[] = [];
    if (entry.pattern) keywords.push(entry.pattern.toLowerCase());
    if (entry.title) keywords.push(entry.title.toLowerCase());

    const match = issues.some((issue) => {
      const msg = issue.message.toLowerCase();
      const sug = (issue.suggestion || "").toLowerCase();
      return keywords.some((kw) => msg.includes(kw) || sug.includes(kw));
    });

    if (match) adopted.push(entry.id);
  }
  return adopted;
}

export function trackKnowledgeHits(
  ids: string[],
  reviewId?: string,
  adoptedIds?: string[]
): void {
  if (ids.length === 0) return;
  const db = getDb();
  const now = new Date().toISOString();
  const adoptedSet = new Set(adoptedIds ?? []);
  const placeholders = ids.map(() => "?").join(",");

  // Increment hit_count for all used knowledge
  db.prepare(
    `UPDATE knowledge_entries SET hit_count = hit_count + 1, last_hit_at = ? WHERE id IN (${placeholders})`
  ).run(now, ...ids);

  // Update confidence: +0.1 for adopted, -0.05 for not adopted
  if (adoptedSet.size > 0) {
    const adoptedPlaceholders = adoptedIds!.map(() => "?").join(",");
    db.prepare(
      `UPDATE knowledge_entries SET confidence = MIN(1.0, confidence + 0.1) WHERE id IN (${adoptedPlaceholders})`
    ).run(...adoptedIds!);
  }

  const notAdopted = ids.filter((id) => !adoptedSet.has(id));
  if (notAdopted.length > 0) {
    const notAdoptedPlaceholders = notAdopted.map(() => "?").join(",");
    db.prepare(
      `UPDATE knowledge_entries SET confidence = MAX(0.1, confidence - 0.05) WHERE id IN (${notAdoptedPlaceholders})`
    ).run(...notAdopted);
  }

  // Record review <-> knowledge usage with adoption status
  if (reviewId) {
    const insertUsage = db.prepare(
      "INSERT OR IGNORE INTO review_knowledge_usage (review_id, knowledge_id, adopted, created_at) VALUES (?, ?, ?, ?)"
    );
    for (const kid of ids) {
      insertUsage.run(reviewId, kid, adoptedSet.has(kid) ? 1 : 0, now);
    }
  }
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
    TERM: "术语",
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
    const lines = apEntries.map((e) => {
      let line = `[${e.severity || "HIGH"}] ${e.id}: ${e.title} — ${e.pattern || e.content}${e.fix_suggestion ? ` → ${e.fix_suggestion}` : ""}`;
      if (e.scope) line += `\n  适用: ${e.scope}`;
      if (e.first_seen_in) line += ` | 首次: ${e.first_seen_in}`;
      return line;
    });
    sections.push(`### 反模式（必须避免）\n${lines.join("\n")}`);
  }

  // Conventions section
  const convEntries = grouped.CONV ?? [];
  if (convEntries.length > 0) {
    const lines = convEntries.map((e) => `${e.id}: ${e.title}: ${e.content}`);
    sections.push(`### 项目约定\n${lines.join("\n")}`);
  }

  // Experiences section
  const expEntries = grouped.EXP ?? [];
  if (expEntries.length > 0) {
    const lines = expEntries.map((e) => {
      let line = `${e.id}: ${e.title}`;
      // Parse structured content for scene/advice
      const content = e.content;
      const sceneMatch = content.match(/场景[：:]\s*(.+)/);
      const adviceMatch = content.match(/建议[：:]\s*(.+)/);
      if (sceneMatch) line += `\n  场景: ${sceneMatch[1]}`;
      else line += `\n  ${content}`;
      if (adviceMatch) line += `\n  建议: ${adviceMatch[1]}`;
      return line;
    });
    sections.push(`### 评审经验\n${lines.join("\n")}`);
  }

  // Business context section (BN + RULE)
  const bnEntries = grouped.BN ?? [];
  const ruleEntries = grouped.RULE ?? [];
  if (bnEntries.length > 0 || ruleEntries.length > 0) {
    const lines: string[] = [];
    for (const bn of bnEntries) {
      let line = `[${bn.id}] ${bn.title}`;
      if (bn.data_structure) line += `\n  数据结构: ${bn.data_structure}`;
      if (bn.default_value) line += `\n  默认值: ${bn.default_value}`;
      if (!bn.data_structure && !bn.default_value) line += ` — ${bn.content}`;
      lines.push(line);
      const related = ruleEntries.filter((r) => r.parent_id === bn.id);
      for (const rule of related) {
        let ruleLine = `  ↳ ${rule.id}: ${rule.title}: ${rule.content}`;
        if (rule.derivation) ruleLine += ` (推导: ${rule.derivation})`;
        lines.push(ruleLine);
      }
    }
    // Standalone rules (no parent BN)
    const standaloneRules = ruleEntries.filter((r) => !bnEntries.some((bn) => r.parent_id === bn.id));
    for (const rule of standaloneRules) {
      let ruleLine = `${rule.id}: ${rule.title}: ${rule.content}`;
      if (rule.derivation) ruleLine += ` (推导: ${rule.derivation})`;
      lines.push(ruleLine);
    }
    sections.push(`### 业务上下文\n${lines.join("\n")}`);
  }

  // Terms section
  const termEntries = grouped.TERM ?? [];
  if (termEntries.length > 0) {
    const lines = termEntries.map((e) => `${e.id}: ${e.title} — ${e.content}`);
    sections.push(`### 术语\n${lines.join("\n")}`);
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

// ---- Fingerprint ----

export function generateFingerprint(type: string, project: string, title: string, pattern?: string): string {
  return `${type}|${project}|${title.toLowerCase().trim()}|${pattern || ""}`;
}

function findEntryByFingerprint(fingerprint: string): KnowledgeEntry | undefined {
  const db = getDb();
  return db.prepare(
    "SELECT * FROM knowledge_entries WHERE fingerprint = ? AND status IN ('TEMP', 'CONFIRMED') ORDER BY created_at DESC LIMIT 1"
  ).get(fingerprint) as KnowledgeEntry | undefined;
}

function mergeIntoExisting(entry: KnowledgeEntry, newContent: string): KnowledgeEntry | undefined {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE knowledge_entries SET content = content || '\n\n[MERGED] ' || ?, hit_count = hit_count + 1, last_verified_at = ?, updated_at = ? WHERE id = ?`
  ).run(newContent, now, now, entry.id);
  return getEntry(entry.id);
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
        source_type: "LLM提取",
        review_pass: 1,
      }));
    }
  }

  // Extract from CRITICAL/HIGH issues
  for (const issue of report.issues) {
    if (issue.severity === "CRITICAL" || issue.severity === "HIGH") {
      const title = issue.message.slice(0, 80);
      const content = issue.suggestion || issue.message;
      const fingerprint = generateFingerprint("AP", project, title, issue.file || undefined);

      // Check for existing entry with same fingerprint
      const existing = findEntryByFingerprint(fingerprint);
      if (existing) {
        const merged = mergeIntoExisting(existing, content);
        if (merged) created.push(merged);
      } else {
        created.push(addEntry({
          type: "AP",
          project,
          severity: issue.severity === "CRITICAL" ? "CRITICAL" : "HIGH",
          title,
          pattern: issue.file || undefined,
          content,
          source_review: reviewId,
          source_file: issue.file ? JSON.stringify([issue.file]) : undefined,
          source_type: "LLM提取",
          review_pass: 1,
        }));
      }
    }
  }

  return created;
}

// ---- Knowledge Relations ----

export type RelationType = "related_rule" | "related_term" | "related_ap" | "finding" | "reuse";

export interface KnowledgeRelation {
  id: string;
  from_id: string;
  to_id: string;
  relation: RelationType;
  created_at: string;
}

export function addRelation(fromId: string, toId: string, relation: RelationType): KnowledgeRelation {
  const db = getDb();
  const id = `REL-${fromId}-${toId}-${relation}`;
  const now = new Date().toISOString();
  db.prepare(
    "INSERT OR IGNORE INTO knowledge_relations (id, from_id, to_id, relation, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(id, fromId, toId, relation, now);
  return { id, from_id: fromId, to_id: toId, relation, created_at: now };
}

export function getRelationsForEntry(entryId: string): KnowledgeRelation[] {
  const db = getDb();
  return db.prepare(
    "SELECT * FROM knowledge_relations WHERE from_id = ? OR to_id = ? ORDER BY created_at"
  ).all(entryId, entryId) as KnowledgeRelation[];
}

export function deleteRelation(id: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM knowledge_relations WHERE id = ?").run(id);
  return result.changes > 0;
}

// ---- Review <-> Knowledge Queries ----

export function getKnowledgeUsedByReview(reviewId: string): KnowledgeEntry[] {
  const db = getDb();
  return db.prepare(
    `SELECT ke.* FROM knowledge_entries ke
     INNER JOIN review_knowledge_usage rku ON ke.id = rku.knowledge_id
     WHERE rku.review_id = ?
     ORDER BY ke.type, ke.created_at`
  ).all(reviewId) as KnowledgeEntry[];
}

export function getKnowledgeProducedByReview(reviewId: string): KnowledgeEntry[] {
  const db = getDb();
  return db.prepare(
    `SELECT * FROM knowledge_entries WHERE source_review = ? ORDER BY type, created_at`
  ).all(reviewId) as KnowledgeEntry[];
}
