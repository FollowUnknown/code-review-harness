import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

interface DbFingerprint {
  source: string;
  target: string;
  generatedAt: string;
  sizeBytes: number;
  walSizeBytes: number;
  shmSizeBytes: number;
  tableCounts: Record<string, number>;
  schemaVersions: string[];
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function optionalSize(filePath: string): number {
  return fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
}

function checkpointWal(dbPath: string): void {
  const db = new Database(dbPath);
  try {
    db.pragma("wal_checkpoint(TRUNCATE)");
  } finally {
    db.close();
  }
}

function copyIfExists(source: string, target: string): void {
  if (!fs.existsSync(source)) return;
  fs.copyFileSync(source, target);
}

function backupIfExists(targetDb: string): string[] {
  if (!fs.existsSync(targetDb)) return [];

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(path.dirname(targetDb), "backups", stamp);
  fs.mkdirSync(backupDir, { recursive: true });

  const files = [targetDb, `${targetDb}-wal`, `${targetDb}-shm`];
  const copied: string[] = [];

  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const target = path.join(backupDir, path.basename(file));
    fs.copyFileSync(file, target);
    copied.push(target);
  }

  return copied;
}

function tableCount(db: Database.Database, table: string): number {
  const row = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as { count: number };
  return row.count;
}

function buildFingerprint(sourcePath: string, targetPath: string): DbFingerprint {
  const db = new Database(targetPath, { readonly: true });
  try {
    const tables = [
      "users",
      "settings",
      "repo_mappings",
      "product_lines",
      "knowledge_entries",
      "reviews",
      "review_jobs",
      "review_checkpoints",
      "review_sub_reports",
      "llm_logs",
      "schema_version",
    ];

    const tableCounts: Record<string, number> = {};
    for (const table of tables) {
      const exists = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name = ?"
      ).get(table) as { name: string } | undefined;
      if (!exists) continue;
      tableCounts[table] = tableCount(db, table);
    }

    const schemaVersions = db.prepare(
      "SELECT version FROM schema_version ORDER BY version"
    ).all() as Array<{ version: string }>;

    return {
      source: sourcePath,
      target: targetPath,
      generatedAt: new Date().toISOString(),
      sizeBytes: fs.statSync(targetPath).size,
      walSizeBytes: optionalSize(`${targetPath}-wal`),
      shmSizeBytes: optionalSize(`${targetPath}-shm`),
      tableCounts,
      schemaVersions: schemaVersions.map((row) => row.version),
    };
  } finally {
    db.close();
  }
}

function main(): void {
  const sourceDb = requiredEnv("SOURCE_DB_PATH");
  const targetDb = requiredEnv("TARGET_DB_PATH");
  const targetDir = path.dirname(targetDb);

  if (!fs.existsSync(sourceDb)) {
    throw new Error(`Source DB not found: ${sourceDb}`);
  }
  if (path.resolve(sourceDb) === path.resolve(targetDb)) {
    throw new Error("SOURCE_DB_PATH and TARGET_DB_PATH must be different");
  }

  fs.mkdirSync(targetDir, { recursive: true });

  checkpointWal(sourceDb);
  const backupPaths = backupIfExists(targetDb);

  copyIfExists(sourceDb, targetDb);
  copyIfExists(`${sourceDb}-wal`, `${targetDb}-wal`);
  copyIfExists(`${sourceDb}-shm`, `${targetDb}-shm`);

  const fingerprint = buildFingerprint(sourceDb, targetDb);
  const fingerprintPath = `${targetDb}.fingerprint.json`;
  fs.writeFileSync(fingerprintPath, JSON.stringify(fingerprint, null, 2));

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        sourceDb,
        targetDb,
        backupPaths,
        fingerprintPath,
        tableCounts: fingerprint.tableCounts,
        schemaVersions: fingerprint.schemaVersions,
      },
      null,
      2
    )
  );
}

main();
