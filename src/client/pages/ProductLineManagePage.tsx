import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ProductLine, RepoMapping, TechStack } from "../../shared/types";

const API_BASE = "";

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

function authHeaders(json = false): Record<string, string> {
  const t = localStorage.getItem("auth_token");
  const h: Record<string, string> = {};
  if (t) h["Authorization"] = `Bearer ${t}`;
  if (json) h["Content-Type"] = "application/json";
  return h;
}

// ---------------------------------------------------------------------------
// Local types
// ---------------------------------------------------------------------------

interface ProductLineWithProjects extends ProductLine {
  projects: RepoMapping[];
}

interface DependencyRow {
  id: number;
  upstreamProject: string;
  downstreamProject: string;
  depType: string;
  depDetails: string | null;
  source: string;
  createdAt: string;
}

interface CreateForm {
  id: string;
  name: string;
  description: string;
}

const EMPTY_CREATE: CreateForm = { id: "", name: "", description: "" };

// ---------------------------------------------------------------------------
// Badge helpers
// ---------------------------------------------------------------------------

function techStackBadge(stack: TechStack) {
  const colors: Record<TechStack, string> = {
    "java-backend": "bg-blue-500/15 text-blue-400",
    "vue-frontend": "bg-emerald-500/15 text-emerald-400",
    mixed: "bg-purple-500/15 text-purple-400",
    unknown: "bg-slate-600/30 text-slate-500",
  };
  return (
    <span className={`px-1.5 py-0.5 text-[10px] rounded ${colors[stack] ?? colors.unknown}`}>
      {stack}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Group projects by techStack
// ---------------------------------------------------------------------------

function groupByTechStack(projects: RepoMapping[]): Record<string, RepoMapping[]> {
  return projects.reduce<Record<string, RepoMapping[]>>((acc, p) => {
    const key = p.techStack ?? "unknown";
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {});
}

const TECH_STACK_ORDER: TechStack[] = ["java-backend", "vue-frontend", "mixed", "unknown"];

// ---------------------------------------------------------------------------
// ProjectRow — editable path with validation
// ---------------------------------------------------------------------------

function ProjectRow({ project, onPathChanged, onRemove }: {
  project: RepoMapping;
  onPathChanged: () => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [path, setPath] = useState(project.localPath);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [pathStatus, setPathStatus] = useState<"ok" | "not_found" | "not_git" | null>(null);

  useEffect(() => { setPath(project.localPath); }, [project.localPath]);

  async function handleSave() {
    if (!path.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/repo-mappings`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ project: project.project, localPath: path.trim() }),
      });
      if (res.ok) {
        setEditing(false);
        onPathChanged();
      }
    } catch { /* ignore */ } finally {
      setSaving(false);
    }
  }

  async function handleValidate() {
    setValidating(true);
    setPathStatus(null);
    try {
      // Check if path is a git repo by trying to preview
      const res = await fetch(`${API_BASE}/api/review/preview`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ project: project.project, sourceBranch: "HEAD", targetBranch: "HEAD~1" }),
      });
      if (res.ok) {
        setPathStatus("ok");
      } else {
        const data = await res.json().catch(() => ({}));
        const msg = data.error || "";
        if (msg.includes("not found") || msg.includes("ENOENT")) {
          setPathStatus("not_found");
        } else if (msg.includes("not a git") || msg.includes("git")) {
          setPathStatus("not_git");
        } else {
          setPathStatus("ok"); // other errors may just mean no diff, path is valid
        }
      }
    } catch {
      setPathStatus("not_found");
    } finally {
      setValidating(false);
    }
  }

  const statusColor = pathStatus === "ok"
    ? "text-emerald-400"
    : pathStatus === "not_found"
      ? "text-red-400"
      : pathStatus === "not_git"
        ? "text-orange-400"
        : "text-slate-500";

  return (
    <div className="px-2.5 py-1.5 bg-slate-900/50 border border-slate-700/30 rounded text-xs space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-slate-300 font-medium">{project.project}</span>
          {techStackBadge(project.techStack)}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setEditing(!editing)}
            className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
          >
            {editing ? "cancel" : "edit path"}
          </button>
          <button
            onClick={onRemove}
            className="text-[10px] text-red-400/60 hover:text-red-400 transition-colors"
          >
            remove
          </button>
        </div>
      </div>
      {editing ? (
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="/path/to/project"
            className="flex-1 px-2 py-1 text-[11px] bg-slate-800 border border-slate-700/50 rounded text-slate-300 font-mono"
          />
          <button
            onClick={handleSave}
            disabled={saving || !path.trim()}
            className="px-2 py-1 text-[10px] bg-blue-600 hover:bg-blue-500 text-white rounded disabled:opacity-50"
          >
            {saving ? "..." : "save"}
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-slate-600 font-mono truncate">{project.localPath}</span>
          <button
            onClick={handleValidate}
            disabled={validating}
            className="shrink-0 text-[10px] text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-50"
          >
            {validating ? "checking..." : "verify"}
          </button>
          {pathStatus && (
            <span className={`text-[10px] ${statusColor}`}>
              {pathStatus === "ok" ? "path valid" : pathStatus === "not_found" ? "path not found" : "not a git repo"}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProductLineManagePage
// ---------------------------------------------------------------------------

export function ProductLineManagePage() {
  const [lines, setLines] = useState<ProductLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(EMPTY_CREATE);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Expanded detail panel
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ProductLineWithProjects | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [saving, setSaving] = useState(false);

  // Add project modal
  const [showAddProject, setShowAddProject] = useState(false);
  const [availableProjects, setAvailableProjects] = useState<RepoMapping[]>([]);
  const [selectedProject, setSelectedProject] = useState("");

  // Dependencies
  const [dependencies, setDependencies] = useState<DependencyRow[]>([]);
  const [scanning, setScanning] = useState(false);

  const loadLines = useCallback(() => {
    setLoading(true);
    fetch(`${API_BASE}/api/product-lines`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((d: ProductLine[]) => setLines(d))
      .catch(() => setLines([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadLines(); }, [loadLines]);

  // -----------------------------------------------------------------------
  // Create
  // -----------------------------------------------------------------------

  async function handleCreate() {
    if (!createForm.id.trim() || !createForm.name.trim()) {
      setCreateError("ID and Name are required.");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch(`${API_BASE}/api/product-lines`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({
          id: createForm.id.trim(),
          name: createForm.name.trim(),
          description: createForm.description.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        setCreateError(err.error || "Create failed.");
        return;
      }
      setShowCreate(false);
      setCreateForm(EMPTY_CREATE);
      loadLines();
    } catch {
      setCreateError("Network error.");
    } finally {
      setCreating(false);
    }
  }

  // -----------------------------------------------------------------------
  // Delete
  // -----------------------------------------------------------------------

  async function handleDelete(pl: ProductLine) {
    const confirmed = confirm(`Delete product line "${pl.name}"?`);
    if (!confirmed) return;

    try {
      const res = await fetch(`${API_BASE}/api/product-lines/${pl.id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        setError(err.error || "Delete failed.");
        return;
      }
      if (expandedId === pl.id) {
        setExpandedId(null);
        setDetail(null);
      }
      loadLines();
    } catch {
      setError("Network error.");
    }
  }

  // -----------------------------------------------------------------------
  // Expand / collapse detail
  // -----------------------------------------------------------------------

  async function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      setDependencies([]);
      setEditing(false);
      return;
    }
    setExpandedId(id);
    setDetailLoading(true);
    setEditing(false);
    setDependencies([]);
    try {
      const res = await fetch(`${API_BASE}/api/product-lines/${id}`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to load");
      const data: ProductLineWithProjects = await res.json();
      setDetail(data);
      setEditName(data.name);
      setEditDesc(data.description ?? "");
      // Load dependencies
      const depRes = await fetch(`${API_BASE}/api/product-lines/${id}/dependencies`, { headers: authHeaders() });
      if (depRes.ok) {
        const deps: DependencyRow[] = await depRes.json();
        setDependencies(deps);
      }
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  async function refreshDetail() {
    if (!expandedId) return;
    try {
      const res = await fetch(`${API_BASE}/api/product-lines/${expandedId}`, { headers: authHeaders() });
      if (!res.ok) return;
      const data: ProductLineWithProjects = await res.json();
      setDetail(data);
    } catch { /* ignore */ }
  }

  // -----------------------------------------------------------------------
  // Update name/description
  // -----------------------------------------------------------------------

  async function handleUpdate() {
    if (!expandedId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/product-lines/${expandedId}`, {
        method: "PUT",
        headers: authHeaders(true),
        body: JSON.stringify({ name: editName.trim(), description: editDesc.trim() || null }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        setError(err.error || "Update failed.");
        return;
      }
      setEditing(false);
      loadLines();
      toggleExpand(expandedId);
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  }

  // -----------------------------------------------------------------------
  // Add project
  // -----------------------------------------------------------------------

  function openAddProject() {
    if (!detail) return;
    const linkedProjects = new Set(detail.projects.map((p) => p.project));
    fetch(`${API_BASE}/api/repo-mappings`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((all: RepoMapping[]) => {
        const unlinked = all.filter((p) => !linkedProjects.has(p.project));
        setAvailableProjects(unlinked);
        setSelectedProject(unlinked.length > 0 ? unlinked[0].project : "");
        setShowAddProject(true);
      })
      .catch(() => setAvailableProjects([]));
  }

  async function handleAddProject() {
    if (!expandedId || !selectedProject) return;
    try {
      const res = await fetch(`${API_BASE}/api/product-lines/${expandedId}/projects`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ project: selectedProject }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        setError(err.error || "Add project failed.");
        return;
      }
      setShowAddProject(false);
      toggleExpand(expandedId);
    } catch {
      setError("Network error.");
    }
  }

  // -----------------------------------------------------------------------
  // Remove project
  // -----------------------------------------------------------------------

  async function handleRemoveProject(project: string) {
    if (!expandedId) return;
    if (!confirm(`Remove project "${project}" from this product line?`)) return;
    try {
      const res = await fetch(`${API_BASE}/api/product-lines/${expandedId}/projects/${encodeURIComponent(project)}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        setError(err.error || "Remove failed.");
        return;
      }
      toggleExpand(expandedId);
    } catch {
      setError("Network error.");
    }
  }

  // -----------------------------------------------------------------------
  // Scan dependencies
  // -----------------------------------------------------------------------

  async function handleScanDependencies() {
    if (!expandedId) return;
    setScanning(true);
    try {
      const res = await fetch(`${API_BASE}/api/product-lines/${expandedId}/scan-dependencies`, {
        method: "POST",
        headers: authHeaders(true),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        setError(err.error || "Scan failed.");
        return;
      }
      const data = await res.json();
      setDependencies(data.dependencies ?? []);
    } catch {
      setError("Network error.");
    } finally {
      setScanning(false);
    }
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-200">Product Lines</h2>
          <p className="text-xs text-slate-500 mt-0.5">Manage product lines and their projects</p>
        </div>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => { setShowCreate(true); setCreateForm(EMPTY_CREATE); setCreateError(null); }}
          className="px-3 py-1.5 text-xs rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 text-white"
        >
          + New Product Line
        </motion.button>
      </div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs"
          >
            {error}
            <button onClick={() => setError(null)} className="ml-2 underline">dismiss</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-5 h-5 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
        </div>
      ) : lines.length === 0 ? (
        <p className="text-sm text-slate-600 py-8 text-center">No product lines yet. Create one to get started.</p>
      ) : (
        <div className="space-y-3">
          {lines.map((pl) => (
            <motion.div
              key={pl.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-slate-800/40 border border-slate-700/30 rounded-lg overflow-hidden"
            >
              {/* Card header */}
              <button
                onClick={() => toggleExpand(pl.id)}
                className="w-full text-left p-4 flex items-center justify-between hover:bg-slate-800/60 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <svg
                    className={`w-4 h-4 text-slate-500 transition-transform ${expandedId === pl.id ? "rotate-90" : ""}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  <div>
                    <span className="text-sm font-medium text-slate-200">{pl.name}</span>
                    <span className="text-xs text-slate-600 ml-2">{pl.id}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {pl.description && (
                    <span className="text-xs text-slate-500 truncate max-w-[200px]">{pl.description}</span>
                  )}
                  <span className="text-[10px] text-slate-600">
                    {new Date(pl.updatedAt).toLocaleDateString()}
                  </span>
                </div>
              </button>

              {/* Expanded detail */}
              <AnimatePresence>
                {expandedId === pl.id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    {detailLoading ? (
                      <div className="px-4 pb-4 flex justify-center">
                        <div className="w-4 h-4 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                      </div>
                    ) : detail ? (
                      <div className="px-4 pb-4 border-t border-slate-700/30 pt-3 space-y-4">
                        {/* Basic info */}
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            {editing ? (
                              <div className="space-y-2">
                                <input
                                  type="text"
                                  value={editName}
                                  onChange={(e) => setEditName(e.target.value)}
                                  className="w-full px-3 py-1.5 text-xs bg-slate-900 border border-slate-700/50 rounded-lg text-slate-300 focus:outline-none focus:border-blue-500/50"
                                  placeholder="Name"
                                />
                                <textarea
                                  value={editDesc}
                                  onChange={(e) => setEditDesc(e.target.value)}
                                  rows={2}
                                  className="w-full px-3 py-1.5 text-xs bg-slate-900 border border-slate-700/50 rounded-lg text-slate-300 focus:outline-none focus:border-blue-500/50 resize-y"
                                  placeholder="Description (optional)"
                                />
                              </div>
                            ) : (
                              <div>
                                <p className="text-sm text-slate-300">{detail.name}</p>
                                {detail.description && (
                                  <p className="text-xs text-slate-500 mt-0.5">{detail.description}</p>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="flex gap-2 ml-4 shrink-0">
                            {editing ? (
                              <>
                                <button
                                  onClick={handleUpdate}
                                  disabled={saving}
                                  className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 rounded text-white disabled:opacity-50"
                                >
                                  {saving ? "Saving..." : "Save"}
                                </button>
                                <button
                                  onClick={() => setEditing(false)}
                                  className="px-3 py-1 text-xs border border-slate-700/50 rounded text-slate-400 hover:text-white"
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => setEditing(true)}
                                  className="px-2 py-1 text-xs border border-slate-700/50 rounded text-slate-400 hover:text-white transition-colors"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleDelete(pl)}
                                  className="px-2 py-1 text-xs border border-red-800/50 rounded text-red-400/70 hover:text-red-400 transition-colors"
                                >
                                  Delete
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Projects */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-xs font-medium text-slate-400">
                              Projects ({detail.projects.length})
                            </h4>
                            <button
                              onClick={openAddProject}
                              className="px-2 py-1 text-[10px] border border-slate-700/50 rounded text-slate-400 hover:text-white transition-colors"
                            >
                              + Add Project
                            </button>
                          </div>

                          {detail.projects.length === 0 ? (
                            <p className="text-xs text-slate-600 py-2">No projects linked yet.</p>
                          ) : (
                            <div className="space-y-2">
                              {TECH_STACK_ORDER.map((stack) => {
                                const groups = groupByTechStack(detail.projects);
                                const projects = groups[stack];
                                if (!projects || projects.length === 0) return null;
                                return (
                                  <div key={stack}>
                                    <div className="flex items-center gap-1.5 mb-1">
                                      {techStackBadge(stack)}
                                      <span className="text-[10px] text-slate-600">({projects.length})</span>
                                    </div>
                                    <div className="space-y-1 ml-1">
                                      {projects.map((p) => (
                                        <ProjectRow
                                          key={p.project}
                                          project={p}
                                          onPathChanged={refreshDetail}
                                          onRemove={() => handleRemoveProject(p.project)}
                                        />
                                      ))}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* Dependencies */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-xs font-medium text-slate-400">
                              Dependencies ({dependencies.length})
                            </h4>
                            <button
                              onClick={handleScanDependencies}
                              disabled={scanning}
                              className="px-2 py-1 text-[10px] border border-slate-700/50 rounded text-slate-400 hover:text-white transition-colors disabled:opacity-50"
                            >
                              {scanning ? "Scanning..." : "Scan Dependencies"}
                            </button>
                          </div>
                          {dependencies.length === 0 ? (
                            <p className="text-xs text-slate-600 py-2">
                              No dependencies found. Click "Scan Dependencies" to detect pom.xml references.
                            </p>
                          ) : (
                            <div className="space-y-1">
                              {dependencies.map((dep) => (
                                <div
                                  key={dep.id}
                                  className="flex items-center gap-2 px-2.5 py-1.5 bg-slate-900/50 border border-slate-700/30 rounded text-[11px]"
                                >
                                  <span className="text-blue-400">{dep.upstreamProject}</span>
                                  <svg className="w-3 h-3 text-slate-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                  </svg>
                                  <span className="text-emerald-400">{dep.downstreamProject}</span>
                                  <span className="text-[9px] px-1 py-0.5 rounded bg-slate-700/50 text-slate-500">{dep.depType}</span>
                                  <span className="text-[9px] text-slate-600 ml-auto">{dep.source}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
            onClick={() => setShowCreate(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg bg-slate-900 border border-slate-700/50 rounded-xl p-6 shadow-xl"
            >
              <h3 className="text-sm font-semibold text-slate-200 mb-4">New Product Line</h3>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">ID <span className="text-slate-600">(required, cannot change later)</span></label>
                  <input
                    type="text"
                    value={createForm.id}
                    onChange={(e) => setCreateForm({ ...createForm, id: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-800/60 border border-slate-700/50 rounded-lg text-slate-300 focus:outline-none focus:border-blue-500/50"
                    placeholder="e.g. trading-platform"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Name <span className="text-slate-600">(required)</span></label>
                  <input
                    type="text"
                    value={createForm.name}
                    onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-800/60 border border-slate-700/50 rounded-lg text-slate-300 focus:outline-none focus:border-blue-500/50"
                    placeholder="e.g. Trading Platform"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Description <span className="text-slate-600">(optional)</span></label>
                  <textarea
                    value={createForm.description}
                    onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 text-xs bg-slate-800/60 border border-slate-700/50 rounded-lg text-slate-300 focus:outline-none focus:border-blue-500/50 resize-y"
                    placeholder="Brief description of the product line"
                  />
                </div>
              </div>

              {createError && (
                <p className="mt-3 text-xs text-red-400">{createError}</p>
              )}

              <div className="flex justify-end gap-2 mt-5">
                <button
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 text-xs border border-slate-700/50 rounded-lg text-slate-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleCreate}
                  disabled={creating}
                  className="px-4 py-2 text-xs bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-lg disabled:opacity-50"
                >
                  {creating ? "Creating..." : "Create"}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Project Modal */}
      <AnimatePresence>
        {showAddProject && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
            onClick={() => setShowAddProject(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-slate-900 border border-slate-700/50 rounded-xl p-6 shadow-xl"
            >
              <h3 className="text-sm font-semibold text-slate-200 mb-4">Add Project</h3>

              {availableProjects.length === 0 ? (
                <p className="text-xs text-slate-500 py-4 text-center">
                  All existing projects are already linked or no projects are registered.
                  Add projects in Settings first.
                </p>
              ) : (
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Select a project</label>
                  <select
                    value={selectedProject}
                    onChange={(e) => setSelectedProject(e.target.value)}
                    className="w-full bg-slate-800/60 border border-slate-700/50 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-blue-500/50"
                  >
                    {availableProjects.map((p) => (
                      <option key={p.project} value={p.project}>
                        {p.project} ({p.techStack}) — {p.localPath}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex justify-end gap-2 mt-5">
                <button
                  onClick={() => setShowAddProject(false)}
                  className="px-4 py-2 text-xs border border-slate-700/50 rounded-lg text-slate-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                {availableProjects.length > 0 && (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleAddProject}
                    disabled={!selectedProject}
                    className="px-4 py-2 text-xs bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-lg disabled:opacity-50"
                  >
                    Add
                  </motion.button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
