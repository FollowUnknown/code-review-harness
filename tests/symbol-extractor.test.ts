import { describe, it, expect } from "vitest";
import { extractChangedSymbols, classifyFile } from "../src/server/services/local-scan/symbol-extractor";

describe("symbol-extractor", () => {
  describe("extractChangedSymbols", () => {
    it("extracts function names from diff", () => {
      const diff = `+export function calculateScore(dim: Dimension[]): number {
-  export function calculateScore(scores: number[]): number {`;
      const symbols = extractChangedSymbols(diff);
      expect(symbols).toContain("calculateScore");
    });

    it("extracts variable names from diff", () => {
      const diff = `+const MAX_RETRIES = 3;
-const MAX_RETRIES = 5;`;
      const symbols = extractChangedSymbols(diff);
      expect(symbols).toContain("MAX_RETRIES");
    });

    it("extracts interface names from diff", () => {
      const diff = `+interface UserConfig {`;
      const symbols = extractChangedSymbols(diff);
      expect(symbols).toContain("UserConfig");
    });

    it("extracts class names from diff", () => {
      const diff = `+export class UserService {`;
      const symbols = extractChangedSymbols(diff);
      expect(symbols).toContain("UserService");
    });

    it("deduplicates symbols", () => {
      const diff = `+function hello() {}
+function hello2() { hello() }`;
      const symbols = extractChangedSymbols(diff);
      const unique = [...new Set(symbols)];
      expect(symbols.length).toBe(unique.length);
    });

    it("returns empty for context lines", () => {
      const diff = ` unchanged line
 another line`;
      const symbols = extractChangedSymbols(diff);
      expect(symbols).toEqual([]);
    });
  });

  describe("classifyFile", () => {
    it("classifies utility files", () => {
      expect(classifyFile("src/utils/format.ts")).toBe("utility");
      expect(classifyFile("src/helpers/common.js")).toBe("utility");
      expect(classifyFile("lib/crypto.ts")).toBe("utility");
    });

    it("classifies business files", () => {
      expect(classifyFile("src/services/order.ts")).toBe("business");
      expect(classifyFile("src/components/UserCard.vue")).toBe("business");
      expect(classifyFile("src/pages/Dashboard.vue")).toBe("business");
    });

    it("classifies entry files", () => {
      expect(classifyFile("src/routes/review.ts")).toBe("entry");
      expect(classifyFile("src/index.ts")).toBe("entry");
      expect(classifyFile("src/app.ts")).toBe("entry");
    });

    it("classifies config files", () => {
      expect(classifyFile(".eslintrc.json")).toBe("config");
      expect(classifyFile("tsconfig.json")).toBe("config");
    });
  });
});
