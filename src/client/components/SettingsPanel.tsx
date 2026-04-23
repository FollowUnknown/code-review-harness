import { useState, useEffect } from "react";
import { LLMProvider } from "../../shared/types";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3001";

interface LLMConfigDisplay {
  provider: LLMProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
}

interface Props {
  onClose: () => void;
}

const PROVIDER_DEFAULTS: Record<LLMProvider, { baseUrl: string; model: string }> = {
  anthropic: { baseUrl: "https://api.anthropic.com", model: "claude-sonnet-4-6" },
  deepseek: { baseUrl: "https://api.deepseek.com", model: "deepseek-chat" },
};

function isMasked(value: string): boolean {
  return value.includes("****");
}

export function SettingsPanel({ onClose }: Props) {
  const [config, setConfig] = useState<LLMConfigDisplay>({
    provider: "anthropic",
    apiKey: "",
    baseUrl: "",
    model: "",
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/settings/llm`)
      .then((res) => res.json())
      .then((data) => setConfig(data as LLMConfigDisplay))
      .catch(() => setMessage("Failed to load settings"));
  }, []);

  function handleProviderChange(newProvider: LLMProvider) {
    const oldProvider: LLMProvider = config.provider;
    const oldDefaults = PROVIDER_DEFAULTS[oldProvider];
    const newDefaults = PROVIDER_DEFAULTS[newProvider];

    setConfig({
      ...config,
      provider: newProvider,
      // Auto-switch model if it was still the old default
      model: config.model === oldDefaults.model ? newDefaults.model : config.model,
      // Auto-switch baseUrl if it was still the old default
      baseUrl: config.baseUrl === oldDefaults.baseUrl ? newDefaults.baseUrl : config.baseUrl,
    });
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const body: Record<string, string> = {};
      if (config.provider) body.provider = config.provider;
      if (config.apiKey && !isMasked(config.apiKey)) body.apiKey = config.apiKey;
      if (config.baseUrl) body.baseUrl = config.baseUrl;
      if (config.model) body.model = config.model;

      const res = await fetch(`${API_BASE}/api/settings/llm`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const updated = await res.json();
      setConfig(updated as LLMConfigDisplay);
      setMessage("Settings saved");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: 16, border: "1px solid #d0d7de", borderRadius: 8, marginBottom: 16, background: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>LLM Settings</h3>
        <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 18 }}>x</button>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        <div>
          <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Provider</label>
          <select
            value={config.provider}
            onChange={(e) => handleProviderChange(e.target.value as LLMProvider)}
            style={{ width: "100%", padding: "8px 12px", fontSize: 14, border: "1px solid #d0d7de", borderRadius: 6 }}
          >
            <option value="anthropic">Anthropic</option>
            <option value="deepseek">DeepSeek</option>
          </select>
        </div>

        <div>
          <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>API Key</label>
          <div style={{ display: "flex", gap: 4 }}>
            <input
              type={showKey ? "text" : "password"}
              value={config.apiKey}
              onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
              placeholder="Enter API key"
              style={{ flex: 1, padding: "8px 12px", fontSize: 14, border: "1px solid #d0d7de", borderRadius: 6, boxSizing: "border-box" }}
            />
            <button
              onClick={() => setShowKey(!showKey)}
              style={{ padding: "6px 10px", border: "1px solid #d0d7de", borderRadius: 6, background: "#f6f8fa", cursor: "pointer", fontSize: 13 }}
              title={showKey ? "Hide" : "Show"}
            >
              {showKey ? "Hide" : "Show"}
            </button>
          </div>
        </div>

        <div>
          <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Base URL</label>
          <input
            type="text"
            value={config.baseUrl}
            onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
            placeholder={`e.g. ${PROVIDER_DEFAULTS[config.provider].baseUrl} (不含 /chat/completions)`}
            style={{ width: "100%", padding: "8px 12px", fontSize: 14, border: "1px solid #d0d7de", borderRadius: 6, boxSizing: "border-box" }}
          />
        </div>

        <div>
          <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Model</label>
          <input
            type="text"
            value={config.model}
            onChange={(e) => setConfig({ ...config, model: e.target.value })}
            placeholder={PROVIDER_DEFAULTS[config.provider].model}
            style={{ width: "100%", padding: "8px 12px", fontSize: 14, border: "1px solid #d0d7de", borderRadius: 6, boxSizing: "border-box" }}
          />
        </div>
      </div>

      {message && (
        <div style={{ marginTop: 12, padding: "8px 12px", background: message.includes("saved") ? "#dcfce7" : "#fef2f2", borderRadius: 4, fontSize: 13 }}>
          {message}
        </div>
      )}

      <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: "8px 16px",
            fontSize: 14,
            backgroundColor: saving ? "#9ca3af" : "#2563eb",
            color: "white",
            border: "none",
            borderRadius: 6,
            cursor: saving ? "not-allowed" : "pointer",
          }}
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
