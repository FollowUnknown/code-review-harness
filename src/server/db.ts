import Database from "better-sqlite3";
import path from "path";
import { randomUUID } from "crypto";
import { REVIEW_DIMENSIONS } from "../shared/constants";
import { JAVA_BACKEND_DIMENSIONS } from "./llm/prompts/defaults";

let db: Database.Database | null = null;

function getDbPath(): string {
  if (process.env.KNOWLEDGE_DB_PATH) return process.env.KNOWLEDGE_DB_PATH;
  // Use __dirname (dist/server) to resolve to project root, independent of cwd
  const projectRoot = path.resolve(__dirname, "../..");
  return path.join(projectRoot, "knowledge.db");
}

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(getDbPath());
    db.pragma("journal_mode = WAL");
    initialize(db);
  }
  return db;
}

function initialize(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      mr_url TEXT NOT NULL,
      project TEXT,
      report TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT,
      role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('admin', 'member')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS prompt_templates (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      category TEXT,
      description TEXT,
      system_template TEXT NOT NULL,
      user_template TEXT,
      variables TEXT,
      is_default INTEGER DEFAULT 0,
      version INTEGER DEFAULT 1,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Repo mappings (v1.3.0 local code scanning)
  db.exec(`CREATE TABLE IF NOT EXISTS repo_mappings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project TEXT NOT NULL UNIQUE,
    local_path TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  // Knowledge entries (replacing legacy `entries` table)
  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_entries (
      id              TEXT PRIMARY KEY,
      type            TEXT NOT NULL CHECK(type IN ('AP', 'EXP', 'CONV', 'BN', 'RULE', 'TERM')),
      project         TEXT NOT NULL,
      module          TEXT,
      severity        TEXT CHECK(severity IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
      title           TEXT NOT NULL,
      pattern         TEXT,
      impact          TEXT,
      fix_suggestion  TEXT,
      content         TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'TEMP' CHECK(status IN ('TEMP', 'CONFIRMED', 'DEPRECATED')),
      source_review   TEXT,
      source_mr       TEXT,
      source_file     TEXT,
      parent_id       TEXT,
      hit_count       INTEGER NOT NULL DEFAULT 0,
      last_hit_at     TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (parent_id) REFERENCES knowledge_entries(id)
    );

    CREATE INDEX IF NOT EXISTS idx_ke_type ON knowledge_entries(type);
    CREATE INDEX IF NOT EXISTS idx_ke_project ON knowledge_entries(project);
    CREATE INDEX IF NOT EXISTS idx_ke_status ON knowledge_entries(status);
    CREATE INDEX IF NOT EXISTS idx_ke_type_project ON knowledge_entries(type, project);
    CREATE INDEX IF NOT EXISTS idx_ke_type_project_status ON knowledge_entries(type, project, status);
  `);

  // Review dimension sets (project-level review dimensions)
  db.exec(`
    CREATE TABLE IF NOT EXISTS review_dimension_sets (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL UNIQUE,
      project     TEXT,
      dimensions  TEXT NOT NULL,
      focus_areas TEXT,
      is_default  INTEGER NOT NULL DEFAULT 0,
      created_by  TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_rds_project ON review_dimension_sets(project);
  `);

  // Knowledge relations
  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_relations (
      id         TEXT PRIMARY KEY,
      from_id    TEXT NOT NULL,
      to_id      TEXT NOT NULL,
      relation   TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (from_id) REFERENCES knowledge_entries(id),
      FOREIGN KEY (to_id) REFERENCES knowledge_entries(id)
    );
    CREATE INDEX IF NOT EXISTS idx_kr_from ON knowledge_relations(from_id);
    CREATE INDEX IF NOT EXISTS idx_kr_to ON knowledge_relations(to_id);
  `);

  // Migrate knowledge_entries table with new columns (safe, idempotent)
  migrateKnowledgeEntriesTable(db);

  // Migrate reviews table to extended schema (safe, idempotent)
  migrateReviewsTable(db);

  // Seed default dimension set (idempotent)
  seedDefaultDimensionSet(db);

  // Review <-> Knowledge usage tracking (after reviews table migration)
  db.exec(`
    CREATE TABLE IF NOT EXISTS review_knowledge_usage (
      review_id    TEXT NOT NULL,
      knowledge_id TEXT NOT NULL,
      adopted      INTEGER NOT NULL DEFAULT 0,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (review_id, knowledge_id)
    );
    CREATE INDEX IF NOT EXISTS idx_rku_review ON review_knowledge_usage(review_id);
    CREATE INDEX IF NOT EXISTS idx_rku_knowledge ON review_knowledge_usage(knowledge_id);
  `);

  // Migrate review_knowledge_usage table with adopted column (must be after CREATE TABLE)
  migrateReviewKnowledgeUsageTable(db);

  // LLM communication logs
  db.exec(`
    CREATE TABLE IF NOT EXISTS llm_logs (
      id TEXT PRIMARY KEY,
      review_id TEXT NOT NULL,
      batch_index INTEGER NOT NULL,
      risk_level TEXT CHECK(risk_level IN ('S','A','B','C')),
      system_prompt TEXT NOT NULL,
      user_message TEXT NOT NULL,
      response_text TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      input_tokens INTEGER,
      output_tokens INTEGER,
      provider TEXT,
      model TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_llm_logs_review_id ON llm_logs(review_id);
  `);

  // Review plans
  db.exec(`
    CREATE TABLE IF NOT EXISTS review_plans (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'reviewing', 'archived')),
      created_by TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_plans_created_by ON review_plans(created_by);
    CREATE INDEX IF NOT EXISTS idx_plans_status ON review_plans(status);

    CREATE TABLE IF NOT EXISTS review_plan_items (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL,
      mr_url TEXT NOT NULL,
      review_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'reviewing', 'completed', 'failed')),
      position INTEGER DEFAULT 0,
      source_branch TEXT,
      target_branch TEXT,
      author TEXT,
      error_message TEXT,
      reviewed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (plan_id) REFERENCES review_plans(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_plan_items_plan_id ON review_plan_items(plan_id);
  `);

  // Review jobs (v1.3.8)
  db.exec(`
    CREATE TABLE IF NOT EXISTS review_jobs (
      id TEXT PRIMARY KEY,
      project TEXT NOT NULL,
      source_branch TEXT NOT NULL,
      target_branch TEXT NOT NULL,
      excluded_files_json TEXT,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending', 'running', 'completed', 'failed', 'aborted')),
      review_id TEXT,
      current_step INTEGER NOT NULL DEFAULT 0,
      current_label TEXT,
      steps_json TEXT,
      error_message TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_review_jobs_status ON review_jobs(status);
    CREATE INDEX IF NOT EXISTS idx_review_jobs_created_by ON review_jobs(created_by);
  `);

  // Migrate review_plan_items table with branch/author/error_message/reviewed_at columns
  migrateReviewPlanItemsTable(db);

  // Seed default prompt templates (idempotent via INSERT OR IGNORE)
  const dimensionsText = REVIEW_DIMENSIONS.map((d: string, i: number) => `${i + 1}. ${d}`).join("\n");
  const stmt = db.prepare(
    "INSERT OR IGNORE INTO prompt_templates (id, name, category, description, system_template, variables, is_default, version) VALUES (?, ?, ?, ?, ?, ?, 1, 1)"
  );
  stmt.run("default-review", "review", "review", "代码评审核心 prompt 模板",
    `你是一个专业的代码评审专家。你需要对提供的代码变更进行评审，并按照指定维度打分。\n\n**文件类型特殊规则：**\n- SVG 文件：仅检查文件大小/变更行数，不做代码逻辑评审。若 SVG diff 行数超过 500 行，标记为 MEDIUM 级别问题，建议压缩或拆分\n- 纯文档文件（.md）：跳过代码逻辑评审\n- 配置文件（.gitignore, tsconfig 等）：跳过代码逻辑评审\n\n## 评分维度（每项 1-5 分）\n\n{{dimensions}}\n\n## 评分标准\n\n{{dimensionCriteria}}\n\n## Issue 严重级别判定\n\n| 级别 | 触发条件 |\n|------|----------|\n| CRITICAL | 硬编码密钥、安全漏洞、数据丢失风险 |\n| HIGH | Bug、核心逻辑错误、重要错误处理缺失、状态泄漏 |\n| MEDIUM | 可维护性问题、代码重复、缺失的边界处理 |\n| LOW | 命名建议、风格优化、小改进 |\n\n请严格按照以下 JSON 格式输出评审结果，不要输出其他内容：\n{\n  "scores": [{"dimension": "维度名", "score": 1-5, "comment": "具体说明"}],\n  "issues": [{"severity": "CRITICAL/HIGH/MEDIUM/LOW", "message": "问题描述", "file": "文件名", "line": 行号, "suggestion": "修复建议"}],\n  "summary": "1-2段总结"\n}`,
    '["dimensions","dimensionCriteria","batchIndex","totalBatches","riskLevel"]'
  );
  stmt.run("default-requirement", "requirement", "understanding", "需求理解 prompt", "", '["type","module","features"]');
  stmt.run("default-knowledge", "knowledge", "extraction", "知识提取 prompt", "", '["entries"]');

  // Migrate existing DB: update prompt template to include dimensionCriteria and remove batch context
  migratePromptTemplate(db);
}

function migratePromptTemplate(db: Database.Database): void {
  // Check if the existing template needs migration
  const row = db.prepare("SELECT system_template, variables FROM prompt_templates WHERE name = 'review'").get() as { system_template: string; variables: string } | undefined;
  if (!row) return;

  // Skip if template already has dimensionCriteria AND is long enough (not truncated)
  if (row.system_template.includes("dimensionCriteria") && row.system_template.includes("JSON 格式")) return;

  // Update the template to include {{dimensionCriteria}} and {{dimensions}}, remove hardcoded batch context
  const newTemplate = `你是一个专业的代码评审专家。你需要对提供的代码变更进行评审，并按照指定维度打分。\n\n**文件类型特殊规则：**\n- SVG 文件：仅检查文件大小/变更行数，不做代码逻辑评审。若 SVG diff 行数超过 500 行，标记为 MEDIUM 级别问题，建议压缩或拆分\n- 纯文档文件（.md）：跳过代码逻辑评审\n- 配置文件（.gitignore, tsconfig 等）：跳过代码逻辑评审\n\n## 评分维度（每项 1-5 分）\n\n{{dimensions}}\n\n## 评分标准\n\n{{dimensionCriteria}}\n\n## Issue 严重级别判定\n\n| 级别 | 触发条件 |\n|------|----------|\n| CRITICAL | 硬编码密钥、安全漏洞、数据丢失风险 |\n| HIGH | Bug、核心逻辑错误、重要错误处理缺失、状态泄漏 |\n| MEDIUM | 可维护性问题、代码重复、缺失的边界处理 |\n| LOW | 命名建议、风格优化、小改进 |\n\n请严格按照以下 JSON 格式输出评审结果，不要输出其他内容：\n{\n  "scores": [{"dimension": "维度名", "score": 1-5, "comment": "具体说明"}],\n  "issues": [{"severity": "CRITICAL/HIGH/MEDIUM/LOW", "message": "问题描述", "file": "文件名", "line": 行号, "suggestion": "修复建议"}],\n  "summary": "1-2段总结"\n}`;

  db.prepare("UPDATE prompt_templates SET system_template = ?, variables = ?, version = version + 1 WHERE name = 'review'")
    .run(newTemplate, '["dimensions","dimensionCriteria","batchIndex","totalBatches","riskLevel"]');
}

function migrateKnowledgeEntriesTable(db: Database.Database): void {
  const columns = db.prepare("PRAGMA table_info(knowledge_entries)").all() as Array<{ name: string }>;
  const colNames = new Set(columns.map((c) => c.name));

  const newColumns: Array<{ name: string; def: string }> = [
    { name: "product_line", def: "TEXT" },
    { name: "engineering", def: "TEXT" },
    { name: "source_story", def: "TEXT" },
    { name: "source_type", def: "TEXT" },
    { name: "review_pass", def: "INTEGER" },
    { name: "scope", def: "TEXT" },
    { name: "data_structure", def: "TEXT" },
    { name: "default_value", def: "TEXT" },
    { name: "first_seen_in", def: "TEXT" },
    { name: "derivation", def: "TEXT" },
    // v1.1.5: Knowledge review workflow
    { name: "suggested_by", def: "TEXT" },
    { name: "reviewed_by", def: "TEXT" },
    { name: "review_status", def: "TEXT NOT NULL DEFAULT 'approved' CHECK(review_status IN ('pending', 'approved', 'rejected'))" },
    { name: "review_comment", def: "TEXT" },
    // v1.2.0: Fingerprint deduplication
    { name: "fingerprint", def: "TEXT" },
    // v1.2.0: Confidence scoring
    { name: "confidence", def: "REAL NOT NULL DEFAULT 0.5" },
    // v1.2.0: Lifecycle management
    { name: "last_verified_at", def: "TEXT" },
  ];

  for (const col of newColumns) {
    if (!colNames.has(col.name)) {
      db.exec(`ALTER TABLE knowledge_entries ADD COLUMN ${col.name} ${col.def}`);
    }
  }
}

function migrateReviewsTable(db: Database.Database): void {
  const columns = db.prepare("PRAGMA table_info(reviews)").all() as Array<{ name: string }>;
  const hasReportJson = columns.some((c) => c.name === "report_json");

  // Add knowledge_dispositions_json column if missing
  const hasDisposition = columns.some((c) => c.name === "knowledge_dispositions_json");
  if (!hasDisposition && hasReportJson) {
    db.exec("ALTER TABLE reviews ADD COLUMN knowledge_dispositions_json TEXT");
  }

  if (hasReportJson) return; // Already migrated

  const migrate = db.transaction(() => {
    db.exec("ALTER TABLE reviews RENAME TO reviews_old");

    db.exec(`
      CREATE TABLE reviews (
        id TEXT PRIMARY KEY,
        mr_url TEXT NOT NULL,
        project TEXT,
        author TEXT,
        status TEXT NOT NULL DEFAULT 'completed' CHECK(status IN ('completed', 'draft')),
        report_json TEXT NOT NULL,
        classification_json TEXT,
        requirement_json TEXT,
        mr_meta_json TEXT,
        reviewed_commit_sha TEXT,
        passed INTEGER,
        avg_score REAL,
        issue_count INTEGER,
        critical_count INTEGER DEFAULT 0,
        created_by TEXT,
        knowledge_dispositions_json TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.exec(`
      INSERT INTO reviews (id, mr_url, project, report_json, created_at)
      SELECT id, mr_url, project, report, created_at FROM reviews_old
    `);

    db.exec("DROP TABLE reviews_old");

    db.exec("CREATE INDEX IF NOT EXISTS idx_reviews_project ON reviews(project)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_reviews_created_by ON reviews(created_by)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(status)");
  });

  migrate();
}

function migrateReviewKnowledgeUsageTable(db: Database.Database): void {
  const columns = db.prepare("PRAGMA table_info(review_knowledge_usage)").all() as Array<{ name: string }>;
  const colNames = new Set(columns.map((c) => c.name));

  if (!colNames.has("adopted")) {
    db.exec("ALTER TABLE review_knowledge_usage ADD COLUMN adopted INTEGER NOT NULL DEFAULT 0");
  }
}

function migrateReviewPlanItemsTable(db: Database.Database): void {
  const columns = db.prepare("PRAGMA table_info(review_plan_items)").all() as Array<{ name: string }>;
  const colNames = new Set(columns.map((c) => c.name));

  if (!colNames.has("source_branch")) {
    db.exec("ALTER TABLE review_plan_items ADD COLUMN source_branch TEXT");
  }
  if (!colNames.has("target_branch")) {
    db.exec("ALTER TABLE review_plan_items ADD COLUMN target_branch TEXT");
  }
  if (!colNames.has("author")) {
    db.exec("ALTER TABLE review_plan_items ADD COLUMN author TEXT");
  }
  if (!colNames.has("error_message")) {
    db.exec("ALTER TABLE review_plan_items ADD COLUMN error_message TEXT");
  }
  if (!colNames.has("reviewed_at")) {
    db.exec("ALTER TABLE review_plan_items ADD COLUMN reviewed_at DATETIME");
  }
}

function seedDefaultDimensionSet(db: Database.Database): void {
  // Seed default dimension set (if not exists)
  const defaultExisting = db.prepare("SELECT COUNT(*) as cnt FROM review_dimension_sets WHERE is_default = 1").get() as { cnt: number };
  if (defaultExisting.cnt === 0) {
    db.prepare(
      `INSERT INTO review_dimension_sets (id, name, project, dimensions, focus_areas, is_default, created_by)
       VALUES (?, ?, NULL, ?, NULL, 1, 'system')`
    ).run(
      "default",
      "默认维度集",
      JSON.stringify([...REVIEW_DIMENSIONS])
    );
  }

  // Seed Java backend dimension set (if not exists)
  const javaExisting = db.prepare("SELECT COUNT(*) as cnt FROM review_dimension_sets WHERE id = ?").get("java-backend") as { cnt: number };
  if (javaExisting.cnt === 0) {
    db.prepare(
      `INSERT INTO review_dimension_sets (id, name, project, dimensions, focus_areas, is_default, created_by)
       VALUES (?, ?, ?, ?, ?, 0, 'system')`
    ).run(
      "java-backend",
      "Java 后端维度集",
      "java-backend",
      JSON.stringify([...JAVA_BACKEND_DIMENSIONS]),
      JSON.stringify(["Spring Boot", "MyBatis/JPA", "Maven/Gradle"])
    );
  }
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
