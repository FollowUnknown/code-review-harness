import https from "https";
import http from "http";
import { LLMConfig } from "../../../shared/types";
import { LLMProviderClient, LLMResponse } from "./types";

export const deepseekProvider: LLMProviderClient = {
  async call(systemPrompt: string, userMessage: string, config: LLMConfig): Promise<LLMResponse> {
    const url = `${config.baseUrl.replace(/\/$/, "")}/chat/completions`;

    const body = JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      stream: false,
    });

    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const mod = parsed.protocol === "https:" ? https : http;

      const req = mod.request(
        url,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Length": Buffer.byteLength(body),
          },
        },
        (res) => {
          let data = "";
          res.on("data", (chunk: string) => (data += chunk));
          res.on("end", () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              try {
                const resp = JSON.parse(data);
                const content = resp.choices?.[0]?.message?.content || "";
                const usage = resp.usage
                  ? { inputTokens: resp.usage.prompt_tokens || 0, outputTokens: resp.usage.completion_tokens || 0 }
                  : undefined;
                resolve({ text: content, usage });
              } catch {
                reject(new Error(`Failed to parse DeepSeek response: ${data.slice(0, 200)}`));
              }
            } else {
              reject(new Error(`DeepSeek API ${res.statusCode}: ${data.slice(0, 200)}`));
            }
          });
        }
      );

      req.on("error", reject);
      req.setTimeout(60000, () => {
        req.destroy();
        reject(new Error("DeepSeek request timed out"));
      });
      req.write(body);
      req.end();
    });
  },
};
