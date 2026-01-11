// mobile/src/lib/api.js
import { getApiBaseUrl } from "./config";
import { getTokens, saveTokens, clearTokens } from "./tokenStore";
import { getOrCreateDeviceId } from "./deviceStore";

/**
 * One API helper for the whole app:
 * - Adds Authorization: Bearer <access> automatically (when auth=true)
 * - Auto refresh on 401 once, then retries the original request
 * - Returns parsed JSON payload (or throws Error with status/details)
 * - Exposes apiFetch() for generic use and apiLogin/apiSignup/apiMe/apiLogout
 */

function joinUrl(base, path) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

async function readJsonSafe(res) {
  const ct = res.headers?.get?.("content-type") || "";
  if (ct.includes("application/json")) {
    try {
      return await res.json();
    } catch {
      return {};
    }
  }
  try {
    const text = await res.text();
    return { message: text };
  } catch {
    return {};
  }
}

function buildError(payload, fallbackMessage, res) {
  const msg =
    payload?.message ||
    payload?.error ||
    payload?.status?.message ||
    fallbackMessage ||
    "Request failed";

  const err = new Error(msg);
  err.status = res?.status;
  err.details = payload?.details ?? payload?.data ?? null;
  return err;
}

async function tryRefreshOnce() {
  const tokens = await getTokens();
  const refresh = tokens?.refresh;
  if (!refresh) return false;

  const device_id = await getOrCreateDeviceId();
  const base = getApiBaseUrl();

  const res = await fetch(joinUrl(base, "/auth/refresh"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ refresh_token: refresh, device_id }),
  });

  if (!res.ok) {
    await clearTokens();
    return false;
  }

  const payload = await readJsonSafe(res);

  // your backend returns: { user, access_token, refresh_token, token_type, expires_in }
  await saveTokens(payload);
  return true;
}

async function requestRaw(path, { method = "GET", body, auth = true, headers = {} } = {}) {
  const base = getApiBaseUrl();
  const url = joinUrl(base, path);

  const finalHeaders = {
    Accept: "application/json",
    ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    ...headers,
  };

  if (auth) {
    const tokens = await getTokens();
    if (tokens?.access) finalHeaders.Authorization = `Bearer ${tokens.access}`;
  }

  return await fetch(url, {
    method,
    headers: finalHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/**
 * apiFetch: returns parsed JSON (or throws)
 * - retries once after refresh when 401
 */
export async function apiFetch(path, opts = {}) {
  const auth = opts.auth ?? true;

  let res = await requestRaw(path, opts);

  if (res.status === 401 && auth) {
    const refreshed = await tryRefreshOnce();
    if (refreshed) {
      res = await requestRaw(path, opts);
    }
  }

  const payload = await readJsonSafe(res);

  if (!res.ok) {
    throw buildError(payload, "Request failed", res);
  }

  // Some endpoints return wrapper: { status, message, data }
  // Some return direct objects. Normalize:
  return payload?.data ?? payload;
}

/* =========================
 * AUTH ENDPOINTS
 * ========================= */

export async function apiLogin({ email, password }) {
  const device_id = await getOrCreateDeviceId();

  const payload = await apiFetch("/auth/login", {
    method: "POST",
    auth: false,
    body: {
      email,
      password,
      device_id,
      platform: "android",
      device_name: "expo",
    },
  });

  // payload might be wrapper or direct; apiFetch normalizes to payload.data ?? payload
  // But tokens are in the response; store again to be safe:
  await saveTokens(payload);

  return payload.user;
}

export async function apiSignup({ name, email, password }) {
  const device_id = await getOrCreateDeviceId();

  const payload = await apiFetch("/auth/signup", {
    method: "POST",
    auth: false,
    body: {
      name,
      email,
      password,
      device_id,
      platform: "android",
      device_name: "expo",
    },
  });

  await saveTokens(payload);
  return payload.user;
}

export async function apiMe() {
  const device_id = await getOrCreateDeviceId();

  const payload = await apiFetch(`/me?device_id=${encodeURIComponent(device_id)}`, {
    method: "GET",
    auth: true,
  });

  return payload.user ?? payload;
}

export async function apiLogout() {
  const device_id = await getOrCreateDeviceId();

  try {
    await apiFetch("/auth/logout", {
      method: "POST",
      auth: true,
      body: { device_id },
    });
  } finally {
    await clearTokens();
  }

  return true;
}
