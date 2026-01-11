import { Router } from "express";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";

export const formsRouter = Router();

/**
 * GET /api/form-types?year=
 * Returns active form types WITH active schema version for the given year.
 */
formsRouter.get("/form-types", requireAuth, async (req, res, next) => {
  try {
    const nowYear = new Date().getFullYear();
    const year = Number(req.query.year ?? nowYear);

    if (!Number.isFinite(year) || year < 1900 || year > 3000) {
      return res.status(400).json({ message: "year must be a valid year" });
    }

    // Get forms
    const [forms] = await pool.execute(
      `SELECT id, \`key\`, name, sector_key, description
       FROM form_types
       WHERE is_active = 1
       ORDER BY sector_key ASC, name ASC, id ASC`
    );

    if (!forms?.length) return res.json({ formTypes: [] });

    // Get ACTIVE schema versions for those forms for that year
    const formIds = forms.map((f) => f.id);
    const placeholders = formIds.map(() => "?").join(",");

    const [schemas] = await pool.execute(
      `SELECT
         id, form_type_id, year, version, status, schema_json, ui_json
       FROM form_schema_versions
       WHERE status = 'active'
         AND year = ?
         AND form_type_id IN (${placeholders})
       ORDER BY form_type_id ASC, id DESC`,
      [year, ...formIds]
    );

    // group schemas by form_type_id
    const byForm = new Map();
    for (const s of schemas || []) {
      if (!byForm.has(s.form_type_id)) byForm.set(s.form_type_id, []);
      byForm.get(s.form_type_id).push({
        id: s.id,
        year: s.year,
        version: s.version,
        status: s.status,
        schema_json: typeof s.schema_json === "string" ? safeJsonParse(s.schema_json) : s.schema_json,
        ui_json: typeof s.ui_json === "string" ? safeJsonParse(s.ui_json) : s.ui_json,
      });
    }

    const out = (forms || []).map((f) => ({
      ...f,
      schema_versions: byForm.get(f.id) || [], // mobile expects this
    }));

    return res.json({ formTypes: out });
  } catch (e) {
    return next(e);
  }
});

function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return {};
  }
}

/**
 * GET /api/form-mappings?form_type_id=&year=
 * (unchanged)
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
