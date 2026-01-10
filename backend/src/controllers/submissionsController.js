// backend/src/controllers/submissionsController.js
import db from "../utils/db.js";
import { getMappingForSubmission } from "../services/submissionsService.js";

function ok(res, data, message = "OK", status = 200) {
  return res.status(status).json({ status: "ok", message, data });
}
function fail(res, message = "Error", details = null, status = 400) {
  return res.status(status).json({ status: "error", message, details });
}

function requireAuth(req) {
  if (!req.user) return null;
  if (req.user.id === undefined || req.user.id === null) return null;
  return req.user;
}

function toInt(v, def = null) {
  if (v === undefined || v === null || v === "") return def;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : def;
}
function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}
function pickLocation(body) {
  return {
    reg_name: isNonEmptyString(body.reg_name) ? body.reg_name.trim() : null,
    prov_name: isNonEmptyString(body.prov_name) ? body.prov_name.trim() : null,
    city_name: isNonEmptyString(body.city_name) ? body.city_name.trim() : null,
    brgy_name: isNonEmptyString(body.brgy_name) ? body.brgy_name.trim() : null,
  };
}

/**
 * IMPORTANT:
 * This controller is MySQL-compatible:
 * - uses "?" placeholders
 * - removes "::int"
 * - removes "RETURNING *"
 * - replaces "ON CONFLICT" with "ON DUPLICATE KEY UPDATE"
 *
 * REQUIREMENT for upsert:
 * submission_answers must have UNIQUE(submission_id, field_key)
 */

export async function listSubmissions(req, res) {
  try {
    const form_type_id = toInt(req.query.form_type_id);
    const year = toInt(req.query.year);
    const status = isNonEmptyString(req.query.status)
      ? String(req.query.status).trim()
      : null;
    const source = isNonEmptyString(req.query.source)
      ? String(req.query.source).trim()
      : null;

    const reg_name = isNonEmptyString(req.query.reg_name)
      ? String(req.query.reg_name).trim()
      : null;
    const prov_name = isNonEmptyString(req.query.prov_name)
      ? String(req.query.prov_name).trim()
      : null;
    const city_name = isNonEmptyString(req.query.city_name)
      ? String(req.query.city_name).trim()
      : null;
    const brgy_name = isNonEmptyString(req.query.brgy_name)
      ? String(req.query.brgy_name).trim()
      : null;

    const per_page = Math.min(Math.max(toInt(req.query.per_page, 20), 1), 200);
    const page = Math.max(toInt(req.query.page, 1), 1);
    const offset = (page - 1) * per_page;

    const where = [];
    const params = [];
    const add = (sql, val) => {
      where.push(sql); // sql must contain "?"
      params.push(val);
    };

    if (form_type_id) add("s.form_type_id = ?", form_type_id);
    if (year) add("s.year = ?", year);
    if (status) add("s.status = ?", status);
    if (source) add("s.source = ?", source);

    if (reg_name) add("s.reg_name = ?", reg_name);
    if (prov_name) add("s.prov_name = ?", prov_name);
    if (city_name) add("s.city_name = ?", city_name);
    if (brgy_name) add("s.brgy_name = ?", brgy_name);

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

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
    return fail(
      res,
      "Failed to list submissions",
      { error: String(e?.message || e) },
      500
    );
  }
}

export async function createSubmission(req, res) {
  try {
    const user = requireAuth(req);
    if (!user) return fail(res, "Unauthorized", null, 401);

    const body = req.body || {};
    const form_type_id = toInt(body.form_type_id);
    const year = toInt(body.year);
    const mapping_id = toInt(body.mapping_id);
    const schema_version_id = toInt(body.schema_version_id);
    const source = isNonEmptyString(body.source)
      ? String(body.source).trim().slice(0, 20)
      : "mobile";

    if (!form_type_id || form_type_id < 1)
      return fail(res, "form_type_id is required", null, 422);
    if (!year || year < 2000 || year > 2100)
      return fail(res, "year is invalid", null, 422);

    let mapping = null;
    if (mapping_id) {
      const r = await db.query(
        `SELECT id, mapping_json FROM form_mappings WHERE id = ? LIMIT 1`,
        [mapping_id]
      );
      mapping = r.rows?.[0] || null;
    } else {
      const r = await db.query(
        `SELECT id, mapping_json
           FROM form_mappings
          WHERE form_type_id = ? AND year = ?
          ORDER BY id DESC
          LIMIT 1`,
        [form_type_id, year]
      );
      mapping = r.rows?.[0] || null;
    }

    const loc = pickLocation(body);

    // MySQL insert: no RETURNING
    const insertQ = await db.query(
      `INSERT INTO submissions
        (form_type_id, schema_version_id, mapping_id, year, source, status, created_by,
         reg_name, prov_name, city_name, brgy_name)
       VALUES (?,?,?,?,?,'draft',?,?,?,?,?)`,
      [
        form_type_id,
        schema_version_id || null,
        mapping?.id || null,
        year,
        source,
        user.id,
        loc.reg_name,
        loc.prov_name,
        loc.city_name,
        loc.brgy_name,
      ]
    );

    const insertedId = insertQ.rows?.insertId;
    if (!insertedId) {
      return fail(res, "Failed to create submission", { error: "Insert failed" }, 500);
    }

    const s2 = await db.query(`SELECT * FROM submissions WHERE id = ? LIMIT 1`, [
      insertedId,
    ]);
    const submission = s2.rows?.[0];
    if (!submission) {
      return fail(res, "Failed to create submission", { error: "Insert readback failed" }, 500);
    }

    const ft = await db.query(`SELECT name FROM form_types WHERE id = ? LIMIT 1`, [
      form_type_id,
    ]);
    submission.form_type_name = ft.rows?.[0]?.name ?? null;

    return ok(res, { submission, mapping_json: mapping?.mapping_json ?? {} }, "Created", 201);
  } catch (e) {
    return fail(
      res,
      "Failed to create submission",
      { error: String(e?.message || e) },
      500
    );
  }
}

export async function getSubmission(req, res) {
  try {
    const id = toInt(req.params.id);
    if (!id) return fail(res, "Invalid id", null, 422);

    const sQ = await db.query(
      `SELECT s.*, ft.name AS form_type_name
         FROM submissions s
         LEFT JOIN form_types ft ON ft.id = s.form_type_id
        WHERE s.id = ?
        LIMIT 1`,
      [id]
    );
    const submission = sQ.rows?.[0];
    if (!submission) return fail(res, "Not found", null, 404);

  const mapping_json = {}; // temporary

    const aQ = await db.query(
      `SELECT * FROM submission_answers WHERE submission_id = ? ORDER BY field_key ASC`,
      [id]
    );
    const answers = aQ.rows || [];

    const answers_human = answers.map((a) => {
      let value = null;
      if (a.option_label) value = a.option_label;
      else if (a.value_text !== null && String(a.value_text).trim() !== "") value = a.value_text;
      else if (a.value_number !== null) value = a.value_number;
      else if (a.value_bool !== null) value = a.value_bool ? "Yes" : "No";
      else if (a.value_json !== null) value = a.value_json;

      return {
        field_key: a.field_key,
        label: a.label || null,
        type: a.type || null,
        value,
        option_key: a.option_key || null,
        option_label: a.option_label || null,
      };
    });

    return ok(res, { submission, mapping_json, answers, answers_human });
  } catch (e) {
    return fail(
      res,
      "Failed to load submission",
      { error: String(e?.message || e) },
      500
    );
  }
}

export async function updateSubmission(req, res) {
  try {
    const id = toInt(req.params.id);
    if (!id) return fail(res, "Invalid id", null, 422);

    const sQ = await db.query(`SELECT * FROM submissions WHERE id = ? LIMIT 1`, [id]);
    const submission = sQ.rows?.[0];
    if (!submission) return fail(res, "Not found", null, 404);

    const body = req.body || {};
    const nextStatus = isNonEmptyString(body.status) ? String(body.status).trim() : null;
    const source = isNonEmptyString(body.source) ? String(body.source).trim().slice(0, 20) : null;

    const loc = pickLocation(body);

    if (nextStatus && nextStatus !== submission.status) {
      const allowed = ["draft", "reviewed", "rejected", "submitted"];
      if (!allowed.includes(nextStatus))
        return fail(res, "Invalid status update.", { allowed }, 422);
      if (submission.status === "submitted" && !["reviewed", "rejected"].includes(nextStatus)) {
        return fail(res, "Invalid transition from submitted.", null, 422);
      }
    }

    const sets = [];
    const params = [];
    const set = (col, val) => {
      sets.push(`${col} = ?`);
      params.push(val);
    };

    if (nextStatus) set("status", nextStatus);
    if (source) set("source", source);

    ["reg_name", "prov_name", "city_name", "brgy_name"].forEach((k) => {
      if (Object.prototype.hasOwnProperty.call(body, k)) set(k, loc[k]);
    });

    if (!sets.length) return ok(res, submission, "No changes");

    params.push(id);

    await db.query(
      `UPDATE submissions
          SET ${sets.join(", ")}, updated_at = NOW()
        WHERE id = ?`,
      params
    );

    const u2 = await db.query(`SELECT * FROM submissions WHERE id = ? LIMIT 1`, [id]);
    return ok(res, u2.rows?.[0], "Updated");
  } catch (e) {
    return fail(
      res,
      "Failed to update submission",
      { error: String(e?.message || e) },
      500
    );
  }
}

export async function upsertSubmissionAnswers(req, res) {
  try {
    const id = toInt(req.params.id);
    if (!id) return fail(res, "Invalid id", null, 422);

    // MySQL placeholders
    const sQ = await db.query(`SELECT * FROM submissions WHERE id = ? LIMIT 1`, [id]);
    const submission = sQ.rows?.[0];
    if (!submission) return fail(res, "Not found", null, 404);

    const body = req.body || {};
    const answers = body.answers;
    const snapshots = body.snapshots || {};
    const mode = isNonEmptyString(body.mode) ? String(body.mode).trim() : null;

    if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
      return fail(res, "answers must be an object", null, 422);
    }

    // Save location if present (MySQL placeholders)
    const locKeys = ["reg_name", "prov_name", "city_name", "brgy_name"];
    const loc = pickLocation(body);

    const locSets = [];
    const locParams = [];
    locKeys.forEach((k) => {
      if (Object.prototype.hasOwnProperty.call(body, k)) {
        locSets.push(`${k} = ?`);
        locParams.push(loc[k]);
      }
    });

    if (locSets.length) {
      locParams.push(id);
      await db.query(
        `UPDATE submissions SET ${locSets.join(", ")}, updated_at = NOW() WHERE id = ?`,
        locParams
      );
      const r = await db.query(`SELECT * FROM submissions WHERE id = ? LIMIT 1`, [id]);
      Object.assign(submission, r.rows?.[0] || {});
    }

    // IMPORTANT: if your services/submissionsService.js still has $1, it will break here.
    // If you want ZERO dependency, comment this out and set mapping_json = {}.
    // For now we keep it; fix the service if it errors.
const mapping_json = {}; // temporary

    const allowedKeys =
      mapping_json && typeof mapping_json === "object" && !Array.isArray(mapping_json)
        ? Object.keys(mapping_json)
        : [];

    let updated = 0;
    const rejected = [];

    for (const [rawKey, value] of Object.entries(answers)) {
      const field_key = String(rawKey);

      if (allowedKeys.length && !allowedKeys.includes(field_key)) {
        rejected.push(field_key);
        continue;
      }

      const ss = snapshots && typeof snapshots === "object" ? snapshots[field_key] : null;

      const label = ss && typeof ss === "object" ? ss.label ?? null : null;
      const type = ss && typeof ss === "object" ? ss.type ?? null : null;
      const option_key = ss && typeof ss === "object" ? ss.option_key ?? null : null;
      const option_label = ss && typeof ss === "object" ? ss.option_label ?? null : null;

      let value_text = null;
      let value_number = null;
      let value_bool = null;
      let value_json = null;

      if (option_label) {
        value_text = String(option_label);
      } else {
        if (typeof value === "boolean") value_bool = value ? 1 : 0;
        else if (typeof value === "number" && Number.isFinite(value)) value_number = value;
        else if (value && typeof value === "object") value_json = value;
        else value_text = value === null || value === undefined ? null : String(value);
      }

      let resolved_option_key = option_key;
      if (["select", "radio", "multiple_choice"].includes(type)) {
        if (
          !resolved_option_key &&
          (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
        ) {
          resolved_option_key = String(value);
        }
      }

      // MySQL UPSERT (requires UNIQUE(submission_id, field_key))
      await db.query(
        `INSERT INTO submission_answers
          (submission_id, form_type_id, year, field_key,
           label, type, option_key, option_label,
           value_text, value_number, value_bool, value_json)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE
           form_type_id = VALUES(form_type_id),
           year = VALUES(year),
           label = COALESCE(VALUES(label), label),
           type = COALESCE(VALUES(type), type),
           option_key = COALESCE(VALUES(option_key), option_key),
           option_label = COALESCE(VALUES(option_label), option_label),
           value_text = VALUES(value_text),
           value_number = VALUES(value_number),
           value_bool = VALUES(value_bool),
           value_json = VALUES(value_json)`,
        [
          id,
          submission.form_type_id,
          submission.year,
          field_key,
          label,
          type,
          resolved_option_key,
          option_label,
          value_text,
          value_number,
          value_bool,
          value_json ? JSON.stringify(value_json) : null,
        ]
      );

      updated += 1;
    }

    if (mode === "submit") {
      const missing = [];
      if (!submission.prov_name) missing.push("prov_name");
      if (!submission.city_name) missing.push("city_name");
      if (!submission.brgy_name) missing.push("brgy_name");
      if (missing.length) {
        return fail(res, "Location is required before submit.", { missing }, 422);
      }
    }

    return ok(res, { updated, rejected }, "Saved");
  } catch (e) {
    return fail(res, "Failed to save answers", { error: String(e?.message || e) }, 500);
  }
}
export async function submitSubmission(req, res) {
  try {
    const id = toInt(req.params.id);
    if (!id) return fail(res, "Invalid id", null, 422);

    const sQ = await db.query(`SELECT * FROM submissions WHERE id = ? LIMIT 1`, [id]);
    const submission = sQ.rows?.[0];
    if (!submission) return fail(res, "Not found", null, 404);

    if (submission.status === "submitted") return ok(res, submission, "Already submitted");

    const missing = [];
    if (!submission.prov_name) missing.push("prov_name");
    if (!submission.city_name) missing.push("city_name");
    if (!submission.brgy_name) missing.push("brgy_name");
    if (missing.length) return fail(res, "Location is required before submit.", { missing }, 422);

    await db.query(
      `UPDATE submissions
          SET status = 'submitted', submitted_at = NOW(), updated_at = NOW()
        WHERE id = ?`,
      [id]
    );

    const r2 = await db.query(`SELECT * FROM submissions WHERE id = ? LIMIT 1`, [id]);
    return ok(res, r2.rows?.[0], "Submitted");
  } catch (e) {
    return fail(
      res,
      "Failed to submit",
      { error: String(e?.message || e) },
      500
    );
  }
}
