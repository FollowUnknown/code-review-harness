CREATE INDEX IF NOT EXISTS idx_llm_logs_provider_model
ON llm_logs(provider, model);
