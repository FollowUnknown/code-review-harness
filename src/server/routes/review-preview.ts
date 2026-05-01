import { Router, Request, Response } from "express";
import { parseDiffToGitLabDiffs, extractLocalDiff } from "../services/local-scan/git-diff";
import { extractChangedSymbols, classifyFile } from "../services/local-scan/symbol-extractor";
import { analyzeDiffPreview } from "../services/local-scan/diff-preview";
import { getRepoMapping } from "../config/repo-mapping";
import { classify } from "../services/classifier";
import type {
  FilePreviewItem,
  GroupByMode,
  DiffPreviewRequest,
  RiskLevel,
} from "../../shared/types";

const router = Router();

router.post("/preview", async (req: Request, res: Response) => {
  const { project, diffText, sourceBranch, targetBranch }: DiffPreviewRequest = req.body;
  const groupBy = (req.query.groupBy as GroupByMode) || "fileType";

  // Determine diff source
  let rawDiff: string;

  if (diffText) {
    rawDiff = diffText;
  } else if (project && sourceBranch && targetBranch) {
    const mapping = getRepoMapping(project);
    if (!mapping) {
      res.status(404).json({ success: false, error: `No repo mapping found for project: ${project}` });
      return;
    }
    try {
      rawDiff = extractLocalDiff(mapping.localPath, targetBranch, sourceBranch);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Failed to extract diff",
      });
      return;
    }
  } else {
    res.status(400).json({
      success: false,
      error: "Either diffText or project + sourceBranch + targetBranch must be provided",
    });
    return;
  }

  try {
    const diffs = parseDiffToGitLabDiffs(rawDiff);

    if (diffs.length === 0) {
      res.json({
        success: true,
        data: {
          totalFiles: 0,
          skipCount: 0,
          groups: [],
          batchEstimate: 0,
          tokenEstimate: 0,
          triggerThreshold: false,
        },
      });
      return;
    }

    // Classify diffs to get risk levels
    const { summary } = classify(diffs);

    // Build path -> risk level mapping from classification
    const levelMap = new Map<string, RiskLevel>();
    for (const batch of summary.batches) {
      for (const file of batch.files) {
        levelMap.set(file.path, file.level);
      }
    }
    for (const skipped of summary.skipped) {
      levelMap.set(skipped.path, skipped.level);
    }

    // Build preview items
    const items: FilePreviewItem[] = diffs.map((d) => ({
      path: d.new_path,
      newFile: d.new_file,
      deletedFile: d.deleted_file,
      renamedFile: d.renamed_file,
      diffChars: d.diff.length,
      riskLevel: (levelMap.get(d.new_path) as RiskLevel) || "C",
      fileCategory: classifyFile(d.new_path),
      symbols: extractChangedSymbols(d.diff).slice(0, 5),
    }));

    const result = analyzeDiffPreview(items, groupBy);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Preview failed",
    });
  }
});

export default router;
