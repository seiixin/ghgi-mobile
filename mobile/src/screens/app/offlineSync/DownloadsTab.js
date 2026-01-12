// mobile/src/screens/app/offlineSync/DownloadsTab.js
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  deleteDownloadedForm,
  listDownloadedForms,
  listDrafts,
  saveDownloadedForm,
} from "../../../storage/offlineStore";

import { fetchFormTypes, fetchFormYears } from "../../../lib/forms";

// ✅ FIX: support BOTH default export and named export (prevents "got: undefined")
import * as DownloadedFormsListMod from "../offline/DownloadedFormsList";
const DownloadedFormsList =
  DownloadedFormsListMod?.DownloadedFormsList ?? DownloadedFormsListMod?.default;

if (!DownloadedFormsList) {
  throw new Error(
    "DownloadedFormsList is undefined. Check ../offline/DownloadedFormsList export (default vs named)."
  );
}

function toYearNum(v) {
  const y = Number(String(v ?? "").trim());
  if (!Number.isFinite(y)) return null;
  if (y < 1900 || y > 3000) return null;
  return Math.trunc(y);
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

function uniqSortedYears(arr) {
  const set = new Set();
  (arr || []).forEach((y) => {
    const n = toYearNum(y);
    if (n) set.add(n);
  });
  return Array.from(set).sort((a, b) => b - a);
}

function schemaVersionsOf(form) {
  return Array.isArray(form?.schema_versions)
    ? form.schema_versions
    : Array.isArray(form?.schemaVersions)
    ? form.schemaVersions
    : [];
}

function hasSchemaVersions(form) {
  return schemaVersionsOf(form).length > 0;
}

function pickBestSchemaVersion(form) {
  const arr = schemaVersionsOf(form);
  if (!arr.length) return null;

  const active = arr.filter((x) => String(x?.status ?? "").toLowerCase() === "active");
  const pool = active.length ? active : arr;

  const sorted = pool.slice().sort((a, b) => {
    const vb = Number(b?.version ?? 0) || 0;
    const va = Number(a?.version ?? 0) || 0;
    if (vb !== va) return vb - va;
    const ib = Number(b?.id ?? 0) || 0;
    const ia = Number(a?.id ?? 0) || 0;
    return ib - ia;
  });

  return sorted[0] ?? null;
}

function extractErrMessage(e) {
  if (!e) return "Unknown error";
  if (typeof e === "string") return e;
  if (e?.message) return convince(e.message);
  return String(e);
}
function convince(msg){ return String(msg); }

function formTitle(f) {
  return normalizeString(f?.name) || normalizeString(f?.title) || normalizeString(f?.key) || `Form ${f?.id}`;
}

function YearDropdown({ years, value, onChange }) {
  const [open, setOpen] = useState(false);
  const opts = useMemo(() => ["ALL", ...(Array.isArray(years) ? years : [])], [years]);
  const selectedLabel = value === "ALL" || value === null ? "ALL" : String(value);

  return (
    <>
      <Pressable style={styles.yearDrop} onPress={() => setOpen(true)}>
        <Text style={styles.yearDropLabel}>Year</Text>
        <Text style={styles.yearDropValue}>{selectedLabel}</Text>
      </Pressable>

      <Modal visible={open} animationType="fade" transparent onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Select Year</Text>
            <FlatList
              data={opts}
              keyExtractor={(y) => String(y)}
              renderItem={({ item }) => {
                const active = String(item) === String(value ?? "ALL");
                return (
                  <Pressable
                    style={[styles.modalRow, active && styles.modalRowActive]}
                    onPress={() => {
                      onChange?.(item);
                      setOpen(false);
                    }}
                  >
                    <Text style={[styles.modalRowText, active && styles.modalRowTextActive]}>
                      {item}
                    </Text>
                  </Pressable>
                );
              }}
              ItemSeparatorComponent={() => <View style={styles.sep} />}
            />
            <Pressable style={styles.modalClose} onPress={() => setOpen(false)}>
              <Text style={styles.modalCloseText}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

export default function DownloadsTab() {
  const [query, setQuery] = useState("");

  const [availableYears, setAvailableYears] = useState([]);
  const [yearFilter, setYearFilter] = useState("ALL");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState("");

  const [formTypes, setFormTypes] = useState([]); // base list
  const [formYearIndex, setFormYearIndex] = useState({});
  const [schemaByFormYear, setSchemaByFormYear] = useState({});

  const [downloadedForms, setDownloadedForms] = useState([]);
  const [drafts, setDrafts] = useState([]);

  const selectedYearNum = useMemo(() => {
    if (yearFilter === "ALL" || yearFilter === null) return null;
    return toYearNum(yearFilter);
  }, [yearFilter]);

  const loadLocal = useCallback(async () => {
    const [dl, dr] = await Promise.all([listDownloadedForms(), listDrafts()]);
    setDownloadedForms(Array.isArray(dl) ? dl : []);
    setDrafts(Array.isArray(dr) ? dr : []);
  }, []);

  const loadYears = useCallback(async () => {
    const years = await fetchFormYears();
    const normalized = uniqSortedYears(years);
    setAvailableYears(normalized);
    return normalized;
  }, []);

  const loadBaseForms = useCallback(async () => {
    const fresh = await fetchFormTypes();
    const list = Array.isArray(fresh) ? fresh : [];
    setFormTypes(list);
    return list;
  }, []);

  const buildFormYearIndex = useCallback(async (years) => {
    const ys = Array.isArray(years) ? years.map(toYearNum).filter(Boolean) : [];
    if (!ys.length) {
      setFormYearIndex({});
      setSchemaByFormYear({});
      return { index: {}, schemaMap: {} };
    }

    const index = {};
    const schemaMap = {};

    for (const y of ys) {
      try {
        const formsForYear = await fetchFormTypes({ year: y });
        const list = Array.isArray(formsForYear) ? formsForYear : [];

        for (const f of list) {
          if (!f?.id) continue;
          if (!hasSchemaVersions(f)) continue;

          const idStr = String(f.id);
          if (!index[idStr]) index[idStr] = new Set();
          index[idStr].add(y);

          const best = pickBestSchemaVersion(f);
          if (best) schemaMap[`${idStr}:${y}`] = best;
        }
      } catch {
        // ignore
      }
    }

    const out = {};
    for (const [id, set] of Object.entries(index)) {
      out[id] = Array.from(set).sort((a, b) => b - a);
    }

    setFormYearIndex(out);
    setSchemaByFormYear(schemaMap);
    return { index: out, schemaMap };
  }, []);

  const fullReload = useCallback(async () => {
    setStatus("");
    setLoading(true);
    try {
      await loadLocal();
      const years = await loadYears();
      await loadBaseForms();
      await buildFormYearIndex(years);
      if (!years.length) setStatus("No years available from database.");
    } catch (e) {
      setStatus(extractErrMessage(e));
    } finally {
      setLoading(false);
    }
  }, [loadLocal, loadYears, loadBaseForms, buildFormYearIndex]);

  useEffect(() => {
    fullReload();
  }, [fullReload]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fullReload();
    } finally {
      setRefreshing(false);
    }
  }, [fullReload]);

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

  const enrichedForms = useMemo(() => {
    const list = Array.isArray(formTypes) ? formTypes : [];
    return list.map((f) => {
      const years = Array.isArray(formYearIndex?.[f.id]) ? formYearIndex[f.id] : [];
      const sorted = years.slice().sort((a, b) => b - a);
      const latest = sorted[0] ?? null;

      const availableForSelectedYear = selectedYearNum ? sorted.includes(selectedYearNum) : true;
      const badgeYear = selectedYearNum ? selectedYearNum : latest;
      const resolvedYear = selectedYearNum ? selectedYearNum : latest;

      const key = resolvedYear ? `${Number(f.id)}:${Number(resolvedYear)}` : null;
      const downloaded = key ? downloadedIndex.get(key) === true : false;
      const draftCount = key ? draftCountIndex.get(key) || 0 : 0;

      return {
        ...f,
        _title: formTitle(f),
        _availableYears: sorted,
        _latestYear: latest,
        _badgeYear: badgeYear,
        _resolvedYear: resolvedYear,
        _availableForSelectedYear: availableForSelectedYear,
        _downloadedForResolvedYear: downloaded,
        _draftCountForResolvedYear: draftCount,
      };
    });
  }, [formTypes, formYearIndex, selectedYearNum, downloadedIndex, draftCountIndex]);

  const visibleForms = useMemo(() => {
    const base = selectedYearNum
      ? enrichedForms.filter((f) => f._availableForSelectedYear)
      : enrichedForms;

    const q = normalizeString(query);
    if (!q) return base;

    return base.filter((it) => {
      return (
        includesLoose(it?._title, q) ||
        includesLoose(it?.key, q) ||
        includesLoose(it?.sector_key, q) ||
        includesLoose(it?.description, q)
      );
    });
  }, [enrichedForms, selectedYearNum, query]);

  const handleDownload = useCallback(
    async (item) => {
      const formTypeId = Number(item?.id);
      const yearToUse = toYearNum(item?._resolvedYear);

      if (!Number.isFinite(formTypeId) || formTypeId < 1) return;

      if (!yearToUse) {
        Alert.alert(
          "Not available",
          "Walang available year na may schema para sa form na ito. I-check ang form_schema_versions."
        );
        return;
      }

      const key = `${String(formTypeId)}:${yearToUse}`;

      if (downloadedIndex.get(key) === true) {
        Alert.alert("Already downloaded", "This form/year is already cached for offline use.");
        return;
      }

      const sv = schemaByFormYear?.[key];
      if (!sv) {
        Alert.alert("Schema not found", `No schema_versions found for form_type_id=${formTypeId}, year=${yearToUse}.`);
        return;
      }

      if (!sv?.schema_json || !sv?.ui_json) {
        Alert.alert(
          "Cannot download",
          "schema_json/ui_json is missing in schema_versions returned by /form-types?year=YYYY."
        );
        return;
      }

      try {
        await saveDownloadedForm({
          formTypeId,
          year: yearToUse,
          title: item?._title ?? item?.name ?? `Form ${formTypeId}`,
          schemaVersionId: sv?.id ?? null,
          version: sv?.version ?? null,
          status: sv?.status ?? null,
          schema_json: sv.schema_json,
          ui_json: sv.ui_json,
          downloadedAt: new Date().toISOString(),
        });

        await loadLocal();
        Alert.alert("Downloaded", `${item?._title ?? "Form"} (${yearToUse}) saved for offline use.`);
      } catch (e) {
        Alert.alert("Download failed", extractErrMessage(e));
      }
    },
    [downloadedIndex, schemaByFormYear, loadLocal]
  );

  const handleRemoveDownloaded = useCallback(
    async (item) => {
      const formTypeId = Number(item?.id);
      const yearToUse = toYearNum(item?._resolvedYear);
      if (!formTypeId || !yearToUse) return;

      Alert.alert("Remove Downloaded Form", "Delete this offline form cache?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await deleteDownloadedForm(formTypeId, yearToUse);
            await loadLocal();
          },
        },
      ]);
    },
    [loadLocal]
  );

  const renderRow = ({ item }) => {
    const badgeText = item?._badgeYear ? String(item._badgeYear) : "—";
    const downloaded = !!item?._downloadedForResolvedYear;
    const draftCount = Number(item?._draftCountForResolvedYear ?? 0) || 0;
    const yearToUse = toYearNum(item?._resolvedYear);
    const canDownload = !!yearToUse && !downloaded;

    return (
      <View style={styles.rowCard}>
        <View style={{ flex: 1 }}>
          <View style={styles.rowTop}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {item?._title}
            </Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{badgeText}</Text>
            </View>
          </View>

          <Text style={styles.rowSub} numberOfLines={1}>
            {item?.sector_key ? `${item.sector_key} • ` : ""}
            {item?.key ?? ""}
          </Text>

          <Text style={styles.rowMeta} numberOfLines={1}>
            {downloaded ? "Downloaded" : "Not downloaded"} • Draft:{draftCount}
            {!selectedYearNum && Array.isArray(item?._availableYears) && item._availableYears.length > 1
              ? ` • Available: ${item._availableYears.join(", ")}`
              : ""}
          </Text>
        </View>

        {downloaded ? (
          <Pressable
            onPress={() => handleRemoveDownloaded(item)}
            style={({ pressed }) => [styles.btnGhost, pressed && styles.pressed]}
          >
            <Text style={styles.btnGhostText}>Remove</Text>
          </Pressable>
        ) : (
          <Pressable
            disabled={!canDownload}
            onPress={() => handleDownload(item)}
            style={({ pressed }) => [
              styles.btn,
              !canDownload && styles.btnDisabled,
              pressed && canDownload && styles.btnPressed,
            ]}
          >
            <Text style={styles.btnText}>{canDownload ? "Download" : "No schema"}</Text>
          </Pressable>
        )}
      </View>
    );
  };

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.filtersCard}>
        <Text style={styles.cardTitle}>Filters</Text>

        <View style={styles.controls}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Search</Text>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search forms..."
              style={styles.input}
            />
          </View>

          <View style={{ width: 150 }}>
            <YearDropdown years={availableYears} value={yearFilter} onChange={(y) => setYearFilter(y)} />
          </View>
        </View>

        <View style={styles.controls2}>
          <Pressable
            onPress={fullReload}
            style={({ pressed }) => [styles.refreshBtn, pressed && styles.pressed]}
            disabled={loading || refreshing}
          >
            <Text style={styles.refreshText}>Reload</Text>
          </Pressable>
        </View>

        {status ? <Text style={styles.status}>{status}</Text> : null}
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator />
          <Text style={styles.loadingText}>Loading…</Text>
        </View>
      ) : (
        <>
          <Text style={styles.sectionTitle}>
            Forms {selectedYearNum ? `(Year ${selectedYearNum})` : "(ALL years)"}
          </Text>

          <FlatList
            data={visibleForms}
            keyExtractor={(it) => String(it.id)}
            renderItem={renderRow}
            scrollEnabled={false}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>No forms found</Text>
                <Text style={styles.emptySub}>Try clearing search or switching Year to ALL.</Text>
              </View>
            }
          />

          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardTitle}>Downloaded Forms</Text>
              <Text style={styles.badgeCount}>{downloadedForms.length}</Text>
            </View>
            <Text style={styles.cardSub}>Offline caches stored locally.</Text>

            <DownloadedFormsList
              forms={downloadedForms}
              onDelete={(form) =>
                Alert.alert("Remove Downloaded Form", "Delete this offline form cache?", [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                      await deleteDownloadedForm(form?.formTypeId, form?.year);
                      await loadLocal();
                    },
                  },
                ])
              }
            />
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 28 },

  filtersCard: {
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 14,
    padding: 14,
    backgroundColor: "#fff",
  },

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
  cardTitle: { fontSize: 16, fontWeight: "900", color: "#111" },
  cardSub: { marginTop: 6, fontSize: 12.5, color: "#666", lineHeight: 18 },
  badgeCount: {
    minWidth: 28,
    textAlign: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#eee",
    backgroundColor: "#fafafa",
    fontWeight: "900",
    color: "#222",
  },

  controls: { marginTop: 10, flexDirection: "row", alignItems: "flex-end", gap: 12 },
  controls2: { marginTop: 10, flexDirection: "row", alignItems: "center", gap: 10 },

  label: { fontSize: 12, color: "#666", marginBottom: 6 },
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 14,
    color: "#111",
    backgroundColor: "#fafafa",
  },

  yearDrop: {
    height: 44,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    paddingHorizontal: 12,
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  yearDropLabel: { fontSize: 11, color: "#666" },
  yearDropValue: { marginTop: 2, fontSize: 14, fontWeight: "800", color: "#111" },

  refreshBtn: {
    height: 38,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ddd",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  refreshText: { fontSize: 13, fontWeight: "900", color: "#111" },

  loading: { alignItems: "center", justifyContent: "center", gap: 10, padding: 24 },
  loadingText: { color: "#666" },

  sectionTitle: { fontSize: 14, fontWeight: "900", color: "#111", marginTop: 12, marginBottom: 10 },

  rowCard: {
    flexDirection: "row",
    gap: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 14,
    backgroundColor: "#fff",
    marginBottom: 10,
    alignItems: "center",
  },
  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  rowTitle: { flex: 1, fontSize: 15, fontWeight: "900", color: "#111" },
  rowSub: { marginTop: 6, fontSize: 12, color: "#666" },
  rowMeta: { marginTop: 8, fontSize: 11.5, color: "#666" },

  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e5e5e5",
    backgroundColor: "#fafafa",
  },
  badgeText: { fontSize: 11, fontWeight: "900", color: "#111" },

  btn: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#111",
    backgroundColor: "#111",
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { color: "#fff", fontWeight: "900", fontSize: 12 },
  btnDisabled: { opacity: 0.4 },
  btnPressed: { opacity: 0.85 },

  btnGhost: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ddd",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  btnGhostText: { color: "#111", fontWeight: "900", fontSize: 12 },

  pressed: { opacity: 0.85 },

  empty: { padding: 18 },
  emptyTitle: { fontSize: 16, fontWeight: "900", color: "#111" },
  emptySub: { marginTop: 6, color: "#666" },

  // modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "75%",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 14,
  },
  modalTitle: { fontSize: 16, fontWeight: "900", color: "#111", marginBottom: 10 },
  modalRow: { paddingVertical: 12, paddingHorizontal: 10, borderRadius: 10 },
  modalRowActive: { backgroundColor: "#f3f4f6" },
  modalRowText: { fontSize: 14, fontWeight: "800", color: "#111" },
  modalRowTextActive: { color: "#111" },
  sep: { height: 1, backgroundColor: "#eee", marginVertical: 4 },
  modalClose: {
    marginTop: 10,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ddd",
    alignItems: "center",
    justifyContent: "center",
  },
  modalCloseText: { fontSize: 13, fontWeight: "900", color: "#111" },
});
