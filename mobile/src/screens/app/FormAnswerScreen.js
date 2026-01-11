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

import { fetchFormTypes, fetchActiveSchemaForFormType } from "../../lib/forms";
import LocationPicker from "../../ui/LocationPicker";
import SchemaFormRenderer from "../../ui/SchemaFormRenderer";
import { createSubmission, saveSubmissionAnswers, submitSubmission } from "../../lib/submissionsApi";

/**
 * WIRED FLOW (mobile):
 * 1) FormsListScreen -> navigate("FormAnswer", { formTypeId, year })
 * 2) FormAnswerScreen loads:
 *    - formType row
 *    - active schema (from list OR fallback endpoint)
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
      option_key: null,
      option_label: null,
    };
  }
  return meta;
}

export default function FormAnswerScreen({ route, navigation }) {
  const { formTypeId, year: initialYear } = route.params || {};

  const yearToSend = useMemo(() => toYearNum(initialYear) ?? new Date().getFullYear(), [initialYear]);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const [form, setForm] = useState(null);

  const [schemaJson, setSchemaJson] = useState(null);
  const [schemaVersionId, setSchemaVersionId] = useState(null);

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

  const load = useCallback(async () => {
    setLoading(true);
    setStatus("");

    try {
      if (!formTypeId) throw new Error("Missing formTypeId");

      // IMPORTANT:
      // fetchFormTypes should include schema_versions for the requested year.
      // If your backend supports it, implement fetchFormTypes({ year }) to call:
      // GET /api/form-types?year=YYYY  (or whatever your backend expects)
      const forms = await fetchFormTypes({ year: yearToSend });
      const f = (forms || []).find((x) => String(x.id) === String(formTypeId));
      if (!f) throw new Error("Form not found");

      setForm(f);

      // 1) try schema from the form list response
      let { schemaJson: sj, schemaVersionId: svid } = extractSchemaFromForm(f);
      sj = normalizeSchemaJson(sj);

      // 2) fallback: fetch active schema endpoint (per-year)
      if (!sj || !svid) {
        setStatus("Loading schema...");
        const sv = await fetchActiveSchemaForFormType({ formTypeId: Number(formTypeId), year: yearToSend });
        const svSchema = normalizeSchemaJson(sv?.schema_json ?? sv?.schemaJson ?? null);
        const svId = sv?.id ?? null;

        if (svSchema) sj = svSchema;
        if (svId) svid = svId;
      }

      setSchemaJson(sj);
      setSchemaVersionId(svid);

      // ensure we always have snapshots for upsert (labels/types)
      // (SchemaFormRenderer can still update snapshots as user interacts)
      setSnapshots((prev) => {
        const base = buildSnapshotsFromSchema(sj);
        // keep any previously captured option labels, etc.
        return { ...base, ...prev };
      });

      if (!sj || !Array.isArray(sj?.fields) || sj.fields.length === 0) {
        setStatus("Schema missing / no fields returned for this form + year.");
      } else if (!svid) {
        setStatus("Schema loaded, but schema_version_id missing. Forms schema endpoint must return schema version id.");
      } else {
        setStatus("");
      }
    } catch (e) {
      setForm(null);
      setSchemaJson(null);
      setSchemaVersionId(null);
      setStatus(e?.message ? String(e.message) : "Failed to load form");
    } finally {
      setLoading(false);
    }
  }, [formTypeId, yearToSend]);

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

    // If your backend requires schema_version_id, keep this strict.
    // If backend no longer requires it (because you already know schema_version_id=1 in your Postman test),
    // you can remove this guard.
    if (!schemaVersionId) {
      Alert.alert("Schema missing", "No schema_version_id found. Check forms schema response for the selected year.");
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

      // createSubmission returns payload.data (from apiFetchJson)
      // backend data: { submission, mapping_json }
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
      // 1) save answers first (mode=submit) -> backend validates location for submit-mode too
      await saveSubmissionAnswers(sub.id, {
        mode: "submit",
        answers,
        snapshots,
        reg_name: location.reg_name || null,
        prov_name: location.prov_name || null,
        city_name: location.city_name || null,
        brgy_name: location.brgy_name || null,
      });

      // 2) then submit
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
                <Text style={styles.muted}>
                  No schema fields loaded for this form/year.
                </Text>
                <Text style={styles.mutedSmall}>
                  Expected: forms API returns schema_versions OR fallback endpoint returns schema_json + id.
                </Text>
              </View>
            ) : (
              <SchemaFormRenderer
                schemaJson={schemaJson}
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
              <Text style={styles.btnTextOutline}>{busy ? "Please wait..." : "Save Draft"}</Text>
            </Pressable>

            <Pressable
              style={[styles.btn, styles.btnPrimary, busy && styles.btnDisabled]}
              disabled={busy}
              onPress={onSubmit}
            >
              <Text style={styles.btnTextPrimary}>{busy ? "Please wait..." : "Submit"}</Text>
            </Pressable>
          </View>

          {submission?.id ? (
            <Text style={styles.muted}>Submission ID: #{submission.id}</Text>
          ) : (
            <Text style={styles.muted}>No submission created yet (auto-create on first save/submit).</Text>
          )}

          <Text style={styles.debug}>
            schema_version_id: {schemaVersionId ? String(schemaVersionId) : "null"} • fields:{" "}
            {normalizeSchemaJson(schemaJson)?.fields?.length ?? 0}
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
