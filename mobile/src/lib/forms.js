import { getApiBaseUrl } from "./config";
import { getTokens, saveTokens } from "./tokenStore";
import { getOrCreateDeviceId } from "./deviceStore";

/**
 * Read JSON if possible, else return { message: text }.
 */
async function readJsonOrText(res) {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return await res.json();
  const t = await res.text();
  return { message: t };
}

async function tryRefresh() {
  const { refresh } = await getTokens();
  if (!refresh) return false;

  const device_id = await getOrCreateDeviceId();
  const base = getApiBaseUrl();

  const res = await fetch(`${base}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refresh, device_id }),
  });

  const data = await readJsonOrText(res).catch(() => ({}));
  if (!res.ok) return false;

  // backend returns: { access_token, refresh_token, expires_in }
  await saveTokens(data);
  return true;
}

async function authedGet(path) {
  const base = getApiBaseUrl();
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;

  const tokens = await getTokens();
  const headers = { "Content-Type": "application/json" };
  if (tokens.access) headers.Authorization = `Bearer ${tokens.access}`;

  let res = await fetch(url, { method: "GET", headers });

  // If access expired/invalid, attempt refresh then retry once.
  if (res.status === 401) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      const tokens2 = await getTokens();
      const headers2 = { "Content-Type": "application/json" };
      if (tokens2.access) headers2.Authorization = `Bearer ${tokens2.access}`;
      res = await fetch(url, { method: "GET", headers: headers2 });
    }
  }

  const data = await readJsonOrText(res).catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}

/**
 * GET /api/form-types
 * Response: { formTypes: [{ id, key, name, sector_key, description }] }
 */
export async function fetchFormTypes() {
  const data = await authedGet("/form-types");
  const list = data?.formTypes ?? data?.data ?? data ?? [];
  return Array.isArray(list) ? list : [];
}

/**
 * GET /api/form-mappings?form_type_id=&year=
 * Response: { mapping: { id, form_type_id, year, mapping_json } }
 * mapping_json is returned as an object when possible.
 */
export async function fetchFormMapping({ formTypeId, year }) {
  const q = `form_type_id=${encodeURIComponent(String(formTypeId))}&year=${encodeURIComponent(String(year))}`;
  const data = await authedGet(`/form-mappings?${q}`);
  return data?.mapping ?? data;
}
