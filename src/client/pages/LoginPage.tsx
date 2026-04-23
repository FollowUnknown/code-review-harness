import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { User } from "../../shared/types";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3001";

interface Props {
  onLogin: (token: string, user: User) => void;
}

export function LoginPage({ onLogin }: Props) {
  const [mode, setMode] = useState<"checking" | "setup" | "login">("checking");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/auth/status`)
      .then((r) => r.json())
      .then((data) => setMode(data.needsSetup ? "setup" : "login"))
      .catch(() => setMode("login"));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const endpoint = mode === "setup" ? "/api/auth/setup" : "/api/auth/login";
      const body =
        mode === "setup"
          ? { username, password, displayName: displayName || undefined }
          : { username, password };

      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `Error ${res.status}`);
        return;
      }

      localStorage.setItem("auth_token", data.token);
      onLogin(data.token, data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setLoading(false);
    }
  }

  if (mode === "checking") {
    return (
      <div className="min-h-screen bg-[var(--color-bg-primary)] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm bg-slate-800/60 backdrop-blur-sm rounded-xl border border-slate-700/50 p-8"
      >
        <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent mb-1">
          Story Code Review
        </h1>
        <p className="text-sm text-slate-500 mb-6">
          {mode === "setup" ? "Create admin account to get started" : "Sign in to continue"}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full px-4 py-2.5 text-sm bg-slate-800/50 border border-slate-700/50 rounded-lg text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500/50 transition-all"
            autoFocus
          />

          {mode === "setup" && (
            <input
              type="text"
              placeholder="Display name (optional)"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-4 py-2.5 text-sm bg-slate-800/50 border border-slate-700/50 rounded-lg text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500/50 transition-all"
            />
          )}

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-2.5 text-sm bg-slate-800/50 border border-slate-700/50 rounded-lg text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500/50 transition-all"
          />

          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            type="submit"
            disabled={loading || !username.trim() || !password.trim()}
            className="w-full px-4 py-2.5 text-sm font-medium bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-500/20"
          >
            {loading ? "..." : mode === "setup" ? "Create Admin" : "Sign In"}
          </motion.button>
        </form>
      </motion.div>
    </div>
  );
}
