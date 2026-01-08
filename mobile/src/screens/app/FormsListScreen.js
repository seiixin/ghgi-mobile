import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { fetchFormMapping, fetchFormTypes } from "../../lib/forms";
import {
  cacheFormTypes,
  cacheMappingJson,
  getCachedFormTypes,
  getCachedMappingJson,
} from "../../lib/cacheStore";

export default function FormsListScreen() {
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [formTypes, setFormTypes] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [status, setStatus] = useState("");

  const yearNum = useMemo(() => {
    const y = Number(year);
    return Number.isFinite(y) ? y : null;
  }, [year]);

  async function loadInitial() {
    setLoading(true);
    setStatus("");

    // 1) show cached immediately (if any)
    const cached = await getCachedFormTypes();
    if (cached?.length) setFormTypes(cached);

    // 2) then refresh from API
    try {
      const fresh = await fetchFormTypes();
      setFormTypes(fresh);
      await cacheFormTypes(fresh);
    } catch (e) {
      // keep cached list if API fails
      setStatus(e?.message ? String(e.message) : "Failed to load form types");
    } finally {
      setLoading(false);
    }
  }

  async function refresh() {
    setRefreshing(true);
    setStatus("");
    try {
      const fresh = await fetchFormTypes();
      setFormTypes(fresh);
      await cacheFormTypes(fresh);
    } catch (e) {
      setStatus(e?.message ? String(e.message) : "Failed to refresh");
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadInitial();
  }, []);

  async function onDownloadMapping(item) {
    if (!yearNum) {
      Alert.alert("Invalid year", "Enter a valid year (e.g., 2025).");
      return;
    }

    setSelectedId(item.id);
    setStatus("Checking cache...");

    try {
      const cached = await getCachedMappingJson({ formTypeId: item.id, year: yearNum });
      if (cached) {
        setStatus(`Cached mapping found for ${item.name} (${yearNum}).`);
        return;
      }

      setStatus("Downloading mapping...");
      const mapping = await fetchFormMapping({ formTypeId: item.id, year: yearNum });

      const mappingJson = mapping?.mapping_json ?? {};
      await cacheMappingJson({ formTypeId: item.id, year: yearNum, mappingJson });

      setStatus(`Downloaded and cached mapping for ${item.name} (${yearNum}).`);
    } catch (e) {
      setStatus(e?.message ? String(e.message) : "Failed to download mapping");
    } finally {
      setSelectedId(null);
    }
  }

  const renderItem = ({ item }) => (
    <Pressable style={styles.card} onPress={() => onDownloadMapping(item)}>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle}>{item.name}</Text>
        <Text style={styles.cardSub}>
          {item.sector_key} • {item.key}
        </Text>
        {item.description ? (
          <Text style={styles.cardDesc} numberOfLines={2}>
            {item.description}
          </Text>
        ) : null}
      </View>
      <View style={styles.right}>
        {selectedId === item.id ? <ActivityIndicator /> : <Text style={styles.action}>Download</Text>}
      </View>
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Forms</Text>

        <View style={styles.controls}>
          <View style={styles.yearBox}>
            <Text style={styles.label}>Year</Text>
            <TextInput
              value={year}
              onChangeText={setYear}
              keyboardType="number-pad"
              placeholder="2025"
              style={styles.yearInput}
              maxLength={4}
            />
          </View>

          <Pressable
            onPress={refresh}
            style={({ pressed }) => [styles.refreshBtn, pressed && styles.pressed]}
            disabled={refreshing}
          >
            <Text style={styles.refreshText}>{refreshing ? "Refreshing..." : "Refresh"}</Text>
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
          data={formTypes}
          keyExtractor={(it) => String(it.id)}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 12, paddingBottom: 24 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No form types found</Text>
              <Text style={styles.emptySub}>Check your API base URL and database seed.</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },

  header: { padding: 16, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: "#eee" },
  title: { fontSize: 20, fontWeight: "700", color: "#111" },

  controls: { marginTop: 12, flexDirection: "row", alignItems: "flex-end", gap: 12 },
  yearBox: { flex: 1 },
  label: { fontSize: 12, color: "#666", marginBottom: 6 },
  yearInput: {
    height: 44,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 16,
    color: "#111",
    backgroundColor: "#fafafa",
  },

  refreshBtn: {
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ddd",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  pressed: { opacity: 0.7 },
  refreshText: { fontSize: 14, fontWeight: "600" },

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
  cardTitle: { fontSize: 16, fontWeight: "700", color: "#111" },
  cardSub: { marginTop: 4, fontSize: 12, color: "#666" },
  cardDesc: { marginTop: 8, fontSize: 12, color: "#444" },

  right: { alignItems: "flex-end", justifyContent: "center" },
  action: { fontSize: 13, fontWeight: "700", color: "#111" },

  empty: { padding: 18 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: "#111" },
  emptySub: { marginTop: 6, color: "#666" },
});
