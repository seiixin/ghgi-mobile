// mobile/src/screens/app/FormsListScreen.js
import React, { useEffect, useMemo, useRef, useState } from "react";
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
  return Array.from(set).sort((a, b) => b - a); // desc (latest first)
}

function YearDropdown({ years, value, onChange }) {
  const [open, setOpen] = useState(false);

  const selectedLabel = value ? String(value) : "Select year";

  return (
    <>
      <Pressable style={styles.yearDrop} onPress={() => setOpen(true)} disabled={!years?.length}>
        <Text style={styles.yearDropLabel}>Year</Text>
        <Text style={styles.yearDropValue}>
          {selectedLabel} {years?.length ? "" : "(no years)"}
        </Text>
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

/**
 * TARGET UX:
 * - Search input (filters all forms)
 * - Year dropdown (only years that exist in DB)
 * - Each form shows badge like: (year|2023)
 * - Tap: open FormAnswer (pass year + formTypeId)
 * - Long press: download mapping cache for that year
 *
 * IMPORTANT:
 * To make schema fields load consistently in FormAnswerScreen,
 * forms API must be year-aware and return schema for that year.
 */
export default function FormsListScreen({ navigation }) {
  const currentYear = new Date().getFullYear();

  const [query, setQuery] = useState("");
  const [year, setYear] = useState(currentYear);

  const [availableYears, setAvailableYears] = useState([currentYear]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [formTypes, setFormTypes] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [status, setStatus] = useState("");

  const yearNum = useMemo(() => toYearNum(year) ?? currentYear, [year, currentYear]);

  const queryDebounceRef = useRef(null);

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

  async function loadYearsFromApiOrFallback() {
    // Preferred: backend endpoint that returns distinct years that exist (from form_schema_versions/form_mappings)
    try {
      const years = await fetchFormYears?.();
      const normalized = uniqSortedYears(years);
      if (normalized.length) {
        setAvailableYears(normalized);

        // default year:
        // - if current year exists -> keep it
        // - else pick latest available
        if (!normalized.includes(currentYear)) setYear(normalized[0]);
        else setYear(currentYear);

        return normalized;
      }
    } catch {
      // ignore, fallback below
    }

    // Fallback: keep current year only
    setAvailableYears([currentYear]);
    setYear(currentYear);
    return [currentYear];
  }

  async function loadForms({ showCachedFirst = true } = {}) {
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
      const y = yearNum;

      /**
       * IMPORTANT: fetchFormTypes({year}) must call a year-aware API.
       * If your current backend route is:
       *   GET /form-types
       * update it to:
       *   GET /form-types?year=2023
       * AND return schema_versions (or at least the active schema version) for that year.
       */
      const fresh = await fetchFormTypes({ year: y });

      const list = Array.isArray(fresh) ? fresh : [];
      setFormTypes(list);
      await cacheFormTypes(list);

      setStatus(list.length ? "" : "No forms found for selected year.");
    } catch (e) {
      setStatus(e?.message ? String(e.message) : "Failed to load form types");
    } finally {
      setLoading(false);
    }
  }

  async function refreshForms() {
    setRefreshing(true);
    setStatus("");
    try {
      const y = yearNum;
      const fresh = await fetchFormTypes({ year: y });
      const list = Array.isArray(fresh) ? fresh : [];
      setFormTypes(list);
      await cacheFormTypes(list);
      setStatus(list.length ? "" : "No forms found for selected year.");
    } catch (e) {
      setStatus(e?.message ? String(e.message) : "Failed to refresh");
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    (async () => {
      await loadYearsFromApiOrFallback();
      await loadForms({ showCachedFirst: true });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // reload forms when year changes
  useEffect(() => {
    if (!yearNum) return;
    refreshForms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearNum]);

  // purely client-side search; debounced just for smoother typing
  useEffect(() => {
    if (queryDebounceRef.current) clearTimeout(queryDebounceRef.current);
    queryDebounceRef.current = setTimeout(() => {}, 120);
    return () => clearTimeout(queryDebounceRef.current);
  }, [query]);

  async function onDownloadMapping(item) {
    const y = yearNum;
    if (!y) {
      Alert.alert("Invalid year", "Select a valid year.");
      return;
    }

    setSelectedId(item.id);
    setStatus("Checking cache...");

    try {
      const cached = await getCachedMappingJson({ formTypeId: item.id, year: y });
      if (cached) {
        setStatus(`Cached mapping found for ${item.name} (year|${y}).`);
        return;
      }

      setStatus("Downloading mapping...");
      const mapping = await fetchFormMapping({ formTypeId: item.id, year: y });

      const mappingJson = mapping?.mapping_json ?? {};
      await cacheMappingJson({ formTypeId: item.id, year: y, mappingJson });

      setStatus(`Downloaded and cached mapping for ${item.name} (year|${y}).`);
    } catch (e) {
      setStatus(e?.message ? String(e.message) : "Failed to download mapping");
    } finally {
      setSelectedId(null);
    }
  }

  function onAnswerForm(item) {
    const y = yearNum;
    if (!y) {
      Alert.alert("Invalid year", "Select a valid year.");
      return;
    }
    navigation.navigate("FormAnswer", { formTypeId: item.id, year: y });
  }

  const renderItem = ({ item }) => {
    const y = yearNum;

    return (
      <Pressable
        style={styles.card}
        onPress={() => onAnswerForm(item)}
        onLongPress={() => onDownloadMapping(item)}
        delayLongPress={350}
      >
        <View style={{ flex: 1 }}>
          <View style={styles.rowTop}>
            <Text style={styles.cardTitle}>{item.name}</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{`year|${y}`}</Text>
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
        </View>

        <View style={styles.right}>
          {selectedId === item.id ? <ActivityIndicator /> : <Text style={styles.action}>Open</Text>}
        </View>
      </Pressable>
    );
  };

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
            disabled={refreshing}
          >
            <Text style={styles.refreshText}>{refreshing ? "Refreshing..." : "Refresh"}</Text>
          </Pressable>

          <Pressable
            onPress={async () => {
              setQuery("");
              setStatus("Reloading years...");
              await loadYearsFromApiOrFallback();
              await refreshForms();
              setStatus("");
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
          <Text style={styles.loadingText}>Loading form types...</Text>
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
              <Text style={styles.emptySub}>
                Try changing year or clearing search.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

/**
 * WHICH API SHOULD BE MODIFIED (to fix "No schema fields loaded for this form/year")?
 *
 * 1) Preferred NEW endpoint:
 *    GET /form-years
 *    -> returns distinct years that exist in DB (based on form_schema_versions and/or form_mappings)
 *    Example response:
 *      { "years": [2023, 2024, 2025] }
 *
 * 2) Modify existing forms list endpoint:
 *    GET /form-types?year=2023
 *    -> return form types PLUS the active schema version for that year (including schema_version_id + schema_json).
 *    Example per form row:
 *      {
 *        id, key, name, sector_key, description,
 *        active_schema: { id, year, version, schema_json, ui_json, status }
 *      }
 *
 * If you do #2, FormAnswerScreen can always render fields without guessing.
 */

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
