import { describe, it, expect } from "vitest";
import { understandRequirement, buildRequirementPrompt } from "../src/server/services/requirement";
import { GitLabMRMeta, GitLabDiff } from "../src/shared/types";

function makeMR(overrides: Partial<GitLabMRMeta> = {}): GitLabMRMeta {
  return {
    projectId: 1,
    iid: 1,
    title: "feat: add user profile page",
    author: { name: "dev", avatar_url: "" },
    source_branch: "feature/profile",
    target_branch: "main",
    created_at: "2026-01-01",
    changes_count: "3",
    ...overrides,
  };
}

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

describe("understandRequirement", () => {
  it("infers feat type from MR title", async () => {
    const mr = makeMR({ title: "feat: add payment module" });
    const result = await understandRequirement(mr, []);
    expect(result.type).toBe("feat");
    expect(result.source).toBe("mr_inference");
  });

  it("infers fix type from MR title", async () => {
    const mr = makeMR({ title: "fix: resolve login redirect loop" });
    const result = await understandRequirement(mr, []);
    expect(result.type).toBe("fix");
  });

  it("infers refactor type from MR title", async () => {
    const mr = makeMR({ title: "refactor: clean up auth middleware" });
    const result = await understandRequirement(mr, []);
    expect(result.type).toBe("refactor");
  });

  it("extracts module from file paths", async () => {
    const diffs = [
      makeDiff({ new_path: "src/pages/dashboard/index.vue" }),
      makeDiff({ new_path: "src/pages/dashboard/chart.ts" }),
    ];
    const result = await understandRequirement(makeMR(), diffs);
    expect(result.module).toBe("dashboard");
  });

  it("detects new files in features list", async () => {
    const diffs = [
      makeDiff({ new_path: "src/pages/settings.tsx", new_file: true, diff: "+export default Settings" }),
    ];
    const result = await understandRequirement(makeMR(), diffs);
    expect(result.features).toContain("新增文件: src/pages/settings.tsx");
  });

  it("detects API calls in features list", async () => {
    const diffs = [
      makeDiff({
        new_path: "src/api/users.ts",
        diff: "+fetch('/api/v1/users')\n+axios.get('/api/data')",
      }),
    ];
    const result = await understandRequirement(makeMR(), diffs);
    const apiFeatures = result.features.filter((f) => f.includes("API 调用"));
    expect(apiFeatures.length).toBeGreaterThanOrEqual(1);
  });

  it("detects conflict when docs title has code files", async () => {
    const mr = makeMR({ title: "docs: update documentation" });
    const diffs = [
      makeDiff({ new_path: "src/utils/helper.ts", diff: "+const x = 1;" }),
    ];
    const result = await understandRequirement(mr, diffs);
    expect(result.conflicts).toContain("标题标记为文档变更但包含代码文件修改");
  });

  it("detects conflict when fix title has new components", async () => {
    const mr = makeMR({ title: "fix: resolve issue" });
    const diffs = [
      makeDiff({ new_path: "src/NewWidget.vue", new_file: true, diff: "+<template/>" }),
    ];
    const result = await understandRequirement(mr, diffs);
    expect(result.conflicts).toContain("标题标记为修复但包含新组件文件");
  });

  it("returns unknown type for unrecognized titles", async () => {
    const mr = makeMR({ title: "random commit message" });
    const result = await understandRequirement(mr, []);
    expect(result.type).toBe("unknown");
  });

  it("handles multiple modules in paths", async () => {
    const diffs = [
      makeDiff({ new_path: "src/pages/home/index.vue" }),
      makeDiff({ new_path: "src/pages/about/index.vue" }),
    ];
    const result = await understandRequirement(makeMR(), diffs);
    expect(result.module).toContain("home");
    expect(result.module).toContain("about");
  });
});

describe("buildRequirementPrompt", () => {
  it("builds prompt with requirement info", () => {
    const prompt = buildRequirementPrompt({
      type: "feat",
      module: "payment",
      features: ["新增文件: src/pages/payment.tsx", "API 调用: /api/pay"],
      conflicts: [],
      source: "mr_inference",
    });

    expect(prompt).toContain("新功能");
    expect(prompt).toContain("payment");
    expect(prompt).toContain("新增文件: src/pages/payment.tsx");
    expect(prompt).toContain("需求背景");
  });

  it("includes conflicts in prompt", () => {
    const prompt = buildRequirementPrompt({
      type: "fix",
      module: "auth",
      features: [],
      conflicts: ["标题标记为修复但包含新组件文件"],
      source: "mr_inference",
    });

    expect(prompt).toContain("待确认");
    expect(prompt).toContain("标题标记为修复但包含新组件文件");
  });

  it("includes lanhu summary when present", () => {
    const prompt = buildRequirementPrompt({
      type: "feat",
      module: "profile",
      features: [],
      conflicts: [],
      source: "lanhu",
      lanhuSummary: "用户个人中心页面设计",
    });

    expect(prompt).toContain("设计稿摘要");
    expect(prompt).toContain("用户个人中心页面设计");
  });
});
