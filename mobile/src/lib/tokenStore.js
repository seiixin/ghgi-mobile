import * as SecureStore from "expo-secure-store";

const KEYS = {
  access: "ghgi_access_token",
  refresh: "ghgi_refresh_token",
  expiresAt: "ghgi_access_expires_at",
};

export async function saveTokens({ access_token, refresh_token, expires_in }) {
  const expiresAt = Date.now() + (Number(expires_in) * 1000);
  await SecureStore.setItemAsync(KEYS.access, access_token);
  await SecureStore.setItemAsync(KEYS.refresh, refresh_token);
  await SecureStore.setItemAsync(KEYS.expiresAt, String(expiresAt));
}

export async function getTokens() {
  const access = await SecureStore.getItemAsync(KEYS.access);
  const refresh = await SecureStore.getItemAsync(KEYS.refresh);
  const expiresAt = await SecureStore.getItemAsync(KEYS.expiresAt);
  return { access, refresh, expiresAt: expiresAt ? Number(expiresAt) : null };
}

export async function clearTokens() {
  await SecureStore.deleteItemAsync(KEYS.access);
  await SecureStore.deleteItemAsync(KEYS.refresh);
  await SecureStore.deleteItemAsync(KEYS.expiresAt);
}

export async function isAccessExpired() {
  const { expiresAt } = await getTokens();
  if (!expiresAt) return true;
  return Date.now() > (expiresAt - 15_000);
}
