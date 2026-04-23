import { useState } from "react";
import { ReviewResponse } from "../shared/types";
import { ReviewForm } from "./components/ReviewForm";
import { ReviewResult } from "./components/ReviewResult";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3001";

export default function App() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReviewResponse | null>(null);

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
      <h1>Story Code Review</h1>
      <ReviewForm onSubmit={handleSubmit} loading={loading} />
      {error && <div style={{ color: "red", marginTop: 16 }}>{error}</div>}
      {result && <ReviewResult data={result} />}
    </div>
  );
}
