import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { LLMProvider } from "../../shared/types";

const API_BASE = "";

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

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("auth_token");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
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
    fetch(`${API_BASE}/api/llm/settings/llm`, { headers: authHeaders() })
      .then((res) => res.json())
      .then((data) => setConfig(data as LLMConfigDisplay))
      .catch(() => setMessage("Failed to load settings"));
  }, []);

  function handleProviderChange(newProvider: LLMProvider) {
    const oldDefaults = PROVIDER_DEFAULTS[config.provider];
    const newDefaults = PROVIDER_DEFAULTS[newProvider];
    setConfig({
      ...config,
      provider: newProvider,
      model: config.model === oldDefaults.model ? newDefaults.model : config.model,
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

      const res = await fetch(`${API_BASE}/api/llm/settings/llm`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const updated = await res.json();
      setConfig(updated as LLMConfigDisplay);
      setMessage("Saved");
      setTimeout(() => setMessage(null), 2000);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-5 bg-slate-800/60 backdrop-blur-sm rounded-xl border border-slate-700/50">
      <div className="flex justify-between items-center mb-5">
        <h3 className="text-base font-semibold text-slate-200">LLM Configuration</h3>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors text-lg">
          x
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Provider</label>
          <select
            value={config.provider}
            onChange={(e) => handleProviderChange(e.target.value as LLMProvider)}
            className="w-full px-3 py-2.5 text-sm bg-slate-900/50 border border-slate-700/50 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500/50"
          >
            <option value="anthropic">Anthropic</option>
            <option value="deepseek">DeepSeek</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">API Key</label>
          <div className="flex gap-2">
            <input
              type={showKey ? "text" : "password"}
              value={config.apiKey}
              onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
              placeholder="Enter API key"
              className="flex-1 px-3 py-2.5 text-sm bg-slate-900/50 border border-slate-700/50 rounded-lg text-slate-200 placeholder-slate-700 focus:outline-none focus:border-blue-500/50 font-mono"
            />
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowKey(!showKey)}
              className="px-3 py-2 text-xs bg-slate-700/50 border border-slate-700/50 rounded-lg text-slate-400 hover:text-slate-200 hover:border-slate-600 transition-all"
            >
              {showKey ? "Hide" : "Show"}
            </motion.button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Base URL</label>
          <input
            type="text"
            value={config.baseUrl}
            onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
            placeholder={`e.g. ${PROVIDER_DEFAULTS[config.provider].baseUrl}`}
            className="w-full px-3 py-2.5 text-sm bg-slate-900/50 border border-slate-700/50 rounded-lg text-slate-200 placeholder-slate-700 focus:outline-none focus:border-blue-500/50 font-mono"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Model</label>
          <input
            type="text"
            value={config.model}
            onChange={(e) => setConfig({ ...config, model: e.target.value })}
            placeholder={`e.g. ${PROVIDER_DEFAULTS[config.provider].model}`}
            className="w-full px-3 py-2.5 text-sm bg-slate-900/50 border border-slate-700/50 rounded-lg text-slate-200 placeholder-slate-700 focus:outline-none focus:border-blue-500/50 font-mono"
          />
        </div>
      </div>

      {message && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className={`mt-4 text-xs px-3 py-2 rounded-lg ${
            message === "Saved" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
          }`}
        >
          {message}
        </motion.p>
      )}

      <div className="mt-5">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2.5 text-sm font-medium bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-lg disabled:opacity-50 shadow-lg shadow-blue-500/20"
        >
          {saving ? "Saving..." : "Save Configuration"}
        </motion.button>
      </div>
    </div>
  );
}
