// mobile/src/screens/app/FormsListScreen.js
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { fetchFormMapping, fetchFormTypes, fetchFormYears } from "../../lib/forms";
import {
  cacheFormTypes,
  cacheMappingJson,
  getCachedFormTypes,
  getCachedMappingJson,
} from "../../lib/cacheStore";

/**
 * KEY FIXES (per advise)
 * 1) DO NOT default to current year (2026) when DB has no such year.
 *    - We only show years returned by fetchFormYears() (DB-derived).
 *    - If years endpoint fails/empty: show "No years available" and block form answering.
 *
 * 2) Forms list is reloaded when selected year changes.
 *
 * 3) Badge shows (year|SELECTED_YEAR), not device year.
 *
 * REQUIRED BACKEND (recommended)
 * - GET /form-years -> { years: [2023, ...] } from DISTINCT year in form_schema_versions and/or form_mappings.
 * - GET /form-types?year=2023 should ideally return the schema_version_id/schema_json for that year (so FormAnswerScreen can render).
 */

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
  return Array.from(set).sort((a, b) => b - a); // desc
}

function YearDropdown({ years, value, onChange }) {
  const [open, setOpen] = useState(false);

  const selectedLabel = value ? String(value) : "Select year";
  const disabled = !Array.isArray(years) || years.length === 0;

  return (
    <>
      <Pressable
        style={[styles.yearDrop, disabled && styles.disabled]}
        onPress={() => setOpen(true)}
        disabled={disabled}
      >
        <Text style={styles.yearDropLabel}>Year</Text>
        <Text style={styles.yearDropValue}>{selectedLabel}</Text>
      </Pressable>

      <Modal visible={open} animationType="fade" transparent onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Select Year</Text>

            <FlatList
              data={years}
              keyExtractor={(y) => String(y)}
              renderItem={({ item }) => {
                const active = Number(item) === Number(value);
                return (
                  <Pressable
                    style={[styles.modalRow, active && styles.modalRowActive]}
                    onPress={() => {
                      onChange?.(item);
                      setOpen(false);
                    }}
                  >
                    <Text style={[styles.modalRowText, active && styles.modalRowTextActive]}>{item}</Text>
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

export default function FormsListScreen({ navigation }) {
  const [query, setQuery] = useState("");

  // selected year must come from DB-derived list, not device year
  const [availableYears, setAvailableYears] = useState([]);
  const [year, setYear] = useState(null); // number or null

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [formTypes, setFormTypes] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [status, setStatus] = useState("");

  const yearNum = useMemo(() => toYearNum(year), [year]);

  const filteredForms = useMemo(() => {
    const q = normalizeString(query);
    const list = Array.isArray(formTypes) ? formTypes : [];
    if (!q) return list;

    return list.filter((it) => {
      return (
        includesLoose(it?.name, q) ||
        includesLoose(it?.key, q) ||
        includesLoose(it?.sector_key, q) ||
        includesLoose(it?.description, q)
      );
    });
  }, [formTypes, query]);

  async function loadYears() {
    setStatus("");
    try {
      const years = await fetchFormYears();
      const normalized = uniqSortedYears(years);

      setAvailableYears(normalized);

      if (normalized.length === 0) {
        setYear(null);
        setFormTypes([]);
        setStatus("No years available from database (form_mappings / form_schema_versions).");
        return null;
      }

      // default: latest available year
      setYear((prev) => {
        const prevNum = toYearNum(prev);
        if (prevNum && normalized.includes(prevNum)) return prevNum;
        return normalized[0];
      });

      return normalized[0];
    } catch (e) {
      // IMPORTANT: do not fallback to device year (this caused 2026)
      setAvailableYears([]);
      setYear(null);
      setFormTypes([]);
      setStatus(e?.message ? String(e.message) : "Failed to load years.");
      return null;
    }
  }

  async function loadForms({ showCachedFirst = true } = {}) {
    // if no DB year selected, stop
    if (!yearNum) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setStatus("");

    if (showCachedFirst) {
      try {
        const cached = await getCachedFormTypes();
        if (cached?.length) setFormTypes(cached);
      } catch {
        // ignore cache errors
      }
    }

    try {
      // IMPORTANT: fetchFormTypes({year}) must call a year-aware API
      // e.g. GET /form-types?year=2023
      const fresh = await fetchFormTypes({ year: yearNum });
      const list = Array.isArray(fresh) ? fresh : [];

      setFormTypes(list);
      await cacheFormTypes(list);

      if (!list.length) setStatus(`No forms found for (year|${yearNum}).`);
    } catch (e) {
      setStatus(e?.message ? String(e.message) : "Failed to load form types");
    } finally {
      setLoading(false);
    }
  }

  async function refreshForms() {
    if (!yearNum) return;

    setRefreshing(true);
    setStatus("");

    try {
      const fresh = await fetchFormTypes({ year: yearNum });
      const list = Array.isArray(fresh) ? fresh : [];
      setFormTypes(list);
      await cacheFormTypes(list);

      if (!list.length) setStatus(`No forms found for (year|${yearNum}).`);
    } catch (e) {
      setStatus(e?.message ? String(e.message) : "Failed to refresh");
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      const firstYear = await loadYears();
      if (firstYear) {
        // ensure yearNum is set before loading forms
        setYear(firstYear);
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // when year changes, reload forms
  useEffect(() => {
    if (!yearNum) return;
    loadForms({ showCachedFirst: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearNum]);

  async function onDownloadMapping(item) {
    if (!yearNum) {
      Alert.alert("Year required", "Select a year that exists in the database.");
      return;
    }

    setSelectedId(item.id);
    setStatus("Checking cache...");

    try {
      const cached = await getCachedMappingJson({ formTypeId: item.id, year: yearNum });
      if (cached) {
        setStatus(`Cached mapping found for ${item.name} (year|${yearNum}).`);
        return;
      }

      setStatus("Downloading mapping...");
      const mapping = await fetchFormMapping({ formTypeId: item.id, year: yearNum });

      const mappingJson = mapping?.mapping_json ?? {};
      await cacheMappingJson({ formTypeId: item.id, year: yearNum, mappingJson });

      setStatus(`Downloaded and cached mapping for ${item.name} (year|${yearNum}).`);
    } catch (e) {
      setStatus(e?.message ? String(e.message) : "Failed to download mapping");
    } finally {
      setSelectedId(null);
    }
  }

  function onAnswerForm(item) {
    if (!yearNum) {
      Alert.alert("Year required", "Select a year that exists in the database.");
      return;
    }
    navigation.navigate("FormAnswer", { formTypeId: item.id, year: yearNum });
  }

  const renderItem = ({ item }) => (
    <Pressable
      style={styles.card}
      onPress={() => onAnswerForm(item)}
      onLongPress={() => onDownloadMapping(item)}
      delayLongPress={350}
      disabled={!yearNum}
    >
      <View style={{ flex: 1 }}>
        <View style={styles.rowTop}>
          <Text style={styles.cardTitle}>{item.name}</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{yearNum ? `year|${yearNum}` : "year|—"}</Text>
          </View>
        </View>

        <Text style={styles.cardSub}>
          {item.sector_key} • {item.key}
        </Text>

        {item.description ? (
          <Text style={styles.cardDesc} numberOfLines={2}>
            {item.description}
          </Text>
        ) : null}

        <Text style={styles.cardHint} numberOfLines={1}>
          Tap: Answer • Long-press: Download mapping cache
        </Text>

        {!yearNum ? <Text style={styles.warn}>Select a DB year first.</Text> : null}
      </View>

      <View style={styles.right}>
        {selectedId === item.id ? <ActivityIndicator /> : <Text style={styles.action}>Open</Text>}
      </View>
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Forms</Text>

        <View style={styles.controls}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Search</Text>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search forms (name, key, sector)..."
              style={styles.searchInput}
              returnKeyType="search"
            />
          </View>

          <View style={{ width: 150 }}>
            <YearDropdown years={availableYears} value={yearNum} onChange={(y) => setYear(y)} />
          </View>
        </View>

        <View style={styles.controls2}>
          <Pressable
            onPress={refreshForms}
            style={({ pressed }) => [styles.refreshBtn, pressed && styles.pressed]}
            disabled={refreshing || !yearNum}
          >
            <Text style={styles.refreshText}>{refreshing ? "Refreshing..." : "Refresh"}</Text>
          </Pressable>

          <Pressable
            onPress={async () => {
              setQuery("");
              setStatus("Reloading years...");
              await loadYears();
            }}
            style={({ pressed }) => [styles.refreshBtn, pressed && styles.pressed]}
            disabled={refreshing}
          >
            <Text style={styles.refreshText}>Reload Years</Text>
          </Pressable>
        </View>

        {status ? <Text style={styles.status}>{status}</Text> : null}
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator />
          <Text style={styles.loadingText}>Loading…</Text>
        </View>
      ) : !yearNum ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No year selected</Text>
          <Text style={styles.emptySub}>
            Years must come from DB (form_mappings.year / form_schema_versions.year). Add /form-years endpoint or fix it.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredForms}
          keyExtractor={(it) => String(it.id)}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 12, paddingBottom: 24 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No forms found</Text>
              <Text style={styles.emptySub}>Try changing year or clearing search.</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },

  header: { padding: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: "#eee" },
  title: { fontSize: 20, fontWeight: "700", color: "#111" },

  controls: { marginTop: 12, flexDirection: "row", alignItems: "flex-end", gap: 12 },
  controls2: { marginTop: 10, flexDirection: "row", alignItems: "center", gap: 10 },

  label: { fontSize: 12, color: "#666", marginBottom: 6 },

  searchInput: {
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

  disabled: { opacity: 0.55 },

  yearDropLabel: { fontSize: 11, color: "#666" },
  yearDropValue: { marginTop: 2, fontSize: 14, fontWeight: "700", color: "#111" },

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
  pressed: { opacity: 0.7 },
  refreshText: { fontSize: 13, fontWeight: "700", color: "#111" },

  status: { marginTop: 10, fontSize: 13, color: "#444" },

  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  loadingText: { color: "#666" },

  card: {
    flexDirection: "row",
    gap: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 14,
    backgroundColor: "#fff",
    marginBottom: 10,
  },
  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  cardTitle: { flex: 1, fontSize: 16, fontWeight: "700", color: "#111" },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e5e5e5",
    backgroundColor: "#fafafa",
  },
  badgeText: { fontSize: 11, fontWeight: "800", color: "#111" },

  cardSub: { marginTop: 6, fontSize: 12, color: "#666" },
  cardDesc: { marginTop: 8, fontSize: 12, color: "#444" },
  cardHint: { marginTop: 10, fontSize: 11, color: "#888" },
  warn: { marginTop: 8, fontSize: 11, color: "#b45309", fontWeight: "700" },

  right: { alignItems: "flex-end", justifyContent: "center" },
  action: { fontSize: 13, fontWeight: "700", color: "#111" },

  empty: { padding: 18 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: "#111" },
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
