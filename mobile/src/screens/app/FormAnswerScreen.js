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
  View,
} from "react-native";

import {
  fetchActiveSchemaForFormType,
  fetchFormMapping,
  fetchFormTypes,
} from "../../lib/forms";
import { cacheMappingJson, getCachedMappingJson } from "../../lib/cacheStore";

import LocationPicker from "../../ui/LocationPicker";
import SchemaFormRenderer from "../../ui/SchemaFormRenderer";

// Local-only drafts + downloaded forms
import { listDrafts, saveDraft, listDownloadedForms } from "../../storage/offlineStore";
import { submitDraftOnline } from "../../services/offlineSyncService";

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
  const schemaVersionId = active?.id ?? null;
  return { activeSchema: active, schemaJson, schemaVersionId };
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
      option_key: f.option_key ?? f.optionKey ?? null,
      option_label: null,
    };
  }
  return meta;
}

function normalizeMappingJson(raw) {
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

function makeDraftId() {
  // lightweight unique id
  return `draft_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

/**
 * UPDATED FLOW (local-only drafts):
 * - Save Draft = save JSON locally (offlineStore)
 * - Submit = tries online submit; if fails, keeps draft
 *
 * Route params supported:
 * - formTypeId, year
 * - mode: "new" | "draft"
 * - draftId (when mode="draft")
 */
export default function FormAnswerScreen({ route, navigation }) {
  const { formTypeId, year: initialYear, mode = "new", draftId: routeDraftId } = route.params || {};

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

  // mapping_json (dropdown options)
  const [mappingJson, setMappingJson] = useState({});

  // LOCAL draft state
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

  const initialHydratedRef = useRef(false);

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

  const findLocalDraft = useCallback(async (id) => {
    const list = await listDrafts();
    const d = (list || []).find((x) => String(x.draftId) === String(id));
    return d || null;
  }, []);

  const findDownloadedForm = useCallback(async ({ formTypeIdNum, yearNum }) => {
    const list = await listDownloadedForms();
    const f = (list || []).find(
      (x) => String(x.formTypeId) === String(formTypeIdNum) && String(x.year) === String(yearNum)
    );
    return f || null;
  }, []);

  const loadMappingJson = useCallback(
    async ({ formTypeIdNum, yearNum }) => {
      // Priority:
      // 1) Downloaded Forms (offlineStore) for this form+year
      // 2) cacheStore
      // 3) network fetchFormMapping (then cache)
      try {
        const offline = await findDownloadedForm({ formTypeIdNum, yearNum });
        if (offline?.mappingJson) {
          setMappingJson(normalizeMappingJson(offline.mappingJson));
          return { ok: true, source: "offlineStore" };
        }

        const cached = await getCachedMappingJson({ formTypeId: formTypeIdNum, year: yearNum });
        if (cached) {
          setMappingJson(normalizeMappingJson(cached));
          return { ok: true, source: "cache" };
        }

        const mapping = await fetchFormMapping({ formTypeId: formTypeIdNum, year: yearNum });
        const mj = normalizeMappingJson(mapping?.mapping_json ?? mapping?.mappingJson ?? {});
        setMappingJson(mj);

        await cacheMappingJson({ formTypeId: formTypeIdNum, year: yearNum, mappingJson: mj });
        return { ok: true, source: "network" };
      } catch (e) {
        setMappingJson({});
        return { ok: false, error: e };
      }
    },
    [findDownloadedForm]
  );

  const hydrateFromDraftIfNeeded = useCallback(async () => {
    if (initialHydratedRef.current) return;
    if (mode !== "draft") return;
    if (!routeDraftId) return;

    setStatus("Loading draft...");
    try {
      const d = await findLocalDraft(routeDraftId);
      if (!d) {
        setStatus("Draft not found locally.");
        return;
      }

      setDraftId(d.draftId);
      setServerSubmissionId(d.serverSubmissionId || null);

      setAnswers(d.answers || {});
      setSnapshots(d.snapshots || {});
      setLocation({
        reg_name: d?.location?.reg_name ?? "Region IV-A (CALABARZON)",
        prov_name: d?.location?.prov_name ?? "Laguna",
        city_name: d?.location?.city_name ?? "",
        brgy_name: d?.location?.brgy_name ?? "",
      });
    } finally {
      initialHydratedRef.current = true;
    }
  }, [findLocalDraft, mode, routeDraftId]);

  const load = useCallback(async () => {
    setLoading(true);
    setStatus("");

    try {
      if (!formTypeId) throw new Error("Missing formTypeId");

      const formTypeIdNum = Number(formTypeId);
      const yearNum = Number(yearToSend);

      // If opening a draft, hydrate answers/location first (so UI doesn't flash empty)
      await hydrateFromDraftIfNeeded();

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

      // 3) ensure snapshots baseline (labels/types) for local draft saving + backend submit
      setSnapshots((prev) => {
        const base = buildSnapshotsFromSchema(sj);
        return { ...base, ...prev };
      });

      // 4) mapping_json (offline store/cache/network)
      setStatus((prev) => prev || "Loading options...");
      const mapRes = await loadMappingJson({ formTypeIdNum, yearNum });

      // 5) status message
      if (!sj || !Array.isArray(sj?.fields) || sj.fields.length === 0) {
        setStatus("Schema missing / no fields returned for this form + year.");
      } else if (!svid) {
        setStatus("Schema loaded, but schema_version_id missing.");
      } else if (!mapRes.ok) {
        setStatus("Schema loaded. Options not loaded (mapping_json missing).");
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
  }, [formTypeId, yearToSend, hydrateFromDraftIfNeeded, loadMappingJson]);

  useEffect(() => {
    load();
  }, [load]);

  const persistLocalDraft = useCallback(
    async ({ reason = "manual" } = {}) => {
      if (!canRenderFields) {
        Alert.alert("Schema missing", "No form fields to save.");
        return null;
      }

      // For draft saving: location can be partial (allow city/prov missing if you want).
      // Here we keep it lenient to make drafts easy.
      const id = draftId || makeDraftId();

      setBusy(true);
      setStatus(reason === "submit" ? "Preparing draft..." : "Saving draft (local)...");

      try {
        const d = {
          draftId: id,
          serverSubmissionId: serverSubmissionId || null,
          formTypeId: Number(formTypeId),
          year: Number(yearToSend),
          mappingId: null,
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

        setStatus("Draft saved (local)");
        return d;
      } catch (e) {
        Alert.alert("Save failed", e?.message ? String(e.message) : "Failed");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [
      answers,
      canRenderFields,
      draftId,
      formTypeId,
      location,
      schemaVersionId,
      serverSubmissionId,
      snapshots,
      yearToSend,
    ]
  );

  const onSaveDraft = useCallback(async () => {
    const d = await persistLocalDraft({ reason: "manual" });
    if (d?.draftId) {
      Alert.alert("Saved", `Local draft saved.\nDraft ID: ${d.draftId}`);
    }
  }, [persistLocalDraft]);

  const onSubmit = useCallback(async () => {
    if (!canRenderFields) {
      Alert.alert("Schema missing", "No form fields to submit.");
      return;
    }

    // For submit: enforce full location
    const missing = validateLocation(true);
    if (missing.length) {
      Alert.alert("Location required", `Complete: ${missing.join(", ")}`);
      return;
    }

    // Always save local draft first (so nothing is lost if submit fails)
    const d = await persistLocalDraft({ reason: "submit" });
    if (!d) return;

    setBusy(true);
    setStatus("Submitting (online)...");

    try {
      // Uses offlineSyncService -> offlineSyncApi -> submissionsApi
      const submissionId = await submitDraftOnline(d);

      setServerSubmissionId(submissionId || null);
      setStatus("Submitted");
      Alert.alert("Submitted", `Submission #${submissionId} submitted.`);
      navigation.goBack();
    } catch (e) {
      // Keep local draft; user can retry later
      setStatus("Submit failed (draft kept locally)");
      Alert.alert(
        "Submit failed",
        `${String(e?.message || e)}\n\nYour draft is still saved locally. Retry later from Offline Sync.`
      );
    } finally {
      setBusy(false);
    }
  }, [canRenderFields, navigation, persistLocalDraft, validateLocation]);

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

          <View style={styles.modeRow}>
            <Text style={styles.muted}>
              Mode: {mode === "draft" ? "Draft" : "New"} • Draft ID: {draftId || "—"}
            </Text>
          </View>

          <LocationPicker value={location} onChange={setLocation} strict={false} />

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
                  If you plan full offline answering, cache schema JSON too (not just mapping).
                </Text>
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
              <Text style={styles.btnTextOutline}>{busy ? "Please wait..." : "Save Draft (Local)"}</Text>
            </Pressable>

            <Pressable
              style={[styles.btn, styles.btnPrimary, busy && styles.btnDisabled]}
              disabled={busy}
              onPress={onSubmit}
            >
              <Text style={styles.btnTextPrimary}>{busy ? "Please wait..." : "Submit (Online)"}</Text>
            </Pressable>
          </View>

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

  modeRow: { marginTop: -6 },

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
});
