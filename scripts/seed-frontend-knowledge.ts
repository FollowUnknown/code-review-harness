/**
 * One-time seed script: Import frontend review knowledge base into codeReview DB.
 *
 * Usage:
 *   npx tsx scripts/seed-frontend-knowledge.ts
 *
 * Reads from external knowledge base files at:
 *   ~/Documents/do1/workspace/claude-skills/.claude/skills/frontend-review/
 *
 * Creates:
 *   - 2 review dimension sets (qiqiao, qixi)
 *   - ~160 knowledge entries (AP, EXP, CONV, BN)
 *
 * Idempotent: uses fingerprint dedup, safe to re-run.
 */

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import os from "os";

// ---- DB Setup ----

const DB_PATH = process.env.KNOWLEDGE_DB_PATH || path.resolve(__dirname, "../knowledge.db");
const KB_ROOT = process.env.FRONTEND_KB_PATH || path.resolve(os.homedir(), "Documents/do1/workspace/claude-skills/.claude/skills/frontend-review");

// Safety: refuse to write to the default production DB unless explicitly allowed
if (DB_PATH === path.resolve(__dirname, "../knowledge.db") && process.env.NODE_ENV === "production" && !process.env.ALLOW_SEED_PROD) {
  console.error("✗ Refusing to seed into production DB. Set ALLOW_SEED_PROD=1 to override.");
  process.exit(1);
}

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

// ---- Types ----

interface SeedEntry {
  id: string;
  type: "AP" | "EXP" | "CONV" | "BN" | "RULE" | "TERM";
  project: string;
  module: string | null;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | null;
  title: string;
  pattern: string | null;
  impact: string | null;
  fix_suggestion: string | null;
  content: string;
  status: "CONFIRMED";
  source_review: string | null;
  source_mr: string | null;
  source_file: string | null;
  fingerprint: string;
  confidence: number;
}

// ---- Dimension Sets ----

const QIQIAO_DIMENSIONS = [
  "安全",
  "Vue 2 组件质量",
  "Vuex 状态管理",
  "API 层与网络请求",
  "MPA 模块独立性",
  "UI 框架使用 (Element UI)",
  "i18n 国际化",
  "代码风格",
  "业务逻辑一致性",
];

const QIXI_DIMENSIONS = [
  "安全",
  "Vue 3 组件质量",
  "TypeScript 类型安全",
  "Pinia 状态管理",
  "API 层与网络请求",
  "UI 框架使用 (Arco Design)",
  "构建与架构",
  "代码风格",
  "业务逻辑一致性",
];

function seedDimensionSets() {
  const now = new Date().toISOString();

  const insertDim = db.prepare(`
    INSERT OR IGNORE INTO review_dimension_sets (id, name, project, dimensions, focus_areas, is_default, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 0, 'seed', ?, ?)
  `);

  insertDim.run(
    "DS-qiqiao",
    "七巧前端评审维度",
    "qiqiao",
    JSON.stringify(QIQIAO_DIMENSIONS),
    JSON.stringify(["Vue 2 响应式陷阱", "内存泄漏", "Element UI 样式作用域", "MPA 模块边界"]),
    now, now,
  );

  insertDim.run(
    "DS-qixi",
    "七析前端评审维度",
    "qixi",
    JSON.stringify(QIXI_DIMENSIONS),
    JSON.stringify(["TypeScript 类型安全", "Vue 3 Composition API", "Pinia 响应式", "Arco Tree fieldNames"]),
    now, now,
  );

  console.log("✓ Dimension sets seeded (qiqiao, qixi)");
}

// ---- Knowledge Entry Parser ----

function parseAntiPatterns(text: string, project: string, idPrefix: string): SeedEntry[] {
  const entries: SeedEntry[] = [];
  // Match patterns like ### AP-XXX: Title or ### AP-QX-XXX: Title
  const apRegex = /### (AP[-\w]+):\s*(.+?)(?=\n- \*\*|$)/g;
  let match: RegExpExecArray | null;

  while ((match = apRegex.exec(text)) !== null) {
    const id = match[1];
    const title = match[2].trim();

    // Extract severity
    const severityMatch = text.substring(match.index, match.index + 800).match(/\*\*严重度\*\*:\s*(CRITICAL|HIGH|MEDIUM|LOW)/);
    const severity = (severityMatch ? severityMatch[1] : "MEDIUM") as SeedEntry["severity"];

    // Extract pattern/影响/修复
    const block = text.substring(match.index, match.index + 800);
    const patternMatch = block.match(/\*\*模式\*\*:\s*(.+?)(?:\n|$)/);
    const impactMatch = block.match(/\*\*影响\*\*:\s*(.+?)(?:\n|$)/);
    const fixMatch = block.match(/\*\*修复\*?\*?:\s*(.+?)(?:\n|$)/);
    const sourceMatch = block.match(/\*\*来源\*\*:\s*(.+?)(?:\n|$)/);

    const content = [
      patternMatch ? `模式: ${patternMatch[1].trim()}` : "",
      impactMatch ? `影响: ${impactMatch[1].trim()}` : "",
      fixMatch ? `修复: ${fixMatch[1].trim()}` : "",
    ].filter(Boolean).join("\n");

    entries.push({
      id: `${idPrefix}-${id.replace(/^AP-/, "")}`,
      type: "AP",
      project,
      module: null,
      severity,
      title,
      pattern: patternMatch?.[1]?.trim() || null,
      impact: impactMatch?.[1]?.trim() || null,
      fix_suggestion: fixMatch?.[1]?.trim() || null,
      content: content || title,
      status: "CONFIRMED",
      source_review: null,
      source_mr: sourceMatch?.[1]?.trim() || null,
      source_file: null,
      fingerprint: `AP|${project}|${title}`,
      confidence: severity === "CRITICAL" ? 0.95 : severity === "HIGH" ? 0.9 : 0.85,
    });
  }

  return entries;
}

function parseConventions(text: string, project: string, idPrefix: string): SeedEntry[] {
  const entries: SeedEntry[] = [];
  const convRegex = /### (CONV[-\w]+):\s*(.+?)(?=\n- \*\*|\n---|\n### |$)/g;
  let match: RegExpExecArray | null;

  while ((match = convRegex.exec(text)) !== null) {
    const id = match[1];
    const title = match[2].trim();
    const block = text.substring(match.index, match.index + 1200);

    // Get all content after title until next heading
    const contentLines = block.split("\n").slice(1);
    const content = contentLines
      .filter((l) => !l.startsWith("### ") && l.trim() !== "" && l.trim() !== "---")
      .join("\n")
      .trim()
      .replace(/^- /gm, "• ")
      .slice(0, 500);

    const sourceMatch = block.match(/\*\*来源\*\*:\s*(.+?)(?:\n|$)/);

    entries.push({
      id: `${idPrefix}-CONV-${id.replace(/^CONV-/, "")}`,
      type: "CONV",
      project,
      module: null,
      severity: "MEDIUM",
      title,
      pattern: null,
      impact: null,
      fix_suggestion: null,
      content: content || title,
      status: "CONFIRMED",
      source_review: null,
      source_mr: sourceMatch?.[1]?.trim() || null,
      source_file: null,
      fingerprint: `CONV|${project}|${title}`,
      confidence: 0.8,
    });
  }

  return entries;
}

function parseExperiences(text: string, project: string, idPrefix: string): SeedEntry[] {
  const entries: SeedEntry[] = [];
  const expRegex = /### (EXP[-\w]+):\s*(.+?)(?=\n- \*\*|\n---|\n### |$)/g;
  let match: RegExpExecArray | null;

  while ((match = expRegex.exec(text)) !== null) {
    const id = match[1];
    const title = match[2].trim();
    const block = text.substring(match.index, match.index + 1500);

    const typeMatch = block.match(/\*\*类型\*\*:\s*(.+?)(?:\n|$)/);
    const filterMatch = block.match(/\*\*过滤规则\*\*:\s*([\s\S]+?)(?=\n- \*\*|\n###|\n---|$)/);
    const sourceMatch = block.match(/\*\*来源\*\*:\s*(.+?)(?:\n|$)/);
    const sceneMatch = block.match(/\*\*场景\*?\*?:\s*(.+?)(?:\n|$)/);
    const adviceMatch = block.match(/\*\*建议\*?\*?:\s*(.+?)(?:\n|$)/);
    const descMatch = block.match(/\*\*(?:经验描述|说明)\*?\*?:\s*([\s\S]+?)(?=\n- \*\*|\n###|\n---|$)/);

    const parts: string[] = [];
    if (typeMatch) parts.push(`类型: ${typeMatch[1].trim()}`);
    if (filterMatch) parts.push(`过滤规则: ${filterMatch[1].trim()}`);
    if (sceneMatch) parts.push(`场景: ${sceneMatch[1].trim()}`);
    if (adviceMatch) parts.push(`建议: ${adviceMatch[1].trim()}`);
    if (descMatch) parts.push(descMatch[1].trim().slice(0, 400));

    const content = parts.join("\n") || title;

    entries.push({
      id: `${idPrefix}-EXP-${id.replace(/^EXP-/, "")}`,
      type: "EXP",
      project,
      module: null,
      severity: null,
      title,
      pattern: null,
      impact: null,
      fix_suggestion: null,
      content,
      status: "CONFIRMED",
      source_review: null,
      source_mr: sourceMatch?.[1]?.trim() || null,
      source_file: null,
      fingerprint: `EXP|${project}|${title}`,
      confidence: 0.7,
    });
  }

  return entries;
}

function parseBusinessNouns(text: string, project: string, idPrefix: string): SeedEntry[] {
  const entries: SeedEntry[] = [];
  const bnRegex = /### (BN[-\w]+):\s*(.+?)(?=\n- \*\*|\n---|\n### |$)/g;
  let match: RegExpExecArray | null;

  while ((match = bnRegex.exec(text)) !== null) {
    const id = match[1];
    const title = match[2].trim();
    const block = text.substring(match.index, match.index + 1500);

    const descMatch = block.match(/\*\*说明\*\*:\s*([\s\S]+?)(?=\n- \*\*|\n###|\n---|$)/);
    const moduleMatch = block.match(/\*\*涉及模块\*\*:\s*(.+?)(?:\n|$)/);
    const filesMatch = block.match(/\*\*关键文件\*\*:\s*(.+?)(?:\n|$)/);
    const sourceMatch = block.match(/\*\*来源\*\*:\s*(.+?)(?:\n|$)/);

    const parts: string[] = [];
    if (descMatch) parts.push(descMatch[1].trim().slice(0, 400));
    if (moduleMatch) parts.push(`涉及模块: ${moduleMatch[1].trim()}`);
    if (filesMatch) parts.push(`关键文件: ${filesMatch[1].trim()}`);

    entries.push({
      id: `${idPrefix}-BN-${id.replace(/^BN-/, "")}`,
      type: "BN",
      project,
      module: null,
      severity: null,
      title,
      pattern: null,
      impact: null,
      fix_suggestion: null,
      content: parts.join("\n") || title,
      status: "CONFIRMED",
      source_review: null,
      source_mr: sourceMatch?.[1]?.trim() || null,
      source_file: null,
      fingerprint: `BN|${project}|${title}`,
      confidence: 0.8,
    });
  }

  return entries;
}

// ---- Seed Knowledge ----

function seedKnowledge() {
  const now = new Date().toISOString();

  const insertEntry = db.prepare(`
    INSERT INTO knowledge_entries (id, type, project, module, severity, title, pattern, impact, fix_suggestion, content, status, source_review, source_mr, source_file, fingerprint, confidence, hit_count, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
  `);

  const findByFingerprint = db.prepare(
    "SELECT id FROM knowledge_entries WHERE fingerprint = ? LIMIT 1"
  );

  const updateEntry = db.prepare(`
    UPDATE knowledge_entries SET content = ?, severity = COALESCE(?, severity), impact = COALESCE(?, impact),
      fix_suggestion = COALESCE(?, fix_suggestion), updated_at = ? WHERE fingerprint = ?
  `);

  const files = [
    { path: "knowledge-base/shared.md", project: "shared", idPrefix: "SH", parseFns: [parseAntiPatterns] },
    { path: "knowledge-base/qiqiao.md", project: "qiqiao", idPrefix: "QQ", parseFns: [parseAntiPatterns, parseConventions, parseExperiences, parseBusinessNouns] },
    { path: "knowledge-base/qixi.md", project: "qixi", idPrefix: "QX", parseFns: [parseAntiPatterns, parseConventions, parseExperiences, parseBusinessNouns] },
  ];

  let totalSeeded = 0;

  for (const file of files) {
    const fullPath = path.join(KB_ROOT, file.path);
    if (!fs.existsSync(fullPath)) {
      console.log(`⚠ File not found, skipping: ${fullPath}`);
      continue;
    }

    const text = fs.readFileSync(fullPath, "utf-8");

    for (const parseFn of file.parseFns) {
      const entries = parseFn(text, file.project, file.idPrefix);
      for (const entry of entries) {
        const existing = findByFingerprint.get(entry.fingerprint) as { id: string } | undefined;
        if (existing) {
          updateEntry.run(
            entry.content, entry.severity, entry.impact,
            entry.fix_suggestion, now, entry.fingerprint,
          );
        } else {
          insertEntry.run(
            entry.id, entry.type, entry.project, entry.module, entry.severity,
            entry.title, entry.pattern, entry.impact, entry.fix_suggestion,
            entry.content, entry.status, entry.source_review, entry.source_mr,
            entry.source_file, entry.fingerprint, entry.confidence, now, now,
          );
        }
      }
      totalSeeded += entries.length;
    }

    console.log(`✓ Seeded entries from ${file.path} (project: ${file.project})`);
  }

  console.log(`✓ Total knowledge entries seeded: ${totalSeeded}`);
}

// ---- Main ----

function main() {
  console.log("Seeding frontend review knowledge base...");
  console.log(`DB: ${DB_PATH}`);
  console.log(`KB: ${KB_ROOT}`);

  if (!fs.existsSync(KB_ROOT)) {
    console.error(`✗ Knowledge base directory not found: ${KB_ROOT}`);
    process.exit(1);
  }

  seedDimensionSets();
  seedKnowledge();

  console.log("\nDone! Run 'npm run dev' and test with a qiqiao/qixi project review.");
}

main();
