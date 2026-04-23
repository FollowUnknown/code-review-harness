import { getDb } from "../db";
import type { LLMLog } from "../../shared/types";

export function saveLLMLog(log: Omit<LLMLog, "created_at">): string {
  const db = getDb();
  db.prepare(`
    INSERT INTO llm_logs (id, review_id, batch_index, risk_level, system_prompt, user_message, response_text, duration_ms, input_tokens, output_tokens, provider, model)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    log.id, log.review_id, log.batch_index, log.risk_level,
    log.system_prompt, log.user_message, log.response_text,
    log.duration_ms, log.input_tokens, log.output_tokens,
    log.provider, log.model
  );
  return log.id;
}

export function getLogsByReviewId(reviewId: string): LLMLog[] {
  const db = getDb();
  return db.prepare(
    "SELECT * FROM llm_logs WHERE review_id = ? ORDER BY batch_index"
  ).all(reviewId) as LLMLog[];
}

export function getLogById(logId: string): LLMLog | null {
  const db = getDb();
  return db.prepare("SELECT * FROM llm_logs WHERE id = ?").get(logId) as LLMLog | null;
}
