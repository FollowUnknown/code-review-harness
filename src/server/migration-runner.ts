import fs from "fs";
import path from "path";
import type Database from "better-sqlite3";

function getMigrationsDir(): string {
  const distDir = path.resolve(__dirname, "migrations");
  if (fs.existsSync(distDir)) return distDir;

  const sourceDir = path.resolve(process.cwd(), "src/server/migrations");
  return sourceDir;
}

function ensureSchemaVersionTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

function listMigrationFiles(): string[] {
  const dir = getMigrationsDir();
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir)
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort();
}

export function runMigrations(db: Database.Database): void {
  ensureSchemaVersionTable(db);

  const applied = new Set(
    (db.prepare("SELECT version FROM schema_version ORDER BY version").all() as Array<{ version: string }>)
      .map((row) => row.version)
  );

  const dir = getMigrationsDir();
  for (const file of listMigrationFiles()) {
    if (applied.has(file)) continue;

    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    const tx = db.transaction(() => {
      db.exec(sql);
      db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(file);
    });
    tx();
  }
}
