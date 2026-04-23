import { Router, Request, Response } from "express";
import { getLLMConfig, saveLLMConfig, getAllSettings } from "../services/settings";
import { LLMConfig } from "../../shared/types";

const router = Router();

// Get current LLM config (mask API key)
router.get("/llm", (_req: Request, res: Response) => {
  const config = getLLMConfig();
  res.json({
    provider: config.provider,
    apiKey: config.apiKey ? `${config.apiKey.slice(0, 4)}****${config.apiKey.slice(-4)}` : "",
    baseUrl: config.baseUrl,
    model: config.model,
  });
});

// Update LLM config
router.put("/llm", (req: Request, res: Response) => {
  const { provider, apiKey, baseUrl, model } = req.body as Partial<LLMConfig>;

  if (provider && !["anthropic", "deepseek"].includes(provider)) {
    res.status(400).json({ error: "Invalid provider. Must be 'anthropic' or 'deepseek'" });
    return;
  }

  // Validate baseUrl is a base URL, not a full endpoint
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

// Get all settings (for debugging)
router.get("/", (_req: Request, res: Response) => {
  const settings = getAllSettings();
  // Mask any API keys
  const masked: Record<string, string> = {};
  for (const [key, value] of Object.entries(settings)) {
    if (key.includes("api_key") || key.includes("token")) {
      masked[key] = value ? `${value.slice(0, 4)}****${value.slice(-4)}` : "";
    } else {
      masked[key] = value;
    }
  }
  res.json(masked);
});

export default router;
