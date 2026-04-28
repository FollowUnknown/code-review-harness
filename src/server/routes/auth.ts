import { Router, Request, Response } from "express";
import { authRequired } from "../middleware/auth";
import {
  authenticateUser,
  createUser,
  generateToken,
  verifyToken,
  getUserById,
  getUserCount,
} from "../services/auth";

const router = Router();

// POST /api/auth/setup — Register first admin (only when no users exist)
router.post("/setup", (req: Request, res: Response) => {
  const { username, password, displayName } = req.body;

  if (!username?.trim() || !password?.trim()) {
    res.status(400).json({ error: "Username and password are required" });
    return;
  }

  if (getUserCount() > 0) {
    res.status(403).json({ error: "Initial user already created" });
    return;
  }

  try {
    const user = createUser({ username, password, displayName });
    const token = generateToken(user);
    res.json({ token, user });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to create user" });
  }
});

// POST /api/auth/login
router.post("/login", (req: Request, res: Response) => {
  const { username, password } = req.body;

  if (!username || !password) {
    res.status(400).json({ error: "Username and password are required" });
    return;
  }

  const user = authenticateUser(username, password);
  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const token = generateToken(user);
  res.json({ token, user });
});

// GET /api/auth/me — Current user info (requires auth)
router.get("/me", authRequired, (req: Request, res: Response) => {
  const user = getUserById(req.user!.id);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(user);
});

// GET /api/auth/status — Check if setup is needed (no auth)
router.get("/status", (_req: Request, res: Response) => {
  res.json({ needsSetup: getUserCount() === 0 });
});

// POST /api/auth/refresh — Refresh JWT token (requires valid auth)
router.post("/refresh", authRequired, (req: Request, res: Response) => {
  const user = getUserById(req.user!.id);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const token = generateToken(user);
  res.json({ token, user });
});

// POST /api/auth/logout — Logout (client clears token, server acknowledges)
router.post("/logout", (_req: Request, res: Response) => {
  res.json({ success: true });
});

export default router;
