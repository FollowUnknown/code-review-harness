import https from "https";
import http from "http";
import { LLMConfig } from "../../../shared/types";
import { LLMProviderClient, LLMResponse } from "./types";

/** Idle timeout — if no chunk arrives within this window, abort. */
const IDLE_TIMEOUT_MS = 30_000;

export const deepseekProvider: LLMProviderClient = {
  async call(systemPrompt: string, userMessage: string, config: LLMConfig): Promise<LLMResponse> {
    const url = `${config.baseUrl.replace(/\/$/, "")}/chat/completions`;

    const body = JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      stream: true,
    });

    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const mod = parsed.protocol === "https:" ? https : http;

      let fullContent = "";
      let usage: { inputTokens: number; outputTokens: number } | undefined;
      let settled = false;
      let idleTimer: ReturnType<typeof setTimeout> | undefined;

      const cleanup = () => {
        settled = true;
        if (idleTimer) clearTimeout(idleTimer);
      };

      const resetIdleTimer = () => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          cleanup();
          req.destroy();
          reject(new Error("DeepSeek stream idle timed out (no data for 30s)"));
        }, IDLE_TIMEOUT_MS);
      };

      const req = mod.request(
        url,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.apiKey}`,
          },
        },
        (res) => {
          // Handle non-2xx errors (read full body for error message)
          if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
            let errData = "";
            res.on("data", (chunk: string) => (errData += chunk));
            res.on("end", () => {
              cleanup();
              reject(new Error(`DeepSeek API ${res.statusCode}: ${errData.slice(0, 200)}`));
            });
            return;
          }

          resetIdleTimer();

          let buffer = "";
          res.on("data", (chunk: string) => {
            if (settled) return;
            resetIdleTimer();

            buffer += chunk;
            const lines = buffer.split("\n");
            buffer = lines.pop() || ""; // keep incomplete line

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith("data: ")) continue;
              const data = trimmed.slice(6);

              if (data === "[DONE]") {
                cleanup();
                resolve({ text: fullContent, usage });
                return;
              }

              try {
                const chunk = JSON.parse(data);
                const delta = chunk.choices?.[0]?.delta?.content;
                if (delta) fullContent += delta;
                if (chunk.usage) {
                  usage = {
                    inputTokens: chunk.usage.prompt_tokens || 0,
                    outputTokens: chunk.usage.completion_tokens || 0,
                  };
                }
              } catch {
                // skip unparseable chunks
              }
            }
          });

          res.on("end", () => {
            if (settled) return;
            cleanup();
            // Stream ended without [DONE] — resolve with accumulated content
            if (fullContent) {
              resolve({ text: fullContent, usage });
            } else {
              reject(new Error("DeepSeek stream ended without data"));
            }
          });
        }
      );

      req.on("error", (err) => {
        if (settled) return;
        cleanup();
        reject(err);
      });

      req.write(body);
      req.end();
    });
  },
};
