// mobile/src/screens/app/DashboardScreen.js
import React, { useMemo } from "react";
import {
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";

function FeatureCard({ title, desc, icon, onPress, cta = "Open" }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
      <View style={styles.cardTop}>
        <View style={styles.cardIcon}>
          <Ionicons name={icon} size={22} color="#16a34a" />
        </View>

        <View style={styles.cardText}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardDesc}>{desc}</Text>
        </View>
      </View>

      <View style={styles.cardBottom}>
        <View style={styles.pill}>
          <Text style={styles.pillText}>{cta}</Text>
          <Ionicons name="chevron-forward" size={16} color="#16a34a" />
        </View>
      </View>
    </Pressable>
  );
}

function StatPill({ label, value, icon }) {
  return (
    <View style={styles.statPill}>
      <View style={styles.statIcon}>
        <Ionicons name={icon} size={16} color="#0f172a" />
      </View>
      <View>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
      </View>
    </View>
  );
}

export default function DashboardScreen() {
  const navigation = useNavigation();

  const cards = useMemo(
    () => [
      {
        key: "forms",
        title: "Forms",
        desc: "Browse forms, fill up answers, save drafts, then submit when online.",
        icon: Platform.OS === "ios" ? "clipboard" : "clipboard-outline",
        cta: "Go to Forms",
        onPress: () => navigation.navigate("Forms"),
      },
      {
        key: "history",
        title: "History",
        desc: "View your submitted entries and track their sync / upload status.",
        icon: Platform.OS === "ios" ? "time" : "time-outline",
        cta: "View History",
        onPress: () => navigation.navigate("History"),
      },
      {
        key: "sync",
        title: "Offline Sync",
        desc: "Manage offline data, see drafts queued for upload, and push when online.",
        icon: Platform.OS === "ios" ? "cloud-upload" : "cloud-upload-outline",
        cta: "Open Sync",
        onPress: () => navigation.navigate("Sync"),
      },
      {
        key: "settings",
        title: "Settings",
        desc: "Account, environment, and app preferences (and logout).",
        icon: Platform.OS === "ios" ? "settings" : "settings-outline",
        cta: "Open Settings",
        onPress: () => navigation.navigate("Settings"),
      },
    ],
    [navigation]
  );

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Dashboard</Text>
        </View>

        <View style={styles.cards}>
          {cards.map((c) => (
            <FeatureCard
              key={c.key}
              title={c.title}
              desc={c.desc}
              icon={c.icon}
              cta={c.cta}
              onPress={c.onPress}
            />
          ))}
        </View>

        <View style={styles.tips}>
          <View style={styles.tipRow}>
            <Ionicons name="bulb-outline" size={18} color="#0f172a" />
            <Text style={styles.tipText}>
              Tip: If you’re offline, keep working in <Text style={styles.tipEm}>Forms</Text> and save drafts.
              Then open <Text style={styles.tipEm}>Offline Sync</Text> when you regain connection.
            </Text>
          </View>
        </View>

        {/* Spacer so content doesn't hide behind the floating tab bar */}
        <View style={{ height: 120 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 16 },

  header: { paddingBottom: 8 },
  title: { fontSize: 26, fontWeight: "900", letterSpacing: 0.2, color: "#0f172a" },
  sub: { marginTop: 6, fontSize: 13.5, lineHeight: 19, color: "#475569" },

  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  statPill: {
    flex: 1,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  statIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(22, 163, 74, 0.10)",
  },
  statValue: { fontSize: 16, fontWeight: "900", color: "#0f172a" },
  statLabel: { marginTop: 2, fontSize: 11.5, fontWeight: "700", color: "#64748b" },

  section: { marginTop: 16, marginBottom: 10 },
  sectionTitle: { fontSize: 15, fontWeight: "900", color: "#0f172a" },
  sectionSub: { marginTop: 4, fontSize: 12.5, lineHeight: 18, color: "#64748b" },

  cards: { gap: 12 },

  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  cardPressed: { transform: [{ scale: 0.99 }], opacity: 0.98 },

  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  cardIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(22, 163, 74, 0.12)",
  },
  cardText: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: "900", color: "#0f172a" },
  cardDesc: { marginTop: 4, fontSize: 12.5, lineHeight: 18, color: "#64748b" },

  cardBottom: { marginTop: 12, flexDirection: "row", justifyContent: "flex-end" },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(22, 163, 74, 0.10)",
  },
  pillText: { fontSize: 12, fontWeight: "900", color: "#16a34a" },

  tips: {
    marginTop: 14,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 16,
    padding: 12,
  },
  tipRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  tipText: { flex: 1, fontSize: 12.5, lineHeight: 18, color: "#334155" },
  tipEm: { fontWeight: "900", color: "#0f172a" },
});
