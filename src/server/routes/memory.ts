import { Router } from "express";
import { getMemoryStats, getExpiringEntries, getArchiveStats } from "../services/memory-stats";

const router = Router();

router.get("/stats", (_req, res) => {
  try {
    const stats = getMemoryStats();
    const expiring = getExpiringEntries(undefined, 7);
    const archiveStats = getArchiveStats();
    res.json({
      success: true,
      data: { stats, expiring, archiveStats },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to read memory stats",
    });
  }
});

export default router;
