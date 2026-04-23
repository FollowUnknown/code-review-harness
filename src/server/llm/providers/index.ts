import { LLMProvider } from "../../../shared/types";
import { LLMProviderClient } from "./types";
import { anthropicProvider } from "./anthropic";
import { deepseekProvider } from "./deepseek";

const providers: Record<LLMProvider, LLMProviderClient> = {
  anthropic: anthropicProvider,
  deepseek: deepseekProvider,
};

export function getProvider(name: LLMProvider): LLMProviderClient {
  return providers[name] || providers.anthropic;
}
