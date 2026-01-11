// backend/src/routes/mySubmissions.js
import { Router } from "express";
import db from "../utils/db.js";
import { requireAuth } from "../middleware/auth.js";

export const mySubmissionsRouter = Router();

function ok(res, data, message = "OK", status = 200) {
  return res.status(status).json({ status: "ok", message, data });
}
function fail(res, message = "Error", details = null, status = 400) {
  return res.status(status).json({ status: "error", message, details });
}

function toInt(v, def = null) {
  if (v === undefined || v === null || v === "") return def;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : def;
}
function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * GET /api/my-submissions
 * Query: year?, status?, form_type_id?, per_page=20, page=1
 */
mySubmissionsRouter.get("/my-submissions", requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return fail(res, "Unauthorized", null, 401);

    const form_type_id = toInt(req.query.form_type_id);
    const year = toInt(req.query.year);
    const status = isNonEmptyString(req.query.status) ? String(req.query.status).trim() : null;

    const per_page = Math.min(Math.max(toInt(req.query.per_page, 20), 1), 200);
    const page = Math.max(toInt(req.query.page, 1), 1);
    const offset = (page - 1) * per_page;

    const where = ["s.created_by = ?"];
    const params = [userId];
    const add = (sql, val) => {
      where.push(sql);
      params.push(val);
    };

    if (form_type_id) add("s.form_type_id = ?", form_type_id);
    if (year) add("s.year = ?", year);
    if (status) add("s.status = ?", status);

    const whereSql = `WHERE ${where.join(" AND ")}`;

    const countQ = await db.query(
      `SELECT COUNT(*) AS total
       FROM submissions s
       ${whereSql}`,
      params
    );
    const total = Number(countQ.rows?.[0]?.total ?? 0);

    const rowsQ = await db.query(
      `SELECT
         s.*,
         ft.name AS form_type_name,
         (SELECT COUNT(*) FROM submission_answers a WHERE a.submission_id = s.id) AS answers_count
       FROM submissions s
       LEFT JOIN form_types ft ON ft.id = s.form_type_id
       ${whereSql}
       ORDER BY s.id DESC
       LIMIT ? OFFSET ?`,
      [...params, per_page, offset]
    );

    return ok(res, {
      data: rowsQ.rows || [],
      meta: {
        page,
        per_page,
        total,
        total_pages: per_page ? Math.ceil(total / per_page) : 0,
      },
    });
  } catch (e) {
    return fail(res, "Failed to list my submissions", { error: String(e?.message || e) }, 500);
  }
});
