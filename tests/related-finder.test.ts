import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { findRelatedFiles } from "../src/server/services/local-scan/related-finder";

const TEST_REPO = path.join(os.tmpdir(), `test-related-${Date.now()}`);

beforeEach(() => {
  fs.mkdirSync(path.join(TEST_REPO, "src"), { recursive: true });
  fs.mkdirSync(path.join(TEST_REPO, "src/services"), { recursive: true });
  fs.mkdirSync(path.join(TEST_REPO, "src/routes"), { recursive: true });
  fs.mkdirSync(path.join(TEST_REPO, "src/utils"), { recursive: true });

  fs.writeFileSync(
    path.join(TEST_REPO, "src/services/order.ts"),
    `import { calculateScore } from '../utils/scoring';\nimport { UserConfig } from '../types';\nexport function createOrder(config: UserConfig) {\n  const score = calculateScore(config);\n  return { score };\n}`
  );
  fs.writeFileSync(
    path.join(TEST_REPO, "src/utils/scoring.ts"),
    `export function calculateScore(config: any): number {\n  return 42;\n}\nexport function formatScore(score: number): string {\n  return String(score);\n}`
  );
  fs.writeFileSync(
    path.join(TEST_REPO, "src/routes/order.ts"),
    `import { createOrder } from '../services/order';\nexport function handleOrder(req: any) {\n  return createOrder(req.body);\n}`
  );
  fs.writeFileSync(
    path.join(TEST_REPO, "src/types.ts"),
    `export interface UserConfig {\n  name: string;\n  maxRetries: number;\n}`
  );
});

afterEach(() => {
  fs.rmSync(TEST_REPO, { recursive: true, force: true });
});

describe("related-finder", () => {
  it("finds files that use a specific symbol", () => {
    const results = findRelatedFiles(["calculateScore"], "src/utils/scoring.ts", TEST_REPO, { maxFiles: 10 });
    const paths = results.map((r) => r.path);
    expect(paths).toContain("src/services/order.ts");
  });

  it("finds upstream imports of changed file", () => {
    const results = findRelatedFiles([], "src/services/order.ts", TEST_REPO, { maxFiles: 10 });
    const paths = results.map((r) => r.path);
    expect(paths).toContain("src/routes/order.ts");
  });

  it("respects maxFiles limit", () => {
    const results = findRelatedFiles(
      ["calculateScore", "formatScore", "UserConfig", "createOrder"],
      "src/services/order.ts",
      TEST_REPO,
      { maxFiles: 2 }
    );
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it("skips utility files from downstream tracing", () => {
    const results = findRelatedFiles(["calculateScore"], "src/utils/scoring.ts", TEST_REPO, { maxFiles: 10 });
    expect(results.every((r) => r.relevance > 0)).toBe(true);
  });
});
