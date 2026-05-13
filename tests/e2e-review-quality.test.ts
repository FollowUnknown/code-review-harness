/**
 * End-to-end integration test: verify AI review output matches architect's findings.
 *
 * Uses the real LLM (DeepSeek) to review the same diff from MR fixbug-0011278,
 * and asserts that the AI now correctly:
 * 1. Uses Java backend dimensions (not default Vue dimensions)
 * 2. Does NOT inject Vue/frontend knowledge
 * 3. Identifies "symptom vs root cause" pattern (根因分析 ≤ 3)
 * 4. Produces at least one MEDIUM+ issue about root cause
 *
 * Run: npx vitest run tests/e2e-review-quality.test.ts
 */
import { describe, it, expect, beforeAll } from "vitest";
import { getKnowledgeForReview, buildKnowledgePrompt } from "../src/server/services/knowledge";
import { getDimensionsForProject } from "../src/server/services/dimensions";
import { inferTechStack } from "../src/server/services/techstack";
import { callLLM, getLLMConfig } from "../src/server/llm";
import { getReviewPrompt, getReviewUserPrompt } from "../src/server/llm/prompts/review";
import { parseReviewResponse } from "../src/server/services/reviewer";
import { JAVA_BACKEND_DIMENSIONS } from "../src/server/llm/prompts/defaults";
import { getDb, closeDb } from "../src/server/db";

// The actual diff from the MR
const DIFF_TEXT = `--- form-engine/src/main/java/cn/com/do1/do1cloud/bpms/form/engine/impl/listener/AggsDocumentChangeListener.java
+++ form-engine/src/main/java/cn/com/do1/do1cloud/bpms/form/engine/impl/listener/AggsDocumentChangeListener.java
@@ -227,6 +227,13 @@ public class AggsDocumentChangeListener implements EventHandle<AggsDocumentChang

                                 int version = Integer.parseInt(aggsFormDataMap.get("version").toString());
                                 String id = aggsFormDataMap.get("id").toString();
+
+                                // 同一次事务中，正常情况下指标都应该是一致的且只有一条更新数据。
+                                // 但是存在非关联字段的情况后，它可能匹配到重复的指标，出现多条一样id的更新数据。
+                                // 已经更新过，直接跳过
+                                if (isUpdateAggsIds.contains(id)) {
+                                    continue;
+                                }
                                 // 没有在实时统计的更新ID中，说明指标当前指标Id实体表有值要删除
                                 if (!waitToUpdateIds.contains(id)) {
                                     waitToDelIds.add(id);`;

const CHANGED_FILES = [
  "form-engine/src/main/java/cn/com/do1/do1cloud/bpms/form/engine/impl/listener/AggsDocumentChangeListener.java",
];

const PROJECT = "do1cloud-form";

describe("E2E: AI review quality for Java backend code", () => {
  let llmConfig: ReturnType<typeof getLLMConfig>;

  beforeAll(() => {
    closeDb();
    getDb();
    llmConfig = getLLMConfig();

    if (!llmConfig.apiKey) {
      console.warn("No LLM API key configured, skipping E2E test");
    }
  });

  it("step 1: techStack detection returns java-backend", () => {
    const techStack = inferTechStack(CHANGED_FILES);
    expect(techStack).toBe("java-backend");
  });

  it("step 2: dimensions are Java backend (not default Vue)", () => {
    const dimensions = getDimensionsForProject(PROJECT, "java-backend");

    expect(dimensions).toContain("数据结构选择");
    expect(dimensions).toContain("异常处理");
    expect(dimensions).toContain("根因分析");
    expect(dimensions).toHaveLength(9);

    // Should NOT contain default Vue dimensions
    expect(dimensions).not.toContain("Contract 完成度");
    expect(dimensions).not.toContain("TDD 合规");
  });

  it("step 3: knowledge injection filters out Vue/frontend entries", () => {
    const knowledge = getKnowledgeForReview(PROJECT, undefined, CHANGED_FILES, "java-backend");
    const aps = knowledge.filter(e => e.type === "AP");

    // No qiqiao/qixi (Vue projects)
    expect(aps.every(e => e.project !== "qiqiao")).toBe(true);
    expect(aps.every(e => e.project !== "qixi")).toBe(true);

    // Only shared + java-backend + project-level
    const projects = [...new Set(aps.map(e => e.project))];
    console.log("Knowledge projects:", projects);
    console.log("Total knowledge entries:", knowledge.length);
  });

  it("step 4: system prompt contains root cause analysis criteria", () => {
    const dimensions = getDimensionsForProject(PROJECT, "java-backend");
    const prompt = getReviewPrompt({
      dimensions,
      batchIndex: 0,
      totalBatches: 1,
      riskLevel: "C",
      requirement: "",
      knowledge: "",
    });

    expect(prompt).toContain("根因分析");
    expect(prompt).toContain("症状处理");
    expect(prompt).toContain("治标不治本");
    expect(prompt).toContain("源头");
  });

  it("step 5: LLM returns root cause findings matching architect review", async () => {
    if (!llmConfig.apiKey) {
      console.warn("Skipping LLM call - no API key");
      return;
    }

    // Build prompt the same way review-local.ts does
    const techStack = inferTechStack(CHANGED_FILES);
    const dimensions = getDimensionsForProject(PROJECT, techStack);
    const knowledge = getKnowledgeForReview(PROJECT, undefined, CHANGED_FILES, techStack);
    const knowledgePrompt = knowledge.length > 0 ? buildKnowledgePrompt(knowledge) : "";

    const systemPrompt = getReviewPrompt({
      dimensions,
      batchIndex: 0,
      totalBatches: 1,
      riskLevel: "C",
      requirement: "",
      knowledge: knowledgePrompt,
    });

    const userMessage = `${getReviewUserPrompt()}${DIFF_TEXT}`;

    console.log("Calling LLM...");
    console.log("Knowledge entries:", knowledge.length);
    console.log("Dimensions:", dimensions.join(", "));

    const result = await callLLM(systemPrompt, userMessage, llmConfig);
    const report = parseReviewResponse(result.text, dimensions);

    // ---- Core assertion: parseReviewResponse must NOT hit the fallback ----
    // The fallback produces "AI 返回格式异常", which means:
    //   fixUnescapedQuotes failed to recover LLM's unescaped quotes in JSON.
    // See fixbug-0011278 for the fix to fixUnescapedQuotes.
    expect(
      report.issues.every(i => !i.message.includes("AI 返回格式异常"))
    ).toBe(true);
    expect(report.summary).not.toBe("评审结果解析失败");

    console.log("\n=== AI Review Result ===");
    console.log("Passed:", report.passed);
    console.log("\nScores:");
    for (const s of report.scores) {
      console.log(`  ${s.dimension}: ${s.score}/5 — ${s.comment}`);
    }
    console.log("\nIssues:");
    for (const i of report.issues) {
      console.log(`  [${i.severity}] ${i.message}`);
      if (i.suggestion) console.log(`    → ${i.suggestion}`);
    }
    console.log(`\nSummary: ${report.summary}`);

    // ---- Assertions matching architect's review ----

    // 1. Root cause analysis score should be ≤ 3 (not 5 like before the fix)
    const rootCauseScore = report.scores.find(s => s.dimension === "根因分析");
    expect(rootCauseScore).toBeDefined();
    expect(rootCauseScore!.score).toBeLessThanOrEqual(3);
    // Comment should mention symptom/root cause pattern
    expect(
      /消费端|症状|源头|治标|根因|上游|兜底/.test(rootCauseScore!.comment)
    ).toBe(true);

    // 2. At least one issue mentioning root cause / symptom pattern
    const rootCauseIssue = report.issues.find(i =>
      /源头|根因|治本|治标|上游|消费端|兜底|重复数据/.test(i.message)
    );
    expect(rootCauseIssue).toBeDefined();
    expect(rootCauseIssue!.severity).toMatch(/MEDIUM|HIGH/);

    // 3. All scores and issues should be present
    expect(report.scores.length).toBe(9);
    expect(report.issues.length).toBeGreaterThanOrEqual(1);
  }, 120_000);
});
