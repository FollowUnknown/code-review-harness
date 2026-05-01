import { describe, it, expect } from "vitest";
import { extractFileContext, extractVueScript } from "../src/server/services/local-scan/context-extractor";

describe("context-extractor", () => {
  describe("extractVueScript", () => {
    it("extracts script section from Vue SFC", () => {
      const vue = `<template>
  <div class="hello">{{ message }}</div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import UserCard from '@/components/UserCard.vue';

const message = ref('hello');
</script>

<style scoped>
.hello { color: red; }
</style>`;

      const script = extractVueScript(vue);
      expect(script).toContain("import { ref } from 'vue'");
      expect(script).toContain("UserCard");
      expect(script).not.toContain("<template>");
      expect(script).not.toContain("<style");
    });

    it("extracts child component names from template", () => {
      const vue = `<template>
  <UserCard :user="user" />
  <UserAvatar :src="user.avatar" />
</template>

<script setup lang="ts">
const user = { name: 'test' };
</script>`;

      const script = extractVueScript(vue);
      expect(script).toContain("Child components used: UserCard, UserAvatar");
    });

    it("handles Vue file with no script", () => {
      const vue = `<template><div>hello</div></template>`;
      const script = extractVueScript(vue);
      expect(script).toBe("");
    });

    it("handles empty string", () => {
      const script = extractVueScript("");
      expect(script).toBe("");
    });
  });

  describe("extractFileContext", () => {
    it("truncates TS files to maxLines", () => {
      const longContent = Array(500).fill("const x = 1;").join("\n");
      const result = extractFileContext(longContent, "src/utils/helper.ts", { maxLines: 300 });
      expect(result.split("\n").length).toBeLessThanOrEqual(302);
      expect(result).toContain("[truncated, showing first 300 lines]");
    });

    it("does not truncate short files", () => {
      const short = "const x = 1;\nconst y = 2;";
      const result = extractFileContext(short, "src/utils/helper.ts", { maxLines: 300 });
      expect(result).toBe(short);
    });

    it("extracts Vue script instead of full content", () => {
      const vue = `<template><div>{{ msg }}</div></template>\n<script setup lang="ts">const msg = 'hi';</script>`;
      const result = extractFileContext(vue, "src/components/Test.vue", { maxLines: 300 });
      expect(result).toContain("const msg = 'hi'");
      expect(result).not.toContain("<template>");
    });

    it("skips CSS files", () => {
      const css = ".hello { color: red; }";
      const result = extractFileContext(css, "src/style.css", { maxLines: 300 });
      expect(result).toBe("");
    });
  });
});
