import { LLMConfig } from "../../shared/types";
import { getProvider } from "./providers";
import { LLMResponse } from "./providers/types";

export { getLLMConfig, saveLLMConfig } from "./config";
export { getReviewPrompt } from "./prompts/review";
export type { LLMResponse } from "./providers/types";

export async function callLLM(
  system: string,
  user: string,
  config: LLMConfig
): Promise<LLMResponse> {
  const provider = getProvider(config.provider);
  return provider.call(system, user, config);
}
