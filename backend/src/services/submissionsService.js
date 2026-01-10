// backend/src/services/submissionsService.js
import db from "../utils/db.js";

/**
 * Returns mapping_json for a given submission row.
 * Expected submission fields:
 * - mapping_id (nullable)
 * - form_type_id
 * - year
 */
export async function getMappingForSubmission(submission) {
  if (!submission) return { mapping_json: {} };

  // If submission has mapping_id, use it
  if (submission.mapping_id) {
    const r = await db.query(
      `SELECT id, mapping_json
         FROM form_mappings
        WHERE id = $1
        LIMIT 1`,
      [submission.mapping_id]
    );
    return { mapping_json: r.rows[0]?.mapping_json ?? {} };
  }

  // Else fallback by form_type_id + year (latest)
  const r = await db.query(
    `SELECT id, mapping_json
       FROM form_mappings
      WHERE form_type_id = $1 AND year = $2
      ORDER BY id DESC
      LIMIT 1`,
    [submission.form_type_id, submission.year]
  );

  return { mapping_json: r.rows[0]?.mapping_json ?? {} };
}
