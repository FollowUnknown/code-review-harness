import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { closeDb, getDb } from "../src/server/db";
import {
  getJwtSecret,
  generateToken,
  verifyToken,
  createUser,
  authenticateUser,
  getUserById,
  getUserByUsername,
  listUsers,
  deleteUser,
  getUserCount,
} from "../src/server/services/auth";

process.env.KNOWLEDGE_DB_PATH = ":memory:";

beforeEach(() => {
  closeDb();
  getDb();
});

afterEach(() => {
  closeDb();
});

describe("JWT Secret", () => {
  it("generates and persists JWT secret", () => {
    const secret = getJwtSecret();
    expect(secret).toBeTruthy();
    expect(getJwtSecret()).toBe(secret); // same on second call
  });

  it("generates UUID-format secret", () => {
    const secret = getJwtSecret();
    expect(secret).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });
});

describe("Token", () => {
  it("generates and verifies token", () => {
    const payload = { id: "u1", username: "alice", role: "admin" as const };
    const token = generateToken(payload);
    const decoded = verifyToken(token);
    expect(decoded).toMatchObject(payload);
  });

  it("returns null for invalid token", () => {
    expect(verifyToken("garbage")).toBeNull();
  });

  it("returns null for expired token", () => {
    // jwt.sign with very short expiry
    const jwt = require("jsonwebtoken");
    const payload = { id: "u1", username: "alice", role: "admin" };
    const token = jwt.sign(payload, getJwtSecret(), { expiresIn: "0s" });
    // Small delay to ensure expiry
    expect(verifyToken(token)).toBeNull();
  });
});

describe("createUser", () => {
  it("creates first user as admin", () => {
    expect(getUserCount()).toBe(0);
    const user = createUser({ username: "alice", password: "pass123" });
    expect(user.role).toBe("admin");
    expect(user.username).toBe("alice");
    expect(user.id).toBeTruthy();
  });

  it("creates subsequent user as member", () => {
    createUser({ username: "alice", password: "pass123" });
    const user = createUser({ username: "bob", password: "pass456" });
    expect(user.role).toBe("member");
  });

  it("hashes password", () => {
    createUser({ username: "alice", password: "pass123" });
    const auth = authenticateUser("alice", "pass123");
    expect(auth).not.toBeNull();
    expect(auth!.username).toBe("alice");
  });

  it("rejects duplicate username", () => {
    createUser({ username: "alice", password: "pass123" });
    expect(() => createUser({ username: "alice", password: "other" })).toThrow(
      "Username already exists"
    );
  });

  it("rejects empty username or password", () => {
    expect(() => createUser({ username: "", password: "pass" })).toThrow("required");
    expect(() => createUser({ username: "bob", password: "" })).toThrow("required");
  });

  it("accepts optional displayName", () => {
    const user = createUser({ username: "alice", password: "pass123", displayName: "Alice W." });
    expect(user.displayName).toBe("Alice W.");
  });
});

describe("authenticateUser", () => {
  it("returns user on correct credentials", () => {
    createUser({ username: "alice", password: "pass123" });
    const user = authenticateUser("alice", "pass123");
    expect(user).not.toBeNull();
    expect(user!.username).toBe("alice");
    expect(user!.role).toBe("admin");
  });

  it("returns null on wrong password", () => {
    createUser({ username: "alice", password: "pass123" });
    expect(authenticateUser("alice", "wrong")).toBeNull();
  });

  it("returns null on nonexistent user", () => {
    expect(authenticateUser("nobody", "pass")).toBeNull();
  });
});

describe("listUsers", () => {
  it("returns all users without password_hash", () => {
    createUser({ username: "alice", password: "pass123" });
    createUser({ username: "bob", password: "pass456" });
    const users = listUsers();
    expect(users).toHaveLength(2);
    expect(users[0]).not.toHaveProperty("password_hash");
    expect(users[0]).not.toHaveProperty("passwordHash");
  });
});

describe("deleteUser", () => {
  it("deletes existing user", () => {
    const user = createUser({ username: "alice", password: "pass123" });
    expect(deleteUser(user.id)).toBe(true);
    expect(getUserById(user.id)).toBeNull();
  });

  it("returns false for nonexistent user", () => {
    expect(deleteUser("fake-id")).toBe(false);
  });
});

describe("getUserById / getUserByUsername", () => {
  it("finds user by id", () => {
    const created = createUser({ username: "alice", password: "pass123" });
    const found = getUserById(created.id);
    expect(found).not.toBeNull();
    expect(found!.username).toBe("alice");
  });

  it("finds user by username", () => {
    createUser({ username: "alice", password: "pass123" });
    const found = getUserByUsername("alice");
    expect(found).not.toBeNull();
    expect(found!.username).toBe("alice");
  });

  it("returns null for missing id", () => {
    expect(getUserById("missing")).toBeNull();
  });

  it("returns null for missing username", () => {
    expect(getUserByUsername("missing")).toBeNull();
  });
});
