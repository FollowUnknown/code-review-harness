import { Router, Request, Response } from "express";
import { LLMConfig } from "../../shared/types";
import { getLLMConfig, saveLLMConfig } from "./config";
import { callLLM } from "../llm";
import {
  listPromptTemplates,
  getPromptTemplate,
  updatePromptTemplate,
  resetPromptTemplate,
} from "./prompts/review";

const router = Router();

// ---- LLM Config ----

// Get current LLM config (mask API key)
router.get("/settings/llm", (_req: Request, res: Response) => {
  const config = getLLMConfig();
  res.json({
    provider: config.provider,
    apiKey: config.apiKey ? `${config.apiKey.slice(0, 4)}****${config.apiKey.slice(-4)}` : "",
    baseUrl: config.baseUrl,
    model: config.model,
  });
});

// Update LLM config
router.put("/settings/llm", (req: Request, res: Response) => {
  const { provider, apiKey, baseUrl, model } = req.body as Partial<LLMConfig>;

  if (provider && !["anthropic", "deepseek"].includes(provider)) {
    res.status(400).json({ error: "Invalid provider. Must be 'anthropic' or 'deepseek'" });
    return;
  }

  if (baseUrl && /\/chat\/completions\/?$/.test(baseUrl)) {
    res.status(400).json({ error: "Base URL should not include /chat/completions. Use just the domain, e.g. https://api.deepseek.com" });
    return;
  }

  const config = saveLLMConfig({ provider, apiKey, baseUrl, model });
  res.json({
    provider: config.provider,
    apiKey: config.apiKey ? `${config.apiKey.slice(0, 4)}****${config.apiKey.slice(-4)}` : "",
    baseUrl: config.baseUrl,
    model: config.model,
  });
});

// ---- LLM Connectivity Check ----

router.post("/settings/llm/check", async (_req: Request, res: Response) => {
  const config = getLLMConfig();
  if (!config.apiKey) {
    res.json({ ok: false, error: "API key not configured" });
    return;
  }

  try {
    const startTime = Date.now();
    const result = await callLLM(
      "You are a connectivity test. Reply with exactly: OK",
      "ping",
      config
    );
    const latencyMs = Date.now() - startTime;
    const reply = result.text.trim().slice(0, 100);

    res.json({
      ok: true,
      latencyMs,
      model: config.model,
      provider: config.provider,
      reply,
      usage: result.usage,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.json({ ok: false, error: message, provider: config.provider, model: config.model });
  }
});

// ---- Prompt Templates ----

// List all prompts
router.get("/prompts", (_req: Request, res: Response) => {
  res.json(listPromptTemplates());
});

// Get prompt detail
router.get("/prompts/:name", (req: Request<{ name: string }>, res: Response) => {
  const tmpl = getPromptTemplate(req.params.name);
  if (!tmpl) {
    res.status(404).json({ error: "Prompt template not found" });
    return;
  }
  res.json(tmpl);
});

// Update prompt
router.put("/prompts/:name", (req: Request<{ name: string }>, res: Response) => {
  const { systemTemplate, userTemplate, description } = req.body;
  const name = req.params.name;
  const updated = updatePromptTemplate(name, { systemTemplate, userTemplate, description });
  if (!updated) {
    res.status(404).json({ error: "Prompt template not found" });
    return;
  }
  res.json(getPromptTemplate(name));
});

// Reset prompt to default (delete DB override, code default takes over)
router.post("/prompts/:name/reset", (req: Request<{ name: string }>, res: Response) => {
  const name = req.params.name;
  const reset = resetPromptTemplate(name);
  if (!reset) {
    res.status(404).json({ error: "Prompt template not found or not a default" });
    return;
  }
  res.json({ success: true });
});

export default router;
