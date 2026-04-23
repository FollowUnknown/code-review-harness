import Database from "better-sqlite3";
import path from "path";
import { randomUUID } from "crypto";
import { REVIEW_DIMENSIONS } from "../shared/constants";

let db: Database.Database | null = null;

function getDbPath(): string {
  return process.env.KNOWLEDGE_DB_PATH || path.join(process.cwd(), "knowledge.db");
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
    CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('AP', 'EXP', 'BN', 'CONV')),
      project TEXT NOT NULL,
      module TEXT,
      severity TEXT CHECK(severity IN ('HIGH', 'MEDIUM', 'LOW')),
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'TEMP' CHECK(status IN ('TEMP', 'CONFIRMED')),
      source_review TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

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

    CREATE INDEX IF NOT EXISTS idx_entries_type ON entries(type);
    CREATE INDEX IF NOT EXISTS idx_entries_project ON entries(project);
    CREATE INDEX IF NOT EXISTS idx_entries_status ON entries(status);

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

  // Seed default prompt templates (idempotent via INSERT OR IGNORE)
  const dimensionsText = REVIEW_DIMENSIONS.map((d: string, i: number) => `${i + 1}. ${d}`).join("\n");
  const stmt = db.prepare(
    "INSERT OR IGNORE INTO prompt_templates (id, name, category, description, system_template, variables, is_default, version) VALUES (?, ?, ?, ?, ?, ?, 1, 1)"
  );
  stmt.run("default-review", "review", "review", "代码评审核心 prompt 模板",
    `你是一个专业的代码评审专家。你需要对提供的代码变更进行评审，并按照指定维度打分。\n\n评分维度（每项 1-5 分）：\n${dimensionsText}\n\n请严格按照以下 JSON 格式输出评审结果，不要输出其他内容：\n{\n  "scores": [{"dimension": "维度名", "score": 1-5, "comment": "具体说明"}],\n  "issues": [{"severity": "CRITICAL/HIGH/MEDIUM/LOW", "message": "问题描述", "file": "文件名", "line": 行号, "suggestion": "修复建议"}],\n  "summary": "1-2段总结"\n}\n\n当前评审批次：第 {{batchIndex}}/{{totalBatches}} 批，风险等级：{{riskLevel}}。`,
    '["dimensions","batchIndex","totalBatches","riskLevel"]'
  );
  stmt.run("default-requirement", "requirement", "understanding", "需求理解 prompt", "", '["type","module","features"]');
  stmt.run("default-knowledge", "knowledge", "extraction", "知识提取 prompt", "", '["entries"]');
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
