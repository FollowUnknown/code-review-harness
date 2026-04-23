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

interface ProgressEvent {
  step: number;
  status: "running" | "done" | "error";
  label: string;
  detail?: string;
  progress?: number;
}

function sendSSE(res: Response, event: ProgressEvent) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

// SSE-based review endpoint
router.post("/review", async (req: Request, res: Response) => {
  const { mrUrl, gitlabHost, gitlabToken, lanhuUrl }: ReviewRequest = req.body;

  // Validate before setting SSE headers so JSON error responses work correctly
  if (!mrUrl) {
    res.status(400).json({ error: "mrUrl is required" });
    return;
  }

  const llmConfig = getLLMConfig();
  if (!llmConfig.apiKey) {
    res.status(500).json({ error: "LLM API key not configured. Use Settings to configure." });
    return;
  }

  // All validations passed — switch to SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  let step = 0;

  const nextStep = (label: string, detail?: string) => {
    step++;
    sendSSE(res, { step, status: "running", label, detail });
  };

  const completeStep = (detail?: string) => {
    sendSSE(res, { step, status: "done", label: "", detail });
  };

  try {
    // Step 1: Parse URL & connect GitLab
    nextStep("Connecting GitLab", `Parsing MR URL...`);
    const parsed = parseMRUrl(mrUrl);
    const host = gitlabHost || parsed.host;
    const token = gitlabToken || process.env.GITLAB_TOKEN;

    if (!token) {
      sendSSE(res, { step, status: "error", label: "GitLab token required" });
      res.end();
      return;
    }
    completeStep();

    // Step 2: Fetch MR data
    nextStep("Fetching MR data", `${host}/${parsed.projectPath} !${parsed.iid}`);
    const [mr, diffs] = await Promise.all([
      fetchMRMeta(host, parsed.projectPath, parsed.iid, token),
      fetchMRDiffs(host, parsed.projectPath, parsed.iid, token),
    ]);
    completeStep(`${diffs.length} files changed`);

    const project = parsed.projectPath.split("/").pop() || parsed.projectPath;

    // Step 3: Classify files
    nextStep("Classifying files", `Analyzing risk levels...`);
    const { summary: classification, batchDiffs } = classify(diffs);
    const batchLevels = classification.batches.map((b) => b.level);
    const levelCounts = Object.entries(classification.stats.byLevel)
      .filter(([, c]) => c > 0)
      .map(([l, c]) => `${l}(${c})`)
      .join(" ");
    completeStep(`S/A/B/C: ${levelCounts}, skipped: ${classification.stats.skipped}`);

    // Step 4: Understand requirement
    nextStep("Understanding requirement", `Analyzing MR context...`);
    const requirement = await understandRequirement(mr, diffs, lanhuUrl);
    completeStep(`${requirement.type} · ${requirement.module}`);

    // Step 5: Load knowledge
    nextStep("Loading knowledge base", `Searching for relevant entries...`);
    const knowledge = getKnowledgeForReview(project, requirement.module);
    completeStep(`${knowledge.length} entries loaded`);

    // Step 6+: Review batches
    const totalBatches = batchDiffs.length;
    let report;

    if (totalBatches === 0) {
      sendSSE(res, { step: step + 1, status: "done", label: "No files to review", detail: "All files skipped" });
      report = {
        contractTitle: "Code Review",
        timestamp: new Date().toISOString(),
        passed: true,
        scores: [],
        issues: [],
        summary: "All files were classified as low-risk and skipped.",
      };
    } else {
      // We'll call reviewBatches manually per batch to send progress
      const { REVIEW_DIMENSIONS, PASS_THRESHOLD } = await import("../../shared/constants");
      const { parseReviewResponse, mergeReports } = await import("../services/reviewer");
      const { buildRequirementPrompt } = await import("../services/requirement");
      const { buildKnowledgePrompt } = await import("../services/knowledge");
      const { callLLM } = await import("../services/llm");

      const reqPrompt = requirement ? buildRequirementPrompt(requirement) : "";
      const knowledgePrompt = knowledge.length > 0 ? buildKnowledgePrompt(knowledge) : "";

      const batchReports = [];

      for (let i = 0; i < batchDiffs.length; i++) {
        const level = batchLevels[i];
        nextStep(
          `Reviewing batch ${i + 1}/${totalBatches}`,
          `Level ${level} · ${llmConfig.provider} · ${llmConfig.model}`
        );

        const diffText = batchDiffs[i]
          .map((d: { old_path: string; new_path: string; diff: string }) => `--- ${d.old_path}\n+++ ${d.new_path}\n${d.diff}`)
          .join("\n\n");

        const levelDesc: Record<string, string> = { S: "高风险", A: "中高风险", B: "中低风险", C: "低风险" };
        const basePrompt = `你是一个专业的代码评审专家。你需要对提供的代码变更进行评审，并按照指定维度打分。

评分维度（每项 1-5 分）：
${REVIEW_DIMENSIONS.map((d: string, idx: number) => `${idx + 1}. ${d}`).join("\n")}

请严格按照以下 JSON 格式输出评审结果，不要输出其他内容：
{
  "scores": [{"dimension": "维度名", "score": 1-5, "comment": "具体说明"}],
  "issues": [{"severity": "CRITICAL/HIGH/MEDIUM/LOW", "message": "问题描述", "file": "文件名", "line": 行号, "suggestion": "修复建议"}],
  "summary": "1-2段总结"
}

当前评审批次：第 ${i + 1}/${totalBatches} 批，风险等级：${levelDesc[level]}。`;

        const systemPrompt = basePrompt + reqPrompt + knowledgePrompt;
        const result = await callLLM(systemPrompt, `请评审以下代码变更：\n\n${diffText}`, llmConfig);
        batchReports.push(parseReviewResponse(result.text));

        sendSSE(res, {
          step,
          status: "done",
          label: "",
          detail: `${batchDiffs[i].length} files reviewed`,
          progress: Math.round(((i + 1) / totalBatches) * 100),
        });
      }

      // Merge reports
      nextStep("Merging results", `${batchReports.length} batches`);
      report = mergeReports(batchReports);
      completeStep();
    }

    // Save review
    const reviewId = `R-${randomUUID().slice(0, 8)}`;
    saveReview({ id: reviewId, mr_url: mrUrl, project, report: JSON.stringify(report) });
    extractLearnings(report, project, reviewId);

    // Send final result
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

    sendSSE(res, { step: step + 1, status: "done", label: "COMPLETE", detail: JSON.stringify(response) });
    res.end();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Review failed";
    // Sanitize: avoid leaking internal details to client
    const safeMessage = message.includes("ENOTFOUND") || message.includes("ECONNREFUSED")
      ? "Failed to connect to external service"
      : message.length > 200 ? message.slice(0, 200) + "..." : message;
    sendSSE(res, { step, status: "error", label: safeMessage });
    res.end();
  }
});

export default router;
