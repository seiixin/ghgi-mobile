// mobile/src/screens/app/offlineSync/DraftsTab.js
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
} from "react-native";

import { deleteDraft, listDrafts } from "../../../storage/offlineStore";

function normalizeString(s) {
  return String(s ?? "").trim();
}

function getDraftId(d) {
  return d?.draftId ?? d?.id ?? null;
}

function getFormTypeId(d) {
  const v = d?.formTypeId ?? d?.form_type_id ?? d?.form_typeId ?? null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function getYear(d) {
  const v = d?.year ?? d?.formYear ?? d?.form_year ?? null;
  const n = Number(v);
  return Number.isFinite(n) && n > 1900 ? n : null;
}

function draftTitle(d) {
  const t = normalizeString(d?.formTitle) || normalizeString(d?.title) || normalizeString(d?.name);
  if (t) return t;

  const ft = getFormTypeId(d) ?? "—";
  const y = getYear(d) ?? "—";
  return `Form ${ft} (${y})`;
}

function draftMeta(d) {
  const ft = getFormTypeId(d);
  const y = getYear(d);
  if (ft && y) return `Form Type ${ft} • ${y}`;
  if (ft) return `Form Type ${ft}`;
  if (y) return String(y);
  return "";
}

function sortByRecent(a, b) {
  const ta = Date.parse(a?.updatedAt || a?.updated_at || a?.createdAt || a?.created_at || "") || 0;
  const tb = Date.parse(b?.updatedAt || b?.updated_at || b?.createdAt || b?.created_at || "") || 0;
  return tb - ta;
}

export default function DraftsTab({ navigation }) {
  const [drafts, setDrafts] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const dr = await listDrafts();
    setDrafts(Array.isArray(dr) ? dr : []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const sortedDrafts = useMemo(() => {
    const arr = Array.isArray(drafts) ? drafts.slice() : [];
    arr.sort(sortByRecent);
    return arr;
  }, [drafts]);

  const navigateToDraft = useCallback(
    (params) => {
      // Drafts tab is under "Sync" (AppTabs stack). FormAnswer is under FormsStack mounted at "Forms".
      const attempt = (nav) => {
        if (!nav?.navigate) return false;
        nav.navigate("Forms", { screen: "FormAnswer", params });
        return true;
      };

      try {
        if (attempt(navigation)) return true;
      } catch {}

      try {
        let parent = navigation?.getParent?.();
        while (parent) {
          try {
            if (attempt(parent)) return true;
          } catch {}
          parent = parent?.getParent?.();
        }
      } catch {}

      Alert.alert(
        "Navigation error",
        "Hindi mahanap ang Forms > FormAnswer route. I-check AppTabs route name = 'Forms' at FormsStack screen name = 'FormAnswer'."
      );
      return false;
    },
    [navigation]
  );

  const handleOpenDraft = useCallback(
    (draft) => {
      const draftId = getDraftId(draft);
      if (!draftId) {
        Alert.alert("Cannot open", "Missing draftId.");
        return;
      }

      const formTypeId = getFormTypeId(draft);
      const year = getYear(draft);

      // If your FormAnswerScreen needs these, pass them.
      if (!formTypeId) {
        Alert.alert(
          "Cannot open",
          "Missing formTypeId in draft. I-check kung paano sine-save ang draft (dapat kasama formTypeId at year)."
        );
        return;
      }
      if (!year) {
        Alert.alert(
          "Cannot open",
          "Missing year in draft. I-check kung paano sine-save ang draft (dapat kasama year)."
        );
        return;
      }

      console.log("[DraftsTab] Open draft", { draftId, formTypeId, year });

      navigateToDraft({
        mode: "draft",
        draftId,
        formTypeId,
        year,
      });
    },
    [navigateToDraft]
  );

  const handleDeleteDraft = useCallback(
    (draftId) => {
      Alert.alert("Delete Draft", "Delete this draft?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await deleteDraft(draftId);
            await load();
          },
        },
      ]);
    },
    [load]
  );

  const total = sortedDrafts.length;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.headerRow}>
        <Text style={styles.title}>Drafts</Text>
        <Text style={styles.badge}>{total}</Text>
      </View>

      <Text style={styles.sub}>Drafts: form title • Open / Delete</Text>

      <View style={styles.card}>
        {!sortedDrafts.length ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No drafts</Text>
            <Text style={styles.emptySub}>Create a draft from Forms, then it will appear here.</Text>
          </View>
        ) : (
          sortedDrafts.map((d) => {
            const id = getDraftId(d);
            const title = draftTitle(d);

            return (
              <View key={String(id)} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {title}
                  </Text>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {draftMeta(d)}
                  </Text>
                </View>

                <Pressable
                  onPress={() => handleOpenDraft(d)}
                  style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
                >
                  <Text style={styles.btnText}>Open</Text>
                </Pressable>

                <Pressable
                  onPress={() => id && handleDeleteDraft(id)}
                  style={({ pressed }) => [styles.btnDanger, pressed && styles.btnPressed]}
                >
                  <Text style={styles.btnDangerText}>Delete</Text>
                </Pressable>
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 28 },

  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 16, fontWeight: "900", color: "#111" },
  sub: { marginTop: 6, fontSize: 12.5, color: "#666", lineHeight: 18 },

  badge: {
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

  card: {
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 14,
    padding: 14,
    marginTop: 12,
    backgroundColor: "#fff",
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  rowTitle: { fontSize: 14, fontWeight: "900", color: "#111" },
  rowMeta: { marginTop: 4, fontSize: 12, color: "#666" },

  btn: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#111",
    backgroundColor: "#111",
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { color: "#fff", fontWeight: "900", fontSize: 12 },

  btnDanger: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#dc2626",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  btnDangerText: { color: "#dc2626", fontWeight: "900", fontSize: 12 },

  btnPressed: { opacity: 0.85 },

  empty: { paddingVertical: 8 },
  emptyTitle: { fontSize: 14, fontWeight: "900", color: "#111" },
  emptySub: { marginTop: 6, fontSize: 12.5, color: "#666", lineHeight: 18 },
});
