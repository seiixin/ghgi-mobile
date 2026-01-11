// mobile/src/lib/config.js
import Constants from "expo-constants";

export function getApiBaseUrl() {
  const extra = Constants.expoConfig?.extra || Constants.manifest?.extra || {};
  const v = extra.apiBaseUrl || "http://10.0.2.2:4000/api";
  return String(v).trim().replace(/\/+$/, "");
}

// ✅ Backward-compatible constant export (what submissionsApi expects)
export const BASE_URL = getApiBaseUrl();
