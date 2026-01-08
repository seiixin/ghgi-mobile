import { Router } from "express";
import { pool } from "../db/pool.js";  // Assuming you have db connection setup in pool.js
import { requireAuth } from "../middleware/auth.js";  // Assuming authentication middleware

export const formsRouter = Router();

/**
 * GET /api/form-types
 * Returns active form types (read-only catalog).
 */
formsRouter.get("/form-types", requireAuth, async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, \`key\`, name, sector_key, description
       FROM form_types
       WHERE is_active = 1
       ORDER BY sector_key ASC, name ASC, id ASC`
    );
    return res.json({ formTypes: rows });
  } catch (e) {
    return next(e);
  }
});

/**
 * GET /api/form-mappings?form_type_id=&year=
 * Returns the mapping row + parsed mapping_json when possible.
 */
formsRouter.get("/form-mappings", requireAuth, async (req, res, next) => {
  try {
    const formTypeId = Number(req.query.form_type_id);
    const year = Number(req.query.year);

    if (!Number.isFinite(formTypeId) || formTypeId <= 0) {
      return res.status(400).json({ message: "form_type_id is required and must be a positive integer" });
    }
    if (!Number.isFinite(year) || year < 1900 || year > 3000) {
      return res.status(400).json({ message: "year is required and must be a valid year" });
    }

    const [rows] = await pool.execute(
      `SELECT id, form_type_id, year, mapping_json
       FROM form_mappings
       WHERE form_type_id = ? AND year = ?
       LIMIT 1`,
      [formTypeId, year]
    );

    const row = rows?.[0];
    if (!row) return res.status(404).json({ message: "Mapping not found" });

    // mysql2 may return mapping_json as string; parse for client convenience
    let parsed = {};
    try {
      parsed = typeof row.mapping_json === "string" ? JSON.parse(row.mapping_json) : row.mapping_json;
    } catch {
      parsed = {};
    }

    return res.json({
      mapping: {
        id: row.id,
        form_type_id: row.form_type_id,
        year: row.year,
        mapping_json: parsed,
      },
    });
  } catch (e) {
    return next(e);
  }
});
