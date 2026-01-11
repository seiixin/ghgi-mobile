// mobile/src/screens/app/HistoryScreen.js
// History Screen (My Submissions)
// Data source: GET /api/my-submissions (created_by = req.user.id)
//
// Features:
// - Default filters: ALL (year/status/form)
// - DB-derived years from /api/form-years (optional)
// - Pagination + pull-to-refresh
// - Tap item: opens detail modal (loads GET /api/submissions/:id)
// - Local search (filters currently loaded page set)

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { fetchFormTypes, fetchFormYears } from "../../lib/forms";
import { listMySubmissions } from "../../lib/mySubmissionsApi";
import { getSubmission } from "../../lib/submissionsApi";

function toYearNum(v) {
  const y = Number(String(v ?? "").trim());
  if (!Number.isFinite(y)) return null;
  if (y < 1900 || y > 3000) return null;
  return Math.trunc(y);
}

function uniqSortedYears(arr) {
  const set = new Set();
  (arr || []).forEach((y) => {
    const n = toYearNum(y);
    if (n) set.add(n);
  });
  return Array.from(set).sort((a, b) => b - a); // desc
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

function formatDateTime(s) {
  const t = String(s || "").trim();
  if (!t) return "—";
  return t.replace(".000Z", "").replace("T", " ");
}

function statusBadgeColor(status) {
  const s = String(status || "").toLowerCase();
  if (s === "submitted") return styles.badgeSubmitted;
  if (s === "draft") return styles.badgeDraft;
  if (s === "reviewed") return styles.badgeReviewed;
  if (s === "rejected") return styles.badgeRejected;
  return styles.badgeDefault;
}

function DropdownModal({ label, valueLabel, options, onSelect, disabled }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        style={[styles.drop, disabled && styles.disabled]}
        onPress={() => setOpen(true)}
        disabled={disabled}
      >
        <Text style={styles.dropLabel}>{label}</Text>
        <Text style={styles.dropValue}>{valueLabel}</Text>
      </Pressable>

      <Modal visible={open} animationType="fade" transparent onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Select {label}</Text>

            <FlatList
              data={options}
              keyExtractor={(it) => String(it.value)}
              renderItem={({ item }) => {
                const active = !!item.active;
                return (
                  <Pressable
                    style={[styles.modalRow, active && styles.modalRowActive]}
                    onPress={() => {
                      onSelect?.(item.value);
                      setOpen(false);
                    }}
                  >
                    <Text style={[styles.modalRowText, active && styles.modalRowTextActive]}>
                      {item.label}
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

export default function HistoryScreen({ navigation }) {
  const [query, setQuery] = useState("");

  // Filters
  const [availableYears, setAvailableYears] = useState(["ALL"]);
  const [year, setYear] = useState("ALL"); // "ALL" | number

  const statusOptions = useMemo(
    () => [
      { value: "ALL", label: "ALL" },
      { value: "draft", label: "draft" },
      { value: "submitted", label: "submitted" },
      { value: "reviewed", label: "reviewed" },
      { value: "rejected", label: "rejected" },
    ],
    []
  );
  const [status, setStatus] = useState("ALL"); // "ALL" | status string

  const [formOptions, setFormOptions] = useState([{ value: "ALL", label: "ALL" }]);
  const [formTypeId, setFormTypeId] = useState("ALL"); // "ALL" | number

  // Data
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [statusText, setStatusText] = useState("");

  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ page: 1, per_page: 20, total: 0, total_pages: 0 });

  // Detail modal
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState(null);

  const yearNum = useMemo(() => (year === "ALL" ? null : toYearNum(year)), [year]);
  const formTypeIdNum = useMemo(() => (formTypeId === "ALL" ? null : Number(formTypeId)), [formTypeId]);

  const yearLabel = useMemo(() => (yearNum ? String(yearNum) : "ALL"), [yearNum]);
  const statusLabel = useMemo(() => (status && status !== "ALL" ? String(status) : "ALL"), [status]);
  const formLabel = useMemo(() => {
    const found = (formOptions || []).find((o) => String(o.value) === String(formTypeId));
    return found?.label ?? "ALL";
  }, [formOptions, formTypeId]);

  const filteredRows = useMemo(() => {
    const q = normalizeString(query);
    const list = Array.isArray(rows) ? rows : [];
    if (!q) return list;
    return list.filter((r) => {
      return (
        includesLoose(r?.form_type_name, q) ||
        includesLoose(r?.status, q) ||
        includesLoose(r?.year, q) ||
        includesLoose(r?.prov_name, q) ||
        includesLoose(r?.city_name, q) ||
        includesLoose(r?.brgy_name, q)
      );
    });
  }, [rows, query]);

  const buildParams = useCallback(
    (page) => {
      const params = {
        per_page: meta?.per_page ?? 20,
        page,
      };
      if (yearNum) params.year = yearNum;
      if (status && status !== "ALL") params.status = status;
      if (formTypeIdNum && Number.isFinite(formTypeIdNum)) params.form_type_id = formTypeIdNum;
      return params;
    },
    [meta?.per_page, yearNum, status, formTypeIdNum]
  );

  const loadFilters = useCallback(async () => {
    try {
      const yearsRaw = await fetchFormYears();
      const yearsNorm = uniqSortedYears(yearsRaw);
      const yrs = ["ALL", ...yearsNorm.map((y) => y)];
      setAvailableYears(yrs);

      setYear((prev) => {
        if (prev === "ALL") return "ALL";
        const prevNum = toYearNum(prev);
        if (prevNum && yearsNorm.includes(prevNum)) return prevNum;
        return "ALL";
      });

      const latest = yearsNorm[0] ?? new Date().getFullYear();
      const forms = await fetchFormTypes({ year: latest });
      const list = Array.isArray(forms) ? forms : (forms?.formTypes || []);
      const opts = [
        { value: "ALL", label: "ALL" },
        ...(list || []).map((f) => ({
          value: f.id,
          label: f?.name ? String(f.name) : `Form #${f.id}`,
        })),
      ];
      setFormOptions(opts);
    } catch {
      setAvailableYears(["ALL"]);
      setFormOptions([{ value: "ALL", label: "ALL" }]);
    }
  }, []);

  const loadPage = useCallback(
    async ({ page = 1, replace = false } = {}) => {
      const params = buildParams(page);

      const payload = await listMySubmissions(params);
      const data = Array.isArray(payload?.data) ? payload.data : [];
      const m = payload?.meta || { page, per_page: params.per_page, total: data.length, total_pages: 1 };

      setMeta(m);
      setRows((prev) => (replace ? data : [...(prev || []), ...data]));

      if (!data.length && page === 1) setStatusText("No submissions found.");
      else setStatusText("");
    },
    [buildParams]
  );

  const reload = useCallback(async () => {
    setLoading(true);
    setStatusText("");
    setRows([]);
    try {
      await loadFilters();
      await loadPage({ page: 1, replace: true });
    } catch (e) {
      setStatusText(e?.message ? String(e.message) : "Failed to load history");
    } finally {
      setLoading(false);
    }
  }, [loadFilters, loadPage]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (loading) return;
    (async () => {
      setLoading(true);
      setStatusText("");
      setRows([]);
      try {
        await loadPage({ page: 1, replace: true });
      } catch (e) {
        setStatusText(e?.message ? String(e.message) : "Failed to load history");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearNum, status, formTypeIdNum]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setStatusText("");
    try {
      await loadFilters();
      await loadPage({ page: 1, replace: true });
    } catch (e) {
      setStatusText(e?.message ? String(e.message) : "Failed to refresh");
    } finally {
      setRefreshing(false);
    }
  }, [loadFilters, loadPage]);

  const canLoadMore = useMemo(() => {
    const p = Number(meta?.page ?? 1);
    const tp = Number(meta?.total_pages ?? 0);
    return tp > 0 && p < tp;
  }, [meta]);

  const onLoadMore = useCallback(async () => {
    if (loadingMore || loading || refreshing) return;
    if (!canLoadMore) return;

    setLoadingMore(true);
    try {
      const nextPage = Number(meta?.page ?? 1) + 1;
      await loadPage({ page: nextPage, replace: false });
    } catch (e) {
      Alert.alert("Load more failed", e?.message ? String(e.message) : "Failed");
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, loading, refreshing, canLoadMore, meta?.page, loadPage]);

  const openDetail = useCallback(async (row) => {
    const id = row?.id;
    if (!id) return;

    setDetail(null);
    setDetailOpen(true);
    setDetailLoading(true);

    try {
      const payload = await getSubmission(id);
      setDetail(payload);
    } catch (e) {
      Alert.alert("Load submission failed", e?.message ? String(e.message) : "Failed");
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const renderItem = ({ item }) => {
    const loc = [item?.prov_name, item?.city_name, item?.brgy_name].filter(Boolean).join(" • ");
    const when = item?.submitted_at ? formatDateTime(item.submitted_at) : formatDateTime(item?.created_at);
    const whenLabel = item?.submitted_at ? "Submitted" : "Created";

    return (
      <Pressable style={styles.card} onPress={() => openDetail(item)}>
        <View style={{ flex: 1, gap: 6 }}>
          <View style={styles.rowTop}>
            <Text style={styles.cardTitle} numberOfLines={2}>
              {item?.form_type_name || `Form #${item?.form_type_id ?? "—"}`}
            </Text>

            <View style={[styles.badge, statusBadgeColor(item?.status)]}>
              <Text style={styles.badgeText}>{String(item?.status || "—")}</Text>
            </View>
          </View>

          <Text style={styles.cardSub} numberOfLines={1}>
            {String(item?.year ?? "—")} • answers: {String(item?.answers_count ?? 0)}
          </Text>

          <Text style={styles.cardSub2} numberOfLines={2}>
            {loc || "—"}
          </Text>

          <Text style={styles.cardHint} numberOfLines={1}>
            {whenLabel}: {when} • ID #{item?.id}
          </Text>
        </View>

        <View style={styles.right}>
          <Text style={styles.action}>View</Text>
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>History</Text>

        <View style={styles.controls}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Search</Text>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search (form, status, location, year)..."
              style={styles.searchInput}
              returnKeyType="search"
            />
          </View>
        </View>

        <View style={styles.filters}>
          <View style={{ flex: 1 }}>
            <DropdownModal
              label="Year"
              valueLabel={yearLabel}
              options={(availableYears || []).map((y) => ({
                value: y,
                label: y === "ALL" ? "ALL" : String(y),
                active: String(y) === String(year),
              }))}
              onSelect={(v) => setYear(v)}
            />
          </View>

          <View style={{ flex: 1 }}>
            <DropdownModal
              label="Status"
              valueLabel={statusLabel}
              options={statusOptions.map((o) => ({
                ...o,
                active: String(o.value) === String(status),
              }))}
              onSelect={(v) => setStatus(v)}
            />
          </View>
        </View>

        <View style={styles.filters}>
          <View style={{ flex: 1 }}>
            <DropdownModal
              label="Form"
              valueLabel={formLabel}
              options={(formOptions || []).map((o) => ({
                ...o,
                active: String(o.value) === String(formTypeId),
              }))}
              onSelect={(v) => setFormTypeId(v)}
            />
          </View>

          <Pressable
            onPress={onRefresh}
            style={({ pressed }) => [styles.refreshBtn, pressed && styles.pressed]}
            disabled={refreshing || loading}
          >
            <Text style={styles.refreshText}>{refreshing ? "Refreshing..." : "Refresh"}</Text>
          </Pressable>
        </View>

        {!!statusText && <Text style={styles.status}>{statusText}</Text>}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={styles.muted}>Loading...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredRows}
          keyExtractor={(it) => String(it.id)}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 12, paddingBottom: 24 }}
          onEndReachedThreshold={0.35}
          onEndReached={onLoadMore}
          ListFooterComponent={
            loadingMore ? (
              <View style={{ paddingVertical: 14 }}>
                <ActivityIndicator />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No submissions</Text>
              <Text style={styles.emptySub}>Try setting filters to ALL or clear search.</Text>
            </View>
          }
        />
      )}

      <Modal visible={detailOpen} animationType="slide" onRequestClose={() => setDetailOpen(false)}>
        <SafeAreaView style={styles.detailSafe}>
          <View style={styles.detailHeader}>
            <Text style={styles.detailTitle}>Submission Details</Text>
            <Pressable onPress={() => setDetailOpen(false)} style={styles.detailClose}>
              <Text style={styles.detailCloseText}>Close</Text>
            </Pressable>
          </View>

          {detailLoading ? (
            <View style={styles.center}>
              <ActivityIndicator />
              <Text style={styles.muted}>Loading details...</Text>
            </View>
          ) : !detail ? (
            <View style={styles.center}>
              <Text style={styles.muted}>No detail loaded.</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.detailBody}>
              <View style={styles.detailCard}>
                <Text style={styles.detailName}>{detail?.submission?.form_type_name || "—"}</Text>
                <Text style={styles.detailMeta}>
                  ID #{detail?.submission?.id} • {detail?.submission?.status} • {detail?.submission?.year}
                </Text>
                <Text style={styles.detailMeta2}>
                  {[
                    detail?.submission?.prov_name,
                    detail?.submission?.city_name,
                    detail?.submission?.brgy_name,
                  ].filter(Boolean).join(" • ") || "—"}
                </Text>
                <Text style={styles.detailMeta2}>
                  Submitted: {formatDateTime(detail?.submission?.submitted_at)} • Updated:{" "}
                  {formatDateTime(detail?.submission?.updated_at)}
                </Text>
              </View>

              <View style={styles.detailCard}>
                <Text style={styles.detailSection}>Answers</Text>

                {(detail?.answers_human || []).length ? (
                  (detail.answers_human || []).map((a) => {
                    const k = a?.field_key || Math.random().toString(36).slice(2);
                    return (
                      <View key={k} style={styles.answerRow}>
                        <Text style={styles.answerLabel}>{a?.label || a?.field_key || "—"}</Text>
                        <Text style={styles.answerValue}>
                          {a?.value === null || a?.value === undefined || a?.value === ""
                            ? "—"
                            : String(a.value)}
                        </Text>
                      </View>
                    );
                  })
                ) : (
                  <Text style={styles.muted}>No answers yet.</Text>
                )}
              </View>
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },

  header: {
    padding: 16,
    paddingTop: 40,       // dagdag space sa taas
    paddingBottom: 22,    // mas malaking space bago border
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },

  title: { fontSize: 20, fontWeight: "900", color: "#111" },

  controls: { marginTop: 12, flexDirection: "row", alignItems: "flex-end", gap: 12 },
  filters: { marginTop: 10, flexDirection: "row", alignItems: "flex-end", gap: 10 },

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

  drop: {
    height: 44,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    paddingHorizontal: 12,
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  disabled: { opacity: 0.55 },
  dropLabel: { fontSize: 11, color: "#666" },
  dropValue: { marginTop: 2, fontSize: 14, fontWeight: "900", color: "#111" },

  refreshBtn: {
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ddd",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  pressed: { opacity: 0.7 },
  refreshText: { fontSize: 13, fontWeight: "900", color: "#111" },

  status: { marginTop: 10, fontSize: 13, color: "#444" },

  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  muted: { fontSize: 12, color: "#666" },

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
  cardTitle: { flex: 1, fontSize: 15, fontWeight: "900", color: "#111" },

  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e5e5e5",
    backgroundColor: "#fafafa",
  },
  badgeText: { fontSize: 11, fontWeight: "900", color: "#111" },
  badgeDefault: {},
  badgeDraft: { backgroundColor: "#fff7ed", borderColor: "#fed7aa" },
  badgeSubmitted: { backgroundColor: "#ecfeff", borderColor: "#a5f3fc" },
  badgeReviewed: { backgroundColor: "#f0fdf4", borderColor: "#bbf7d0" },
  badgeRejected: { backgroundColor: "#fef2f2", borderColor: "#fecaca" },

  cardSub: { fontSize: 12, color: "#666" },
  cardSub2: { fontSize: 12, color: "#444" },
  cardHint: { marginTop: 2, fontSize: 11, color: "#888" },

  right: { alignItems: "flex-end", justifyContent: "center" },
  action: { fontSize: 13, fontWeight: "900", color: "#111" },

  empty: { padding: 18 },
  emptyTitle: { fontSize: 16, fontWeight: "900", color: "#111" },
  emptySub: { marginTop: 6, color: "#666" },

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
  modalRowText: { fontSize: 14, fontWeight: "900", color: "#111" },
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

  detailSafe: { flex: 1, backgroundColor: "#fff" },
  detailHeader: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  detailTitle: { fontSize: 16, fontWeight: "900", color: "#111" },
  detailClose: {
    paddingHorizontal: 12,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ddd",
    alignItems: "center",
    justifyContent: "center",
  },
  detailCloseText: { fontSize: 12, fontWeight: "900", color: "#111" },
  detailBody: { padding: 14, gap: 12, paddingBottom: 24 },
  detailCard: { borderWidth: 1, borderColor: "#eee", borderRadius: 14, padding: 12, gap: 6 },
  detailName: { fontSize: 16, fontWeight: "900", color: "#111" },
  detailMeta: { fontSize: 12, color: "#444", fontWeight: "800" },
  detailMeta2: { fontSize: 12, color: "#666" },
  detailSection: { fontSize: 14, fontWeight: "900", color: "#111", marginBottom: 6 },
  answerRow: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: "#f0f0f0" },
  answerLabel: { fontSize: 12, color: "#666", fontWeight: "800" },
  answerValue: { marginTop: 4, fontSize: 14, color: "#111", fontWeight: "800" },
});
