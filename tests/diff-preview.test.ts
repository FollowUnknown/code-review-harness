import { describe, it, expect } from "vitest";
import {
  groupByFileType,
  groupByDirectory,
  groupByRiskLevel,
  estimateBatchesAndTokens,
  analyzeDiffPreview,
} from "../src/server/services/local-scan/diff-preview";
import type { FilePreviewItem } from "../src/shared/types";

const mockFiles: FilePreviewItem[] = [
  {
    path: "src/components/UserCard.vue",
    newFile: false,
    deletedFile: false,
    renamedFile: false,
    diffChars: 500,
    riskLevel: "A",
    fileCategory: "business",
    symbols: ["user"],
  },
  {
    path: "src/components/UserAvatar.vue",
    newFile: true,
    deletedFile: false,
    renamedFile: false,
    diffChars: 800,
    riskLevel: "S",
    fileCategory: "business",
    symbols: ["avatar"],
  },
  {
    path: "src/utils/helper.ts",
    newFile: false,
    deletedFile: false,
    renamedFile: false,
    diffChars: 200,
    riskLevel: "B",
    fileCategory: "utility",
    symbols: ["format"],
  },
  {
    path: "src/assets/logo.svg",
    newFile: true,
    deletedFile: false,
    renamedFile: false,
    diffChars: 1500,
    riskLevel: "C",
    fileCategory: "config",
    symbols: [],
  },
  {
    path: "src/styles/common.less",
    newFile: false,
    deletedFile: false,
    renamedFile: false,
    diffChars: 300,
    riskLevel: "C",
    fileCategory: "config",
    symbols: [],
  },
  {
    path: ".eslintrc.json",
    newFile: false,
    deletedFile: false,
    renamedFile: false,
    diffChars: 50,
    riskLevel: "C",
    fileCategory: "config",
    symbols: [],
  },
];

describe("diff-preview", () => {
  describe("groupByFileType", () => {
    it("groups files by extension", () => {
      const groups = groupByFileType(mockFiles);

      const vueGroup = groups.find((g) => g.key === "vue");
      expect(vueGroup).toBeDefined();
      expect(vueGroup!.count).toBe(2);
      expect(vueGroup!.newCount).toBe(1);

      const tsGroup = groups.find((g) => g.key === "ts");
      expect(tsGroup).toBeDefined();
      expect(tsGroup!.count).toBe(1);

      const imageGroup = groups.find((g) => g.key === "image");
      expect(imageGroup).toBeDefined();
      expect(imageGroup!.count).toBe(1);

      const styleGroup = groups.find((g) => g.key === "style");
      expect(styleGroup).toBeDefined();
      expect(styleGroup!.count).toBe(1);

      const configGroup = groups.find((g) => g.key === "config");
      expect(configGroup).toBeDefined();
      expect(configGroup!.count).toBe(1);
    });

    it("sorts groups by predefined order", () => {
      const groups = groupByFileType(mockFiles);
      const keys = groups.map((g) => g.key);

      expect(keys.indexOf("vue")).toBeLessThan(keys.indexOf("ts"));
      expect(keys.indexOf("ts")).toBeLessThan(keys.indexOf("style"));
      expect(keys.indexOf("style")).toBeLessThan(keys.indexOf("image"));
      expect(keys.indexOf("image")).toBeLessThan(keys.indexOf("config"));
    });
  });

  describe("groupByDirectory", () => {
    it("groups files by directory path", () => {
      const groups = groupByDirectory(mockFiles);

      const componentsGroup = groups.find((g) => g.key === "src/components");
      expect(componentsGroup).toBeDefined();
      expect(componentsGroup!.count).toBe(2);

      const utilsGroup = groups.find((g) => g.key === "src/utils");
      expect(utilsGroup).toBeDefined();
      expect(utilsGroup!.count).toBe(1);

      const assetsGroup = groups.find((g) => g.key === "src/assets");
      expect(assetsGroup).toBeDefined();
      expect(assetsGroup!.count).toBe(1);

      const stylesGroup = groups.find((g) => g.key === "src/styles");
      expect(stylesGroup).toBeDefined();
      expect(stylesGroup!.count).toBe(1);

      // root-level .eslintrc.json — only 1 segment, so group is "." + filename
      const rootGroup = groups.find((g) => g.key === ".eslintrc.json");
      expect(rootGroup).toBeDefined();
      expect(rootGroup!.count).toBe(1);
    });

    it("sorts groups by count descending", () => {
      const groups = groupByDirectory(mockFiles);

      for (let i = 1; i < groups.length; i++) {
        expect(groups[i - 1].count).toBeGreaterThanOrEqual(groups[i].count);
      }
    });

    it("marks group as suggestedSkip when all files are risk C", () => {
      const groups = groupByDirectory(mockFiles);

      const assetsGroup = groups.find((g) => g.key === "src/assets");
      expect(assetsGroup).toBeDefined();
      expect(assetsGroup!.suggestedSkip).toBe(true);

      const componentsGroup = groups.find((g) => g.key === "src/components");
      expect(componentsGroup!.suggestedSkip).toBe(false);
    });
  });

  describe("groupByRiskLevel", () => {
    it("groups files by risk level", () => {
      const groups = groupByRiskLevel(mockFiles);

      const sGroup = groups.find((g) => g.key === "S");
      expect(sGroup).toBeDefined();
      expect(sGroup!.count).toBe(1);

      const aGroup = groups.find((g) => g.key === "A");
      expect(aGroup).toBeDefined();
      expect(aGroup!.count).toBe(1);

      const bGroup = groups.find((g) => g.key === "B");
      expect(bGroup).toBeDefined();
      expect(bGroup!.count).toBe(1);

      const cGroup = groups.find((g) => g.key === "C");
      expect(cGroup).toBeDefined();
      expect(cGroup!.count).toBe(3);
    });

    it("sorts groups by S, A, B, C order", () => {
      const groups = groupByRiskLevel(mockFiles);
      const keys = groups.map((g) => g.key);

      expect(keys).toEqual(["S", "A", "B", "C"]);
    });

    it("marks C group as suggestedSkip", () => {
      const groups = groupByRiskLevel(mockFiles);

      const cGroup = groups.find((g) => g.key === "C");
      expect(cGroup!.suggestedSkip).toBe(true);

      const sGroup = groups.find((g) => g.key === "S");
      expect(sGroup!.suggestedSkip).toBe(false);
    });
  });

  describe("estimateBatchesAndTokens", () => {
    it("returns reasonable estimates", () => {
      const { batchEstimate, tokenEstimate } = estimateBatchesAndTokens(mockFiles);

      // 6 files / 4 per batch = ceil(1.5) = 2 batches
      expect(batchEstimate).toBe(2);

      // totalDiffChars = 500+800+200+1500+300+50 = 3350
      // tokenEstimate = 2 * 2000 + ceil(3350 / 4) = 4000 + 838 = 4838
      expect(tokenEstimate).toBe(4838);
    });

    it("handles empty file list", () => {
      const { batchEstimate, tokenEstimate } = estimateBatchesAndTokens([]);

      expect(batchEstimate).toBe(0);
      expect(tokenEstimate).toBe(0);
    });
  });

  describe("analyzeDiffPreview", () => {
    it("returns totalFiles=6 and triggerThreshold=false for 6 files", () => {
      const result = analyzeDiffPreview(mockFiles);

      expect(result.totalFiles).toBe(6);
      expect(result.triggerThreshold).toBe(false);
    });

    it("returns triggerThreshold=true for 25 files", () => {
      const manyFiles: FilePreviewItem[] = Array(25)
        .fill(null)
        .map((_, i) => ({
          path: `src/file${i}.ts`,
          newFile: i % 2 === 0,
          deletedFile: false,
          renamedFile: false,
          diffChars: 100,
          riskLevel: "A" as const,
          fileCategory: "business" as const,
          symbols: [],
        }));

      const result = analyzeDiffPreview(manyFiles);

      expect(result.totalFiles).toBe(25);
      expect(result.triggerThreshold).toBe(true);
    });

    it("uses fileType grouping by default", () => {
      const result = analyzeDiffPreview(mockFiles);

      const vueGroup = result.groups.find((g) => g.key === "vue");
      expect(vueGroup).toBeDefined();
    });

    it("supports directory grouping", () => {
      const result = analyzeDiffPreview(mockFiles, "directory");

      const dirGroup = result.groups.find((g) => g.key === "src/components");
      expect(dirGroup).toBeDefined();
    });

    it("supports riskLevel grouping", () => {
      const result = analyzeDiffPreview(mockFiles, "riskLevel");

      const riskGroup = result.groups.find((g) => g.key === "S");
      expect(riskGroup).toBeDefined();
    });

    it("calculates skipCount for risk C and image/style files", () => {
      const result = analyzeDiffPreview(mockFiles);

      // logo.svg (risk C + image), common.less (risk C + style), .eslintrc.json (risk C)
      // skipCount = files where isSkippable: logo.svg, common.less, .eslintrc.json = 3
      expect(result.skipCount).toBe(3);
    });
  });

  describe("suggestedSkip", () => {
    it("marks image and style groups as suggestedSkip=true", () => {
      const groups = groupByFileType(mockFiles);

      const imageGroup = groups.find((g) => g.key === "image");
      expect(imageGroup!.suggestedSkip).toBe(true);

      const styleGroup = groups.find((g) => g.key === "style");
      expect(styleGroup!.suggestedSkip).toBe(true);

      // Non-skip groups
      const vueGroup = groups.find((g) => g.key === "vue");
      expect(vueGroup!.suggestedSkip).toBe(false);

      const tsGroup = groups.find((g) => g.key === "ts");
      expect(tsGroup!.suggestedSkip).toBe(false);
    });
  });
});
