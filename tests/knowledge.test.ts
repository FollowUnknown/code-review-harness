import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  addEntry,
  getEntry,
  confirmEntry,
  deprecateEntry,
  deleteEntry,
  listEntries,
  getKnowledgeStats,
  getKnowledgeForReview,
  trackKnowledgeHits,
  buildKnowledgePrompt,
  extractLearnings,
  getProjectAbbr,
} from "../src/server/services/knowledge";
import { getDb, closeDb } from "../src/server/db";

// Use in-memory database for tests
process.env.KNOWLEDGE_DB_PATH = ":memory:";

beforeEach(() => {
  closeDb();
  getDb();
});

afterEach(() => {
  closeDb();
});

describe("project abbreviation", () => {
  it("extracts abbreviation from project path", () => {
    expect(getProjectAbbr("do1cloud-qiqiao/console-web")).toBe("con");
    expect(getProjectAbbr("do1cloud/runtime-web")).toBe("run");
    expect(getProjectAbbr("simple")).toBe("sim");
  });
});

describe("knowledge entries CRUD", () => {
  it("adds an entry with auto-generated TEMP id", () => {
    const entry = addEntry({
      type: "AP",
      project: "myapp",
      severity: "HIGH",
      title: "Memory leak in useEffect",
      content: "Always clean up subscriptions in useEffect return",
    });

    expect(entry.id).toMatch(/^AP-TEMP-\d{3}$/);
    expect(entry.status).toBe("TEMP");
    expect(entry.hit_count).toBe(0);
    expect(entry.type).toBe("AP");
  });

  it("retrieves an entry by id", () => {
    const entry = addEntry({
      type: "AP",
      project: "myapp",
      severity: "HIGH",
      title: "Test title",
      content: "Test content",
    });

    const fetched = getEntry(entry.id);
    expect(fetched).toBeDefined();
    expect(fetched!.title).toBe("Test title");
    expect(fetched!.status).toBe("TEMP");
  });

  it("confirms an entry and assigns formal ID", () => {
    const entry = addEntry({
      type: "AP",
      project: "myapp",
      severity: "HIGH",
      title: "Test",
      content: "Content",
    });

    const confirmed = confirmEntry(entry.id, "mya");
    expect(confirmed).toBeDefined();
    expect(confirmed!.id).toMatch(/^AP-mya-\d{3}$/);
    expect(confirmed!.status).toBe("CONFIRMED");

    // Old TEMP id should no longer exist
    expect(getEntry(entry.id)).toBeUndefined();
  });

  it("deprecates an entry", () => {
    const entry = addEntry({ type: "EXP", project: "app", title: "T", content: "C" });
    expect(deprecateEntry(entry.id)).toBe(true);
    expect(getEntry(entry.id)!.status).toBe("DEPRECATED");
  });

  it("deletes a TEMP entry only", () => {
    const entry = addEntry({ type: "BN", project: "app", title: "SKU", content: "Stock Keeping Unit" });
    expect(deleteEntry(entry.id)).toBe(true);
    expect(getEntry(entry.id)).toBeUndefined();
  });

  it("cannot delete a CONFIRMED entry", () => {
    const entry = addEntry({ type: "AP", project: "app", severity: "HIGH", title: "T", content: "C" });
    confirmEntry(entry.id, "app");
    // Try deleting the old TEMP id - it no longer exists
    expect(deleteEntry(entry.id)).toBe(false);
  });

  it("lists entries with pagination and filters", () => {
    addEntry({ type: "AP", project: "app1", severity: "HIGH", title: "T1", content: "C1" });
    addEntry({ type: "AP", project: "app2", severity: "LOW", title: "T2", content: "C2" });
    addEntry({ type: "CONV", project: "app1", title: "T3", content: "C3" });

    const allAp = listEntries({ type: "AP" });
    expect(allAp.total).toBe(2);
    expect(allAp.items).toHaveLength(2);

    const app1Ap = listEntries({ type: "AP", project: "app1" });
    expect(app1Ap.items).toHaveLength(1);

    const page1 = listEntries({ type: "AP", page: 1, pageSize: 1 });
    expect(page1.items).toHaveLength(1);
    expect(page1.total).toBe(2);
  });

  it("returns knowledge stats", () => {
    addEntry({ type: "AP", project: "app1", severity: "HIGH", title: "T", content: "C" });
    addEntry({ type: "EXP", project: "app1", title: "T2", content: "C2" });

    const stats = getKnowledgeStats();
    expect(stats.length).toBeGreaterThanOrEqual(2);
  });
});

describe("getKnowledgeForReview", () => {
  it("returns relevant knowledge entries in priority order", () => {
    // Layer 1: Universal AP (HIGH, other project)
    const shared = addEntry({ type: "AP", project: "other", severity: "HIGH", title: "Shared AP", content: "Shared content" });
    confirmEntry(shared.id, "oth");

    // Layer 2: Project AP
    const projAp = addEntry({ type: "AP", project: "myapp", severity: "MEDIUM", title: "Project AP", content: "Project content" });
    confirmEntry(projAp.id, "mya");

    // Layer 3: Project CONV
    const conv = addEntry({ type: "CONV", project: "myapp", title: "Naming convention", content: "Use camelCase" });
    confirmEntry(conv.id, "mya");

    // Layer 4: Project EXP with module
    const exp = addEntry({ type: "EXP", project: "myapp", module: "payment", title: "Payment insight", content: "Use idempotency keys" });
    confirmEntry(exp.id, "mya");

    const knowledge = getKnowledgeForReview("myapp", "payment");
    expect(knowledge.length).toBeGreaterThanOrEqual(4);

    // Module-matched EXP should be present
    expect(knowledge.find((e) => e.id === confirmEntry(exp.id, "mya")?.id || e.title === "Payment insight")).toBeDefined();
  });

  it("returns empty array when no knowledge exists", () => {
    const knowledge = getKnowledgeForReview("unknown-project");
    expect(knowledge).toHaveLength(0);
  });

  it("excludes TEMP and DEPRECATED entries", () => {
    addEntry({ type: "AP", project: "myapp", severity: "HIGH", title: "Temp", content: "Should not appear" });
    const knowledge = getKnowledgeForReview("myapp");
    expect(knowledge).toHaveLength(0);
  });

  it("loads RULE entries linked to BN parent", () => {
    const bn = addEntry({ type: "BN", project: "myapp", title: "Order", content: "Order entity" });
    const confirmedBn = confirmEntry(bn.id, "mya");

    const rule = addEntry({ type: "RULE", project: "myapp", title: "Order rule", content: "Must have status", parent_id: confirmedBn!.id });
    confirmEntry(rule.id, "mya");

    const knowledge = getKnowledgeForReview("myapp");
    const foundRule = knowledge.find((e) => e.type === "RULE");
    expect(foundRule).toBeDefined();
  });
});

describe("trackKnowledgeHits", () => {
  it("increments hit count for entries", () => {
    const entry = addEntry({ type: "AP", project: "app", severity: "HIGH", title: "T", content: "C" });
    const confirmed = confirmEntry(entry.id, "app");

    trackKnowledgeHits([confirmed!.id]);

    const fetched = getEntry(confirmed!.id);
    expect(fetched!.hit_count).toBe(1);
    expect(fetched!.last_hit_at).toBeDefined();
  });
});

describe("buildKnowledgePrompt", () => {
  it("returns empty string for empty entries", () => {
    expect(buildKnowledgePrompt([])).toBe("");
  });

  it("formats entries into structured prompt sections", () => {
    const entries = [
      { id: "AP-001", type: "AP" as const, project: "app", title: "Anti-pattern", content: "Don't do X", status: "CONFIRMED" as const, pattern: "Bad pattern", fix_suggestion: "Do Y instead", hit_count: 0, created_at: "", updated_at: "" },
      { id: "CONV-001", type: "CONV" as const, project: "app", title: "Convention", content: "Always do Y", status: "CONFIRMED" as const, hit_count: 0, created_at: "", updated_at: "" },
    ];

    const prompt = buildKnowledgePrompt(entries);
    expect(prompt).toContain("项目知识库");
    expect(prompt).toContain("反模式");
    expect(prompt).toContain("Anti-pattern");
    expect(prompt).toContain("项目约定");
    expect(prompt).toContain("Convention");
  });
});

describe("extractLearnings", () => {
  it("extracts learnings from low scores", () => {
    const report = {
      scores: [
        { dimension: "测试覆盖率", score: 2, comment: "缺少单元测试" },
        { dimension: "函数长度", score: 5, comment: "OK" },
      ],
      issues: [],
    };

    const entries = extractLearnings(report, "myapp", "R-100");
    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe("EXP");
    expect(entries[0].title).toContain("测试覆盖率");
    expect(entries[0].status).toBe("TEMP");
  });

  it("extracts learnings from high severity issues", () => {
    const report = {
      scores: [],
      issues: [
        { severity: "CRITICAL", message: "SQL injection vulnerability", suggestion: "Use parameterized queries" },
        { severity: "LOW", message: "Minor style issue" },
      ],
    };

    const entries = extractLearnings(report, "myapp", "R-101");
    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe("AP");
    expect(entries[0].severity).toBe("CRITICAL");
  });
});
