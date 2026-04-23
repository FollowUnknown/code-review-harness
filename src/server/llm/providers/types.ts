import { LLMConfig } from "../../../shared/types";

export interface LLMProviderClient {
  call(systemPrompt: string, userMessage: string, config: LLMConfig): Promise<LLMResponse>;
}

export interface LLMResponse {
  text: string;
  usage?: { inputTokens: number; outputTokens: number };
}
