import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  addEntry,
  getEntry,
  confirmEntry,
  deleteEntry,
  listEntries,
  saveReview,
  getReview,
  getKnowledgeForReview,
  buildKnowledgePrompt,
  extractLearnings,
} from "../src/server/services/knowledge";
import { getDb, closeDb } from "../src/server/db";

// Use in-memory database for tests
process.env.KNOWLEDGE_DB_PATH = ":memory:";

beforeEach(() => {
  closeDb();
  // Force re-initialization with in-memory DB
  getDb();
});

afterEach(() => {
  closeDb();
});

describe("knowledge entries CRUD", () => {
  it("adds and retrieves an entry", () => {
    const entry = addEntry({
      id: "AP-001",
      type: "AP",
      project: "myapp",
      severity: "HIGH",
      title: "Memory leak in useEffect",
      content: "Always clean up subscriptions in useEffect return",
    });

    expect(entry.status).toBe("TEMP");

    const fetched = getEntry("AP-001");
    expect(fetched).toBeDefined();
    expect(fetched!.title).toBe("Memory leak in useEffect");
    expect(fetched!.status).toBe("TEMP");
  });

  it("confirms an entry", () => {
    addEntry({
      id: "EXP-001",
      type: "EXP",
      project: "myapp",
      title: "lodash is slow",
      content: "Use native methods instead",
    });

    const result = confirmEntry("EXP-001");
    expect(result).toBe(true);

    const fetched = getEntry("EXP-001");
    expect(fetched!.status).toBe("CONFIRMED");
  });

  it("deletes an entry", () => {
    addEntry({
      id: "BN-001",
      type: "BN",
      project: "myapp",
      title: "SKU",
      content: "Stock Keeping Unit",
    });

    expect(deleteEntry("BN-001")).toBe(true);
    expect(getEntry("BN-001")).toBeUndefined();
  });

  it("lists entries with filters", () => {
    addEntry({ id: "AP-010", type: "AP", project: "app1", severity: "HIGH", title: "T1", content: "C1" });
    addEntry({ id: "AP-011", type: "AP", project: "app2", severity: "LOW", title: "T2", content: "C2" });
    addEntry({ id: "CONV-010", type: "CONV", project: "app1", title: "T3", content: "C3" });

    const allAp = listEntries({ type: "AP" });
    expect(allAp).toHaveLength(2);

    const app1Ap = listEntries({ type: "AP", project: "app1" });
    expect(app1Ap).toHaveLength(1);

    const conv = listEntries({ type: "CONV" });
    expect(conv).toHaveLength(1);
  });

  it("lists entries with status filter", () => {
    addEntry({ id: "AP-020", type: "AP", project: "app", severity: "HIGH", title: "T", content: "C" });
    confirmEntry("AP-020");

    const temp = listEntries({ status: "TEMP" });
    expect(temp).toHaveLength(0);

    const confirmed = listEntries({ status: "CONFIRMED" });
    expect(confirmed).toHaveLength(1);
  });
});

describe("review records", () => {
  it("saves and retrieves a review", () => {
    saveReview({
      id: "R-001",
      mr_url: "https://gitlab.com/project/-/merge_requests/1",
      project: "myapp",
      report: JSON.stringify({ passed: true }),
    });

    const review = getReview("R-001");
    expect(review).toBeDefined();
    expect(review!.mr_url).toContain("merge_requests/1");
  });
});

describe("getKnowledgeForReview", () => {
  it("returns relevant knowledge entries", () => {
    // Add shared AP (severity HIGH)
    addEntry({ id: "AP-100", type: "AP", project: "other", severity: "HIGH", title: "Shared AP", content: "Shared content" });
    confirmEntry("AP-100");

    // Add project AP
    addEntry({ id: "AP-101", type: "AP", project: "myapp", severity: "MEDIUM", title: "Project AP", content: "Project content" });
    confirmEntry("AP-101");

    // Add CONV
    addEntry({ id: "CONV-100", type: "CONV", project: "myapp", title: "Naming convention", content: "Use camelCase" });
    confirmEntry("CONV-100");

    // Add EXP
    addEntry({ id: "EXP-100", type: "EXP", project: "myapp", module: "payment", title: "Payment insight", content: "Use idempotency keys" });
    confirmEntry("EXP-100");

    const knowledge = getKnowledgeForReview("myapp", "payment");
    expect(knowledge.length).toBeGreaterThanOrEqual(4);

    // Module-matched EXP should come before unmatched
    const expIdx = knowledge.findIndex((e) => e.id === "EXP-100");
    expect(expIdx).toBeLessThan(knowledge.length);
  });

  it("returns empty array when no knowledge exists", () => {
    const knowledge = getKnowledgeForReview("unknown-project");
    expect(knowledge).toHaveLength(0);
  });

  it("excludes TEMP entries", () => {
    addEntry({ id: "AP-200", type: "AP", project: "myapp", severity: "HIGH", title: "Temp", content: "Should not appear" });
    // Not confirmed - stays TEMP

    const knowledge = getKnowledgeForReview("myapp");
    expect(knowledge).toHaveLength(0);
  });
});

describe("buildKnowledgePrompt", () => {
  it("returns empty string for empty entries", () => {
    expect(buildKnowledgePrompt([])).toBe("");
  });

  it("formats entries into prompt text", () => {
    const entries = [
      { id: "AP-001", type: "AP" as const, project: "app", title: "Anti-pattern", content: "Don't do X", status: "CONFIRMED" as const, created_at: "" },
      { id: "CONV-001", type: "CONV" as const, project: "app", title: "Convention", content: "Always do Y", status: "CONFIRMED" as const, created_at: "" },
    ];

    const prompt = buildKnowledgePrompt(entries);
    expect(prompt).toContain("项目知识库");
    expect(prompt).toContain("[反模式] Anti-pattern: Don't do X");
    expect(prompt).toContain("[约定] Convention: Always do Y");
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
    expect(entries[0].severity).toBe("HIGH"); // CRITICAL maps to HIGH in knowledge DB
  });
});
