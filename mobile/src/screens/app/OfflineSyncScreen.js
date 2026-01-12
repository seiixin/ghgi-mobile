// mobile/src/screens/app/OfflineSyncScreen.js
import React, { useMemo, useState } from "react";
import { SafeAreaView, StyleSheet, Text, View, Pressable } from "react-native";

import DownloadsTab from "./offlineSync/DownloadsTab";
import DraftsTab from "./offlineSync/DraftsTab";

/**
 * OfflineSyncScreen (refactor)
 * - Tabs: Downloads | Drafts
 * - Downloads tab contains:
 *   - Remote forms list (ALL/year filter + per-form real year)
 *   - Download / Remove
 *   - DownloadedFormsList
 * - Drafts tab contains:
 *   - DraftsList
 *
 * This keeps OfflineSyncScreen short and avoids 800+ lines in one file.
 */

export default function OfflineSyncScreen({ navigation }) {
  const [tab, setTab] = useState("downloads"); // "downloads" | "drafts"

  const isDownloads = tab === "downloads";
  const isDrafts = tab === "drafts";

  const Tabs = useMemo(() => {
    return (
      <View style={styles.tabs}>
        <Pressable
          onPress={() => setTab("downloads")}
          style={({ pressed }) => [
            styles.tabBtn,
            isDownloads && styles.tabBtnActive,
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.tabText, isDownloads && styles.tabTextActive]}>Downloads</Text>
        </Pressable>

        <Pressable
          onPress={() => setTab("drafts")}
          style={({ pressed }) => [
            styles.tabBtn,
            isDrafts && styles.tabBtnActive,
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.tabText, isDrafts && styles.tabTextActive]}>Drafts</Text>
        </Pressable>
      </View>
    );
  }, [isDownloads, isDrafts]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Offline Sync</Text>
        <Text style={styles.sub}>Manage offline downloads and local drafts.</Text>
        {Tabs}
      </View>

      {isDownloads ? <DownloadsTab navigation={navigation} /> : <DraftsTab navigation={navigation} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },

  header: { padding: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: "#eee" },
  title: { fontSize: 20, fontWeight: "800", color: "#111" },
  sub: { marginTop: 6, fontSize: 13, color: "#444", lineHeight: 18 },

  tabs: {
    marginTop: 12,
    flexDirection: "row",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#fafafa",
  },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: "center", justifyContent: "center" },
  tabBtnActive: { backgroundColor: "#111" },
  tabText: { fontSize: 13, fontWeight: "900", color: "#111" },
  tabTextActive: { color: "#fff" },
  pressed: { opacity: 0.85 },
});
