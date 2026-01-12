// mobile/src/lib/forms.js
// Robust API helpers for forms endpoints.
// Supports apiFetch returning any of:
// 1) native fetch Response
// 2) already-parsed JSON payload (object/string/etc.)
// 3) wrapper object { ok, status, data/message/... }

import { apiFetch } from "./api";

function isFetchResponse(x) {
  return (
    !!x &&
    typeof x === "object" &&
    typeof x.json === "function" &&
    typeof x.headers?.get === "function"
  );
}

async function safeReadPayload(resOrPayload) {
  // Case A: apiFetch returned a native Response
  if (isFetchResponse(resOrPayload)) {
    const res = resOrPayload;
    const ct = res.headers?.get?.("content-type") || "";
    if (ct.includes("application/json")) return await res.json();
    if (typeof res.text === "function") return { message: await res.text() };
    return { message: "Non-JSON response" };
  }

  // Case B: apiFetch returned raw text
  if (typeof resOrPayload === "string") {
    try {
      return JSON.parse(resOrPayload);
    } catch {
      return { message: resOrPayload };
    }
  }

  // Case C: already-parsed object or null
  return resOrPayload ?? {};
}

function getOk(resOrPayload, payload) {
  // Native Response
  if (isFetchResponse(resOrPayload)) return !!resOrPayload.ok;

  // Wrapper with ok boolean
  if (resOrPayload && typeof resOrPayload === "object" && typeof resOrPayload.ok === "boolean") {
    return resOrPayload.ok;
  }

  // Payload conventions
  if (payload && typeof payload === "object") {
    if (payload.status === "error") return false;
    if (payload.error) return false;
  }
  return true;
}

function getStatus(resOrPayload) {
  if (isFetchResponse(resOrPayload)) return resOrPayload.status ?? 0;
  if (resOrPayload && typeof resOrPayload === "object" && typeof resOrPayload.status === "number") {
    return resOrPayload.status;
  }
  return 0;
}

function pick(obj, paths, fallback = undefined) {
  for (const p of paths) {
    const parts = String(p).split(".");
    let cur = obj;
    let ok = true;
    for (const k of parts) {
      if (cur && Object.prototype.hasOwnProperty.call(cur, k)) cur = cur[k];
      else {
        ok = false;
        break;
      }
    }
    if (ok && cur !== undefined) return cur;
  }
  return fallback;
}

function normalizeArray(v) {
  return Array.isArray(v) ? v : [];
}

function toYearNum(v) {
  const y = Number(String(v ?? "").trim());
  if (!Number.isFinite(y)) return null;
  const n = Math.trunc(y);
  if (n < 1900 || n > 3000) return null;
  return n;
}

function parseJsonMaybe(v, fallback) {
  if (v === null || v === undefined) return fallback;
  if (typeof v === "object") return v;
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      return parsed && typeof parsed === "object" ? parsed : fallback;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

/**
 * GET /form-years
 * expected:
 *  - { years:[2023,2024] }
 *  - { data:{ years:[...] } }
 */
export async function fetchFormYears() {
  const res = await apiFetch("/form-years", { method: "GET" });
  const payload = await safeReadPayload(res);
  const ok = getOk(res, payload);

  if (!ok) {
    const msg =
      pick(payload, ["message", "error.message"], null) ||
      `Failed to fetch years (status ${getStatus(res) || "?"})`;
    throw new Error(msg);
  }

  const years = pick(payload, ["years", "data.years"], []);
  return normalizeArray(years).map(toYearNum).filter(Boolean);
}

/**
 * GET /form-types?year=YYYY
 * expected:
 *  - { formTypes:[...] }
 *  - { data:{ formTypes:[...] } }
 */
export async function fetchFormTypes({ year } = {}) {
  const y = toYearNum(year);
  const qs = y ? `?year=${encodeURIComponent(String(y))}` : "";
  const res = await apiFetch(`/form-types${qs}`, { method: "GET" });
  const payload = await safeReadPayload(res);
  const ok = getOk(res, payload);

  if (!ok) {
    const msg =
      pick(payload, ["message", "error.message"], null) ||
      `Failed to fetch form types (status ${getStatus(res) || "?"})`;
    throw new Error(msg);
  }

  const list = pick(payload, ["formTypes", "data.formTypes", "data", "rows"], []);
  return normalizeArray(list);
}

/**
 * GET /form-mappings?form_type_id=&year=
 * expected:
 *  - { mapping:{ id, form_type_id, year, mapping_json } }
 *  - { data:{ mapping:{...} } }
 */
export async function fetchFormMapping({ formTypeId, year }) {
  const ft = Number(formTypeId);
  const y = toYearNum(year);

  if (!Number.isFinite(ft) || ft <= 0) throw new Error("formTypeId is required");
  if (!y) throw new Error("year is required");

  const qs = `?form_type_id=${encodeURIComponent(String(ft))}&year=${encodeURIComponent(String(y))}`;
  const res = await apiFetch(`/form-mappings${qs}`, { method: "GET" });
  const payload = await safeReadPayload(res);
  const ok = getOk(res, payload);

  if (!ok) {
    const msg =
      pick(payload, ["message", "error.message"], null) ||
      `Failed to fetch mapping (status ${getStatus(res) || "?"})`;
    throw new Error(msg);
  }

  const mapping = pick(payload, ["mapping", "data.mapping"], null);
  if (!mapping) return null;

  const mappingJson = parseJsonMaybe(mapping.mapping_json ?? mapping.mappingJson, {});
  return { ...mapping, mapping_json: mappingJson };
}

/**
 * GET /form-types/:id/active-schema?year=YYYY  (example)
 * Your backend may expose a different path; keep this wrapper aligned.
 *
 * expected:
 *  - { schemaVersion:{ id, schema_json, ... } }
 *  - { data:{ schemaVersion:{...} } }
 *  - { id, schema_json } (direct)
 */
export async function fetchActiveSchemaForFormType({ formTypeId, year }) {
  const ft = Number(formTypeId);
  const y = toYearNum(year);

  if (!Number.isFinite(ft) || ft <= 0) throw new Error("formTypeId is required");
  if (!y) throw new Error("year is required");

  // If your API is different, update this path only.
  const qs = `?year=${encodeURIComponent(String(y))}`;
  const res = await apiFetch(`/form-types/${encodeURIComponent(String(ft))}/active-schema${qs}`, {
    method: "GET",
  });
  const payload = await safeReadPayload(res);
  const ok = getOk(res, payload);

  if (!ok) {
    const msg =
      pick(payload, ["message", "error.message"], null) ||
      `Failed to fetch active schema (status ${getStatus(res) || "?"})`;
    throw new Error(msg);
  }

  const sv =
    pick(payload, ["schemaVersion", "data.schemaVersion"], null) ??
    (payload && typeof payload === "object" ? payload : null);

  if (!sv) return null;

  const schemaJson = parseJsonMaybe(sv.schema_json ?? sv.schemaJson, null);
  return { ...sv, schema_json: schemaJson };
}

/**
 * Used by Offline Sync module downloadForm().
 * Returns a compact payload suitable for offlineStore.saveDownloadedForm().
 *
 * Output:
 * {
 *   formTypeId, year,
 *   mappingId, schemaVersionId,
 *   mappingJson, downloadedAt
 * }
 */
export async function fetchFormSchema(formTypeId, year) {
  const ft = Number(formTypeId);
  const y = toYearNum(year);

  if (!Number.isFinite(ft) || ft <= 0) throw new Error("formTypeId is required");
  if (!y) throw new Error("year is required");

  // Fetch mapping (dropdown options)
  const mapping = await fetchFormMapping({ formTypeId: ft, year: y });
  const mappingId = mapping?.id ?? null;
  const mappingJson = mapping?.mapping_json ?? {};

  // Fetch active schema (to capture schemaVersionId; schema_json optional for now)
  const sv = await fetchActiveSchemaForFormType({ formTypeId: ft, year: y });
  const schemaVersionId = sv?.id ?? null;

  return {
    formTypeId: ft,
    year: y,
    mappingId,
    schemaVersionId,
    mappingJson,
    downloadedAt: Date.now(),
  };
}
