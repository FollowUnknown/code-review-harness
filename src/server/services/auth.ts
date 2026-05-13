import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { getDb, getReadDb } from "../db";
import { getSetting, setSetting } from "./settings";
import { User, UserRole } from "../../shared/types";

// ---- JWT Secret (cached in memory to avoid DB contention) ----

let cachedJwtSecret: string | null = null;

export function getJwtSecret(): string {
  if (cachedJwtSecret) return cachedJwtSecret;
  let secret = getSetting("jwt_secret");
  if (!secret) {
    secret = randomUUID();
    setSetting("jwt_secret", secret);
  }
  cachedJwtSecret = secret;
  return secret;
}

// Called when settings are updated (e.g. admin changes JWT secret)
export function invalidateJwtSecretCache(): void {
  cachedJwtSecret = null;
}

// ---- User CRUD ----

export function getUserCount(): number {
  const db = getDb();
  const row = db.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number };
  return row.count;
}

export function createUser(params: {
  username: string;
  password: string;
  displayName?: string;
  role?: UserRole;
}): User {
  const { username, password, displayName } = params;

  if (!username.trim() || !password.trim()) {
    throw new Error("Username and password are required");
  }

  const db = getDb();
  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (existing) {
    throw new Error("Username already exists");
  }

  const id = randomUUID();
  const passwordHash = bcrypt.hashSync(password, 10);
  // First user automatically becomes admin
  const role = getUserCount() === 0 ? "admin" : (params.role || "member");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, display_name, role) VALUES (?, ?, ?, ?, ?)"
  ).run(id, username.trim(), passwordHash, displayName?.trim() || null, role);

  return {
    id,
    username: username.trim(),
    displayName: displayName?.trim() || null,
    role: role as UserRole,
    createdAt: new Date().toISOString(),
  };
}

export function authenticateUser(username: string, password: string): User | null {
  const db = getDb();
  const row = db.prepare(
    "SELECT id, username, password_hash, display_name, role, created_at FROM users WHERE username = ?"
  ).get(username) as {
    id: string; username: string; password_hash: string;
    display_name: string | null; role: string; created_at: string;
  } | undefined;

  if (!row) return null;
  if (!bcrypt.compareSync(password, row.password_hash)) return null;

  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role as UserRole,
    createdAt: row.created_at,
  };
}

export function generateToken(user: { id: string; username: string; role: string }): string {
  return jwt.sign({ id: user.id, username: user.username, role: user.role }, getJwtSecret(), {
    expiresIn: "7d",
  });
}

export function verifyToken(token: string): { id: string; username: string; role: string } | null {
  try {
    return jwt.verify(token, getJwtSecret()) as { id: string; username: string; role: string };
  } catch {
    return null;
  }
}

export function getUserById(id: string): User | null {
  const db = getReadDb();
  const row = db.prepare(
    "SELECT id, username, display_name, role, created_at FROM users WHERE id = ?"
  ).get(id) as {
    id: string; username: string; display_name: string | null;
    role: string; created_at: string;
  } | undefined;

  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role as UserRole,
    createdAt: row.created_at,
  };
}

export function getUserByUsername(username: string): User | null {
  const db = getReadDb();
  const row = db.prepare(
    "SELECT id, username, display_name, role, created_at FROM users WHERE username = ?"
  ).get(username) as {
    id: string; username: string; display_name: string | null;
    role: string; created_at: string;
  } | undefined;

  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role as UserRole,
    createdAt: row.created_at,
  };
}

export function listUsers(): User[] {
  const db = getReadDb();
  const rows = db.prepare(
    "SELECT id, username, display_name, role, created_at FROM users ORDER BY created_at"
  ).all() as Array<{
    id: string; username: string; display_name: string | null;
    role: string; created_at: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role as UserRole,
    createdAt: row.created_at,
  }));
}

export function deleteUser(id: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM users WHERE id = ?").run(id);
  return result.changes > 0;
}
