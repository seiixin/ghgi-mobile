import React, { useEffect, useState } from "react";
import { Alert, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { PillButton } from "../../ui/components";
import { apiMe, apiLogout } from "../../lib/api";
import { getApiBaseUrl } from "../../lib/config";
import { getOrCreateDeviceId } from "../../lib/deviceStore";

export default function SettingsScreen({ onLogout }) {
  const [user, setUser] = useState(null);
  const [deviceId, setDeviceId] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setDeviceId(await getOrCreateDeviceId());
        const u = await apiMe();
        setUser(u);
      } catch {}
    })();
  }, []);

  async function handleLogout() {
    try {
      setLoading(true);
      await apiLogout();
      onLogout?.();
    } catch (e) {
      Alert.alert("Logout", String(e.message || e));
      onLogout?.();
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.box}>
        <Text style={styles.h1}>Settings</Text>
        <Text style={styles.label}>API</Text>
        <Text style={styles.value}>{getApiBaseUrl()}</Text>

        <Text style={styles.label}>Device ID</Text>
        <Text style={styles.value}>{deviceId || "-"}</Text>

        <Text style={styles.label}>User</Text>
        <Text style={styles.value}>{user ? `${user.name} (${user.role})` : "-"}</Text>
        <Text style={styles.value}>{user ? user.email : ""}</Text>

        <View style={{ height: 18 }} />
        <PillButton title="Logout" loading={loading} onPress={handleLogout} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  box: { padding: 20 },
  h1: { fontSize: 22, fontWeight: "900", marginBottom: 14 },
  label: { marginTop: 12, fontSize: 12, fontWeight: "800", color: "#444" },
  value: { marginTop: 6, fontSize: 14, color: "#111" },
});
