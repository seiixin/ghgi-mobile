import Constants from "expo-constants";

export function getApiBaseUrl() {
  const extra = Constants.expoConfig?.extra || Constants.manifest?.extra || {};
  return extra.apiBaseUrl || "http://10.0.2.2:4000/api";
}
