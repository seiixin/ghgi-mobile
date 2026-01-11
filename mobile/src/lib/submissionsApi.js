// mobile/src/lib/submissionsApi.js
// Submissions API (mobile answering)
// Uses fetch directly (no apiFetch dependency).
// - Adds robust JSON/text parsing (avoids "res.text is not a function" edge cases)
// - Supports tokenStore being async or sync
// - Throws rich errors (status + details)
// - Works with backend format { status, message, data } OR plain payloads

import { BASE_URL } from "./config";
import * as tokenStore from "./tokenStore";

function joinUrl(base, path) {
  const b = String(base || "").replace(/\/+$/, "");
  const p = String(path || "").replace(/^\/+/, "");
  return `${b}/${p}`;
}

async function safeGetToken() {
  try {
    const fn =
      typeof tokenStore?.getAccessToken === "function"
        ? tokenStore.getAccessToken
        : typeof tokenStore?.default?.getAccessToken === "function"
        ? tokenStore.default.getAccessToken
        : null;

    if (!fn) return null;

    const v = fn();
    return typeof v?.then === "function" ? await v : v;
  } catch {
    return null;
  }
}

async function authHeaders(extra = {}) {
  const token = await safeGetToken();
  const h = { ...extra };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

function isFetchResponse(x) {
  return !!x && typeof x === "object" && typeof x.json === "function";
}

async function readPayload(res) {
  // Normal fetch Response
  if (isFetchResponse(res)) {
    const ct = res.headers?.get?.("content-type") || "";
    if (ct.includes("application/json")) {
      try {
        return await res.json();
      } catch {
        return {};
      }
    }

    if (typeof res.text === "function") {
      try {
        const t = await res.text();
        return { message: t };
      } catch {
        return {};
      }
    }

    return {};
  }

  // If some wrapper returned already-parsed payload
  return res ?? {};
}

function unwrapData(payload) {
  // backend: { status, message, data }
  return payload?.data ?? payload;
}

function pickErrorMessage(payload) {
  return (
    payload?.message ||
    payload?.error?.message ||
    payload?.error ||
    payload?.status?.message ||
    "Request failed"
  );
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

  const payload = await readPayload(res);

  if (!res.ok) {
    const err = new Error(pickErrorMessage(payload));
    err.status = res.status;
    err.details = payload?.details ?? payload ?? null;
    throw err;
  }

  return unwrapData(payload);
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
      form_type_id: Number(form_type_id),
      year: Number(year),
      schema_version_id: schema_version_id === null ? null : Number(schema_version_id),
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
  const loc =
    location && typeof location === "object"
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
    body: undefined,
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
