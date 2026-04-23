import { Router, Request, Response } from "express";
import { randomUUID } from "crypto";
import { parseMRUrl, fetchMRMeta, fetchMRDiffs } from "../services/gitlab";
import { reviewBatches } from "../services/reviewer";
import { classify } from "../services/classifier";
import { understandRequirement } from "../services/requirement";
import { getKnowledgeForReview, saveReview, extractLearnings } from "../services/knowledge";
import { getLLMConfig } from "../services/settings";
import { ReviewRequest, ReviewResponse } from "../../shared/types";

const router = Router();

router.post("/review", async (req: Request, res: Response) => {
  const { mrUrl, gitlabHost, gitlabToken, lanhuUrl }: ReviewRequest = req.body;

  if (!mrUrl) {
    res.status(400).json({ error: "mrUrl is required" });
    return;
  }

  // Read LLM config from DB (with env var fallback)
  const llmConfig = getLLMConfig();

  if (!llmConfig.apiKey) {
    res.status(500).json({ error: "LLM API key not configured. Use Settings to configure." });
    return;
  }

  try {
    const parsed = parseMRUrl(mrUrl);
    const host = gitlabHost || parsed.host;
    const token = gitlabToken || process.env.GITLAB_TOKEN;

    if (!token) {
      res.status(400).json({ error: "GitLab token required (GITLAB_TOKEN or request body)" });
      return;
    }

    const [mr, diffs] = await Promise.all([
      fetchMRMeta(host, parsed.projectPath, parsed.iid, token),
      fetchMRDiffs(host, parsed.projectPath, parsed.iid, token),
    ]);

    const project = parsed.projectPath.split("/").pop() || parsed.projectPath;

    // Understand requirement (Lanhu or MR inference)
    const requirement = await understandRequirement(mr, diffs, lanhuUrl);

    // Load knowledge for this project
    const knowledge = getKnowledgeForReview(project, requirement.module);

    // Classify diffs and create batches
    const { summary: classification, batchDiffs } = classify(diffs);
    const batchLevels = classification.batches.map((b) => b.level);

    // Review each batch with requirement context + knowledge
    const report = await reviewBatches(
      batchDiffs,
      batchLevels,
      llmConfig,
      requirement,
      knowledge
    );

    // Save review and extract learnings
    const reviewId = `R-${randomUUID().slice(0, 8)}`;
    saveReview({
      id: reviewId,
      mr_url: mrUrl,
      project,
      report: JSON.stringify(report),
    });
    extractLearnings(report, project, reviewId);

    // Build response
    const response: ReviewResponse = {
      mr,
      diffs,
      report,
      classification,
      requirement: {
        type: requirement.type,
        module: requirement.module,
        features: requirement.features,
        conflicts: requirement.conflicts,
        source: requirement.source,
        lanhuSummary: requirement.lanhuSummary,
      },
    };
    res.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

export default router;
