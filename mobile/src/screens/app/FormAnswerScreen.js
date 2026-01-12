// mobile/src/screens/app/FormAnswerScreen.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  fetchActiveSchemaForFormType,
  fetchFormMapping,
  fetchFormTypes,
} from "../../lib/forms";

import LocationPicker from "../../ui/LocationPicker";
import SchemaFormRenderer from "../../ui/SchemaFormRenderer";

import { listDrafts, saveDraft, listDownloadedForms } from "../../storage/offlineStore";
import { submitDraftOnline } from "../../services/offlineSyncService";

/* ------------------------ utils ------------------------ */

function toYearNum(v) {
  const y = Number(String(v ?? "").trim());
  if (!Number.isFinite(y)) return null;
  if (y < 1900 || y > 3000) return null;
  return Math.trunc(y);
}

function toInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function normalizeJson(raw) {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw);
      return p && typeof p === "object" ? p : null;
    } catch {
      return null;
    }
  }
  if (typeof raw === "object") return raw;
  return null;
}

function normalizeMappingJson(raw) {
  const v = normalizeJson(raw);
  return v && typeof v === "object" ? v : {};
}

function extractErrMessage(e) {
  if (!e) return "Unknown error";
  if (typeof e === "string") return e;
  if (e?.message) return String(e.message);
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

function makeDraftId() {
  return `draft_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

// robust snapshot builder: works for fields array only; if schema shape differs, snapshots can be built by renderer later
function buildSnapshotsFromSchema(schemaJson) {
  const sj = normalizeJson(schemaJson);
  const fields = Array.isArray(sj?.fields) ? sj.fields : [];
  const meta = {};
  for (const f of fields) {
    const k = String(f?.key ?? "").trim();
    if (!k) continue;
    meta[k] = {
      key: k,
      label: f.label ?? k,
      type: f.type ?? "text",
      required: !!f.required,
      option_key: f.option_key ?? f.optionKey ?? null,
      option_label: null,
    };
  }
  return meta;
}

function pickActiveSchema(schemaVersions = []) {
  const list = Array.isArray(schemaVersions) ? schemaVersions : [];
  const active = list.find((v) => String(v?.status || "").toLowerCase() === "active");
  return active || list[0] || null;
}

function extractSchemaFromForm(form) {
  const versions = form?.schema_versions || form?.schemaVersions || [];
  const active = pickActiveSchema(versions);
  const schemaJson = active?.schema_json ?? active?.schemaJson ?? null;
  const schemaVersionId = active?.id ?? null;
  return { schemaJson, schemaVersionId };
}

/* ------------------------ offline-only location UI ------------------------ */

function OfflineLocationPicker({ value, onChange, strict }) {
  const v = value || {};
  const set = (patch) => onChange?.({ ...v, ...patch });

  return (
    <View style={styles.locCard}>
      <Text style={styles.locTitle}>Location (Offline)</Text>
      <Text style={styles.locHint}>
        Offline mode: no network lookups. Type values manually.
      </Text>

      <Text style={styles.locLabel}>Region</Text>
      <TextInput
        style={styles.locInput}
        value={String(v.reg_name ?? "")}
        onChangeText={(t) => set({ reg_name: t })}
        placeholder="Region"
      />

      <Text style={styles.locLabel}>Province</Text>
      <TextInput
        style={styles.locInput}
        value={String(v.prov_name ?? "")}
        onChangeText={(t) => set({ prov_name: t })}
        placeholder="Province"
      />

      <Text style={styles.locLabel}>City/Municipality</Text>
      <TextInput
        style={styles.locInput}
        value={String(v.city_name ?? "")}
        onChangeText={(t) => set({ city_name: t })}
        placeholder="City / Municipality"
      />

      <Text style={styles.locLabel}>Barangay {strict ? "(required on submit)" : ""}</Text>
      <TextInput
        style={styles.locInput}
        value={String(v.brgy_name ?? "")}
        onChangeText={(t) => set({ brgy_name: t })}
        placeholder="Barangay"
      />
    </View>
  );
}

/* ------------------------ screen ------------------------ */

export default function FormAnswerScreen({ route, navigation }) {
  const params = route?.params || {};
  const mode = String(params?.mode || "new").toLowerCase();
  const routeDraftId = params?.draftId || null;
  const preferOffline = !!params?.preferOffline;

  const routeFormTypeId = toInt(params?.formTypeId);
  const routeYear = toYearNum(params?.year);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const [effectiveFormTypeId, setEffectiveFormTypeId] = useState(routeFormTypeId);
  const [effectiveYear, setEffectiveYear] = useState(routeYear ?? new Date().getFullYear());

  const [formTitle, setFormTitle] = useState("Answer Form");

  const [schemaJson, setSchemaJson] = useState(null);
  const [schemaVersionId, setSchemaVersionId] = useState(null);
  const [mappingJson, setMappingJson] = useState({});

  const [draftId, setDraftId] = useState(routeDraftId || null);
  const [serverSubmissionId, setServerSubmissionId] = useState(null);

  const [answers, setAnswers] = useState({});
  const [snapshots, setSnapshots] = useState({});

  const [location, setLocation] = useState({
    reg_name: "Region IV-A (CALABARZON)",
    prov_name: "Laguna",
    city_name: "",
    brgy_name: "",
  });

  const hydratedRef = useRef(false);

  /**
   * KEY CHANGE:
   * canRenderFields should not assume schemaJson.fields exists.
   * If schemaJson is an object, renderer will decide if fields exist.
   */
  const hasSchemaObject = useMemo(() => {
    const sj = normalizeJson(schemaJson);
    return !!sj && typeof sj === "object";
  }, [schemaJson]);

  const validateLocation = useCallback(
    (strict) => {
      const missing = [];
      if (!location?.prov_name) missing.push("prov_name");
      if (!location?.city_name) missing.push("city_name");
      if (strict && !location?.brgy_name) missing.push("brgy_name");
      return missing;
    },
    [location]
  );

  /* ------------------------ NETWORK GUARD (offline) ------------------------ */

  useEffect(() => {
    // Only guard when preferOffline=true for this screen instance.
    if (!preferOffline) return;

    const originalFetch = global.fetch;

    global.fetch = async (...args) => {
      const url = args?.[0];
      console.log("🟥 [BLOCKED NETWORK IN OFFLINE FORM]", url);
      // throw an error similar to RN network fail, but with explicit info
      throw new Error(`Network blocked in offline mode. url=${String(url)}`);
    };

    return () => {
      global.fetch = originalFetch;
    };
  }, [preferOffline]);

  /* ------------------------ local storage helpers ------------------------ */

  const findLocalDraft = useCallback(async (id) => {
    const list = await listDrafts();
    return (list || []).find((x) => String(x?.draftId) === String(id)) || null;
  }, []);

  const findDownloadedForm = useCallback(async ({ formTypeIdNum, yearNum }) => {
    const list = await listDownloadedForms();
    return (
      (list || []).find(
        (x) => String(x?.formTypeId) === String(formTypeIdNum) && String(x?.year) === String(yearNum)
      ) || null
    );
  }, []);

  const hydrateDraftIfNeeded = useCallback(async () => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;

    if (mode !== "draft" || !routeDraftId) return;

    setStatus("Loading draft...");
    const d = await findLocalDraft(routeDraftId);
    if (!d) {
      setStatus("Draft not found locally.");
      return;
    }

    const ft = toInt(d?.formTypeId ?? d?.form_type_id);
    const y = toYearNum(d?.year);

    if (ft) setEffectiveFormTypeId(ft);
    if (y) setEffectiveYear(y);

    setDraftId(d?.draftId);
    setServerSubmissionId(d?.serverSubmissionId || null);
    setAnswers(d?.answers || {});
    setSnapshots(d?.snapshots || {});
    setLocation({
      reg_name: d?.location?.reg_name ?? "Region IV-A (CALABARZON)",
      prov_name: d?.location?.prov_name ?? "Laguna",
      city_name: d?.location?.city_name ?? "",
      brgy_name: d?.location?.brgy_name ?? "",
    });
  }, [findLocalDraft, mode, routeDraftId]);

  const loadOfflinePayload = useCallback(
    async ({ formTypeIdNum, yearNum }) => {
      const off = await findDownloadedForm({ formTypeIdNum, yearNum });
      if (!off) throw new Error("Not downloaded for this year.");

      const sj = normalizeJson(off?.schema_json ?? off?.schemaJson);
      const uj = normalizeJson(off?.ui_json ?? off?.uiJson);
      if (!sj || !uj) throw new Error("Downloaded cache missing schema_json/ui_json.");

      const mj = off?.mapping_json ?? off?.mappingJson ?? off?.mapping ?? null;

      return {
        title: String(off?.title || "").trim() || `Form ${formTypeIdNum}`,
        schemaJson: sj,
        uiJson: uj,
        schemaVersionId: off?.schemaVersionId ?? off?.schema_version_id ?? null,
        mappingJson: normalizeMappingJson(mj),
      };
    },
    [findDownloadedForm]
  );

  const loadOnlinePayload = useCallback(async ({ formTypeIdNum, yearNum }) => {
    const forms = await fetchFormTypes({ year: yearNum });
    const f = (forms || []).find((x) => String(x?.id) === String(formTypeIdNum));
    if (!f) throw new Error("Form not found");

    let { schemaJson: sjRaw, schemaVersionId: svid } = extractSchemaFromForm(f);
    let sj = normalizeJson(sjRaw);

    if (!sj || !svid) {
      const sv = await fetchActiveSchemaForFormType({ formTypeId: formTypeIdNum, year: yearNum });
      sj = normalizeJson(sv?.schema_json ?? sv?.schemaJson);
      svid = sv?.id ?? svid ?? null;
    }

    const mapping = await fetchFormMapping({ formTypeId: formTypeIdNum, year: yearNum });
    const mj = normalizeMappingJson(mapping?.mapping_json ?? mapping?.mappingJson);

    return {
      title: String(f?.name || f?.title || f?.key || "").trim() || `Form ${formTypeIdNum}`,
      schemaJson: sj,
      schemaVersionId: svid,
      mappingJson: mj,
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setStatus("");

    try {
      await hydrateDraftIfNeeded();

      const formTypeIdNum = toInt(effectiveFormTypeId);
      const yearNum = toYearNum(effectiveYear) ?? new Date().getFullYear();

      if (!formTypeIdNum) throw new Error("Missing formTypeId");
      setEffectiveYear(yearNum);

      if (preferOffline) {
        setStatus("Loading offline cache...");
        const off = await loadOfflinePayload({ formTypeIdNum, yearNum });

        setFormTitle(off.title);
        setSchemaJson(off.schemaJson);
        setSchemaVersionId(off.schemaVersionId || null);
        setMappingJson(off.mappingJson);

        // keep existing snapshots (draft) but enrich if schema has fields[]
        setSnapshots((prev) => ({ ...buildSnapshotsFromSchema(off.schemaJson), ...prev }));

        setStatus("");
        return;
      }

      setStatus("Loading online...");
      const on = await loadOnlinePayload({ formTypeIdNum, yearNum });

      setFormTitle(on.title);
      setSchemaJson(on.schemaJson);
      setSchemaVersionId(on.schemaVersionId || null);
      setMappingJson(on.mappingJson);

      setSnapshots((prev) => ({ ...buildSnapshotsFromSchema(on.schemaJson), ...prev }));
      setStatus("");
    } catch (e) {
      setSchemaJson(null);
      setSchemaVersionId(null);
      setMappingJson({});
      setStatus(extractErrMessage(e));
    } finally {
      setLoading(false);
    }
  }, [
    hydrateDraftIfNeeded,
    effectiveFormTypeId,
    effectiveYear,
    preferOffline,
    loadOfflinePayload,
    loadOnlinePayload,
  ]);

  useEffect(() => {
    load();
  }, [load]);

  const persistLocalDraft = useCallback(
    async ({ reason = "manual" } = {}) => {
      const formTypeIdNum = toInt(effectiveFormTypeId);
      const yearNum = toYearNum(effectiveYear) ?? new Date().getFullYear();

      if (!formTypeIdNum) {
        Alert.alert("Missing formTypeId", "Cannot save draft.");
        return null;
      }
      if (!hasSchemaObject) {
        Alert.alert("Schema missing", "No schema loaded.");
        return null;
      }

      const id = draftId || makeDraftId();

      setBusy(true);
      setStatus(reason === "submit" ? "Preparing draft..." : "Saving draft...");

      try {
        const d = {
          draftId: id,
          serverSubmissionId: serverSubmissionId || null,
          formTypeId: formTypeIdNum,
          year: yearNum,
          schemaVersionId: schemaVersionId || null,
          location: {
            reg_name: location.reg_name || null,
            prov_name: location.prov_name || null,
            city_name: location.city_name || null,
            brgy_name: location.brgy_name || null,
          },
          answers: answers || {},
          snapshots: snapshots || {},
          status: "draft",
          dirty: true,
          updatedAt: Date.now(),
        };

        await saveDraft(d);
        setDraftId(id);
        setStatus("Draft saved");
        return d;
      } catch (e) {
        Alert.alert("Save failed", extractErrMessage(e));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [
      answers,
      hasSchemaObject,
      draftId,
      effectiveFormTypeId,
      effectiveYear,
      location,
      schemaVersionId,
      serverSubmissionId,
      snapshots,
    ]
  );

  const onSaveDraft = useCallback(async () => {
    const d = await persistLocalDraft({ reason: "manual" });
    if (d?.draftId) Alert.alert("Saved", "Local draft saved.");
  }, [persistLocalDraft]);

  const onSubmit = useCallback(async () => {
    if (!hasSchemaObject) {
      Alert.alert("Schema missing", "No schema to submit.");
      return;
    }

    const missing = validateLocation(true);
    if (missing.length) {
      Alert.alert("Location required", `Complete: ${missing.join(", ")}`);
      return;
    }

    const d = await persistLocalDraft({ reason: "submit" });
    if (!d) return;

    // If preferOffline, submission should not run.
    if (preferOffline) {
      Alert.alert("Offline", "You are in offline mode. Save draft then submit when online.");
      return;
    }

    setBusy(true);
    setStatus("Submitting (online)...");

    try {
      const submissionId = await submitDraftOnline(d);
      setServerSubmissionId(submissionId || null);
      setStatus("Submitted");
      Alert.alert("Submitted", `Submission #${submissionId} submitted.`);
      navigation?.goBack?.();
    } catch (e) {
      setStatus("Submit failed (draft kept locally)");
      Alert.alert("Submit failed", extractErrMessage(e));
    } finally {
      setBusy(false);
    }
  }, [hasSchemaObject, navigation, persistLocalDraft, validateLocation, preferOffline]);

  const yearLabel = toYearNum(effectiveYear) ?? new Date().getFullYear();

  // debug (safe)
  const debugSchemaKeys = useMemo(() => {
    const sj = normalizeJson(schemaJson);
    return sj && typeof sj === "object" ? Object.keys(sj).slice(0, 12).join(", ") : "null";
  }, [schemaJson]);

  return (
    <SafeAreaView style={styles.safe}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={styles.muted}>Loading...</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.title}>{formTitle}</Text>
          <Text style={styles.sub}>Year {yearLabel}</Text>

          {!!status && <Text style={styles.status}>{status}</Text>}

          <Text style={styles.muted}>
            Mode: {mode} • Draft: {draftId || "—"} • {preferOffline ? "Offline" : "Online"}
          </Text>

          {/* Offline: do not allow LocationPicker (it may fetch). */}
          {preferOffline ? (
            <OfflineLocationPicker value={location} onChange={setLocation} strict={false} />
          ) : (
            <LocationPicker value={location} onChange={setLocation} strict={false} />
          )}

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Form Fields</Text>
              {!hasSchemaObject ? (
                <Pressable style={styles.retryBtn} onPress={load} disabled={busy}>
                  <Text style={styles.retryText}>{busy ? "..." : "Reload"}</Text>
                </Pressable>
              ) : null}
            </View>

            {!hasSchemaObject ? (
              <View style={{ paddingVertical: 10 }}>
                <Text style={styles.muted}>No schema loaded.</Text>
              </View>
            ) : (
              <SchemaFormRenderer
                schemaJson={schemaJson}
                mappingJson={mappingJson}
                answers={answers}
                onChangeAnswers={setAnswers}
                snapshots={snapshots}
                onChangeSnapshots={setSnapshots}
              />
            )}
          </View>

          <View style={styles.actions}>
            <Pressable
              style={[styles.btn, styles.btnOutline, busy && styles.btnDisabled]}
              disabled={busy}
              onPress={onSaveDraft}
            >
              <Text style={styles.btnTextOutline}>{busy ? "..." : "Save Draft"}</Text>
            </Pressable>

            <Pressable
              style={[
                styles.btn,
                styles.btnPrimary,
                (busy || preferOffline) && styles.btnDisabled,
              ]}
              disabled={busy || preferOffline}
              onPress={onSubmit}
            >
              <Text style={styles.btnTextPrimary}>
                {busy ? "..." : preferOffline ? "Submit (Online only)" : "Submit"}
              </Text>
            </Pressable>
          </View>

          <Text style={styles.debug}>
            formTypeId: {String(effectiveFormTypeId || "null")} • schema_version_id:{" "}
            {schemaVersionId ? String(schemaVersionId) : "null"} • schemaKeys: {debugSchemaKeys}
          </Text>

          {preferOffline ? (
            <Text style={styles.debug2}>
              Offline network guard is ON. If anything still tries to fetch, it will log:
              {"\n"}🟥 [BLOCKED NETWORK IN OFFLINE FORM] &lt;url&gt;
            </Text>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

/* ------------------------ styles ------------------------ */

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  container: { padding: 14, paddingBottom: 24, gap: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  title: { fontSize: 18, fontWeight: "900", color: "#111" },
  sub: { fontSize: 12, color: "#666" },
  status: { fontSize: 12, color: "#0f766e" },
  muted: { fontSize: 12, color: "#666" },

  locCard: {
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 16,
    padding: 14,
    gap: 10,
    backgroundColor: "#fff",
  },
  locTitle: { fontSize: 14, fontWeight: "900", color: "#111" },
  locHint: { fontSize: 12, color: "#666", marginTop: -6 },

  locLabel: { fontSize: 12, color: "#666", marginTop: 6 },
  locInput: {
    height: 44,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 14,
    backgroundColor: "#fafafa",
    color: "#111",
  },

  card: { borderWidth: 1, borderColor: "#eee", borderRadius: 16, padding: 14, gap: 10 },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardTitle: { fontSize: 16, fontWeight: "900", color: "#111" },

  retryBtn: {
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ddd",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  retryText: { fontSize: 12, fontWeight: "800", color: "#111" },

  actions: { flexDirection: "row", gap: 10, marginTop: 6 },
  btn: { flex: 1, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  btnOutline: { borderWidth: 1, borderColor: "#ddd", backgroundColor: "#fff" },
  btnPrimary: { backgroundColor: "#111" },
  btnDisabled: { opacity: 0.6 },
  btnTextOutline: { fontSize: 13, fontWeight: "800", color: "#111", textAlign: "center" },
  btnTextPrimary: { fontSize: 13, fontWeight: "800", color: "#fff", textAlign: "center" },

  debug: { marginTop: 8, fontSize: 11, color: "#999" },
  debug2: { marginTop: 6, fontSize: 11, color: "#6b7280", lineHeight: 16 },
});
