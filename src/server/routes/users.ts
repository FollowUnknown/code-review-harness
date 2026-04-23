import { Router, Request, Response } from "express";
import { authRequired, adminOnly } from "../middleware/auth";
import { listUsers, createUser, deleteUser, getUserById } from "../services/auth";

const router = Router();

// All user management routes require admin
router.use(authRequired, adminOnly);

// GET /api/users
router.get("/", (_req: Request, res: Response) => {
  res.json(listUsers());
});

// POST /api/users — Create a new user
router.post("/", (req: Request, res: Response) => {
  const { username, password, displayName, role } = req.body;

  if (!username?.trim() || !password?.trim()) {
    res.status(400).json({ error: "Username and password are required" });
    return;
  }

  try {
    const user = createUser({ username, password, displayName, role });
    res.json(user);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to create user" });
  }
});

// DELETE /api/users/:id
router.delete("/:id", (req: Request<{ id: string }>, res: Response) => {
  const userId = req.params.id;
  if (req.user!.id === userId) {
    res.status(400).json({ error: "Cannot delete yourself" });
    return;
  }

  // Prevent deleting the last admin
  const target = getUserById(userId);
  if (target?.role === "admin") {
    const admins = listUsers().filter((u) => u.role === "admin");
    if (admins.length <= 1) {
      res.status(400).json({ error: "Cannot delete the last admin" });
      return;
    }
  }

  const deleted = deleteUser(userId);
  if (!deleted) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({ success: true });
});

export default router;
