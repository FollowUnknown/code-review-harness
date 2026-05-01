import { Router, Request, Response } from "express";
import { getRepoMapping, setRepoMapping, listRepoMappings, deleteRepoMapping } from "../config/repo-mapping";

const router = Router();

// GET /api/repo-mappings — list all mappings
router.get("/", (_req: Request, res: Response) => {
  const list = listRepoMappings();
  res.json(list);
});

// POST /api/repo-mappings — create or update mapping
router.post("/", (req: Request, res: Response) => {
  const { project, localPath } = req.body as { project: string; localPath: string };

  if (!project?.trim() || !localPath?.trim()) {
    res.status(400).json({ error: "project and localPath are required" });
    return;
  }

  setRepoMapping(project.trim(), localPath.trim());
  const mapping = getRepoMapping(project.trim());
  res.json(mapping);
});

// GET /api/repo-mappings/:project — get single mapping
router.get("/:project", (req: Request<{ project: string }>, res: Response) => {
  const mapping = getRepoMapping(req.params.project);
  if (!mapping) {
    res.status(404).json({ error: "Mapping not found" });
    return;
  }
  res.json(mapping);
});

// DELETE /api/repo-mappings/:project — delete mapping
router.delete("/:project", (req: Request<{ project: string }>, res: Response) => {
  deleteRepoMapping(req.params.project);
  res.json({ success: true });
});

export default router;
