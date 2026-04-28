import { Router } from "express";
import { getQualityStats } from "../services/quality";

const router = Router();

router.get("/", (_req, res) => {
  try {
    const stats = getQualityStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ success: false, error: message });
  }
});

export default router;
