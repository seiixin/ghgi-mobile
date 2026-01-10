# GHGI Mobile MOM1 - Submission Module Patch (Backend)

This patch adds a **Submission** module to the existing Node/Express backend **without** migrations or seeds.

## What you copy
Copy these files into your existing backend project:

- `src/routes/submissions.js`
- `src/controllers/submissionsController.js`
- `src/services/submissionsService.js`
- `src/utils/db.js`

## Mount the routes
In your `src/index.js` (or wherever routes are mounted), add:

```js
const submissionsRoutes = require("./routes/submissions");
app.use("/api/submissions", submissionsRoutes);
```

## Auth requirement
These routes assume your existing `middleware/auth.js` populates `req.user` with at least:
- `req.user.id` (numeric user id)

If your user field name differs, update `requireAuth()` in `submissionsController.js`.

## Database assumptions (existing)
Tables/columns are expected to already exist:

- `submissions`:
  `id, form_type_id, year, mapping_id, schema_version_id, source, status, created_by,
   reg_name, prov_name, city_name, brgy_name, submitted_at, created_at, updated_at`

- `submission_answers`:
  `id, submission_id, form_type_id, year, field_key, label, type, option_key, option_label,
   value_text, value_number, value_bool, value_json`

- `form_mappings`: `id, form_type_id, year, mapping_json`
- `form_types`: `id, name`

## Recommended constraint
For clean upserts:
- unique `(submission_id, field_key)` on `submission_answers`

## Endpoints
- `GET    /api/submissions`
- `POST   /api/submissions`
- `GET    /api/submissions/:id`
- `PATCH  /api/submissions/:id`
- `PUT    /api/submissions/:id/answers`
- `POST   /api/submissions/:id/submit`
