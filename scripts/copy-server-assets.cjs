const fs = require("fs");
const path = require("path");

function copyDirFiles(sourceDir, targetDir, pattern) {
  if (!fs.existsSync(sourceDir)) return;
  fs.mkdirSync(targetDir, { recursive: true });

  for (const name of fs.readdirSync(sourceDir)) {
    if (!pattern.test(name)) continue;
    fs.copyFileSync(path.join(sourceDir, name), path.join(targetDir, name));
  }
}

const sourceMigrations = path.resolve(__dirname, "../src/server/migrations");
const targetMigrations = path.resolve(__dirname, "../dist/server/migrations");

copyDirFiles(sourceMigrations, targetMigrations, /^\d+_.+\.sql$/);
