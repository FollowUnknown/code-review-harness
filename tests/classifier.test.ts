import { describe, it, expect } from "vitest";
import { classify } from "../src/server/services/classifier";
import { GitLabDiff } from "../src/shared/types";

function makeDiff(overrides: Partial<GitLabDiff> & { new_path: string }): GitLabDiff {
  return {
    old_path: overrides.old_path ?? overrides.new_path,
    new_path: overrides.new_path,
    new_file: overrides.new_file ?? false,
    deleted_file: overrides.deleted_file ?? false,
    renamed_file: overrides.renamed_file ?? false,
    diff: overrides.diff ?? "",
  };
}

describe("classify", () => {
  it("classifies a new Vue component as S level", () => {
    const diff = makeDiff({
      new_path: "src/components/UserProfile.vue",
      new_file: true,
      diff: "+<template>\n+  <div>User</div>\n+</template>".repeat(5),
    });

    const { summary } = classify([diff]);
    expect(summary.stats.total).toBe(1);
    expect(summary.stats.byLevel.S).toBe(1);
    expect(summary.batches).toHaveLength(1);
    expect(summary.batches[0].level).toBe("S");
    expect(summary.batches[0].files[0].riskFlags).toContain("NEW_COMPONENT");
  });

  it("classifies a core business file as S level", () => {
    const diff = makeDiff({
      new_path: "src/pages/payment/Checkout.vue",
      diff: Array(50).fill("+const x = 1").join("\n"),
    });

    const { summary } = classify([diff]);
    expect(summary.stats.byLevel.S).toBe(1);
    expect(summary.batches[0].files[0].riskFlags).toContain("CORE_BUSINESS_FILE");
  });

  it("classifies large diff (>120 lines) as S level", () => {
    const diff = makeDiff({
      new_path: "src/utils/helper.ts",
      diff: Array(130).fill("+const line = 'data';").join("\n"),
    });

    const { summary } = classify([diff]);
    expect(summary.stats.byLevel.S).toBe(1);
  });

  it("classifies medium diff (>50 lines) as A level", () => {
    const diff = makeDiff({
      new_path: "src/utils/format.ts",
      diff: Array(60).fill("+const x = 1;").join("\n"),
    });

    const { summary } = classify([diff]);
    expect(summary.stats.byLevel.A).toBe(1);
    expect(summary.batches[0].files[0].reviewMode).toBe("standard");
  });

  it("classifies 10-50 line diff as B level", () => {
    const diff = makeDiff({
      new_path: "src/styles/theme.css",
      diff: Array(20).fill("+.class { color: red; }").join("\n"),
    });

    const { summary } = classify([diff]);
    expect(summary.stats.byLevel.B).toBe(1);
    expect(summary.batches[0].files[0].reviewMode).toBe("diff_plus_self");
  });

  it("classifies small diff (<10 lines) as C level", () => {
    const diff = makeDiff({
      new_path: "src/styles/margin.css",
      diff: "+.margin { margin: 8px; }",
    });

    const { summary } = classify([diff]);
    expect(summary.stats.byLevel.C).toBe(1);
    expect(summary.batches[0].files[0].reviewMode).toBe("diff_only");
  });

  it("skips pure markdown files", () => {
    const diff = makeDiff({
      new_path: "docs/README.md",
      diff: "+# Title\n+Some content here",
    });

    const { summary } = classify([diff]);
    expect(summary.stats.skipped).toBe(1);
    expect(summary.skipped).toHaveLength(1);
    expect(summary.skipped[0].skipReason).toBe("PURE_DOCUMENTATION");
    expect(summary.batches).toHaveLength(0);
  });

  it("skips build config files", () => {
    const diff = makeDiff({
      new_path: "vite.config.ts",
      diff: "+export default { plugins: [] }",
    });

    const { summary } = classify([diff]);
    expect(summary.stats.skipped).toBe(1);
    expect(summary.skipped[0].skipReason).toBe("BUILD_CONFIG");
  });

  it("skips .gitignore", () => {
    const diff = makeDiff({
      new_path: ".gitignore",
      diff: "+node_modules\n+dist",
    });

    const { summary } = classify([diff]);
    expect(summary.stats.skipped).toBe(1);
    expect(summary.skipped[0].skipReason).toBe("GITIGNORE");
  });

  it("upgrades C to B when risk flags present", () => {
    const diff = makeDiff({
      new_path: "src/api/client.ts",
      diff: "+fetch('/api/data');",
    });

    const { summary } = classify([diff]);
    expect(summary.batches[0].files[0].riskFlags).toContain("REQUEST_URL_CHANGED");
    expect(summary.batches[0].files[0].level).not.toBe("C");
  });

  it("upgrades A to S when auth-related risk flags present", () => {
    const diff = makeDiff({
      new_path: "src/middleware/auth.ts",
      diff: Array(55).fill("+// auth code").join("\n") + "\n+const token = Authorization;",
    });

    const { summary } = classify([diff]);
    const file = summary.batches[0].files[0];
    expect(file.riskFlags).toContain("AUTH_HEADER_CHANGED");
    expect(file.level).toBe("S");
  });

  it("detects env var changes as risk flag", () => {
    const diff = makeDiff({
      new_path: "src/config/env.ts",
      diff: "+const apiKey = process.env.API_KEY;",
    });

    const { summary } = classify([diff]);
    expect(summary.batches[0].files[0].riskFlags).toContain("ENV_VAR_CHANGED");
  });

  it("creates multiple batches for many files", () => {
    const diffs = Array(8).fill(null).map((_, i) =>
      makeDiff({
        new_path: `src/utils/file${i}.ts`,
        diff: Array(5).fill(`+const x${i} = ${i};`).join("\n"),
      })
    );

    const { summary } = classify(diffs);
    expect(summary.stats.total).toBe(8);
    expect(summary.batches.length).toBeGreaterThanOrEqual(2);
  });

  it("produces correct batch diff arrays", () => {
    const diff1 = makeDiff({ new_path: "src/a.ts", diff: "+const a = 1;" });
    const diff2 = makeDiff({ new_path: "src/b.ts", diff: "+const b = 2;" });

    const { summary, batchDiffs } = classify([diff1, diff2]);
    expect(batchDiffs.length).toBe(summary.batches.length);
    expect(batchDiffs.flat()).toHaveLength(2);
  });

  it("handles empty input", () => {
    const { summary } = classify([]);
    expect(summary.stats.total).toBe(0);
    expect(summary.batches).toHaveLength(0);
    expect(summary.skipped).toHaveLength(0);
  });

  it("skips pure comment/whitespace changes", () => {
    const diff = makeDiff({
      new_path: "src/code.ts",
      diff: "+// just a comment\n+\n+   ",
    });

    const { summary } = classify([diff]);
    expect(summary.stats.skipped).toBe(1);
    expect(summary.skipped[0].skipReason).toBe("PURE_COMMENT_WHITESPACE");
  });

  it("classifies API route files as A level", () => {
    const diff = makeDiff({
      new_path: "src/api/data.ts",
      diff: Array(30).fill("+// handler logic").join("\n"),
    });

    const { summary } = classify([diff]);
    expect(summary.stats.byLevel.A).toBe(1);
  });
});
