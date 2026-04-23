import Database from "better-sqlite3";
import path from "path";

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

    CREATE INDEX IF NOT EXISTS idx_entries_type ON entries(type);
    CREATE INDEX IF NOT EXISTS idx_entries_project ON entries(project);
    CREATE INDEX IF NOT EXISTS idx_entries_status ON entries(status);
  `);
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
