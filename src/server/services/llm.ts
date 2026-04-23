import https from "https";
import http from "http";
import Anthropic from "@anthropic-ai/sdk";
import { LLMConfig } from "../../shared/types";

// ---- Types ----

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMCallResult {
  text: string;
}

// ---- Anthropic Provider ----

function callAnthropic(messages: LLMMessage[], config: LLMConfig): Promise<LLMCallResult> {
  const client = new Anthropic({ apiKey: config.apiKey, baseURL: config.baseUrl });

  // Anthropic separates system from messages
  const systemMsg = messages.find((m) => m.role === "system")?.content || "";
  const userMessages = messages.filter((m) => m.role !== "system").map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  return client.messages.create({
    model: config.model,
    max_tokens: 4096,
    system: systemMsg,
    messages: userMessages,
  }).then((response) => ({
    text: response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join(""),
  }));
}

// ---- DeepSeek / OpenAI-Compatible Provider ----

function callDeepSeek(messages: LLMMessage[], config: LLMConfig): Promise<LLMCallResult> {
  const url = `${config.baseUrl.replace(/\/$/, "")}/chat/completions`;

  const body = JSON.stringify({
    model: config.model,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
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
          "Authorization": `Bearer ${config.apiKey}`,
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const resp = JSON.parse(data);
              const content = resp.choices?.[0]?.message?.content || "";
              resolve({ text: content });
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
}

// ---- Unified API ----

export async function callLLM(
  system: string,
  user: string,
  config: LLMConfig
): Promise<LLMCallResult> {
  const messages: LLMMessage[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  switch (config.provider) {
    case "deepseek":
      return callDeepSeek(messages, config);
    case "anthropic":
    default:
      return callAnthropic(messages, config);
  }
}
