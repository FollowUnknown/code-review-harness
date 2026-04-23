import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getSetting,
  setSetting,
  getAllSettings,
  getLLMConfig,
  saveLLMConfig,
} from "../src/server/services/settings";
import { getDb, closeDb } from "../src/server/db";

// Use in-memory database for tests
process.env.KNOWLEDGE_DB_PATH = ":memory:";

beforeEach(() => {
  closeDb();
  getDb();
});

afterEach(() => {
  closeDb();
});

describe("settings CRUD", () => {
  it("sets and gets a setting", () => {
    setSetting("test_key", "test_value");
    expect(getSetting("test_key")).toBe("test_value");
  });

  it("returns undefined for missing key", () => {
    expect(getSetting("nonexistent")).toBeUndefined();
  });

  it("updates existing setting", () => {
    setSetting("test_key", "v1");
    setSetting("test_key", "v2");
    expect(getSetting("test_key")).toBe("v2");
  });

  it("gets all settings", () => {
    setSetting("a", "1");
    setSetting("b", "2");
    const all = getAllSettings();
    expect(all.a).toBe("1");
    expect(all.b).toBe("2");
  });
});

describe("LLM config", () => {
  it("returns default anthropic config when no settings", () => {
    // Clear env var fallback to test pure defaults
    delete process.env.ANTHROPIC_BASE_URL;
    delete process.env.ANTHROPIC_MODEL;
    delete process.env.ANTHROPIC_AUTH_TOKEN;
    delete process.env.LLM_PROVIDER;

    const config = getLLMConfig();
    expect(config.provider).toBe("anthropic");
    expect(config.baseUrl).toBe("https://api.anthropic.com");
    expect(config.model).toBe("claude-sonnet-4-6");
  });

  it("saves and reads deepseek config", () => {
    const config = saveLLMConfig({
      provider: "deepseek",
      apiKey: "sk-test-deepseek-key",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-chat",
    });

    expect(config.provider).toBe("deepseek");
    expect(config.apiKey).toBe("sk-test-deepseek-key");
    expect(config.baseUrl).toBe("https://api.deepseek.com");
    expect(config.model).toBe("deepseek-chat");
  });

  it("reads config from DB after save", () => {
    saveLLMConfig({
      provider: "deepseek",
      apiKey: "sk-test-123",
    });

    const config = getLLMConfig();
    expect(config.provider).toBe("deepseek");
    expect(config.apiKey).toBe("sk-test-123");
  });

  it("partially updates config", () => {
    saveLLMConfig({ provider: "deepseek", apiKey: "sk-abc", model: "deepseek-chat" });
    saveLLMConfig({ model: "deepseek-reasoner" });

    const config = getLLMConfig();
    expect(config.provider).toBe("deepseek");
    expect(config.apiKey).toBe("sk-abc");
    expect(config.model).toBe("deepseek-reasoner");
  });

  it("falls back to env vars", () => {
    process.env.ANTHROPIC_AUTH_TOKEN = "env-test-key";
    const config = getLLMConfig();
    expect(config.apiKey).toBe("env-test-key");
    delete process.env.ANTHROPIC_AUTH_TOKEN;
  });
});
