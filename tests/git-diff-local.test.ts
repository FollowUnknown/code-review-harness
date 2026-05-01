import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import { extractLocalDiff, parseDiffToGitLabDiffs } from "../src/server/services/local-scan/git-diff";

const TEST_REPO = path.join(os.tmpdir(), `test-repo-${Date.now()}`);

let defaultBranch: string;

beforeEach(() => {
  fs.mkdirSync(TEST_REPO);
  execSync("git init", { cwd: TEST_REPO });
  execSync("git config user.email 'test@test.com'", { cwd: TEST_REPO });
  execSync("git config user.name 'Test'", { cwd: TEST_REPO });

  fs.writeFileSync(path.join(TEST_REPO, "hello.ts"), "export function hello() { return 'hello'; }\n");
  execSync("git add . && git commit -m initial", { cwd: TEST_REPO });

  // Detect the default branch name (main vs master depending on git version)
  defaultBranch = execSync("git branch --show-current", { cwd: TEST_REPO }).toString().trim();

  execSync("git checkout -b feature", { cwd: TEST_REPO });
  fs.writeFileSync(path.join(TEST_REPO, "hello.ts"), "export function hello(name: string) { return `hello ${name}`; }\n");
  fs.writeFileSync(path.join(TEST_REPO, "world.ts"), "export function world() { return 'world'; }\n");
  execSync("git add . && git commit -m feature", { cwd: TEST_REPO });

  execSync(`git checkout ${defaultBranch}`, { cwd: TEST_REPO });
});

afterEach(() => {
  fs.rmSync(TEST_REPO, { recursive: true, force: true });
});

describe("git-diff", () => {
  it("extractLocalDiff returns diff string", () => {
    const diff = extractLocalDiff(TEST_REPO, defaultBranch, "feature");
    expect(diff).toContain("hello");
    expect(diff).toContain("world.ts");
  });

  it("parseDiffToGitLabDiffs parses diff into GitLabDiff array", () => {
    const diff = extractLocalDiff(TEST_REPO, defaultBranch, "feature");
    const gitlabDiffs = parseDiffToGitLabDiffs(diff);
    expect(gitlabDiffs.length).toBeGreaterThanOrEqual(2);
    const paths = gitlabDiffs.map((d) => d.new_path);
    expect(paths).toContain("hello.ts");
    expect(paths).toContain("world.ts");
  });

  it("parseDiffToGitLabDiffs sets new_file flag correctly", () => {
    const diff = extractLocalDiff(TEST_REPO, defaultBranch, "feature");
    const gitlabDiffs = parseDiffToGitLabDiffs(diff);
    const newFile = gitlabDiffs.find((d) => d.new_path === "world.ts");
    expect(newFile?.new_file).toBe(true);
    const modified = gitlabDiffs.find((d) => d.new_path === "hello.ts");
    expect(modified?.new_file).toBe(false);
  });

  it("extractLocalDiff throws on invalid branch", () => {
    expect(() => extractLocalDiff(TEST_REPO, defaultBranch, "nonexistent")).toThrow();
  });

  it("parseDiffToGitLabDiffs returns empty for empty input", () => {
    expect(parseDiffToGitLabDiffs("")).toEqual([]);
    expect(parseDiffToGitLabDiffs("  ")).toEqual([]);
  });
});
