import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ReviewResponse, User } from "../shared/types";
import { ReviewForm } from "./components/ReviewForm";
import { ReviewResult } from "./components/ReviewResult";
import { SettingsPanel } from "./components/SettingsPanel";
import { ProgressStepper } from "./components/ProgressStepper";
import { PromptEditor } from "./components/PromptEditor";
import { LoginPage } from "./pages/LoginPage";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3001";

export default function App() {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReviewResponse | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showPrompts, setShowPrompts] = useState(false);
  const [reviewingUrl, setReviewingUrl] = useState<string | null>(null);
  const [lanhuUrl, setLanhuUrl] = useState<string | undefined>(undefined);

  // Check existing auth on mount
  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    if (!token) {
      setAuthChecked(true);
      return;
    }
    fetch(`${API_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error("invalid");
        return r.json();
      })
      .then((user: User) => setAuthUser(user))
      .catch(() => localStorage.removeItem("auth_token"))
      .finally(() => setAuthChecked(true));
  }, []);

  function handleLogin(token: string, user: User) {
    localStorage.setItem("auth_token", token);
    setAuthUser(user);
  }

  function handleLogout() {
    localStorage.removeItem("auth_token");
    setAuthUser(null);
  }

  function handleSubmit(mrUrl: string, lanhu?: string) {
    setLoading(true);
    setError(null);
    setResult(null);
    setReviewingUrl(mrUrl);
    setLanhuUrl(lanhu);
  }

  function handleComplete(data: unknown) {
    setLoading(false);
    setReviewingUrl(null);
    setResult(data as ReviewResponse);
  }

  function handleError(message: string) {
    setLoading(false);
    setReviewingUrl(null);
    setError(message);
  }

  // Auth gate
  if (!authChecked) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-primary)] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!authUser) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex justify-between items-center mb-8"
        >
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
              Story Code Review
            </h1>
            <p className="text-sm text-slate-500 mt-1">AI-powered code review with risk classification</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">{authUser.displayName || authUser.username}</span>
            {authUser.role === "admin" && (
              <span className="text-xs px-1.5 py-0.5 bg-blue-500/10 text-blue-400 rounded">admin</span>
            )}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleLogout}
              className="px-3 py-1.5 text-xs rounded-lg border bg-slate-800/50 border-slate-700/50 text-slate-400 hover:text-white hover:border-slate-600 transition-all"
            >
              Logout
            </motion.button>
            {authUser.role === "admin" && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowPrompts(!showPrompts)}
                className={`px-3 py-1.5 text-xs rounded-lg border transition-all ${
                  showPrompts
                    ? "bg-slate-700 border-slate-600 text-white"
                    : "bg-slate-800/50 border-slate-700/50 text-slate-400 hover:text-white hover:border-slate-600"
                }`}
              >
                Prompts
              </motion.button>
            )}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowSettings(!showSettings)}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-all ${
                showSettings
                  ? "bg-slate-700 border-slate-600 text-white"
                  : "bg-slate-800/50 border-slate-700/50 text-slate-400 hover:text-white hover:border-slate-600"
              }`}
            >
              Settings
            </motion.button>
          </div>
        </motion.div>

        {/* Settings Panel */}
        <AnimatePresence>
          {showSettings && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden mb-6"
            >
              <SettingsPanel onClose={() => setShowSettings(false)} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Prompt Editor (admin only) */}
        <AnimatePresence>
          {showPrompts && authUser.role === "admin" && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden mb-6"
            >
              <PromptEditor onClose={() => setShowPrompts(false)} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Review Form */}
        {!result && !loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <ReviewForm onSubmit={handleSubmit} loading={loading} />
          </motion.div>
        )}

        {/* Progress Stepper */}
        {loading && reviewingUrl && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <ProgressStepper
              mrUrl={reviewingUrl}
              lanhuUrl={lanhuUrl}
              onComplete={handleComplete}
              onError={handleError}
            />
          </motion.div>
        )}

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Result */}
        <AnimatePresence>
          {result && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <ReviewResult data={result} onReset={() => setResult(null)} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
