// mobile/src/lib/submissionsApi.js
// Submissions API (mobile answering) - aligned with Offline Sync module.
// Uses fetch directly (no apiFetch dependency).
//
// Key guarantees:
// 1) Validates BASE_URL (must exist; http/https)
// 2) Safe URL join
// 3) Rich "Network request failed" error includes URL + original error
// 4) Robust payload parsing (json/text/empty)
// 5) Token getter supports sync/async exports
// 6) Normalizes backend responses {status, message, data} OR plain payload
// 7) Exposes BOTH naming styles:
//    - saveSubmissionAnswers (existing)
//    - upsertAnswers (alias used by offlineSyncApi)
//    so you don't get export mismatch issues again.

import { BASE_URL } from "./config";
import * as tokenStore from "./tokenStore";

const DEBUG = true;

function log(...args) {
  if (DEBUG) console.log("🟦 [submissionsApi]", ...args);
}

function normalizeBaseUrl() {
  const b = String(BASE_URL ?? "").trim();
  if (!b) throw new Error("BASE_URL is empty in mobile/src/lib/config.js (submissionsApi)");
  if (!/^https?:\/\//i.test(b)) throw new Error(`BASE_URL must start with http:// or https:// (got: ${b})`);
  return b.replace(/\/+$/, "");
}

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
  if (!isFetchResponse(res)) return res ?? {};

  const ct = res.headers?.get?.("content-type") || "";
  const looksJson = ct.includes("application/json") || ct.includes("+json");

  if (looksJson) {
    try {
      return await res.json();
    } catch {
      try {
        if (typeof res.text === "function") {
          const t = await res.text();
          return t ? { message: t } : {};
        }
      } catch {}
      return {};
    }
  }

  if (typeof res.text === "function") {
    try {
      const t = await res.text();
      return t ? { message: t } : {};
    } catch {
      return {};
    }
  }

  return {};
}

function unwrapData(payload) {
  // backend often returns { status:"ok", message:"..", data:{...} }
  return payload?.data ?? payload;
}

function pickErrorMessage(payload) {
  const m =
    payload?.message ||
    payload?.error?.message ||
    (typeof payload?.error === "string" ? payload.error : null) ||
    payload?.status?.message ||
    payload?.data?.message;

  if (m) return String(m);

  try {
    return typeof payload === "string" ? payload : JSON.stringify(payload);
  } catch {
    return "Request failed";
  }
}

function enrichError(err, { url, method, status, payload }) {
  const e = err instanceof Error ? err : new Error(String(err));
  e.url = url;
  e.method = method;
  if (typeof status === "number") e.status = status;
  e.details = payload?.details ?? payload ?? null;
  return e;
}

async function requestJson(path, { method = "GET", body = undefined, headers = {} } = {}) {
  const base = normalizeBaseUrl();
  const url = joinUrl(base, path);

  const finalHeaders = await authHeaders({
    Accept: "application/json",
    ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    ...headers,
  });

  log(`${method} ${url}`, { hasAuth: !!finalHeaders.Authorization, hasBody: body !== undefined });

  let res;
  try {
    res = await fetch(url, {
      method,
      headers: finalHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw enrichError(new Error(`Network request failed (url=${url})`), {
      url,
      method,
      status: undefined,
      payload: { original: e?.message ?? String(e) },
    });
  }

  const payload = await readPayload(res);

  if (!res.ok) {
    const err = new Error(pickErrorMessage(payload));
    throw enrichError(err, { url, method, status: res.status, payload });
  }

  return unwrapData(payload);
}

/* =========================
 * API functions
 * ========================= */

export async function createSubmission({
  form_type_id,
  year,
  schema_version_id = null,
  source = "mobile",
  reg_name = null,
  prov_name = null,
  city_name = null,
  brgy_name = null,
  // tolerate camelCase too
  formTypeId,
  schemaVersionId,
} = {}) {
  const ft = form_type_id ?? formTypeId;
  const sv = schema_version_id ?? schemaVersionId;

  return await requestJson("/submissions", {
    method: "POST",
    body: {
      form_type_id: Number(ft),
      year: Number(year),
      schema_version_id: sv === null || sv === undefined ? null : Number(sv),
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
    location = null,
    reg_name = null,
    prov_name = null,
    city_name = null,
    brgy_name = null,
  } = {}
) {
  const loc =
    location && typeof location === "object"
      ? location
      : { reg_name, prov_name, city_name, brgy_name };

  return await requestJson(`/submissions/${encodeURIComponent(String(submissionId))}/answers`, {
    method: "PUT",
    body: {
      mode,
      answers,
      snapshots,
      ...loc,
    },
  });
}

// Alias used by offlineSyncApi.js (upsertSubmissionAnswers controller)
export async function upsertAnswers(submissionId, answers = {}, location = {}) {
  return await saveSubmissionAnswers(submissionId, {
    mode: "draft",
    answers,
    snapshots: {}, // offline module doesn't require snapshots; FormAnswer can pass snapshots via saveSubmissionAnswers
    location,
  });
}

export async function submitSubmission(submissionId) {
  return await requestJson(`/submissions/${encodeURIComponent(String(submissionId))}/submit`, {
    method: "POST",
    body: undefined,
  });
}

export async function getSubmission(submissionId) {
  return await requestJson(`/submissions/${encodeURIComponent(String(submissionId))}`, {
    method: "GET",
  });
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

/**
 * Optional helper for OfflineSyncScreen bulk submit later.
 * drafts: [{ answers, location, schemaVersionId, ... }]
 */
export async function submitFull(submissionId, { answers, snapshots, location } = {}) {
  await saveSubmissionAnswers(submissionId, { mode: "submit", answers, snapshots, location });
  return await submitSubmission(submissionId);
}
