import { Router, Request, Response } from "express";
import {
  listDimensionSets,
  createDimensionSet,
  updateDimensionSet,
  deleteDimensionSet,
} from "../services/dimensions";

const router = Router();

function checkAdmin(req: Request): boolean {
  const user = (req as Request & { user?: { role: string } }).user;
  return user?.role === "admin";
}

// GET / — List dimension sets
router.get("/", (_req: Request, res: Response) => {
  res.json(listDimensionSets());
});

// POST / — Create dimension set (admin only)
router.post("/", (req: Request, res: Response) => {
  if (!checkAdmin(req)) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  const { name, project, dimensions, focus_areas } = req.body;
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  if (!Array.isArray(dimensions) || dimensions.length === 0 || !dimensions.every((d: unknown) => typeof d === "string")) {
    res.status(400).json({ error: "dimensions must be a non-empty array of strings" });
    return;
  }

  const userId = (req as Request & { user?: { id: string } }).user?.id || "unknown";
  try {
    const result = createDimensionSet({ name: name.trim(), project, dimensions, focus_areas, created_by: userId });
    res.json(result);
  } catch (err) {
    if (err instanceof Error && err.message.includes("UNIQUE")) {
      res.status(409).json({ error: "Dimension set name already exists" });
      return;
    }
    throw err;
  }
});

// PUT /:id — Update dimension set (admin only)
router.put("/:id", (req: Request<{ id: string }>, res: Response) => {
  if (!checkAdmin(req)) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  const { name, project, dimensions, focus_areas } = req.body;
  if (dimensions !== undefined && (!Array.isArray(dimensions) || !dimensions.every((d: unknown) => typeof d === "string"))) {
    res.status(400).json({ error: "dimensions must be an array of strings" });
    return;
  }

  const result = updateDimensionSet(req.params.id, { name, project, dimensions, focus_areas });
  if (!result) {
    res.status(404).json({ error: "Dimension set not found" });
    return;
  }
  res.json(result);
});

// DELETE /:id — Delete dimension set (admin only)
router.delete("/:id", (req: Request<{ id: string }>, res: Response) => {
  if (!checkAdmin(req)) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  if (!deleteDimensionSet(req.params.id)) {
    res.status(404).json({ error: "Dimension set not found or is default set" });
    return;
  }
  res.json({ success: true });
});

export default router;
