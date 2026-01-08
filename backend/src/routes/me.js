import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { pool } from "../db/pool.js";

export const meRouter = Router();

meRouter.get("/me", requireAuth, async (req, res) => {
  const deviceId = (req.query.device_id || "").toString().trim();
  if (deviceId) {
    await pool.execute("UPDATE devices SET last_seen_at = NOW() WHERE user_id = ? AND device_id = ?", [req.user.id, deviceId]);
  }
  res.json({ user: req.user });
});
