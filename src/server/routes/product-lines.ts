import { Router, Request, Response } from "express";
import {
  createProductLine,
  getProductLine,
  listProductLines,
  updateProductLine,
  deleteProductLine,
  addProjectToProductLine,
  removeProjectFromProductLine,
} from "../services/product-line";
import { getRepoMappingsByProductLine } from "../config/repo-mapping";
import {
  scanProductLineDependencies,
  getDependencies,
  addDependency,
  removeDependency,
} from "../services/dependency-scanner";

const router = Router();

// GET /api/product-lines -- list all product lines
router.get("/", (_req: Request, res: Response) => {
  const list = listProductLines();
  res.json(list);
});

// POST /api/product-lines -- create product line
router.post("/", (req: Request, res: Response) => {
  const { id, name, description, knowledgeScope, defaultDimensionSetId, configJson } = req.body;

  if (!id?.trim() || !name?.trim()) {
    res.status(400).json({ error: "id and name are required" });
    return;
  }

  try {
    const productLine = createProductLine({
      id: id.trim(),
      name: name.trim(),
      description,
      knowledgeScope,
      defaultDimensionSetId,
      configJson,
      createdBy: (req as Request & { user?: { id: string } }).user?.id,
    });
    res.json(productLine);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("UNIQUE constraint")) {
      res.status(409).json({ error: `Product line '${id}' already exists` });
      return;
    }
    throw err;
  }
});

// GET /api/product-lines/:id -- get product line with projects
router.get("/:id", (req: Request<{ id: string }>, res: Response) => {
  const productLine = getProductLine(req.params.id);
  if (!productLine) {
    res.status(404).json({ error: "Product line not found" });
    return;
  }
  const projects = getRepoMappingsByProductLine(req.params.id);
  res.json({ ...productLine, projects });
});

// PUT /api/product-lines/:id -- update product line
router.put("/:id", (req: Request<{ id: string }>, res: Response) => {
  const { name, description, knowledgeScope, defaultDimensionSetId, configJson } = req.body;
  const updated = updateProductLine(req.params.id, {
    name, description, knowledgeScope, defaultDimensionSetId, configJson,
  });
  if (!updated) {
    res.status(404).json({ error: "Product line not found" });
    return;
  }
  res.json(updated);
});

// DELETE /api/product-lines/:id -- delete product line (unlinks projects, does not delete them)
router.delete("/:id", (req: Request<{ id: string }>, res: Response) => {
  const deleted = deleteProductLine(req.params.id);
  if (!deleted) {
    res.status(404).json({ error: "Product line not found" });
    return;
  }
  res.json({ success: true });
});

// POST /api/product-lines/:id/projects -- add project to product line
router.post("/:id/projects", (req: Request<{ id: string }>, res: Response) => {
  const { project } = req.body as { project: string };
  if (!project?.trim()) {
    res.status(400).json({ error: "project is required" });
    return;
  }
  const productLine = getProductLine(req.params.id);
  if (!productLine) {
    res.status(404).json({ error: "Product line not found" });
    return;
  }
  const added = addProjectToProductLine(req.params.id, project.trim());
  if (!added) {
    res.status(404).json({ error: `Project '${project}' not found in repo mappings` });
    return;
  }
  res.json({ success: true });
});

// DELETE /api/product-lines/:id/projects/:project -- remove project from product line
router.delete("/:id/projects/:project", (req: Request<{ id: string; project: string }>, res: Response) => {
  const removed = removeProjectFromProductLine(req.params.project);
  if (!removed) {
    res.status(404).json({ error: `Project '${req.params.project}' is not linked to any product line` });
    return;
  }
  res.json({ success: true });
});

// POST /api/product-lines/:id/scan-dependencies -- trigger pom.xml dependency scan
router.post("/:id/scan-dependencies", (req: Request<{ id: string }>, res: Response) => {
  const productLine = getProductLine(req.params.id);
  if (!productLine) {
    res.status(404).json({ error: "Product line not found" });
    return;
  }

  try {
    const newCount = scanProductLineDependencies(req.params.id);
    const deps = getDependencies(req.params.id);
    res.json({ scanned: true, newDependencies: newCount, totalDependencies: deps.length, dependencies: deps });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: `Dependency scan failed: ${message}` });
  }
});

// GET /api/product-lines/:id/dependencies -- get dependency graph
router.get("/:id/dependencies", (req: Request<{ id: string }>, res: Response) => {
  const productLine = getProductLine(req.params.id);
  if (!productLine) {
    res.status(404).json({ error: "Product line not found" });
    return;
  }
  const deps = getDependencies(req.params.id);
  res.json(deps);
});

// POST /api/product-lines/:id/dependencies -- manually add dependency
router.post("/:id/dependencies", (req: Request<{ id: string }>, res: Response) => {
  const { upstreamProject, downstreamProject, depType } = req.body as {
    upstreamProject: string;
    downstreamProject: string;
    depType?: string;
  };

  if (!upstreamProject?.trim() || !downstreamProject?.trim()) {
    res.status(400).json({ error: "upstreamProject and downstreamProject are required" });
    return;
  }

  const productLine = getProductLine(req.params.id);
  if (!productLine) {
    res.status(404).json({ error: "Product line not found" });
    return;
  }

  const type = depType ?? "compile";
  const validDepTypes = ["compile", "runtime", "test", "provided"];
  if (!validDepTypes.includes(type)) {
    res.status(400).json({ error: `depType must be one of: ${validDepTypes.join(", ")}` });
    return;
  }

  const success = addDependency(upstreamProject.trim(), downstreamProject.trim(), type);
  if (!success) {
    res.status(409).json({ error: "Dependency already exists or referenced projects not found" });
    return;
  }
  res.json({ success: true });
});

// DELETE /api/product-lines/:id/dependencies/:depId -- delete dependency
router.delete("/:id/dependencies/:depId", (req: Request<{ id: string; depId: string }>, res: Response) => {
  const depId = parseInt(req.params.depId, 10);
  if (isNaN(depId)) {
    res.status(400).json({ error: "depId must be a number" });
    return;
  }

  const deleted = removeDependency(depId);
  if (!deleted) {
    res.status(404).json({ error: "Dependency not found" });
    return;
  }
  res.json({ success: true });
});

export default router;
