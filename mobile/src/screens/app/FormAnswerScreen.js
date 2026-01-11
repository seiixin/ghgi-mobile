// mobile/src/screens/app/FormAnswerScreen.js
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  fetchActiveSchemaForFormType,
  fetchFormMapping,
  fetchFormTypes,
} from "../../lib/forms";
import {
  cacheMappingJson,
  getCachedMappingJson,
} from "../../lib/cacheStore";
import LocationPicker from "../../ui/LocationPicker";
import SchemaFormRenderer from "../../ui/SchemaFormRenderer";
import {
  createSubmission,
  saveSubmissionAnswers,
  submitSubmission,
} from "../../lib/submissionsApi";

/**
 * WIRED FLOW (mobile):
 * 1) FormsListScreen -> navigate("FormAnswer", { formTypeId, year })
 * 2) FormAnswerScreen loads:
 *    - formType row
 *    - active schema (from list OR fallback endpoint)
 *    - mapping_json (dropdown options) from cache OR endpoint
 * 3) User selects location + answers fields
 * 4) Save Draft:
 *    - ensureSubmission() => POST /submissions
 *    - PUT /submissions/:id/answers (mode=draft)
 * 5) Submit:
 *    - PUT /submissions/:id/answers (mode=submit)
 *    - POST /submissions/:id/submit
 */

function toYearNum(v) {
  const y = Number(String(v ?? "").trim());
  if (!Number.isFinite(y)) return null;
  if (y < 1900 || y > 3000) return null;
  return Math.trunc(y);
}

function pickActiveSchema(schemaVersions = []) {
  const list = Array.isArray(schemaVersions) ? schemaVersions : [];
  const active = list.find((v) => v?.status === "active");
  return active || list[0] || null;
}

function extractSchemaFromForm(form) {
  const versions = form?.schema_versions || form?.schemaVersions || [];
  const active = pickActiveSchema(versions);
  const schemaJson = active?.schema_json ?? active?.schemaJson ?? null;
  const schemaYear = active?.year ?? null;
  const schemaVersionId = active?.id ?? null;
  return { activeSchema: active, schemaJson, schemaYear, schemaVersionId };
}

function normalizeSchemaJson(raw) {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }
  if (typeof raw === "object") return raw;
  return null;
}

function buildSnapshotsFromSchema(schemaJson) {
  const sj = normalizeSchemaJson(schemaJson);
  const fields = Array.isArray(sj?.fields) ? sj.fields : [];

  const meta = {};
  for (const f of fields) {
    if (!f?.key) continue;
    meta[f.key] = {
      key: f.key,
      label: f.label ?? f.key,
      type: f.type ?? "text",
      required: !!f.required,
      // keep these for select-like fields; renderer can fill labels later
      option_key: f.option_key ?? f.optionKey ?? null,
      option_label: null,
    };
  }
  return meta;
}

function normalizeMappingJson(raw) {
  // mapping_json can be object or stringified JSON
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  if (typeof raw === "object") return raw;
  return {};
}

export default function FormAnswerScreen({ route, navigation }) {
  const { formTypeId, year: initialYear } = route.params || {};

  // IMPORTANT: year should already be DB-derived from FormsListScreen.
  // We keep a safe fallback to device year if route param missing.
  const yearToSend = useMemo(
    () => toYearNum(initialYear) ?? new Date().getFullYear(),
    [initialYear]
  );

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const [form, setForm] = useState(null);

  const [schemaJson, setSchemaJson] = useState(null);
  const [schemaVersionId, setSchemaVersionId] = useState(null);

  // NEW: mapping_json (dropdown options)
  const [mappingJson, setMappingJson] = useState({});

  const [submission, setSubmission] = useState(null);

  const [answers, setAnswers] = useState({});
  const [snapshots, setSnapshots] = useState({});

  const [location, setLocation] = useState({
    reg_name: "Region IV-A (CALABARZON)",
    prov_name: "Laguna",
    city_name: "",
    brgy_name: "",
  });

  const canRenderFields = useMemo(() => {
    const sj = normalizeSchemaJson(schemaJson);
    return !!sj && Array.isArray(sj.fields) && sj.fields.length > 0;
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

  const loadMappingJson = useCallback(
    async ({ formTypeIdNum, yearNum }) => {
      // Try cache first, then endpoint, then cache it.
      try {
        const cached = await getCachedMappingJson({
          formTypeId: formTypeIdNum,
          year: yearNum,
        });

        if (cached) {
          setMappingJson(normalizeMappingJson(cached));
          return { ok: true, source: "cache" };
        }

        const mapping = await fetchFormMapping({
          formTypeId: formTypeIdNum,
          year: yearNum,
        });

        const mj = normalizeMappingJson(mapping?.mapping_json ?? mapping?.mappingJson ?? {});
        setMappingJson(mj);

        await cacheMappingJson({
          formTypeId: formTypeIdNum,
          year: yearNum,
          mappingJson: mj,
        });

        return { ok: true, source: "network" };
      } catch (e) {
        // keep empty mapping; renderer can still show non-select fields
        setMappingJson({});
        return { ok: false, error: e };
      }
    },
    []
  );

  const load = useCallback(async () => {
    setLoading(true);
    setStatus("");

    try {
      if (!formTypeId) throw new Error("Missing formTypeId");

      const formTypeIdNum = Number(formTypeId);
      const yearNum = Number(yearToSend);

      // 1) load form list (year-aware)
      const forms = await fetchFormTypes({ year: yearNum });
      const f = (forms || []).find((x) => String(x.id) === String(formTypeId));
      if (!f) throw new Error("Form not found");
      setForm(f);

      // 2) resolve schemaJson + schemaVersionId
      let { schemaJson: sj, schemaVersionId: svid } = extractSchemaFromForm(f);
      sj = normalizeSchemaJson(sj);

      if (!sj || !svid) {
        setStatus("Loading schema...");
        const sv = await fetchActiveSchemaForFormType({
          formTypeId: formTypeIdNum,
          year: yearNum,
        });

        const svSchema = normalizeSchemaJson(sv?.schema_json ?? sv?.schemaJson ?? null);
        const svId = sv?.id ?? null;

        if (svSchema) sj = svSchema;
        if (svId) svid = svId;
      }

      setSchemaJson(sj);
      setSchemaVersionId(svid);

      // 3) ensure snapshots baseline (labels/types) for backend upsert
      setSnapshots((prev) => {
        const base = buildSnapshotsFromSchema(sj);
        return { ...base, ...prev };
      });

      // 4) NEW: load mapping_json (dropdown options)
      setStatus((prev) => prev || "Loading options...");
      const mapRes = await loadMappingJson({ formTypeIdNum, yearNum });

      // 5) show state messages
      if (!sj || !Array.isArray(sj?.fields) || sj.fields.length === 0) {
        setStatus("Schema missing / no fields returned for this form + year.");
      } else if (!svid) {
        setStatus(
          "Schema loaded, but schema_version_id missing. Forms schema endpoint must return schema version id."
        );
      } else if (!mapRes.ok) {
        // Not fatal; but user needs this to see dropdown options.
        setStatus("Schema loaded. Options not loaded (mapping_json missing). Long-press form in list to cache mapping or fix endpoint.");
      } else {
        setStatus("");
      }
    } catch (e) {
      setForm(null);
      setSchemaJson(null);
      setSchemaVersionId(null);
      setMappingJson({});
      setStatus(e?.message ? String(e.message) : "Failed to load form");
    } finally {
      setLoading(false);
    }
  }, [formTypeId, yearToSend, loadMappingJson]);

  useEffect(() => {
    load();
  }, [load]);

  async function ensureSubmission() {
    if (submission?.id) return submission;

    const missing = validateLocation(true);
    if (missing.length) {
      Alert.alert("Location required", `Complete: ${missing.join(", ")}`);
      return null;
    }

    if (!schemaVersionId) {
      Alert.alert(
        "Schema missing",
        "No schema_version_id found. Check forms schema response for the selected year."
      );
      return null;
    }

    setBusy(true);
    setStatus("Creating submission...");

    try {
      const created = await createSubmission({
        form_type_id: Number(formTypeId),
        year: yearToSend,
        schema_version_id: schemaVersionId,
        source: "mobile",
        reg_name: location.reg_name || null,
        prov_name: location.prov_name || null,
        city_name: location.city_name || null,
        brgy_name: location.brgy_name || null,
      });

      const s = created?.submission ?? created?.data?.submission ?? null;
      if (!s?.id) throw new Error("Create succeeded but missing submission id");

      setSubmission(s);
      setStatus(`Submission #${s.id} created`);
      return s;
    } catch (e) {
      Alert.alert("Create failed", e?.message ? String(e.message) : "Failed");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function onSaveDraft() {
    if (!canRenderFields) {
      Alert.alert("Schema missing", "No form fields to save. Load schema first.");
      return;
    }

    const sub = await ensureSubmission();
    if (!sub) return;

    setBusy(true);
    setStatus("Saving draft...");

    try {
      await saveSubmissionAnswers(sub.id, {
        mode: "draft",
        answers,
        snapshots,
        reg_name: location.reg_name || null,
        prov_name: location.prov_name || null,
        city_name: location.city_name || null,
        brgy_name: location.brgy_name || null,
      });

      setStatus("Draft saved");
    } catch (e) {
      Alert.alert("Save failed", e?.message ? String(e.message) : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit() {
    if (!canRenderFields) {
      Alert.alert("Schema missing", "No form fields to submit. Load schema first.");
      return;
    }

    const sub = await ensureSubmission();
    if (!sub) return;

    const missing = validateLocation(true);
    if (missing.length) {
      Alert.alert("Location required", `Complete: ${missing.join(", ")}`);
      return;
    }

    setBusy(true);
    setStatus("Submitting...");

    try {
      await saveSubmissionAnswers(sub.id, {
        mode: "submit",
        answers,
        snapshots,
        reg_name: location.reg_name || null,
        prov_name: location.prov_name || null,
        city_name: location.city_name || null,
        brgy_name: location.brgy_name || null,
      });

      await submitSubmission(sub.id);

      setStatus("Submitted");
      Alert.alert("Submitted", `Submission #${sub.id} submitted.`);
      navigation.goBack();
    } catch (e) {
      Alert.alert("Submit failed", e?.message ? String(e.message) : "Failed");
    } finally {
      setBusy(false);
    }
  }

  const debugFieldsCount = normalizeSchemaJson(schemaJson)?.fields?.length ?? 0;
  const debugMappingKeysCount = Object.keys(mappingJson || {}).length;

  return (
    <SafeAreaView style={styles.safe}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={styles.muted}>Loading...</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.title}>{form?.name || "Answer Form"}</Text>
          <Text style={styles.sub}>
            {form?.sector_key || "—"} • {form?.key || "—"} • Year {yearToSend}
          </Text>

          {!!status && <Text style={styles.status}>{status}</Text>}

          <LocationPicker value={location} onChange={setLocation} strict />

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Form Fields</Text>
              {!canRenderFields ? (
                <Pressable style={styles.retryBtn} onPress={load} disabled={busy}>
                  <Text style={styles.retryText}>{busy ? "..." : "Reload"}</Text>
                </Pressable>
              ) : null}
            </View>

            {!canRenderFields ? (
              <View style={{ paddingVertical: 10 }}>
                <Text style={styles.muted}>No schema fields loaded for this form/year.</Text>
                <Text style={styles.mutedSmall}>
                  Expected: forms API returns schema_versions OR fallback endpoint returns schema_json + id.
                </Text>
              </View>
            ) : (
              <SchemaFormRenderer
                schemaJson={schemaJson}
                mappingJson={mappingJson} // ✅ NEW: enables dropdowns from mapping_json
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
              <Text style={styles.btnTextOutline}>
                {busy ? "Please wait..." : "Save Draft"}
              </Text>
            </Pressable>

            <Pressable
              style={[styles.btn, styles.btnPrimary, busy && styles.btnDisabled]}
              disabled={busy}
              onPress={onSubmit}
            >
              <Text style={styles.btnTextPrimary}>
                {busy ? "Please wait..." : "Submit"}
              </Text>
            </Pressable>
          </View>

          {submission?.id ? (
            <Text style={styles.muted}>Submission ID: #{submission.id}</Text>
          ) : (
            <Text style={styles.muted}>
              No submission created yet (auto-create on first save/submit).
            </Text>
          )}

          <Text style={styles.debug}>
            schema_version_id: {schemaVersionId ? String(schemaVersionId) : "null"} • fields:{" "}
            {debugFieldsCount} • mapping_keys: {debugMappingKeysCount}
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  container: { padding: 14, paddingBottom: 24, gap: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  title: { fontSize: 18, fontWeight: "900", color: "#111" },
  sub: { fontSize: 12, color: "#666" },
  status: { fontSize: 12, color: "#0f766e" },
  muted: { fontSize: 12, color: "#666" },
  mutedSmall: { fontSize: 11, color: "#777", marginTop: 6 },

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
  btnTextOutline: { fontSize: 14, fontWeight: "800", color: "#111" },
  btnTextPrimary: { fontSize: 14, fontWeight: "800", color: "#fff" },

  debug: { marginTop: 8, fontSize: 11, color: "#999" },
});
