import { LLMProvider, LLMConfig } from "../../shared/types";
import { getSetting, setSetting } from "../services/settings";

export type { LLMProvider, LLMConfig };

const DEFAULT_CONFIGS: Record<LLMProvider, { baseUrl: string; model: string }> = {
  anthropic: { baseUrl: "https://api.anthropic.com", model: "claude-sonnet-4-6" },
  deepseek: { baseUrl: "https://api.deepseek.com", model: "deepseek-chat" },
};

export function getLLMConfig(): LLMConfig {
  const provider = (getSetting("llm_provider") || process.env.LLM_PROVIDER || "anthropic") as LLMProvider;
  const defaults = DEFAULT_CONFIGS[provider] || DEFAULT_CONFIGS.anthropic;

  const apiKey = getSetting("llm_api_key") ||
    (provider === "deepseek" ? process.env.DEEPSEEK_API_KEY : "") ||
    process.env.ANTHROPIC_AUTH_TOKEN || "";
  const baseUrl = getSetting("llm_base_url") || process.env.ANTHROPIC_BASE_URL || defaults.baseUrl;
  const model = getSetting("llm_model") || process.env.ANTHROPIC_MODEL || defaults.model;

  return { provider, apiKey, baseUrl, model };
}

export function saveLLMConfig(config: Partial<LLMConfig>): LLMConfig {
  if (config.provider) setSetting("llm_provider", config.provider);
  if (config.apiKey) setSetting("llm_api_key", config.apiKey);
  if (config.baseUrl) setSetting("llm_base_url", config.baseUrl);
  if (config.model) setSetting("llm_model", config.model);
  return getLLMConfig();
}
