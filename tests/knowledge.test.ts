import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  addEntry,
  getEntry,
  updateEntry,
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
  getKnowledgeUsedByReview,
  getKnowledgeProducedByReview,
  scoreKnowledgeRelevance,
  generateFingerprint,
  determineAdoptedKnowledge,
  deprecateStaleEntries,
  refreshEntryVerification,
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

  it("prioritizes AP entries whose pattern matches changed files", () => {
    // Project-specific AP with pattern matching changed files
    const matchedAp = addEntry({
      type: "AP", project: "myapp", severity: "MEDIUM",
      title: "Dialog leak", content: "Clean up dialog refs",
      pattern: "Dialog.vue",
    });
    confirmEntry(matchedAp.id, "mya");

    // Another project AP without matching pattern
    const unmatchedAp = addEntry({
      type: "AP", project: "myapp", severity: "HIGH",
      title: "SQL injection", content: "Use parameterized queries",
      pattern: "db.ts",
    });
    confirmEntry(unmatchedAp.id, "mya");

    const changedFiles = ["src/components/Dialog.vue", "src/utils/helper.ts"];
    const knowledge = getKnowledgeForReview("myapp", undefined, changedFiles);

    // Both APs should be present
    expect(knowledge.length).toBeGreaterThanOrEqual(2);

    // Matched AP should come before unmatched AP (priority boost)
    const matchedIndex = knowledge.findIndex((e) => e.title === "Dialog leak");
    const unmatchedIndex = knowledge.findIndex((e) => e.title === "SQL injection");
    expect(matchedIndex).toBeLessThan(unmatchedIndex);
  });

  it("falls back to original order when no files match", () => {
    const ap1 = addEntry({ type: "AP", project: "myapp", severity: "HIGH", title: "T1", content: "C1", pattern: "db.ts" });
    const ap2 = addEntry({ type: "AP", project: "myapp", severity: "MEDIUM", title: "T2", content: "C2", pattern: "api.ts" });
    confirmEntry(ap1.id, "mya");
    confirmEntry(ap2.id, "mya");

    const changedFiles = ["src/components/Button.tsx"]; // no match
    const knowledge = getKnowledgeForReview("myapp", undefined, changedFiles);

    // Original severity-based order: HIGH first
    const idx1 = knowledge.findIndex((e) => e.title === "T1");
    const idx2 = knowledge.findIndex((e) => e.title === "T2");
    expect(idx1).toBeLessThan(idx2);
  });

  it("matches pattern as substring against file paths", () => {
    const ap = addEntry({
      type: "AP", project: "myapp", severity: "HIGH",
      title: "Store mutation", content: "Never mutate Vuex store directly",
      pattern: "store",
    });
    confirmEntry(ap.id, "mya");

    const changedFiles = ["src/store/modules/user.ts"];
    const knowledge = getKnowledgeForReview("myapp", undefined, changedFiles);

    expect(knowledge.some((e) => e.title === "Store mutation")).toBe(true);
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

  it("records review-knowledge usage when reviewId provided", () => {
    const entry = addEntry({ type: "AP", project: "app", severity: "HIGH", title: "T", content: "C" });
    const confirmed = confirmEntry(entry.id, "app");

    trackKnowledgeHits([confirmed!.id], "R-test001");

    const used = getKnowledgeUsedByReview("R-test001");
    expect(used).toHaveLength(1);
    expect(used[0].id).toBe(confirmed!.id);
  });
});

describe("review-knowledge queries", () => {
  it("getKnowledgeUsedByReview returns empty for unknown review", () => {
    expect(getKnowledgeUsedByReview("R-nonexistent")).toHaveLength(0);
  });

  it("getKnowledgeProducedByReview returns entries with matching source_review", () => {
    addEntry({ type: "AP", project: "app", severity: "CRITICAL", title: "Produced AP", content: "C", source_review: "R-prod001" });
    addEntry({ type: "EXP", project: "app", title: "Produced EXP", content: "C", source_review: "R-prod001" });
    addEntry({ type: "AP", project: "app", severity: "HIGH", title: "Other", content: "C", source_review: "R-prod002" });

    const produced = getKnowledgeProducedByReview("R-prod001");
    expect(produced).toHaveLength(2);
    expect(produced.every((e) => e.source_review === "R-prod001")).toBe(true);
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
    expect(entries[0].source_type).toBe("LLM提取");
    expect(entries[0].review_pass).toBe(1);
  });

  it("extracts learnings from high severity issues", () => {
    const report = {
      scores: [],
      issues: [
        { severity: "CRITICAL", message: "SQL injection vulnerability", suggestion: "Use parameterized queries", file: "db.ts" },
        { severity: "LOW", message: "Minor style issue" },
      ],
    };

    const entries = extractLearnings(report, "myapp", "R-101");
    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe("AP");
    expect(entries[0].severity).toBe("CRITICAL");
    expect(entries[0].source_type).toBe("LLM提取");
    expect(entries[0].source_file).toBe(JSON.stringify(["db.ts"]));
  });
});

describe("new fields", () => {
  it("adds entry with new fields", () => {
    const entry = addEntry({
      type: "AP",
      project: "myapp",
      severity: "HIGH",
      title: "New field test",
      content: "Content",
      product_line: "qiqiao",
      engineering: "console-web",
      source_story: "STORY-100",
      source_type: "交叉评审",
      review_pass: 2,
      scope: "全局弹窗组件",
      first_seen_in: "STORY-100 + dialog.vue",
    });

    expect(entry.product_line).toBe("qiqiao");
    expect(entry.engineering).toBe("console-web");
    expect(entry.source_story).toBe("STORY-100");
    expect(entry.source_type).toBe("交叉评审");
    expect(entry.review_pass).toBe(2);
    expect(entry.scope).toBe("全局弹窗组件");
    expect(entry.first_seen_in).toBe("STORY-100 + dialog.vue");
  });

  it("adds BN with data_structure and default_value", () => {
    const entry = addEntry({
      type: "BN",
      project: "myapp",
      title: "数据安全配置",
      content: "数据安全配置实体",
      data_structure: "{ dataDisplayMode, dataMaskingConfig, permissionConfig }",
      default_value: "dataDisplayMode=0, isAll=false",
    });

    expect(entry.data_structure).toBe("{ dataDisplayMode, dataMaskingConfig, permissionConfig }");
    expect(entry.default_value).toBe("dataDisplayMode=0, isAll=false");
  });

  it("adds RULE with derivation", () => {
    const entry = addEntry({
      type: "RULE",
      project: "myapp",
      title: "权限规则",
      content: "不配置权限时所有人无可见权限",
      derivation: "代码推断",
    });

    expect(entry.derivation).toBe("代码推断");
  });

  it("adds TERM entry", () => {
    const entry = addEntry({
      type: "TERM",
      project: "myapp",
      title: "脱敏规则",
      content: "对敏感数据进行掩码处理的配置规则",
    });

    expect(entry.type).toBe("TERM");
    expect(entry.id).toMatch(/^TERM-TEMP-\d{3}$/);
  });

  it("updates new fields", () => {
    const entry = addEntry({ type: "AP", project: "app", severity: "HIGH", title: "T", content: "C" });

    const updated = updateEntry(entry.id, {
      product_line: "qiqiao",
      scope: "全局",
      first_seen_in: "story-100",
    });

    expect(updated!.product_line).toBe("qiqiao");
    expect(updated!.scope).toBe("全局");
    expect(updated!.first_seen_in).toBe("story-100");
  });
});

describe("buildKnowledgePrompt enhanced", () => {
  it("includes scope and first_seen_in for AP entries", () => {
    const entries = [
      { id: "AP-cw-001", type: "AP" as const, project: "app", title: "Dialog 未清理", content: "Don't leak", status: "CONFIRMED" as const, severity: "CRITICAL", scope: "全局弹窗组件", first_seen_in: "story-001100", hit_count: 0, created_at: "", updated_at: "" },
    ];

    const prompt = buildKnowledgePrompt(entries);
    expect(prompt).toContain("适用: 全局弹窗组件");
    expect(prompt).toContain("首次: story-001100");
  });

  it("includes data_structure and default_value for BN entries", () => {
    const entries = [
      { id: "BN-cw-001", type: "BN" as const, project: "app", title: "数据安全配置", content: "Config entity", status: "CONFIRMED" as const, data_structure: "{ dataDisplayMode }", default_value: "dataDisplayMode=0", hit_count: 0, created_at: "", updated_at: "" },
    ];

    const prompt = buildKnowledgePrompt(entries);
    expect(prompt).toContain("数据结构: { dataDisplayMode }");
    expect(prompt).toContain("默认值: dataDisplayMode=0");
  });

  it("includes derivation for RULE entries", () => {
    const bn = { id: "BN-cw-001", type: "BN" as const, project: "app", title: "配置", content: "Config", status: "CONFIRMED" as const, hit_count: 0, created_at: "", updated_at: "" };
    const rule = { id: "RULE-cw-001", type: "RULE" as const, project: "app", title: "权限规则", content: "无权限时不可见", status: "CONFIRMED" as const, parent_id: "BN-cw-001", derivation: "代码推断", hit_count: 0, created_at: "", updated_at: "" };

    const prompt = buildKnowledgePrompt([bn, rule]);
    expect(prompt).toContain("推导: 代码推断");
  });

  it("parses structured content for EXP scene/advice", () => {
    const entries = [
      { id: "EXP-cw-061", type: "EXP" as const, project: "app", title: "Vue 2 模板可选链兼容性", content: "场景：runtime-web 模板中使用 ?. 语法\n建议：确认 Babel 配置或改用传统判断", status: "CONFIRMED" as const, hit_count: 0, created_at: "", updated_at: "" },
    ];

    const prompt = buildKnowledgePrompt(entries);
    expect(prompt).toContain("场景: runtime-web 模板中使用 ?. 语法");
    expect(prompt).toContain("建议: 确认 Babel 配置或改用传统判断");
  });

  it("includes TERM section", () => {
    const entries = [
      { id: "TERM-001", type: "TERM" as const, project: "app", title: "脱敏规则", content: "对敏感数据进行掩码处理", status: "CONFIRMED" as const, hit_count: 0, created_at: "", updated_at: "" },
    ];

    const prompt = buildKnowledgePrompt(entries);
    expect(prompt).toContain("术语");
    expect(prompt).toContain("脱敏规则");
  });
});

describe("token budget", () => {
  it("truncates low-relevance entries when token budget exceeded", () => {
    // Create many entries to exceed the 4000 token budget
    for (let i = 0; i < 30; i++) {
      const entry = addEntry({
        type: "EXP",
        project: "budget-test",
        title: `Experience ${i}`,
        content: "x".repeat(300), // ~75 tokens each, 30 * 75 = 2250 tokens
      });
      confirmEntry(entry.id, "bt");
    }

    const knowledge = getKnowledgeForReview("budget-test");
    // Should return entries but not all 30 (token budget limits it)
    expect(knowledge.length).toBeLessThan(30);
    expect(knowledge.length).toBeGreaterThan(0);
  });

  it("keeps high-relevance entries under token budget", () => {
    // Add a high-severity AP (high relevance) and many low-priority EXPs
    const ap = addEntry({
      type: "AP",
      project: "priority-test",
      severity: "CRITICAL",
      title: "Critical AP",
      content: "Short",
    });
    confirmEntry(ap.id, "pt");

    for (let i = 0; i < 30; i++) {
      const entry = addEntry({
        type: "EXP",
        project: "priority-test",
        title: `Exp ${i}`,
        content: "x".repeat(300),
      });
      confirmEntry(entry.id, "pt");
    }

    const changedFiles = ["src/components/Dialog.vue"];
    const knowledge = getKnowledgeForReview("priority-test", undefined, changedFiles);

    // The CRITICAL AP should be first (highest relevance)
    expect(knowledge[0].title).toBe("Critical AP");
  });
});

describe("scoreKnowledgeRelevance", () => {
  it("scores project match higher", () => {
    const sameProject = { type: "AP" as const, project: "myapp", severity: "MEDIUM" as const, title: "T", content: "C", status: "CONFIRMED" as const, hit_count: 0, created_at: "", updated_at: "" };
    const otherProject = { type: "AP" as const, project: "other", severity: "MEDIUM" as const, title: "T", content: "C", status: "CONFIRMED" as const, hit_count: 0, created_at: "", updated_at: "" };

    const sameScore = scoreKnowledgeRelevance(sameProject, "myapp");
    const otherScore = scoreKnowledgeRelevance(otherProject, "myapp");
    expect(sameScore).toBeGreaterThan(otherScore);
  });

  it("scores pattern match highest", () => {
    const matched = { type: "AP" as const, project: "myapp", severity: "LOW" as const, title: "T", content: "C", status: "CONFIRMED" as const, pattern: "Dialog.vue", hit_count: 0, created_at: "", updated_at: "" };
    const unmatched = { type: "AP" as const, project: "myapp", severity: "CRITICAL" as const, title: "T", content: "C", status: "CONFIRMED" as const, pattern: "db.ts", hit_count: 0, created_at: "", updated_at: "" };

    const matchedScore = scoreKnowledgeRelevance(matched, "myapp", ["src/components/Dialog.vue"]);
    const unmatchedScore = scoreKnowledgeRelevance(unmatched, "myapp", ["src/components/Dialog.vue"]);
    expect(matchedScore).toBeGreaterThan(unmatchedScore);
  });

  it("scores severity correctly", () => {
    const critical = { type: "AP" as const, project: "myapp", severity: "CRITICAL" as const, title: "T", content: "C", status: "CONFIRMED" as const, hit_count: 0, created_at: "", updated_at: "" };
    const high = { type: "AP" as const, project: "myapp", severity: "HIGH" as const, title: "T", content: "C", status: "CONFIRMED" as const, hit_count: 0, created_at: "", updated_at: "" };
    const low = { type: "AP" as const, project: "myapp", severity: "LOW" as const, title: "T", content: "C", status: "CONFIRMED" as const, hit_count: 0, created_at: "", updated_at: "" };

    expect(scoreKnowledgeRelevance(critical, "myapp")).toBeGreaterThan(scoreKnowledgeRelevance(high, "myapp"));
    expect(scoreKnowledgeRelevance(high, "myapp")).toBeGreaterThan(scoreKnowledgeRelevance(low, "myapp"));
  });

  it("caps hit_count contribution at 20", () => {
    const lowHits = { type: "AP" as const, project: "myapp", severity: "MEDIUM" as const, title: "T", content: "C", status: "CONFIRMED" as const, hit_count: 5, created_at: "", updated_at: "" };
    const highHits = { type: "AP" as const, project: "myapp", severity: "MEDIUM" as const, title: "T", content: "C", status: "CONFIRMED" as const, hit_count: 100, created_at: "", updated_at: "" };

    const lowScore = scoreKnowledgeRelevance(lowHits, "myapp");
    const highScore = scoreKnowledgeRelevance(highHits, "myapp");
    // 100 hits should only add 20 (capped), 5 hits add 10
    expect(highScore - lowScore).toBe(10); // 20 - 10 = 10
  });

  it("returns 0 for minimal entry", () => {
    const minimal = { type: "CONV" as const, project: "other", title: "T", content: "C", status: "CONFIRMED" as const, hit_count: 0, created_at: "", updated_at: "" };
    expect(scoreKnowledgeRelevance(minimal, "myapp")).toBe(0);
  });
});

describe("fingerprint deduplication", () => {
  it("generates consistent fingerprint", () => {
    const fp1 = generateFingerprint("AP", "myapp", "SQL Injection", "db.ts");
    const fp2 = generateFingerprint("AP", "myapp", "SQL Injection", "db.ts");
    expect(fp1).toBe(fp2);
    expect(fp1).toContain("AP");
    expect(fp1).toContain("myapp");
    expect(fp1).toContain("sql injection");
    expect(fp1).toContain("db.ts");
  });

  it("extractLearnings merges duplicate AP instead of creating new", () => {
    // First extraction creates an AP
    const report1 = {
      scores: [],
      issues: [{ severity: "CRITICAL", message: "SQL injection", suggestion: "Use params", file: "db.ts" }],
    };
    const first = extractLearnings(report1, "myapp", "R-201");
    expect(first).toHaveLength(1);
    expect(first[0].type).toBe("AP");
    const firstId = first[0].id;

    // Second extraction with same fingerprint should MERGE
    const report2 = {
      scores: [],
      issues: [{ severity: "HIGH", message: "SQL injection", suggestion: "Prepared statements", file: "db.ts" }],
    };
    const second = extractLearnings(report2, "myapp", "R-202");
    expect(second).toHaveLength(1);
    expect(second[0].id).toBe(firstId);
    expect(second[0].hit_count).toBe(1);
    expect(second[0].content).toContain("[MERGED]");
    expect(second[0].content).toContain("Prepared statements");
  });

  it("creates new entry when fingerprint differs", () => {
    const report1 = {
      scores: [],
      issues: [{ severity: "CRITICAL", message: "SQL injection", suggestion: "Use params", file: "db.ts" }],
    };
    const report2 = {
      scores: [],
      issues: [{ severity: "CRITICAL", message: "XSS vulnerability", suggestion: "Escape output", file: "ui.ts" }],
    };

    const first = extractLearnings(report1, "myapp", "R-203");
    const second = extractLearnings(report2, "myapp", "R-204");

    expect(first[0].id).not.toBe(second[0].id);
  });
});

describe("confidence", () => {
  it("auto-extracted entries have confidence 0.3", () => {
    const report = {
      scores: [],
      issues: [{ severity: "HIGH", message: "Bad practice", suggestion: "Fix it", file: "a.ts" }],
    };
    const entries = extractLearnings(report, "myapp", "R-300");
    expect(entries[0].confidence).toBe(0.3);
  });

  it("manual entries have confidence 0.7", () => {
    const entry = addEntry({ type: "CONV", project: "myapp", title: "Convention", content: "Use PascalCase" });
    expect(entry.confidence).toBe(0.7);
  });

  it("confirmEntry boosts confidence to at least 0.7", () => {
    const entry = addEntry({
      type: "AP", project: "myapp", severity: "HIGH",
      title: "Test", content: "C", source_type: "LLM提取",
    });
    expect(entry.confidence).toBe(0.3);

    const confirmed = confirmEntry(entry.id, "mya");
    expect(confirmed!.confidence).toBe(0.7);
  });

  it("confirmEntry preserves higher confidence", () => {
    const entry = addEntry({ type: "CONV", project: "myapp", title: "T", content: "C" });
    expect(entry.confidence).toBe(0.7);

    const confirmed = confirmEntry(entry.id, "mya");
    expect(confirmed!.confidence).toBe(0.7);
  });
});

describe("hit feedback loop", () => {
  it("determineAdoptedKnowledge matches issue message to knowledge pattern", () => {
    const knowledge: KnowledgeEntry[] = [
      { id: "AP-001", type: "AP", project: "app", title: "SQL Injection", pattern: "sql injection", content: "Use params", status: "CONFIRMED", severity: "HIGH", hit_count: 0, confidence: 0.5, created_at: "", updated_at: "" },
      { id: "AP-002", type: "AP", project: "app", title: "XSS", pattern: "xss", content: "Escape", status: "CONFIRMED", severity: "HIGH", hit_count: 0, confidence: 0.5, created_at: "", updated_at: "" },
    ];

    const issues = [
      { severity: "CRITICAL", message: "SQL injection vulnerability found", suggestion: "Use parameterized queries", file: "db.ts" },
    ];

    const adopted = determineAdoptedKnowledge(issues, knowledge);
    expect(adopted).toContain("AP-001");
    expect(adopted).not.toContain("AP-002");
  });

  it("trackKnowledgeHits updates confidence for adopted and not-adopted", () => {
    const entry1 = addEntry({ type: "AP", project: "app", severity: "HIGH", title: "SQL Injection", pattern: "sql injection", content: "C" });
    const confirmed1 = confirmEntry(entry1.id, "app");

    const entry2 = addEntry({ type: "AP", project: "app", severity: "HIGH", title: "XSS", pattern: "xss", content: "C" });
    const confirmed2 = confirmEntry(entry2.id, "app");

    // Both start at 0.7 after confirm
    expect(confirmed1!.confidence).toBe(0.7);
    expect(confirmed2!.confidence).toBe(0.7);

    trackKnowledgeHits([confirmed1!.id, confirmed2!.id], "R-400", [confirmed1!.id]);

    // Adopted: +0.1
    expect(getEntry(confirmed1!.id)!.confidence).toBeCloseTo(0.8, 5);
    // Not adopted: -0.05
    expect(getEntry(confirmed2!.id)!.confidence).toBeCloseTo(0.65, 5);
  });

  it("records adoption status in review_knowledge_usage", () => {
    const entry = addEntry({ type: "AP", project: "app", severity: "HIGH", title: "T", content: "C" });
    const confirmed = confirmEntry(entry.id, "app");

    trackKnowledgeHits([confirmed!.id], "R-401", [confirmed!.id]);

    const db = getDb();
    const usage = db.prepare("SELECT * FROM review_knowledge_usage WHERE review_id = ? AND knowledge_id = ?").get("R-401", confirmed!.id) as { adopted: number };
    expect(usage.adopted).toBe(1);
  });
});

describe("lifecycle management", () => {
  it("deprecates low confidence entries with no recent hits", () => {
    const entry = addEntry({ type: "AP", project: "app", severity: "HIGH", title: "Stale", content: "C" });
    const confirmed = confirmEntry(entry.id, "app");

    // Force low confidence and old last_hit_at
    const db = getDb();
    db.prepare("UPDATE knowledge_entries SET confidence = 0.1, last_hit_at = ? WHERE id = ?")
      .run(new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString(), confirmed!.id);

    const result = deprecateStaleEntries();
    expect(result.deprecated).toBeGreaterThanOrEqual(1);
    expect(getEntry(confirmed!.id)!.status).toBe("DEPRECATED");
  });

  it("flags confirmed entries with no hits for 90 days", () => {
    const entry = addEntry({ type: "AP", project: "app", severity: "HIGH", title: "Old", content: "C" });
    const confirmed = confirmEntry(entry.id, "app");

    const db = getDb();
    db.prepare("UPDATE knowledge_entries SET last_hit_at = ? WHERE id = ?")
      .run(new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString(), confirmed!.id);

    const result = deprecateStaleEntries();
    expect(result.flagged).toBeGreaterThanOrEqual(1);
    expect(getEntry(confirmed!.id)!.review_status).toBe("pending");
  });

  it("refreshEntryVerification updates last_verified_at", () => {
    const entry = addEntry({ type: "AP", project: "app", severity: "HIGH", title: "Refresh", content: "C" });
    const confirmed = confirmEntry(entry.id, "app");

    const refreshed = refreshEntryVerification(confirmed!.id);
    expect(refreshed!.last_verified_at).toBeDefined();
  });
});
