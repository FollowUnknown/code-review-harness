import { useState } from "react";
import { ReviewResponse } from "../shared/types";
import { ReviewForm } from "./components/ReviewForm";
import { ReviewResult } from "./components/ReviewResult";
import { SettingsPanel } from "./components/SettingsPanel";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3001";

export default function App() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReviewResponse | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  async function handleSubmit(mrUrl: string, lanhuUrl?: string) {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`${API_BASE}/api/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mrUrl, lanhuUrl }),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || `HTTP ${res.status}`);
      }

      setResult(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>Story Code Review</h1>
        <button
          onClick={() => setShowSettings(!showSettings)}
          style={{
            padding: "6px 14px",
            fontSize: 13,
            background: showSettings ? "#e5e7eb" : "#f3f4f6",
            border: "1px solid #d0d7de",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          {showSettings ? "Close Settings" : "Settings"}
        </button>
      </div>
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
      <ReviewForm onSubmit={handleSubmit} loading={loading} />
      {error && <div style={{ color: "red", marginTop: 16 }}>{error}</div>}
      {result && <ReviewResult data={result} />}
    </div>
  );
}
