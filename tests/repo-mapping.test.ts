import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getDb, closeDb } from "../src/server/db";
import {
  getRepoMapping,
  setRepoMapping,
  listRepoMappings,
  deleteRepoMapping,
  ensureRepoMappingsTable,
} from "../src/server/config/repo-mapping";

beforeEach(() => {
  process.env.KNOWLEDGE_DB_PATH = ":memory:";
  closeDb();
  // Re-open with in-memory DB and ensure our table exists
  getDb();
  ensureRepoMappingsTable();
});

afterEach(() => {
  closeDb();
  delete process.env.KNOWLEDGE_DB_PATH;
});

describe("repo-mapping", () => {
  it("setRepoMapping inserts new mapping", () => {
    setRepoMapping("my-project", "/data/repos/my-project");
    const mapping = getRepoMapping("my-project");
    expect(mapping).not.toBeNull();
    expect(mapping!.project).toBe("my-project");
    expect(mapping!.localPath).toBe("/data/repos/my-project");
    expect(mapping!.id).toBeGreaterThan(0);
    expect(mapping!.createdAt).toBeTruthy();
  });

  it("setRepoMapping updates existing mapping (upsert)", () => {
    setRepoMapping("my-project", "/old/path");
    setRepoMapping("my-project", "/new/path");
    const mapping = getRepoMapping("my-project");
    expect(mapping!.localPath).toBe("/new/path");
  });

  it("getRepoMapping returns null for unknown project", () => {
    const mapping = getRepoMapping("unknown-project");
    expect(mapping).toBeNull();
  });

  it("listRepoMappings returns all mappings ordered by project", () => {
    setRepoMapping("project-b", "/path/b");
    setRepoMapping("project-a", "/path/a");
    const list = listRepoMappings();
    expect(list.length).toBe(2);
    // Ordered alphabetically by project name
    expect(list[0].project).toBe("project-a");
    expect(list[1].project).toBe("project-b");
  });

  it("listRepoMappings returns empty array when no mappings exist", () => {
    const list = listRepoMappings();
    expect(list).toEqual([]);
  });

  it("deleteRepoMapping removes mapping", () => {
    setRepoMapping("to-delete", "/path");
    deleteRepoMapping("to-delete");
    expect(getRepoMapping("to-delete")).toBeNull();
  });

  it("deleteRepoMapping is idempotent for non-existent project", () => {
    // Should not throw
    expect(() => deleteRepoMapping("non-existent")).not.toThrow();
  });
});
