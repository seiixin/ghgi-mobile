// mobile/src/lib/mySubmissionsApi.js
// Fetches submissions for the currently-authenticated user via:
//   GET /api/my-submissions
//
// Notes:
// - Uses fetch directly (no apiFetch dependency)
// - Robust JSON/text parsing
// - Supports async or sync tokenStore.getAccessToken()
// - Unwraps backend envelope: { status, message, data } -> returns data

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
  return res ?? {};
}

function unwrapData(payload) {
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

async function requestJson(path, { method = "GET", headers = {}, body = undefined } = {}) {
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

function buildQuery(params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    qs.set(k, String(v));
  });
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return suffix;
}

/**
 * listMySubmissions({ year?, status?, form_type_id?, per_page?, page? })
 * Returns: { data: [...], meta: {...} }
 */
export async function listMySubmissions(params = {}) {
  const suffix = buildQuery(params);
  return await requestJson(`/my-submissions${suffix}`, { method: "GET" });
}
