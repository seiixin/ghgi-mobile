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

import { fetchFormTypes, fetchFormYears } from "../../lib/forms";
import { cacheFormTypes, getCachedFormTypes } from "../../lib/cacheStore";

/**
 * GOAL:
 * - Default filter = ALL
 * - Sa ALL, bawat form may makikitang year (hindi "no schema years")
 * - Year sa row is DB-derived availability (computed from /form-types?year=YYYY results),
 *   hindi controlled ng UI filter.
 * - Remove download mapping function (no long-press actions).
 *
 * HOW it works:
 * 1) Load global years from /form-years
 * 2) Load base forms list once (fetchFormTypes() without year)
 * 3) Build a per-form "availableYears" index by calling fetchFormTypes({year}) for each year
 *    and marking forms that returned schema_versions for that year.
 * 4) UI filter:
 *    - ALL: shows all base forms, badge shows latest available year per form (or "—" if none)
 *    - Specific year: shows only forms available for that year; badge shows that year
 * 5) On tap:
 *    - If filter is year: navigate using that year
 *    - If ALL: navigate using the latest available year for that form
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

function hasSchemaVersions(form) {
  const v =
    Array.isArray(form?.schema_versions)
      ? form.schema_versions
      : Array.isArray(form?.schemaVersions)
      ? form.schemaVersions
      : [];
  return v.length > 0;
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

export default function FormsListScreen({ navigation }) {
  const [query, setQuery] = useState("");

  const [availableYears, setAvailableYears] = useState([]); // global years from DB
  const [yearFilter, setYearFilter] = useState("ALL"); // "ALL" | number

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [formTypes, setFormTypes] = useState([]); // base list
  const [status, setStatus] = useState("");

  // formYearIndex: { [formId]: number[] } years where this form has schema for that year
  const [formYearIndex, setFormYearIndex] = useState({});

  const selectedYearNum = useMemo(() => {
    if (yearFilter === "ALL" || yearFilter === null) return null;
    return toYearNum(yearFilter);
  }, [yearFilter]);

  const enrichedForms = useMemo(() => {
    const list = Array.isArray(formTypes) ? formTypes : [];
    return list.map((f) => {
      const years = Array.isArray(formYearIndex?.[f.id]) ? formYearIndex[f.id] : [];
      const sorted = years.slice().sort((a, b) => b - a);
      const latest = sorted[0] ?? null;

      const availableForSelectedYear = selectedYearNum ? sorted.includes(selectedYearNum) : true;

      // badgeYear:
      // - if filter year is set: show that year
      // - if ALL: show latest available year (so user sees an actual year)
      const badgeYear = selectedYearNum ? selectedYearNum : latest;

      return {
        ...f,
        _availableYears: sorted,
        _latestYear: latest,
        _badgeYear: badgeYear,
        _availableForSelectedYear: availableForSelectedYear,
      };
    });
  }, [formTypes, formYearIndex, selectedYearNum]);

  const visibleForms = useMemo(() => {
    const base = selectedYearNum
      ? enrichedForms.filter((f) => f._availableForSelectedYear)
      : enrichedForms;

    const q = normalizeString(query);
    if (!q) return base;

    return base.filter((it) => {
      return (
        includesLoose(it?.name, q) ||
        includesLoose(it?.key, q) ||
        includesLoose(it?.sector_key, q) ||
        includesLoose(it?.description, q)
      );
    });
  }, [enrichedForms, selectedYearNum, query]);

  async function loadYears() {
    try {
      const years = await fetchFormYears();
      const normalized = uniqSortedYears(years);
      setAvailableYears(normalized);
      return normalized;
    } catch (e) {
      setAvailableYears([]);
      setStatus(e?.message ? String(e.message) : "Failed to load years.");
      return [];
    }
  }

  async function loadBaseForms({ showCachedFirst = true } = {}) {
    if (showCachedFirst) {
      try {
        const cached = await getCachedFormTypes();
        if (cached?.length) setFormTypes(cached);
      } catch {
        // ignore
      }
    }

    const fresh = await fetchFormTypes(); // no year = base list
    const list = Array.isArray(fresh) ? fresh : [];
    setFormTypes(list);
    await cacheFormTypes(list);
    return list;
  }

  async function buildFormYearIndex(years) {
    // Build a reliable per-form year list without relying on UI filter.
    // We call fetchFormTypes({year}) for each year and mark those forms that have schema_versions for that year.
    const ys = Array.isArray(years) ? years.map(toYearNum).filter(Boolean) : [];
    if (!ys.length) {
      setFormYearIndex({});
      return {};
    }

    const index = {}; // { [id]: Set(year) } then convert to arrays

    // Sequential (safer for small year count). If you want faster, convert to Promise.all with care.
    for (const y of ys) {
      try {
        const formsForYear = await fetchFormTypes({ year: y });
        const list = Array.isArray(formsForYear) ? formsForYear : [];

        for (const f of list) {
          // Consider it available for this year only if schema_versions present
          // (this avoids pretending everything is available for 2026)
          if (!f?.id) continue;
          if (!hasSchemaVersions(f)) continue;

          const id = String(f.id);
          if (!index[id]) index[id] = new Set();
          index[id].add(y);
        }
      } catch {
        // ignore per-year failures; index will be partial
      }
    }

    const out = {};
    for (const [id, set] of Object.entries(index)) {
      out[id] = Array.from(set).sort((a, b) => b - a);
    }

    setFormYearIndex(out);
    return out;
  }

  async function fullReload({ showCachedFirst = true } = {}) {
    setStatus("");
    setLoading(true);
    try {
      const years = await loadYears();
      await loadBaseForms({ showCachedFirst });
      await buildFormYearIndex(years);

      // status messaging
      if (!years.length) {
        setStatus("No years available from database.");
      }
    } catch (e) {
      setStatus(e?.message ? String(e.message) : "Reload failed.");
    } finally {
      setLoading(false);
    }
  }

  async function refresh() {
    setRefreshing(true);
    setStatus("");
    try {
      const years = await loadYears();
      await loadBaseForms({ showCachedFirst: false });
      await buildFormYearIndex(years);
    } catch (e) {
      setStatus(e?.message ? String(e.message) : "Refresh failed.");
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    fullReload({ showCachedFirst: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resolveYearToUse(item) {
    // If user picked a specific filter year, use it.
    if (selectedYearNum) return selectedYearNum;

    // ALL: use the latest available year for that form (so user still sees and uses a real year).
    const y = item?._latestYear ?? item?._badgeYear ?? null;
    return toYearNum(y);
  }

  function onAnswerForm(item) {
    const y = resolveYearToUse(item);

    if (!y) {
      // At this point, the form has no known schema years across the /form-years set.
      // That means the backend isn't returning schema_versions for it in any year.
      Alert.alert(
        "Not available",
        "Walang available year na may schema para sa form na ito. I-check ang form_schema_versions."
      );
      return;
    }

    // If filter is set, item should already be available. If ALL, we navigate using latest year.
    navigation.navigate("FormAnswer", { formTypeId: item.id, year: y });
  }

  const renderItem = ({ item }) => {
    const badgeText = item?._badgeYear ? String(item._badgeYear) : "—";
    return (
      <Pressable style={styles.card} onPress={() => onAnswerForm(item)}>
        <View style={{ flex: 1 }}>
          <View style={styles.rowTop}>
            <Text style={styles.cardTitle}>{item.name}</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{badgeText}</Text>
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

          {/* Optional hint when ALL and there are multiple years */}
          {!selectedYearNum && Array.isArray(item?._availableYears) && item._availableYears.length > 1 ? (
            <Text style={styles.hint} numberOfLines={1}>
              Available: {item._availableYears.join(", ")} (using {item._latestYear})
            </Text>
          ) : null}
        </View>

        <View style={styles.right}>
          <Text style={styles.action}>Open</Text>
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
            <YearDropdown years={availableYears} value={yearFilter} onChange={(y) => setYearFilter(y)} />
          </View>
        </View>

        <View style={styles.controls2}>
          <Pressable
            onPress={refresh}
            style={({ pressed }) => [styles.refreshBtn, pressed && styles.pressed]}
            disabled={refreshing}
          >
            <Text style={styles.refreshText}>{refreshing ? "Refreshing..." : "Refresh"}</Text>
          </Pressable>

          <Pressable
            onPress={async () => {
              setQuery("");
              await fullReload({ showCachedFirst: false });
            }}
            style={({ pressed }) => [styles.refreshBtn, pressed && styles.pressed]}
            disabled={refreshing}
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
        <FlatList
          data={visibleForms}
          keyExtractor={(it) => String(it.id)}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 12, paddingBottom: 24 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No forms found</Text>
              <Text style={styles.emptySub}>Try clearing search or switching Year to ALL.</Text>
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
  hint: { marginTop: 8, fontSize: 11, color: "#888" },

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
