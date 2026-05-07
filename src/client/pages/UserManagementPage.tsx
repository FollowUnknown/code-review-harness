import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { User } from "../../shared/types";

const API_BASE = "";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("auth_token");
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

interface Props {
  currentUser: User;
}

export function UserManagementPage({ currentUser }: Props) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create form
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "member">("member");
  const [creating, setCreating] = useState(false);

  const fetchUsers = useCallback(() => {
    setLoading(true);
    fetch(`${API_BASE}/api/users`, { headers: authHeaders() })
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load users");
        return r.json();
      })
      .then((data: User[]) => setUsers(data))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load users"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/users`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          username: newUsername,
          password: newPassword,
          displayName: newDisplayName || undefined,
          role: newRole,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create user");
      }
      setNewUsername("");
      setNewPassword("");
      setNewDisplayName("");
      setNewRole("member");
      setShowCreate(false);
      fetchUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create user");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(userId: string, username: string) {
    if (!confirm(`Delete user "${username}"?`)) return;
    try {
      const res = await fetch(`${API_BASE}/api/users/${userId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to delete user");
      }
      fetchUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete user");
    }
  }

  if (currentUser.role !== "admin") {
    return (
      <div className="py-12 text-center text-sm text-slate-500">
        Admin access required
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-200">User Management</h2>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="px-3 py-1.5 text-xs rounded-lg border bg-slate-800/50 border-slate-700/50 text-slate-400 hover:text-white hover:border-slate-600 transition-all"
        >
          {showCreate ? "Cancel" : "Add User"}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-300 hover:text-red-200">&times;</button>
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <motion.form
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          onSubmit={handleCreate}
          className="mb-4 p-4 bg-slate-800/40 border border-slate-700/40 rounded-lg space-y-3"
        >
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Username"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              className="px-3 py-2 text-xs bg-slate-800 border border-slate-700/50 rounded text-slate-300 placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
              autoFocus
            />
            <input
              type="password"
              placeholder="Password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="px-3 py-2 text-xs bg-slate-800 border border-slate-700/50 rounded text-slate-300 placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Display name (optional)"
              value={newDisplayName}
              onChange={(e) => setNewDisplayName(e.target.value)}
              className="px-3 py-2 text-xs bg-slate-800 border border-slate-700/50 rounded text-slate-300 placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
            />
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as "admin" | "member")}
              className="px-3 py-2 text-xs bg-slate-800 border border-slate-700/50 rounded text-slate-400 focus:outline-none focus:border-blue-500/50"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={creating || !newUsername.trim() || !newPassword.trim()}
            className="px-4 py-2 text-xs font-medium bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white rounded-lg disabled:opacity-50 transition-all"
          >
            {creating ? "Creating..." : "Create User"}
          </button>
        </motion.form>
      )}

      {/* User list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-5 h-5 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="rounded-lg border border-slate-700/40 overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-800/50 text-slate-500">
                <th className="px-3 py-2 text-left">Username</th>
                <th className="px-3 py-2 text-left">Display Name</th>
                <th className="px-3 py-2 text-center">Role</th>
                <th className="px-3 py-2 text-left">Created</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr
                  key={user.id}
                  className="border-t border-slate-800/50 hover:bg-slate-800/30 transition-colors"
                >
                  <td className="px-3 py-2.5 text-slate-300 font-mono">{user.username}</td>
                  <td className="px-3 py-2.5 text-slate-400">{user.displayName || "--"}</td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`px-1.5 py-0.5 text-[10px] rounded ${
                      user.role === "admin"
                        ? "bg-blue-500/15 text-blue-400"
                        : "bg-slate-500/15 text-slate-400"
                    }`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-slate-500">
                    {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "--"}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {user.id !== currentUser.id && (
                      <button
                        onClick={() => handleDelete(user.id, user.username)}
                        className="px-2 py-0.5 text-[10px] rounded border border-red-700/50 text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </motion.div>
  );
}
