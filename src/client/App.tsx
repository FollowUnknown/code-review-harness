import { useState, useEffect, useRef } from "react";
import { Routes, Route, Link, useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ReviewResponse, User } from "../shared/types";
import { ReviewForm } from "./components/ReviewForm";
import { ReviewResult } from "./components/ReviewResult";
import { SettingsPanel } from "./components/SettingsPanel";
import { ProgressStepper } from "./components/ProgressStepper";
import { PromptEditor } from "./components/PromptEditor";
import { LoginPage } from "./pages/LoginPage";
import { ReviewListPage } from "./pages/ReviewListPage";
import { ReviewDetailPage } from "./pages/ReviewDetailPage";
import { PlanListPage } from "./pages/PlanListPage";
import { PlanDetailPage } from "./pages/PlanDetailPage";
import { PlanNewPage } from "./pages/PlanNewPage";
import { KnowledgePage } from "./pages/KnowledgePage";
import { DimensionSetPage } from "./pages/DimensionSetPage";
import { UserManagementPage } from "./pages/UserManagementPage";
import { QualityPage } from "./pages/QualityPage";
import { MemoryPage } from "./pages/MemoryPage";
import { LocalReviewPage } from "./pages/LocalReviewPage";
import { RequirementReviewPage } from "./pages/RequirementReviewPage";
import { ProductLineManagePage } from "./pages/ProductLineManagePage";

const API_BASE = "";

// Reusable nav link with active state
function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  const location = useLocation();
  const isActive = location.pathname === to;
  return (
    <Link
      to={to}
      className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
        isActive
          ? "bg-blue-600/20 border-blue-500/40 text-blue-300"
          : "bg-slate-800/50 border-slate-700/50 text-slate-400 hover:text-white hover:border-slate-600"
      }`}
    >
      {children}
    </Link>
  );
}

// Admin menu link item
function AdminMenuLink({ to, children, onClick }: { to: string; children: React.ReactNode; onClick: () => void }) {
  const location = useLocation();
  const isActive = location.pathname === to;
  return (
    <Link
      to={to}
      onClick={onClick}
      className={`block px-3 py-1.5 text-xs transition-colors ${
        isActive ? "text-blue-400" : "text-slate-400 hover:text-white"
      }`}
    >
      {children}
    </Link>
  );
}

export default function App() {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showPrompts, setShowPrompts] = useState(false);
  const [showAdminMenu, setShowAdminMenu] = useState(false);
  const adminMenuRef = useRef<HTMLDivElement>(null);

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

  // Close admin menu on outside click
  useEffect(() => {
    if (!showAdminMenu) return;
    function handleClick(e: MouseEvent) {
      if (adminMenuRef.current && !adminMenuRef.current.contains(e.target as Node)) {
        setShowAdminMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showAdminMenu]);

  // Auto-refresh token periodically (every 6 days, token expires in 7)
  useEffect(() => {
    if (!authUser) return;
    const interval = setInterval(() => {
      const token = localStorage.getItem("auth_token");
      if (!token) return;
      fetch(`${API_BASE}/api/auth/refresh`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => {
          if (!r.ok) throw new Error("refresh failed");
          return r.json();
        })
        .then((data) => {
          if (data.token) localStorage.setItem("auth_token", data.token);
        })
        .catch(() => {
          // Silent fail — next API call will 401 if token expired
        });
    }, 6 * 24 * 60 * 60 * 1000); // 6 days
    return () => clearInterval(interval);
  }, [authUser]);

  function handleLogin(token: string, user: User) {
    localStorage.setItem("auth_token", token);
    setAuthUser(user);
  }

  function handleLogout() {
    const token = localStorage.getItem("auth_token");
    localStorage.removeItem("auth_token");
    setAuthUser(null);
    // Notify server (fire-and-forget)
    if (token) {
      fetch(`${API_BASE}/api/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
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
          <div className="flex items-center gap-3">
            <Link to="/">
              <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                Story Code Review
              </h1>
            </Link>

            {/* Primary actions */}
            <NavLink to="/reviews">History</NavLink>
            <NavLink to="/local-review">Local</NavLink>
            <NavLink to="/requirement-review">Requirement</NavLink>

            {/* Divider */}
            <div className="w-px h-5 bg-slate-700/60" />

            {/* Data pages */}
            <NavLink to="/plans">Plans</NavLink>
            <NavLink to="/knowledge">Knowledge</NavLink>
            <NavLink to="/quality">Quality</NavLink>
            <NavLink to="/memory">Memory</NavLink>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">{authUser.displayName || authUser.username}</span>
            {authUser.role === "admin" && (
              <span className="text-xs px-1.5 py-0.5 bg-blue-500/10 text-blue-400 rounded">admin</span>
            )}

            {/* Admin dropdown (admin only) */}
            {authUser.role === "admin" && (
              <div className="relative" ref={adminMenuRef}>
                <button
                  onClick={() => setShowAdminMenu(!showAdminMenu)}
                  className={`px-2.5 py-1.5 text-xs rounded-lg border transition-all ${
                    showAdminMenu
                      ? "bg-slate-700 border-slate-600 text-white"
                      : "bg-slate-800/50 border-slate-700/50 text-slate-400 hover:text-white hover:border-slate-600"
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                  </svg>
                </button>
                <AnimatePresence>
                  {showAdminMenu && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="absolute right-0 top-full mt-1 w-40 bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-1 z-50"
                    >
                      <AdminMenuLink to="/product-lines" onClick={() => setShowAdminMenu(false)}>Product Lines</AdminMenuLink>
                      <AdminMenuLink to="/dimensions" onClick={() => setShowAdminMenu(false)}>Dimensions</AdminMenuLink>
                      <AdminMenuLink to="/users" onClick={() => setShowAdminMenu(false)}>Users</AdminMenuLink>
                      <button
                        onClick={() => { setShowPrompts(!showPrompts); setShowAdminMenu(false); }}
                        className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                          showPrompts ? "text-blue-400" : "text-slate-400 hover:text-white"
                        }`}
                      >
                        Prompts
                      </button>
                      <button
                        onClick={() => { setShowSettings(!showSettings); setShowAdminMenu(false); }}
                        className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                          showSettings ? "text-blue-400" : "text-slate-400 hover:text-white"
                        }`}
                      >
                        Settings
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Settings button for non-admin */}
            {authUser.role !== "admin" && (
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
            )}

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleLogout}
              className="px-3 py-1.5 text-xs rounded-lg border bg-slate-800/50 border-slate-700/50 text-slate-400 hover:text-white hover:border-slate-600 transition-all"
            >
              Logout
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

        {/* Routes */}
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/reviews" element={<ReviewListPage />} />
          <Route path="/reviews/:id" element={<ReviewDetailPage />} />
          <Route path="/plans" element={<PlanListPage />} />
          <Route path="/plans/new" element={<PlanNewPage />} />
          <Route path="/plans/:id" element={<PlanDetailPage />} />
          <Route path="/knowledge" element={<KnowledgePage />} />
          <Route path="/dimensions" element={<DimensionSetPage />} />
          <Route path="/users" element={<UserManagementPage currentUser={authUser} />} />
          <Route path="/quality" element={<QualityPage />} />
          <Route path="/memory" element={<MemoryPage />} />
          <Route path="/local-review" element={<LocalReviewPage />} />
          <Route path="/requirement-review" element={<RequirementReviewPage />} />
          <Route path="/product-lines" element={<ProductLineManagePage />} />
        </Routes>
      </div>
    </div>
  );
}

function HomePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReviewResponse | null>(null);
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
    const response = data as ReviewResponse;
    setResult(response);
    // Navigate to detail page if reviewId available
    if (response.reviewId) {
      navigate(`/reviews/${response.reviewId}`);
    }
  }

  function handleError(message: string) {
    setLoading(false);
    setReviewingUrl(null);
    setError(message);
  }

  return (
    <>
      {!result && !loading && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <ReviewForm onSubmit={handleSubmit} loading={loading} />
        </motion.div>
      )}

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

      <AnimatePresence>
        {result && !result.reviewId && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <ReviewResult data={result} onReset={() => setResult(null)} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
