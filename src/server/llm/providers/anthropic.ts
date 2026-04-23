import Anthropic from "@anthropic-ai/sdk";
import { LLMConfig } from "../../../shared/types";
import { LLMProviderClient, LLMResponse } from "./types";

export const anthropicProvider: LLMProviderClient = {
  async call(systemPrompt: string, userMessage: string, config: LLMConfig): Promise<LLMResponse> {
    const client = new Anthropic({ apiKey: config.apiKey, baseURL: config.baseUrl });

    const response = await client.messages.create({
      model: config.model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    return {
      text,
      usage: response.usage
        ? {
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
          }
        : undefined,
    };
  },
};
