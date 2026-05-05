import { LLMConfig } from "../../shared/types";
import { getProvider } from "./providers";
import { LLMResponse } from "./providers/types";

export { getLLMConfig, saveLLMConfig } from "./config";
export { getReviewPrompt } from "./prompts/review";
export type { LLMResponse } from "./providers/types";

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 5000;

/**
 * Sleep for a given number of milliseconds, with exponential backoff jitter.
 */
function backoff(attempt: number): Promise<void> {
  const delay = BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 1000;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * Check if an error is retryable (429 rate limit or 5xx server error).
 */
function isRetryableError(err: unknown): boolean {
  // Anthropic SDK errors have a .status property
  if (err && typeof err === "object" && "status" in err) {
    const status = (err as { status: unknown }).status;
    if (typeof status === "number") {
      return status === 429 || (status >= 500 && status < 600);
    }
  }
  if (!(err instanceof Error)) return false;
  const msg = err.message;
  // Match HTTP status patterns from providers: "DeepSeek API 429: ...", "API 502: ..."
  return /\b429\b/.test(msg) || /(?:API|HTTP)\s+5[0-9]{2}\b/.test(msg);
}

export async function callLLM(
  system: string,
  user: string,
  config: LLMConfig
): Promise<LLMResponse> {
  const provider = getProvider(config.provider);
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await provider.call(system, user, config);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < MAX_RETRIES && isRetryableError(lastError)) {
        console.warn(`[llm] Retryable error (attempt ${attempt + 1}/${MAX_RETRIES}): ${lastError.message}`);
        await backoff(attempt);
        continue;
      }

      throw lastError;
    }
  }

  // Should not reach here, but satisfy TypeScript
  throw lastError ?? new Error("LLM call failed with no error captured");
}
