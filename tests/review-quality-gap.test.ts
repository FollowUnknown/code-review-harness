/**
 * Tests for the two fixes from 2026-05-07-review-quality-gap contract:
 *
 * P0: Knowledge injection filtered by techStack (no Vue AP in Java reviews)
 * P1: Root cause analysis dimension criteria rewritten for "symptom vs root cause"
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  addEntry,
  confirmEntry,
  getKnowledgeForReview,
} from "../src/server/services/knowledge";
import { getDb, closeDb } from "../src/server/db";
import { getDimensionCriteria, JAVA_BACKEND_DIMENSIONS } from "../src/server/llm/prompts/defaults";
import { getReviewPrompt } from "../src/server/llm/prompts/review";

process.env.KNOWLEDGE_DB_PATH = ":memory:";

beforeEach(() => {
  closeDb();
  getDb();
});

afterEach(() => {
  closeDb();
});

// ---- P0: TechStack Knowledge Filtering ----

describe("P0: Knowledge injection filters by techStack", () => {
  /**
   * Simulate the real DB scenario:
   * - qiqiao (73 Vue APs), qixi (12 Vue APs), java-backend (8 APs), shared (6 APs)
   * - Java review should only see shared + java-backend
   * - Vue review should see qiqiao + qixi + shared + console-web
   */

  function seedKnowledge() {
    const projects = {
      qiqiao: { count: 5, tech: "vue-frontend" },
      qixi: { count: 3, tech: "vue-frontend" },
      "java-backend": { count: 4, tech: "java-backend" },
      shared: { count: 3, tech: "shared" },
      "do1cloud-qiqiao-console-web": { count: 2, tech: "vue-frontend" },
    };

    const ids: string[] = [];
    for (const [project, config] of Object.entries(projects)) {
      for (let i = 0; i < config.count; i++) {
        const entry = addEntry({
          type: "AP",
          project,
          severity: i === 0 ? "CRITICAL" : "HIGH",
          title: `${project} AP ${i}`,
          content: `${config.tech} anti-pattern ${i}`,
        });
        const confirmed = confirmEntry(entry.id, project.slice(0, 3));
        ids.push(confirmed!.id);
      }
    }
    return ids;
  }

  it("Java review only gets shared + java-backend APs, NOT qiqiao/qixi", () => {
    seedKnowledge();

    const knowledge = getKnowledgeForReview(
      "do1cloud-form",                  // project
      undefined,                         // module
      ["AggsDocumentChangeListener.java"], // changedFiles
      "java-backend"                     // techStack
    );

    const aps = knowledge.filter(e => e.type === "AP");

    // Should contain java-backend and shared APs
    expect(aps.some(e => e.project === "java-backend")).toBe(true);
    expect(aps.some(e => e.project === "shared")).toBe(true);

    // Should NOT contain qiqiao or qixi APs
    expect(aps.every(e => e.project !== "qiqiao")).toBe(true);
    expect(aps.every(e => e.project !== "qixi")).toBe(true);
    expect(aps.every(e => e.project !== "do1cloud-qiqiao-console-web")).toBe(true);
  });

  it("Vue review still gets qiqiao + qixi + shared APs", () => {
    seedKnowledge();

    const knowledge = getKnowledgeForReview(
      "qiqiao",
      undefined,
      ["SomeComponent.vue"],
      "vue-frontend"
    );

    const aps = knowledge.filter(e => e.type === "AP");

    // Should contain vue-frontend project APs
    expect(aps.some(e => e.project === "qiqiao")).toBe(true);
    expect(aps.some(e => e.project === "shared")).toBe(true);

    // Should NOT contain java-backend APs
    expect(aps.every(e => e.project !== "java-backend")).toBe(true);
  });

  it("unknown techStack falls back to loading all (backward compat)", () => {
    seedKnowledge();

    const knowledge = getKnowledgeForReview(
      "some-project",
      undefined,
      ["file.java"],
      "unknown"
    );

    const aps = knowledge.filter(e => e.type === "AP");
    // unknown = no filtering, all projects visible
    expect(aps.length).toBeGreaterThan(0);
  });

  it("mixed techStack only gets shared knowledge in universal layer", () => {
    seedKnowledge();

    const knowledge = getKnowledgeForReview(
      "mixed-project",
      undefined,
      ["file.java", "Component.vue"],
      "mixed"
    );

    const aps = knowledge.filter(e => e.type === "AP");
    // mixed: only shared in universal layer
    expect(aps.every(e => e.project === "shared")).toBe(true);
  });

  it("injects tech-stack specific knowledge via Layer 2b/3b/4b", () => {
    seedKnowledge();

    // Add a java-backend CONV entry
    const conv = addEntry({
      type: "CONV",
      project: "java-backend",
      title: "Use SLF4J",
      content: "Always use SLF4J for logging",
    });
    confirmEntry(conv.id, "jav");

    const knowledge = getKnowledgeForReview(
      "do1cloud-form",
      undefined,
      ["file.java"],
      "java-backend"
    );

    // Should include java-backend CONV via Layer 3b
    expect(knowledge.some(e => e.type === "CONV" && e.project === "java-backend")).toBe(true);
  });
});

// ---- P1: Root Cause Analysis Dimension ----

describe("P1: Root cause analysis dimension criteria", () => {
  it("includes '治标/治本' scoring guidance", () => {
    const criteria = getDimensionCriteria(["根因分析"]);

    // Should contain root cause analysis guidance
    expect(criteria).toContain("根因分析");

    // Should reference "根因" (root cause) vs symptom treatment
    expect(criteria).toContain("根因");
    expect(criteria).toContain("症状处理");

    // Should contain the "治标不治本" detection pattern
    expect(criteria).toContain("治标不治本");
  });

  it("includes detection rules for symptom-only fixes", () => {
    const criteria = getDimensionCriteria(["根因分析"]);

    // Should detect: filtering/skipping in consumer while source still produces bad data
    expect(criteria).toContain("消费端");
    expect(criteria).toContain("源头");

    // Should detect: null check bypassing upstream null return
    expect(criteria).toContain("NPE");

    // Should detect: break/continue skipping bad data without explaining why
    expect(criteria).toContain("continue");
  });

  it("JAVA_BACKEND_DIMENSIONS includes 根因分析", () => {
    expect(JAVA_BACKEND_DIMENSIONS).toContain("根因分析");
  });

  it("system prompt includes the new root cause criteria", () => {
    const prompt = getReviewPrompt({
      dimensions: JAVA_BACKEND_DIMENSIONS,
      batchIndex: 0,
      totalBatches: 1,
      riskLevel: "C",
      requirement: "",
      knowledge: "",
    });

    // The prompt should contain the root cause dimension with symptom-vs-root-cause guidance
    expect(prompt).toContain("根因分析");
    expect(prompt).toContain("症状处理");
    expect(prompt).toContain("治标不治本");
  });

  it("scoring reference: 5=root cause fix, 3=symptom fix with note, 1=wrong direction", () => {
    const criteria = getDimensionCriteria(["根因分析"]);

    // 5分 = root cause fix
    expect(criteria).toMatch(/5分.*根因/);

    // 3分 = symptom fix but documented
    expect(criteria).toMatch(/3分.*症状/);

    // 1分 = wrong direction
    expect(criteria).toMatch(/1分.*错误/);
  });
});
