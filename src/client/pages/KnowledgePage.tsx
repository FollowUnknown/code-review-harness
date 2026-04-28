import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3001";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("auth_token");
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

// ---------------------------------------------------------------------------
// Local types (mirrors server API shape)
// ---------------------------------------------------------------------------

type KnowledgeType = "AP" | "EXP" | "CONV" | "BN" | "RULE" | "TERM";
type KnowledgeStatus = "TEMP" | "CONFIRMED" | "DEPRECATED";
type ReviewStatus = "pending" | "approved" | "rejected";
type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

interface KnowledgeItem {
  id: string;
  type: KnowledgeType;
  title: string;
  severity: Severity | null;
  project: string;
  module: string | null;
  content: string;
  pattern: string | null;
  impact: string | null;
  fix_suggestion: string | null;
  source_review: string | null;
  source_mr: string | null;
  source_file: string | null;
  parent_id: string | null;
  status: KnowledgeStatus;
  hit_count: number;
  last_hit_at: string | null;
  product_line: string | null;
  engineering: string | null;
  source_story: string | null;
  source_type: string | null;
  review_pass: number | null;
  scope: string | null;
  data_structure: string | null;
  default_value: string | null;
  first_seen_in: string | null;
  derivation: string | null;
  suggested_by: string | null;
  reviewed_by: string | null;
  review_status: ReviewStatus;
  review_comment: string | null;
  created_at: string;
  updated_at: string;
}

interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// Server returns raw grouped array, we aggregate locally
interface KnowledgeStatRow {
  type: KnowledgeType;
  status: KnowledgeStatus;
  project: string;
  count: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TYPE_TABS: { label: string; value: KnowledgeType }[] = [
  { label: "AP", value: "AP" },
  { label: "EXP", value: "EXP" },
  { label: "CONV", value: "CONV" },
  { label: "BN", value: "BN" },
  { label: "RULE", value: "RULE" },
  { label: "TERM", value: "TERM" },
];

const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Badge helpers
// ---------------------------------------------------------------------------

function severityBadge(severity: Severity | null) {
  if (!severity) return <span className="text-slate-600">--</span>;
  const map: Record<Severity, string> = {
    CRITICAL: "bg-red-500/15 text-red-400",
    HIGH: "bg-orange-500/15 text-orange-400",
    MEDIUM: "bg-yellow-500/15 text-yellow-400",
    LOW: "bg-slate-500/15 text-slate-400",
  };
  return (
    <span className={`px-1.5 py-0.5 text-[10px] rounded ${map[severity]}`}>
      {severity}
    </span>
  );
}

function statusBadge(status: KnowledgeStatus) {
  const map: Record<KnowledgeStatus, string> = {
    TEMP: "bg-yellow-500/15 text-yellow-400",
    CONFIRMED: "bg-emerald-500/15 text-emerald-400",
    DEPRECATED: "bg-slate-500/15 text-slate-400",
  };
  return (
    <span className={`px-1.5 py-0.5 text-[10px] rounded ${map[status]}`}>
      {status}
    </span>
  );
}

function reviewStatusBadge(reviewStatus: ReviewStatus | null) {
  if (!reviewStatus || reviewStatus === "approved") return null;
  const map: Record<string, string> = {
    pending: "bg-amber-500/15 text-amber-400",
    rejected: "bg-red-500/15 text-red-400",
  };
  return (
    <span className={`px-1.5 py-0.5 text-[10px] rounded ${map[reviewStatus] || "bg-slate-500/15 text-slate-400"}`}>
      {reviewStatus}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Detail Drawer
// ---------------------------------------------------------------------------

function DetailDrawer({
  item,
  onClose,
  onMutated,
}: {
  item: KnowledgeItem;
  onClose: () => void;
  onMutated: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<KnowledgeItem>({ ...item });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Fields that should never be editable in the drawer
  const READONLY_FIELDS = new Set(["id", "type", "project", "status", "hit_count", "last_hit_at", "created_at", "updated_at", "source_review", "source_mr", "source_file", "parent_id"]);

  // Keep form in sync when item changes externally
  useEffect(() => {
    setForm({ ...item });
    setEditing(false);
  }, [item]);

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`${API_BASE}/api/knowledge/${item.id}`, {
        method: "PUT",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          content: form.content,
          severity: form.severity,
          module: form.module,
          pattern: form.pattern,
          impact: form.impact,
          fix_suggestion: form.fix_suggestion,
          product_line: form.product_line,
          engineering: form.engineering,
          source_story: form.source_story,
          source_type: form.source_type,
          review_pass: form.review_pass,
          scope: form.scope,
          data_structure: form.data_structure,
          default_value: form.default_value,
          first_seen_in: form.first_seen_in,
          derivation: form.derivation,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "save failed");
      }
      setEditing(false);
      onMutated();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function updateField<K extends keyof KnowledgeItem>(key: K, value: KnowledgeItem[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // Field renderer -- editable or read-only
  function field(label: string, key: keyof KnowledgeItem, mono = false) {
    const value = editing ? (form[key] as string | number | null) : (item[key] as string | number | null);
    const display = value == null ? "--" : String(value);
    const isEditable = editing && !READONLY_FIELDS.has(key) && (typeof value === "string" || typeof value === "number");

    return (
      <div className="space-y-1">
        <span className="text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
        {isEditable && typeof value === "number" ? (
          <input
            type="number"
            value={value ?? ""}
            onChange={(e) => updateField(key, (e.target.value === "" ? null : Number(e.target.value)) as KnowledgeItem[typeof key])}
            className="w-full px-2 py-1 text-xs bg-slate-800 border border-slate-700/50 rounded text-slate-300"
          />
        ) : isEditable ? (
          <textarea
            value={value ?? ""}
            onChange={(e) => updateField(key, e.target.value as KnowledgeItem[typeof key])}
            rows={2}
            className={`w-full px-2 py-1 text-xs bg-slate-800 border border-slate-700/50 rounded text-slate-300 resize-y ${mono ? "font-mono" : ""}`}
          />
        ) : (
          <p className={`text-xs text-slate-300 break-words ${mono ? "font-mono" : ""}`}>{display}</p>
        )}
      </div>
    );
  }

  // JSON array field renderer — parses JSON array strings into readable list
  function jsonArrayField(label: string, key: keyof KnowledgeItem) {
    const raw = editing ? (form[key] as string | null) : (item[key] as string | null);
    let items: string[] = [];
    if (raw) {
      try { items = JSON.parse(raw); if (!Array.isArray(items)) items = [raw]; } catch { items = [raw]; }
    }
    const display = items.length > 0 ? items.join(", ") : "--";

    return (
      <div className="space-y-1">
        <span className="text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
        {editing ? (
          <textarea
            value={raw ?? ""}
            onChange={(e) => updateField(key, e.target.value as KnowledgeItem[typeof key])}
            rows={2}
            placeholder="JSON array, e.g. [&quot;file1.vue&quot;, &quot;file2.vue&quot;]"
            className="w-full px-2 py-1 text-xs bg-slate-800 border border-slate-700/50 rounded text-slate-300 font-mono resize-y"
          />
        ) : (
          <div className="text-xs text-slate-300 space-y-0.5">
            {items.length > 0 ? items.map((it, i) => <p key={i} className="font-mono">{it}</p>) : <p>{display}</p>}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
      />
      {/* Drawer */}
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 250 }}
        className="fixed top-0 right-0 z-50 h-full w-[520px] max-w-[90vw] bg-slate-900 border-l border-slate-700/50 shadow-2xl flex flex-col"
      >
        {/* Header */}
        <div className="flex justify-between items-center px-5 py-3 border-b border-slate-700/50 shrink-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-200">
              #{item.id}
            </h3>
            {severityBadge(item.severity)}
            {statusBadge(item.status)}
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300 text-lg leading-none"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Identity section */}
          <div className="grid grid-cols-2 gap-4">
            {field("Title", "title")}
            {field("Type", "type")}
            {field("Project", "project")}
            {field("Module", "module")}
            {field("Product Line", "product_line")}
            {field("Engineering", "engineering")}
          </div>

          {/* Type-specific fields */}
          {item.type === "AP" && (
            <div className="space-y-4">
              {field("Pattern", "pattern", true)}
              {field("Impact", "impact")}
              {field("Fix Suggestion", "fix_suggestion")}
              {field("Scope", "scope")}
              {field("First Seen In", "first_seen_in")}
            </div>
          )}

          {item.type === "BN" && (
            <div className="space-y-4">
              {field("Data Structure", "data_structure", true)}
              {field("Default Value", "default_value")}
            </div>
          )}

          {item.type === "RULE" && (
            <div className="space-y-4">
              {field("Derivation", "derivation")}
              {field("Parent ID", "parent_id")}
            </div>
          )}

          {item.type === "EXP" && (
            <div className="space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-slate-500">Content format hint</span>
              <p className="text-[10px] text-slate-500">Use "场景：..." and "建议：..." lines in content for structured injection into review prompts.</p>
            </div>
          )}

          {item.type === "TERM" && (
            <div className="space-y-4">
              {field("Scope", "scope")}
            </div>
          )}

          {/* Content */}
          <div className="space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-slate-500">Content</span>
            {editing ? (
              <textarea
                value={form.content}
                onChange={(e) => updateField("content", e.target.value as never)}
                rows={8}
                className="w-full px-2 py-1 text-xs bg-slate-800 border border-slate-700/50 rounded text-slate-300 font-mono resize-y"
              />
            ) : (
              <pre className="text-xs text-slate-300 whitespace-pre-wrap break-words font-mono bg-slate-800/40 rounded p-3 max-h-72 overflow-y-auto">
                {item.content}
              </pre>
            )}
          </div>

          {/* Source section */}
          <div className="grid grid-cols-3 gap-4">
            {field("Source Review", "source_review")}
            {jsonArrayField("Source MR", "source_mr")}
            {jsonArrayField("Source File", "source_file")}
          </div>

          {/* Metadata section */}
          <div className="grid grid-cols-3 gap-4">
            {field("Source Story", "source_story")}
            {field("Source Type", "source_type")}
            {field("Review Pass", "review_pass")}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-slate-500">Hit Count</span>
              <p className="text-xs text-slate-300">{item.hit_count}</p>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-slate-500">Last Hit</span>
              <p className="text-xs text-slate-300">
                {item.last_hit_at ? new Date(item.last_hit_at).toLocaleString() : "--"}
              </p>
            </div>
            {item.project && (
              <div className="space-y-1">
                <span className="text-[10px] uppercase tracking-wider text-slate-500">Project</span>
                <p className="text-xs text-slate-300">{item.project}</p>
              </div>
            )}
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-slate-500">Created</span>
              <p className="text-xs text-slate-300">{new Date(item.created_at).toLocaleString()}</p>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-slate-500">Updated</span>
              <p className="text-xs text-slate-300">{new Date(item.updated_at).toLocaleString()}</p>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-700/50 shrink-0">
          <button
            onClick={() => setEditing(!editing)}
            className="px-3 py-1.5 text-xs rounded border border-slate-700/50 text-slate-400 hover:text-white hover:border-slate-600 transition-colors"
          >
            {editing ? "Cancel" : "Edit"}
          </button>
          {editing && (
            <>
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                disabled={saving}
                onClick={handleSave}
                className="px-3 py-1.5 text-xs rounded bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </motion.button>
              {saveError && (
                <span className="text-xs text-red-400">{saveError}</span>
              )}
            </>
          )}
        </div>
      </motion.div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export function KnowledgePage() {
  const [data, setData] = useState<PaginatedResult<KnowledgeItem> | null>(null);
  const [stats, setStats] = useState<KnowledgeStatRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [type, setType] = useState<KnowledgeType>("AP");
  const [statusFilter, setStatusFilter] = useState<KnowledgeStatus | "">("");
  const [projectFilter, setProjectFilter] = useState("");
  const [selected, setSelected] = useState<KnowledgeItem | null>(null);
  const [viewTab, setViewTab] = useState<"browse" | "review" | "suggest">("browse");

  // Review tab state
  const [pendingData, setPendingData] = useState<PaginatedResult<KnowledgeItem> | null>(null);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [pendingPage, setPendingPage] = useState(1);

  // Suggest form state
  const [suggestForm, setSuggestForm] = useState({
    type: "EXP" as KnowledgeType,
    project: "",
    title: "",
    content: "",
    severity: "" as Severity | "",
  });
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [suggestSuccess, setSuggestSuccess] = useState(false);

  // Check if current user is admin
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    if (!token) return;
    fetch(`${API_BASE}/api/auth/me`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((u) => {
        setIsAdmin(u.role === "admin");
        setCurrentUserId(u.id);
      })
      .catch(() => {});
  }, []);

  const fetchData = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({
      type,
      page: String(page),
      pageSize: String(PAGE_SIZE),
    });
    if (statusFilter) params.set("status", statusFilter);
    if (projectFilter) params.set("project", projectFilter);

    fetch(`${API_BASE}/api/knowledge?${params}`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [type, page, statusFilter, projectFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Fetch stats once on mount
  useEffect(() => {
    fetch(`${API_BASE}/api/knowledge/stats`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => setStats(d))
      .catch(() => setStats(null));
  }, []);

  // Fetch pending entries (admin only)
  const fetchPending = useCallback(() => {
    if (!isAdmin) return;
    setPendingLoading(true);
    fetch(`${API_BASE}/api/knowledge/pending?page=${pendingPage}&pageSize=${PAGE_SIZE}`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => setPendingData(d))
      .catch(() => setPendingData(null))
      .finally(() => setPendingLoading(false));
  }, [isAdmin, pendingPage]);

  useEffect(() => {
    if (viewTab === "review") fetchPending();
  }, [viewTab, fetchPending]);

  function switchType(nextType: KnowledgeType) {
    setType(nextType);
    setPage(1);
    setSelected(null);
  }

  // -------------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------------

  async function confirmItem(id: string) {
    try {
      const res = await fetch(`${API_BASE}/api/knowledge/${id}/confirm`, {
        method: "PUT",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "confirm failed"); }
      fetchData();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to confirm");
    }
  }

  async function deprecateItem(id: string) {
    try {
      const res = await fetch(`${API_BASE}/api/knowledge/${id}/deprecate`, {
        method: "PUT",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "deprecate failed"); }
      fetchData();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to deprecate");
    }
  }

  async function deleteItem(id: string) {
    try {
      const res = await fetch(`${API_BASE}/api/knowledge/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "delete failed"); }
      fetchData();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  async function openDetail(id: string) {
    try {
      const res = await fetch(`${API_BASE}/api/knowledge/${id}`, { headers: authHeaders() });
      if (!res.ok) throw new Error("fetch failed");
      const item: KnowledgeItem = await res.json();
      setSelected(item);
    } catch {
      // Non-critical — user can retry by clicking again
    }
  }

  // Review actions (admin)
  async function reviewItem(id: string, action: "approved" | "rejected", comment?: string) {
    try {
      const res = await fetch(`${API_BASE}/api/knowledge/${id}/review`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ action, comment }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "review failed");
      }
      fetchPending();
      fetchData();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to review");
    }
  }

  // Submit suggestion
  async function handleSuggest(e: React.FormEvent) {
    e.preventDefault();
    setSuggesting(true);
    setSuggestError(null);
    setSuggestSuccess(false);
    try {
      const res = await fetch(`${API_BASE}/api/knowledge/`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          type: suggestForm.type,
          project: suggestForm.project,
          title: suggestForm.title,
          content: suggestForm.content,
          severity: suggestForm.severity || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "submit failed");
      }
      setSuggestSuccess(true);
      setSuggestForm({ type: "EXP", project: "", title: "", content: "", severity: "" });
    } catch (e) {
      setSuggestError(e instanceof Error ? e.message : "Failed to submit");
    } finally {
      setSuggesting(false);
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-slate-200">Knowledge Base</h2>
          {stats && (
            <span className="text-[10px] text-slate-500">
              {stats.reduce((sum, s) => sum + s.count, 0)} entries
            </span>
          )}
        </div>

        {/* View tabs */}
        <div className="flex gap-1">
          <button
            onClick={() => setViewTab("browse")}
            className={`px-3 py-1 text-xs rounded border transition-all ${
              viewTab === "browse"
                ? "bg-slate-700 border-slate-600 text-white"
                : "bg-slate-800/50 border-slate-700/50 text-slate-400 hover:text-white hover:border-slate-600"
            }`}
          >
            Browse
          </button>
          <button
            onClick={() => setViewTab("suggest")}
            className={`px-3 py-1 text-xs rounded border transition-all ${
              viewTab === "suggest"
                ? "bg-slate-700 border-slate-600 text-white"
                : "bg-slate-800/50 border-slate-700/50 text-slate-400 hover:text-white hover:border-slate-600"
            }`}
          >
            Suggest
          </button>
          {isAdmin && (
            <button
              onClick={() => setViewTab("review")}
              className={`px-3 py-1 text-xs rounded border transition-all ${
                viewTab === "review"
                  ? "bg-slate-700 border-slate-600 text-white"
                  : "bg-slate-800/50 border-slate-700/50 text-slate-400 hover:text-white hover:border-slate-600"
              }`}
            >
              Review
              {pendingData && pendingData.total > 0 && (
                <span className="ml-1 text-[10px] text-amber-400">{pendingData.total}</span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Suggest tab */}
      {viewTab === "suggest" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-lg">
          <h3 className="text-sm font-medium text-slate-300 mb-3">Submit a Knowledge Suggestion</h3>
          <p className="text-xs text-slate-500 mb-4">Your suggestion will be reviewed by an admin before being added to the knowledge base.</p>

          {suggestSuccess && (
            <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 text-xs">
              Suggestion submitted successfully! It will be reviewed by an admin.
            </div>
          )}

          <form onSubmit={handleSuggest} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <select
                value={suggestForm.type}
                onChange={(e) => setSuggestForm((p) => ({ ...p, type: e.target.value as KnowledgeType }))}
                className="px-3 py-2 text-xs bg-slate-800 border border-slate-700/50 rounded text-slate-400"
              >
                {TYPE_TABS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <select
                value={suggestForm.severity}
                onChange={(e) => setSuggestForm((p) => ({ ...p, severity: e.target.value as Severity | "" }))}
                className="px-3 py-2 text-xs bg-slate-800 border border-slate-700/50 rounded text-slate-400"
              >
                <option value="">No severity</option>
                <option value="CRITICAL">CRITICAL</option>
                <option value="HIGH">HIGH</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="LOW">LOW</option>
              </select>
            </div>
            <input
              type="text"
              placeholder="Project *"
              value={suggestForm.project}
              onChange={(e) => setSuggestForm((p) => ({ ...p, project: e.target.value }))}
              className="w-full px-3 py-2 text-xs bg-slate-800 border border-slate-700/50 rounded text-slate-300 placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
              required
            />
            <input
              type="text"
              placeholder="Title *"
              value={suggestForm.title}
              onChange={(e) => setSuggestForm((p) => ({ ...p, title: e.target.value }))}
              className="w-full px-3 py-2 text-xs bg-slate-800 border border-slate-700/50 rounded text-slate-300 placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
              required
            />
            <textarea
              placeholder="Content *"
              value={suggestForm.content}
              onChange={(e) => setSuggestForm((p) => ({ ...p, content: e.target.value }))}
              rows={6}
              className="w-full px-3 py-2 text-xs bg-slate-800 border border-slate-700/50 rounded text-slate-300 placeholder-slate-600 font-mono resize-y focus:outline-none focus:border-blue-500/50"
              required
            />
            {suggestError && (
              <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{suggestError}</p>
            )}
            <button
              type="submit"
              disabled={suggesting || !suggestForm.project.trim() || !suggestForm.title.trim() || !suggestForm.content.trim()}
              className="px-4 py-2 text-xs font-medium bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white rounded-lg disabled:opacity-50 transition-all"
            >
              {suggesting ? "Submitting..." : "Submit Suggestion"}
            </button>
          </form>
        </motion.div>
      )}

      {/* Review tab (admin only) */}
      {viewTab === "review" && isAdmin && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <h3 className="text-sm font-medium text-slate-300 mb-3">Pending Review</h3>
          {pendingLoading ? (
            <div className="flex justify-center py-12">
              <div className="w-5 h-5 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
            </div>
          ) : !pendingData || pendingData.items.length === 0 ? (
            <p className="text-sm text-slate-600 py-8 text-center">No pending suggestions</p>
          ) : (
            <>
              <div className="rounded-lg border border-slate-700/40 overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-800/50 text-slate-500">
                      <th className="px-3 py-2 text-left">Type</th>
                      <th className="px-3 py-2 text-left">Title</th>
                      <th className="px-3 py-2 text-left">Project</th>
                      <th className="px-3 py-2 text-left">Content</th>
                      <th className="px-3 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingData.items.map((item) => (
                      <tr key={item.id} className="border-t border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                        <td className="px-3 py-2.5">
                          <span className="px-1.5 py-0.5 text-[10px] rounded bg-cyan-500/15 text-cyan-400">{item.type}</span>
                        </td>
                        <td className="px-3 py-2.5 text-slate-300 max-w-[200px] truncate">{item.title}</td>
                        <td className="px-3 py-2.5 text-slate-400">{item.project}</td>
                        <td className="px-3 py-2.5 text-slate-500 max-w-[200px] truncate">{item.content.slice(0, 80)}</td>
                        <td className="px-3 py-2.5 text-right space-x-1">
                          <button
                            onClick={() => reviewItem(item.id, "approved")}
                            className="px-2 py-0.5 text-[10px] rounded border border-emerald-700/50 text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => {
                              const comment = prompt("Rejection reason (optional):");
                              if (comment !== null) reviewItem(item.id, "rejected", comment || undefined);
                            }}
                            className="px-2 py-0.5 text-[10px] rounded border border-red-700/50 text-red-400 hover:bg-red-500/10 transition-colors"
                          >
                            Reject
                          </button>
                          <button
                            onClick={() => openDetail(item.id)}
                            className="px-2 py-0.5 text-[10px] rounded border border-slate-700/50 text-slate-400 hover:bg-slate-500/10 transition-colors"
                          >
                            Detail
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {pendingData.totalPages > 1 && (
                <div className="flex justify-center gap-2 mt-4">
                  <button
                    disabled={pendingPage <= 1}
                    onClick={() => setPendingPage(pendingPage - 1)}
                    className="px-3 py-1 text-xs rounded border border-slate-700/50 text-slate-400 disabled:opacity-30 hover:text-white transition-colors"
                  >
                    Prev
                  </button>
                  <span className="px-3 py-1 text-xs text-slate-500">
                    {pendingPage} / {pendingData.totalPages}
                  </span>
                  <button
                    disabled={pendingPage >= pendingData.totalPages}
                    onClick={() => setPendingPage(pendingPage + 1)}
                    className="px-3 py-1 text-xs rounded border border-slate-700/50 text-slate-400 disabled:opacity-30 hover:text-white transition-colors"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </motion.div>
      )}

      {/* Browse tab */}
      {viewTab === "browse" && (
        <>
          {/* Type tabs */}
          <div className="flex gap-1 mb-4">
            {TYPE_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => switchType(tab.value)}
                className={`px-3 py-1 text-xs rounded border transition-all ${
                  type === tab.value
                    ? "bg-slate-700 border-slate-600 text-white"
                    : "bg-slate-800/50 border-slate-700/50 text-slate-400 hover:text-white hover:border-slate-600"
                }`}
              >
                {tab.label}
                {stats && (() => {
                  const count = stats.filter((s) => s.type === tab.value).reduce((sum, s) => sum + s.count, 0);
                  return count > 0 ? <span className="ml-1 text-[10px] text-slate-500">{count}</span> : null;
                })()}
              </button>
            ))}
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3 mb-4">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as KnowledgeStatus | "");
                setPage(1);
              }}
              className="px-2 py-1 text-xs bg-slate-800 border border-slate-700/50 rounded text-slate-400"
            >
              <option value="">All status</option>
              <option value="TEMP">TEMP</option>
              <option value="CONFIRMED">CONFIRMED</option>
              <option value="DEPRECATED">DEPRECATED</option>
            </select>

            <input
              type="text"
              placeholder="Filter by project..."
              value={projectFilter}
              onChange={(e) => {
                setProjectFilter(e.target.value);
                setPage(1);
              }}
              className="px-2 py-1 text-xs bg-slate-800 border border-slate-700/50 rounded text-slate-300 placeholder-slate-600 w-48"
            />
          </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-5 h-5 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
        </div>
      ) : !data || data.items.length === 0 ? (
        <p className="text-sm text-slate-600 py-8 text-center">No entries found</p>
      ) : (
        <>
          {/* Table */}
          <div className="rounded-lg border border-slate-700/40 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-800/50 text-slate-500">
                  <th className="px-3 py-2 text-left">ID</th>
                  <th className="px-3 py-2 text-left">Title</th>
                  <th className="px-3 py-2 text-center">Severity</th>
                  <th className="px-3 py-2 text-left">Project</th>
                  <th className="px-3 py-2 text-center">Hits</th>
                  <th className="px-3 py-2 text-center">Status</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => openDetail(item.id)}
                    className="border-t border-slate-800/50 hover:bg-slate-800/30 transition-colors cursor-pointer"
                  >
                    <td className="px-3 py-2.5 font-mono text-slate-400">{item.id}</td>
                    <td className="px-3 py-2.5 text-slate-300 max-w-[280px] truncate">
                      {item.title || "--"}
                    </td>
                    <td className="px-3 py-2.5 text-center">{severityBadge(item.severity)}</td>
                    <td className="px-3 py-2.5 text-slate-400">{item.project || "--"}</td>
                    <td className="px-3 py-2.5 text-center text-slate-400">{item.hit_count}</td>
                    <td className="px-3 py-2.5 text-center">
                        <span className="flex items-center justify-center gap-1">
                          {statusBadge(item.status)}
                          {reviewStatusBadge(item.review_status)}
                        </span>
                      </td>
                    <td
                      className="px-3 py-2.5 text-right space-x-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {item.status === "TEMP" && (
                        <>
                          <button
                            onClick={() => confirmItem(item.id)}
                            className="px-2 py-0.5 text-[10px] rounded border border-emerald-700/50 text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => deleteItem(item.id)}
                            className="px-2 py-0.5 text-[10px] rounded border border-red-700/50 text-red-400 hover:bg-red-500/10 transition-colors"
                          >
                            Delete
                          </button>
                        </>
                      )}
                      {item.status === "CONFIRMED" && (
                        <button
                          onClick={() => deprecateItem(item.id)}
                          className="px-2 py-0.5 text-[10px] rounded border border-slate-700/50 text-slate-400 hover:bg-slate-500/10 transition-colors"
                        >
                          Deprecate
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data.totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-4">
              <button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="px-3 py-1 text-xs rounded border border-slate-700/50 text-slate-400 disabled:opacity-30 hover:text-white transition-colors"
              >
                Prev
              </button>
              <span className="px-3 py-1 text-xs text-slate-500">
                {page} / {data.totalPages}
              </span>
              <button
                disabled={page >= data.totalPages}
                onClick={() => setPage(page + 1)}
                className="px-3 py-1 text-xs rounded border border-slate-700/50 text-slate-400 disabled:opacity-30 hover:text-white transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
      </>
      )}

      {/* Detail Drawer */}
      <AnimatePresence>
        {selected && (
          <DetailDrawer
            item={selected}
            onClose={() => setSelected(null)}
            onMutated={() => {
              fetchData();
              // Re-fetch detail if still visible
              openDetail(selected.id);
            }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
