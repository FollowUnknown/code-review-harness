import { Router, Request, Response } from "express";
import { parseMRUrl, fetchMRMeta, fetchMRDiffs } from "../services/gitlab";
import { reviewDiffs } from "../services/reviewer";
import { ReviewRequest, ReviewResponse } from "../../shared/types";

const router = Router();

router.post("/review", async (req: Request, res: Response) => {
  const { mrUrl, gitlabHost, gitlabToken }: ReviewRequest = req.body;

  if (!mrUrl) {
    res.status(400).json({ error: "mrUrl is required" });
    return;
  }

  const authToken = process.env.ANTHROPIC_AUTH_TOKEN;
  const baseUrl = process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com";
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

  if (!authToken) {
    res.status(500).json({ error: "ANTHROPIC_AUTH_TOKEN not configured" });
    return;
  }

  try {
    // Parse MR URL
    const parsed = parseMRUrl(mrUrl);
    const host = gitlabHost || parsed.host;
    const token = gitlabToken || process.env.GITLAB_TOKEN;

    if (!token) {
      res.status(400).json({ error: "GitLab token required (GITLAB_TOKEN or request body)" });
      return;
    }

    // Fetch MR data
    const [mr, diffs] = await Promise.all([
      fetchMRMeta(host, parsed.projectPath, parsed.iid, token),
      fetchMRDiffs(host, parsed.projectPath, parsed.iid, token),
    ]);

    // AI review
    const report = await reviewDiffs(diffs, { authToken, baseUrl, model });

    const response: ReviewResponse = { mr, diffs, report };
    res.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

export default router;
