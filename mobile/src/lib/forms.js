// mobile/src/lib/forms.js
import { BASE_URL } from "./config";
import { getAccessToken } from "./tokenStore";

function joinUrl(base, path) {
  const b = String(base || "").replace(/\/+$/, "");
  const p = String(path || "").replace(/^\/+/, "");
  return `${b}/${p}`;
}

async function authHeaders(extra = {}) {
  const token = await getAccessToken();
  const h = { ...extra };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function getJson(path) {
  const url = joinUrl(BASE_URL, path);
  const res = await fetch(url, {
    headers: await authHeaders({ Accept: "application/json" }),
  });
  const ct = res.headers?.get?.("content-type") || "";
  const payload = ct.includes("application/json") ? await res.json() : { message: await res.text() };
  if (!res.ok) throw new Error(payload?.message || "Request failed");
  return payload?.data ?? payload;
}

function normalizeFormTypes(payload) {
  const list =
    (Array.isArray(payload) ? payload : null) ??
    payload?.formTypes ??
    payload?.data ??
    payload?.data?.formTypes ??
    [];
  return Array.isArray(list) ? list : [];
}

// EXISTING: list form types
export async function fetchFormTypes() {
  // Try a few likely endpoints
  const tries = ["/forms", "/forms?active=all", "/forms?include=schema_versions"];
  let lastErr = null;

  for (const p of tries) {
    try {
      const data = await getJson(p);
      const list = normalizeFormTypes(data);
      if (list.length) return list;
    } catch (e) {
      lastErr = e;
    }
  }

  if (lastErr) throw lastErr;
  return [];
}

// NEW: fetch active schema for a single form type (fallback when schema_versions missing)
export async function fetchActiveSchemaForFormType({ formTypeId, year }) {
  // Try likely endpoints (adjust if your backend differs)
  const y = year ? `?year=${encodeURIComponent(String(year))}` : "";
  const tries = [
    `/forms/${formTypeId}${y}`,
    `/forms/${formTypeId}/schema${y}`,
    `/forms/${formTypeId}/active-schema${y}`,
  ];

  let lastErr = null;
  for (const p of tries) {
    try {
      const data = await getJson(p);

      // normalize: could be {schema_version:{...}} OR {activeSchema:{...}} etc
      const sv =
        data?.schema_version ??
        data?.schemaVersion ??
        data?.active_schema ??
        data?.activeSchema ??
        data?.data?.schema_version ??
        null;

      if (sv?.schema_json || sv?.schemaJson) return sv;

      // sometimes backend returns the form itself
      const form = data?.form ?? data?.data?.form ?? data;
      const versions = form?.schema_versions || form?.schemaVersions || [];
      const list = Array.isArray(versions) ? versions : [];
      const active = list.find((v) => v?.status === "active") || list[0] || null;
      if (active?.schema_json || active?.schemaJson) return active;
    } catch (e) {
      lastErr = e;
    }
  }

  if (lastErr) throw lastErr;
  return null;
}
