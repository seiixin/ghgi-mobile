// mobile/src/lib/submissionsApi.js
// Submissions API (mobile answering)
// Uses fetch directly to avoid apiFetch export mismatch issues.

import { BASE_URL } from "./config";
import { getAccessToken } from "./tokenStore";

function joinUrl(base, path) {
  const b = String(base || "").replace(/\/+$/, "");
  const p = String(path || "").replace(/^\/+/, "");
  return `${b}/${p}`;
}

async function authHeaders(extra = {}) {
  // tokenStore may be async (most RN storage is)
  const token = await getAccessToken();
  const h = { ...extra };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function requestJson(path, { method = "GET", body = undefined, headers = {} } = {}) {
  const url = joinUrl(BASE_URL, path);

  const finalHeaders = await authHeaders({
    Accept: "application/json",
    ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    ...headers,
  });

  const res = await fetch(url, {
    method,
    headers: finalHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const ct = res.headers?.get?.("content-type") || "";
  const payload = ct.includes("application/json") ? await res.json() : { message: await res.text() };

  if (!res.ok) {
    const msg = payload?.message || payload?.error || "Request failed";
    const err = new Error(msg);
    err.status = res.status;
    err.details = payload?.details ?? payload ?? null;
    throw err;
  }

  // backend format: { status, message, data }
  return payload?.data ?? payload;
}

export async function createSubmission({
  form_type_id,
  year,
  schema_version_id = null,
  source = "mobile",
  reg_name = null,
  prov_name,
  city_name,
  brgy_name,
}) {
  return await requestJson("/submissions", {
    method: "POST",
    body: {
      form_type_id,
      year,
      schema_version_id,
      source,
      reg_name,
      prov_name,
      city_name,
      brgy_name,
    },
  });
}

export async function saveSubmissionAnswers(
  submissionId,
  {
    mode = "draft",
    answers = {},
    snapshots = {},
    // allow either `location: {..}` OR top-level location keys
    location = null,
    reg_name,
    prov_name,
    city_name,
    brgy_name,
  } = {}
) {
  const loc = location && typeof location === "object"
    ? location
    : { reg_name, prov_name, city_name, brgy_name };

  return await requestJson(`/submissions/${submissionId}/answers`, {
    method: "PUT",
    body: {
      mode,
      answers,
      snapshots,
      ...loc,
    },
  });
}

export async function submitSubmission(submissionId) {
  return await requestJson(`/submissions/${submissionId}/submit`, {
    method: "POST",
  });
}

export async function getSubmission(submissionId) {
  return await requestJson(`/submissions/${submissionId}`, { method: "GET" });
}

export async function listSubmissions(params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    qs.set(k, String(v));
  });
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return await requestJson(`/submissions${suffix}`, { method: "GET" });
}
