// mobile/src/screens/app/OfflineSyncScreen.js
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Pressable,
} from "react-native";

import {
  listDrafts,
  listDownloadedForms,
  deleteDraft,
  deleteDownloadedForm,
  saveDownloadedForm,
} from "../../storage/offlineStore";

import { fetchFormTypes } from "../../lib/forms";

// ✅ FIX: support BOTH default export and named export (prevents "got: undefined")
import * as DownloadedFormsListMod from "./offline/DownloadedFormsList";
import * as DraftsListMod from "./offline/DraftsList";

const DownloadedFormsList =
  DownloadedFormsListMod?.DownloadedFormsList ?? DownloadedFormsListMod?.default;

const DraftsList = DraftsListMod?.DraftsList ?? DraftsListMod?.default;

// Hard fail early with clear error (instead of React "Element type is invalid")
if (!DownloadedFormsList) {
  throw new Error(
    "DownloadedFormsList is undefined. Check ./offline/DownloadedFormsList export (default vs named)."
  );
}
if (!DraftsList) {
  throw new Error(
    "DraftsList is undefined. Check ./offline/DraftsList export (default vs named)."
  );
}

/**
 * OfflineSyncScreen (NO backend changes)
 * - List forms by year using: /api/form-types?year=YYYY (via fetchFormTypes({year}))
 * - Download caches schema locally using saveDownloadedForm()
 */

function toYearNum(v) {
  const n = Number(String(v ?? "").trim());
  if (!Number.isFinite(n)) return null;
  const y = Math.trunc(n);
  if (y < 1900 || y > 3000) return null;
  return y;
}

function normalizeString(s) {
  return String(s ?? "").trim();
}

function includesLoose(hay, needle) {
  const h = normalizeString(hay).toLowerCase();
  const n = normalizeString(needle).toLowerCase();
  if (!n) return true;
  return h.includes(n);
}

function schemaVersionsOf(form) {
  return Array.isArray(form?.schema_versions)
    ? form.schema_versions
    : Array.isArray(form?.schemaVersions)
    ? form.schemaVersions
    : [];
}

function pickBestSchemaVersion(form) {
  const arr = schemaVersionsOf(form);
  if (!arr.length) return null;

  const active = arr.filter((x) => String(x?.status ?? "").toLowerCase() === "active");
  const pool = active.length ? active : arr;

  return (
    pool
      .slice()
      .sort((a, b) => {
        const vb = Number(b?.version ?? 0) || 0;
        const va = Number(a?.version ?? 0) || 0;
        if (vb !== va) return vb - va;
        const ib = Number(b?.id ?? 0) || 0;
        const ia = Number(a?.id ?? 0) || 0;
        return ib - ia;
      })[0] ?? null
  );
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

function formTitle(f) {
  return (
    normalizeString(f?.name) ||
    normalizeString(f?.title) ||
    normalizeString(f?.key) ||
    `Form ${f?.id ?? "—"}`
  );
}

export default function OfflineSyncScreen() {
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [query, setQuery] = useState("");

  const [loadingRemote, setLoadingRemote] = useState(false);
  const [remoteForms, setRemoteForms] = useState([]);
  const [remoteStatus, setRemoteStatus] = useState("");

  const [loadingLocal, setLoadingLocal] = useState(false);
  const [downloadedForms, setDownloadedForms] = useState([]);
  const [drafts, setDrafts] = useState([]);

  const [refreshing, setRefreshing] = useState(false);

  const parsedYear = useMemo(() => toYearNum(year), [year]);

  const loadLocal = useCallback(async () => {
    setLoadingLocal(true);
    try {
      const [dl, dr] = await Promise.all([listDownloadedForms(), listDrafts()]);
      setDownloadedForms(Array.isArray(dl) ? dl : []);
      setDrafts(Array.isArray(dr) ? dr : []);
    } finally {
      setLoadingLocal(false);
    }
  }, []);

  const loadRemote = useCallback(async () => {
    if (!parsedYear) {
      setRemoteForms([]);
      setRemoteStatus("Invalid year.");
      return;
    }

    setLoadingRemote(true);
    setRemoteStatus("");
    try {
      const res = await fetchFormTypes({ year: parsedYear });
      const list = Array.isArray(res) ? res : [];
      setRemoteForms(list);
      if (!list.length) setRemoteStatus("No forms returned for this year.");
    } catch (e) {
      setRemoteForms([]);
      setRemoteStatus(extractErrMessage(e));
    } finally {
      setLoadingRemote(false);
    }
  }, [parsedYear]);

  const fullLoad = useCallback(async () => {
    await Promise.all([loadLocal(), loadRemote()]);
  }, [loadLocal, loadRemote]);

  useEffect(() => {
    fullLoad();
  }, [fullLoad]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fullLoad();
    } finally {
      setRefreshing(false);
    }
  }, [fullLoad]);

  const downloadedIndex = useMemo(() => {
    const map = new Map();
    (downloadedForms || []).forEach((it) => {
      const k = `${Number(it?.formTypeId)}:${Number(it?.year)}`;
      map.set(k, true);
    });
    return map;
  }, [downloadedForms]);

  const draftCountIndex = useMemo(() => {
    const map = new Map();
    (drafts || []).forEach((d) => {
      const k = `${Number(d?.formTypeId)}:${Number(d?.year)}`;
      map.set(k, (map.get(k) || 0) + 1);
    });
    return map;
  }, [drafts]);

  const rows = useMemo(() => {
    const list = Array.isArray(remoteForms) ? remoteForms : [];
    const y = parsedYear;

    const enriched = list
      .map((f) => {
        const formTypeId = Number(f?.id);
        const key = `${formTypeId}:${Number(y)}`;

        const best = pickBestSchemaVersion(f);
        const hasSchema = !!best;

        return {
          raw: f,
          id: formTypeId,
          title: formTitle(f),
          year: y,
          hasSchema,
          schemaVersion: best,
          downloaded: downloadedIndex.get(key) === true,
          draftCount: draftCountIndex.get(key) || 0,
        };
      })
      .filter((r) => Number.isFinite(r.id) && r.id > 0);

    const q = normalizeString(query);
    if (!q) return enriched;

    return enriched.filter((r) => {
      const f = r.raw;
      return (
        includesLoose(r.title, q) ||
        includesLoose(f?.key, q) ||
        includesLoose(f?.sector_key, q) ||
        includesLoose(f?.description, q)
      );
    });
  }, [remoteForms, parsedYear, downloadedIndex, draftCountIndex, query]);

  const handleDownloadRow = useCallback(
    async (row) => {
      if (!row?.id || !row?.year) return;

      if (!row?.hasSchema || !row?.schemaVersion) {
        Alert.alert("Schema not available", "No schema_versions found for this form/year.");
        return;
      }
      if (row.downloaded) {
        Alert.alert("Already downloaded", "This form is already cached for offline use.");
        return;
      }

      try {
        const sv = row.schemaVersion;

        if (!sv?.schema_json || !sv?.ui_json) {
          Alert.alert("Cannot download", "schema_json/ui_json is missing in schema_versions.");
          return;
        }

        await saveDownloadedForm({
          formTypeId: row.id,
          year: row.year,
          title: row.title,
          schemaVersionId: sv?.id ?? null,
          version: sv?.version ?? null,
          status: sv?.status ?? null,
          schema_json: sv.schema_json,
          ui_json: sv.ui_json,
          downloadedAt: new Date().toISOString(),
        });

        await loadLocal();
        Alert.alert("Downloaded", `${row.title} (${row.year}) saved for offline use.`);
      } catch (e) {
        Alert.alert("Download failed", extractErrMessage(e));
      }
    },
    [loadLocal]
  );

  const handleRemoveDownloaded = useCallback(
    async (row) => {
      Alert.alert("Remove Downloaded Form", "Delete this offline form cache?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await deleteDownloadedForm(row?.id, row?.year);
            await loadLocal();
          },
        },
      ]);
    },
    [loadLocal]
  );

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Offline Sync</Text>
          <Text style={styles.sub}>
            List forms by year and download for offline use. Draft count is local.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Filters</Text>

          <View style={styles.row}>
            <View style={styles.field}>
              <Text style={styles.label}>Year</Text>
              <TextInput
                value={year}
                onChangeText={setYear}
                keyboardType="number-pad"
                placeholder="e.g. 2025"
                style={styles.input}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Search</Text>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search title, key, sector..."
                style={styles.input}
              />
            </View>
          </View>

          <Pressable
            onPress={loadRemote}
            disabled={loadingRemote}
            style={({ pressed }) => [
              styles.primaryBtn,
              loadingRemote && styles.btnDisabled,
              pressed && !loadingRemote && styles.btnPressed,
            ]}
          >
            <Text style={styles.primaryBtnText}>
              {loadingRemote ? "Loading..." : "Load forms for year"}
            </Text>
          </Pressable>

          {remoteStatus ? <Text style={styles.status}>{remoteStatus}</Text> : null}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Forms for {parsedYear || "—"}</Text>
            <Text style={styles.badge}>{rows.length}</Text>
          </View>
          <Text style={styles.cardSub}>Title • Year • Download status • Draft count</Text>

          {(loadingRemote || loadingLocal) && !rows.length ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator />
              <Text style={styles.loadingText}>Loading…</Text>
            </View>
          ) : null}

          {rows.map((r) => {
            const canDownload = r.hasSchema && !r.downloaded;
            const downloadLabel = r.downloaded ? "Downloaded" : canDownload ? "Download" : "No schema";
            const draftLabel = `Draft:${r.draftCount}`;

            return (
              <View key={`${r.id}:${r.year}`} style={styles.tableRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {r.title}
                  </Text>
                  <Text style={styles.rowMeta}>
                    Year: {r.year} • {draftLabel}
                  </Text>
                </View>

                {r.downloaded ? (
                  <Pressable
                    onPress={() => handleRemoveDownloaded(r)}
                    style={({ pressed }) => [styles.btnGhost, pressed && styles.btnPressedGhost]}
                  >
                    <Text style={styles.btnGhostText}>Remove</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={() => handleDownloadRow(r)}
                    disabled={!canDownload}
                    style={({ pressed }) => [
                      styles.btn,
                      !canDownload && styles.btnDisabled2,
                      pressed && canDownload && styles.btnPressed2,
                    ]}
                  >
                    <Text style={styles.btnText}>{downloadLabel}</Text>
                  </Pressable>
                )}

                <View style={styles.badgeMini}>
                  <Text style={styles.badgeMiniText}>{draftLabel}</Text>
                </View>
              </View>
            );
          })}

          {!rows.length && !loadingRemote ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No forms</Text>
              <Text style={styles.emptySub}>Try another year or clear search.</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Downloaded Forms</Text>
            <Text style={styles.badge}>{downloadedForms.length}</Text>
          </View>
          <Text style={styles.cardSub}>Offline caches stored locally.</Text>

          <DownloadedFormsList
            forms={downloadedForms}
            onDelete={(form) =>
              handleRemoveDownloaded({
                id: form?.formTypeId,
                year: form?.year,
                title: form?.title || "Form",
              })
            }
          />
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Drafts</Text>
            <Text style={styles.badge}>{drafts.length}</Text>
          </View>
          <Text style={styles.cardSub}>Local-only drafts saved as JSON snapshots.</Text>

          <DraftsList
            drafts={drafts}
            onOpen={() => {}}
            onDelete={async (draftId) => {
              Alert.alert("Delete Draft", "Are you sure you want to delete this draft?", [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Delete",
                  style: "destructive",
                  onPress: async () => {
                    await deleteDraft(draftId);
                    await loadLocal();
                  },
                },
              ]);
            }}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 16, paddingBottom: 28 },

  header: { paddingVertical: 6, marginBottom: 10 },
  title: { fontSize: 22, fontWeight: "800" },
  sub: { marginTop: 6, fontSize: 13, color: "#444", lineHeight: 18 },

  status: { marginTop: 10, fontSize: 13, color: "#444" },

  card: {
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 14,
    padding: 14,
    marginTop: 12,
    backgroundColor: "#fff",
  },
  cardHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardTitle: { fontSize: 16, fontWeight: "800" },
  cardSub: { marginTop: 6, fontSize: 12.5, color: "#666", lineHeight: 18 },

  row: { flexDirection: "row", gap: 10, marginTop: 10 },
  field: { flex: 1 },
  label: { fontSize: 12, color: "#444", marginBottom: 6, fontWeight: "700" },
  input: {
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: "#fafafa",
  },

  primaryBtn: {
    marginTop: 12,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#111",
    backgroundColor: "#111",
  },
  primaryBtnText: { color: "#fff", fontWeight: "800" },
  btnDisabled: { opacity: 0.55 },
  btnPressed: { opacity: 0.9 },

  badge: {
    minWidth: 28,
    textAlign: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#eee",
    backgroundColor: "#fafafa",
    fontWeight: "800",
    color: "#222",
  },

  loadingRow: { marginTop: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  loadingText: { color: "#666" },

  tableRow: {
    marginTop: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  rowTitle: { fontSize: 14, fontWeight: "900", color: "#111" },
  rowMeta: { marginTop: 4, fontSize: 12, color: "#666" },

  btn: {
    paddingHorizontal: 12,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#111",
    backgroundColor: "#111",
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { color: "#fff", fontWeight: "900", fontSize: 12 },
  btnDisabled2: { opacity: 0.4 },
  btnPressed2: { opacity: 0.85 },

  btnGhost: {
    paddingHorizontal: 12,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ddd",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  btnGhostText: { color: "#111", fontWeight: "900", fontSize: 12 },
  btnPressedGhost: { opacity: 0.7 },

  badgeMini: {
    height: 36,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#eee",
    backgroundColor: "#fafafa",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeMiniText: { fontSize: 11, fontWeight: "900", color: "#111" },

  empty: { padding: 12, marginTop: 10 },
  emptyTitle: { fontSize: 14, fontWeight: "900", color: "#111" },
  emptySub: { marginTop: 6, color: "#666" },
});
