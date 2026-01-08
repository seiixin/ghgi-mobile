import { getApiBaseUrl } from "./config";
import { getTokens, saveTokens, clearTokens } from "./tokenStore";
import { getOrCreateDeviceId } from "./deviceStore";

async function request(path, { method = "GET", body, auth = true } = {}) {
  const base = getApiBaseUrl();
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;

  let headers = { "Content-Type": "application/json" };
  let tokens = await getTokens();

  if (auth && tokens.access) {
    headers.Authorization = `Bearer ${tokens.access}`;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  // attempt refresh on 401 once
  if (res.status === 401 && auth) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      tokens = await getTokens();
      headers.Authorization = `Bearer ${tokens.access}`;
      const res2 = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
      return res2;
    }
  }

  return res;
}

async function tryRefresh() {
  const { refresh } = await getTokens();
  if (!refresh) return false;

  const device_id = await getOrCreateDeviceId();
  const base = getApiBaseUrl();
  const url = `${base}/auth/refresh`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refresh, device_id }),
  });

  if (!res.ok) {
    await clearTokens();
    return false;
  }
  const data = await res.json();
  await saveTokens(data);
  return true;
}

export async function apiLogin({ email, password }) {
  const device_id = await getOrCreateDeviceId();
  const res = await request("/auth/login", {
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
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Login failed");
  await saveTokens(data);
  return data.user;
}

export async function apiSignup({ name, email, password }) {
  const device_id = await getOrCreateDeviceId();
  const res = await request("/auth/signup", {
    method: "POST",
    auth: false,
    body: { name, email, password, device_id, platform: "android", device_name: "expo" },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Signup failed");
  await saveTokens(data);
  return data.user;
}

export async function apiMe() {
  const device_id = await getOrCreateDeviceId();
  const res = await request(`/me?device_id=${encodeURIComponent(device_id)}`, { method: "GET", auth: true });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Unauthorized");
  return data.user;
}

export async function apiLogout() {
  const device_id = await getOrCreateDeviceId();
  const res = await request("/auth/logout", { method: "POST", auth: true, body: { device_id } });
  await clearTokens();
  return res.ok;
}
