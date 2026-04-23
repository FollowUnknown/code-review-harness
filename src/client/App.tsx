import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ReviewResponse } from "../shared/types";
import { ReviewForm } from "./components/ReviewForm";
import { ReviewResult } from "./components/ReviewResult";
import { SettingsPanel } from "./components/SettingsPanel";
import { ProgressStepper } from "./components/ProgressStepper";

export default function App() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReviewResponse | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [reviewingUrl, setReviewingUrl] = useState<string | null>(null);
  const [lanhuUrl, setLanhuUrl] = useState<string | undefined>(undefined);

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
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowSettings(!showSettings)}
            className={`px-4 py-2 text-sm rounded-lg border transition-all ${
              showSettings
                ? "bg-slate-700 border-slate-600 text-white"
                : "bg-slate-800/50 border-slate-700/50 text-slate-400 hover:text-white hover:border-slate-600"
            }`}
          >
            Settings
          </motion.button>
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
