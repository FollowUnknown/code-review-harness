import { Router, Request, Response } from "express";
import {
  getEntry,
  updateEntry,
  confirmEntry,
  deprecateEntry,
  restoreEntry,
  deleteEntry,
  listEntries,
  listPendingEntries,
  reviewEntry,
  getKnowledgeStats,
  addEntry,
  addRelation,
  getRelationsForEntry,
  deleteRelation,
} from "../services/knowledge";
import type { RelationType } from "../services/knowledge";
import type { EntryType, EntryStatus, ReviewStatus } from "../services/knowledge";

const router = Router();

function getUser(req: Request): { id: string; role: string } | undefined {
  return (req as Request & { user?: { id: string; role: string } }).user;
}

function requireAdmin(req: Request, res: Response): boolean {
  const user = getUser(req);
  if (user?.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return false;
  }
  return true;
}

// POST / — Create knowledge entry (admin: auto-approved, member: pending review)
router.post("/", (req: Request, res: Response) => {
  const user = getUser(req);
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const { type, project, module, severity, title, pattern, impact, fix_suggestion, content,
          source_review, source_mr, source_file, parent_id,
          product_line, engineering, source_story, source_type, review_pass,
          scope, data_structure, default_value, first_seen_in, derivation } = req.body;

  if (!type || !project || !title || !content) {
    res.status(400).json({ error: "type, project, title, and content are required" });
    return;
  }

  const validTypes: EntryType[] = ["AP", "EXP", "CONV", "BN", "RULE", "TERM"];
  if (!validTypes.includes(type)) {
    res.status(400).json({ error: `Invalid type. Must be one of: ${validTypes.join(", ")}` });
    return;
  }

  const isAdmin = user.role === "admin";
  const entry = addEntry({
    type, project, module, severity, title, pattern, impact, fix_suggestion, content,
    source_review, source_mr, source_file, parent_id,
    product_line, engineering, source_story, source_type, review_pass,
    scope, data_structure, default_value, first_seen_in, derivation,
    suggested_by: user.id,
    review_status: isAdmin ? "approved" : "pending",
  });

  res.json(entry);
});

// GET / — List knowledge entries with pagination and filters
router.get("/", (req: Request, res: Response) => {
  const type = req.query.type as EntryType | undefined;
  const projectRaw = req.query.project;
  const project = projectRaw ? (Array.isArray(projectRaw) ? projectRaw as string[] : projectRaw as string) : undefined;
  const title = req.query.title as string | undefined;
  const status = req.query.status as EntryStatus | undefined;
  const review_status = req.query.review_status as ReviewStatus | undefined;
  const suggested_by = req.query.suggested_by as string | undefined;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 20));

  const validTypes: EntryType[] = ["AP", "EXP", "CONV", "BN", "RULE", "TERM"];
  if (type && !validTypes.includes(type)) {
    res.status(400).json({ error: `Invalid type. Must be one of: ${validTypes.join(", ")}` });
    return;
  }

  const validStatuses: EntryStatus[] = ["TEMP", "CONFIRMED", "DEPRECATED"];
  if (status && !validStatuses.includes(status)) {
    res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` });
    return;
  }

  const validReviewStatuses: ReviewStatus[] = ["pending", "approved", "rejected"];
  if (review_status && !validReviewStatuses.includes(review_status)) {
    res.status(400).json({ error: `Invalid review_status. Must be one of: ${validReviewStatuses.join(", ")}` });
    return;
  }

  const result = listEntries({ type, project, title, status, review_status, suggested_by, page, pageSize });
  res.json(result);
});

// GET /stats — Knowledge statistics
router.get("/stats", (_req: Request, res: Response) => {
  res.json(getKnowledgeStats());
});

// GET /pending — List pending review entries (admin only)
router.get("/pending", (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 20));
  const result = listPendingEntries(page, pageSize);
  res.json(result);
});

// POST /:id/review — Review a pending entry (admin only)
router.post("/:id/review", (req: Request<{ id: string }>, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const user = getUser(req)!;
  const entry = getEntry(req.params.id);
  if (!entry) {
    res.status(404).json({ error: "Knowledge entry not found" });
    return;
  }

  if (entry.review_status !== "pending") {
    res.status(400).json({ error: "Only pending entries can be reviewed" });
    return;
  }

  const { action, comment } = req.body as { action?: string; comment?: string };
  if (action !== "approved" && action !== "rejected") {
    res.status(400).json({ error: "action must be 'approved' or 'rejected'" });
    return;
  }

  const reviewed = reviewEntry(req.params.id, action, user.id, comment);
  if (!reviewed) {
    res.status(500).json({ error: "Failed to review entry" });
    return;
  }
  res.json(reviewed);
});

// GET /:id — Knowledge entry detail
router.get("/:id", (req: Request<{ id: string }>, res: Response) => {
  const entry = getEntry(req.params.id);
  if (!entry) {
    res.status(404).json({ error: "Knowledge entry not found" });
    return;
  }
  res.json(entry);
});

// PUT /:id — Edit knowledge entry
router.put("/:id", (req: Request<{ id: string }>, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const entry = getEntry(req.params.id);
  if (!entry) {
    res.status(404).json({ error: "Knowledge entry not found" });
    return;
  }

  const { title, pattern, impact, fix_suggestion, content, module, severity, parent_id,
          product_line, engineering, source_story, source_type, review_pass,
          scope, data_structure, default_value, first_seen_in, derivation } = req.body;
  const updated = updateEntry(req.params.id, {
    title, pattern, impact, fix_suggestion, content, module, severity, parent_id,
    product_line, engineering, source_story, source_type, review_pass,
    scope, data_structure, default_value, first_seen_in, derivation,
  });
  res.json(updated);
});

// PUT /:id/confirm — Confirm entry (TEMP → CONFIRMED with formal ID, admin only)
router.put("/:id/confirm", (req: Request<{ id: string }>, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const entry = getEntry(req.params.id);
  if (!entry) {
    res.status(404).json({ error: "Knowledge entry not found" });
    return;
  }
  if (entry.status !== "TEMP") {
    res.status(400).json({ error: "Only TEMP entries can be confirmed" });
    return;
  }

  const { projectAbbr } = req.body as { projectAbbr?: string };
  const confirmed = confirmEntry(req.params.id, projectAbbr);
  if (!confirmed) {
    res.status(500).json({ error: "Failed to confirm entry" });
    return;
  }
  res.json(confirmed);
});

// PUT /:id/deprecate — Deprecate entry (admin only)
router.put("/:id/deprecate", (req: Request<{ id: string }>, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const entry = getEntry(req.params.id);
  if (!entry) {
    res.status(404).json({ error: "Knowledge entry not found" });
    return;
  }

  if (!deprecateEntry(req.params.id)) {
    res.status(400).json({ error: "Failed to deprecate entry" });
    return;
  }
  res.json({ success: true });
});

// PUT /:id/restore — Restore DEPRECATED entry to CONFIRMED (admin only)
router.put("/:id/restore", (req: Request<{ id: string }>, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const entry = getEntry(req.params.id);
  if (!entry) {
    res.status(404).json({ error: "Knowledge entry not found" });
    return;
  }

  if (!restoreEntry(req.params.id)) {
    res.status(400).json({ error: "Only DEPRECATED entries can be restored" });
    return;
  }
  res.json({ success: true });
});

// DELETE /:id — Delete entry (TEMP or DEPRECATED, admin only)
router.delete("/:id", (req: Request<{ id: string }>, res: Response) => {
  if (!requireAdmin(req, res)) return;

  if (!deleteEntry(req.params.id)) {
    const entry = getEntry(req.params.id);
    if (!entry) {
      res.status(404).json({ error: "Knowledge entry not found" });
      return;
    }
    res.status(400).json({ error: "Only TEMP or DEPRECATED entries can be deleted" });
    return;
  }
  res.json({ success: true });
});

// GET /:id/relations — Get relations for an entry
router.get("/:id/relations", (req: Request<{ id: string }>, res: Response) => {
  const entry = getEntry(req.params.id);
  if (!entry) {
    res.status(404).json({ error: "Knowledge entry not found" });
    return;
  }
  res.json(getRelationsForEntry(req.params.id));
});

// POST /:id/relations — Add a relation (admin only)
router.post("/:id/relations", (req: Request<{ id: string }>, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const { toId, relation } = req.body as { toId?: string; relation?: string };
  if (!toId || !relation) {
    res.status(400).json({ error: "toId and relation required" });
    return;
  }

  const validRelations: RelationType[] = ["related_rule", "related_term", "related_ap", "finding", "reuse"];
  if (!validRelations.includes(relation as RelationType)) {
    res.status(400).json({ error: `Invalid relation. Must be one of: ${validRelations.join(", ")}` });
    return;
  }

  if (!getEntry(toId)) {
    res.status(404).json({ error: "Target entry not found" });
    return;
  }

  const rel = addRelation(req.params.id, toId, relation as RelationType);
  res.json(rel);
});

// DELETE /:id/relations/:relId — Delete a relation (admin only)
router.delete("/:id/relations/:relId", (req: Request<{ id: string; relId: string }>, res: Response) => {
  if (!requireAdmin(req, res)) return;

  if (!deleteRelation(req.params.relId)) {
    res.status(404).json({ error: "Relation not found" });
    return;
  }
  res.json({ success: true });
});

export default router;
