import React from "react";
import { Pressable, Text, View, StyleSheet, ActivityIndicator } from "react-native";
import { theme } from "./theme";

export function PillButton({ title, onPress, disabled, loading, variant = "solid", style }) {
  const solid = variant === "solid";
  return (
    <Pressable
      hitSlop={10}
      onPress={disabled || loading ? undefined : onPress}
      style={[
        styles.btn,
        solid ? styles.btnSolid : styles.btnGhost,
        (disabled || loading) ? styles.btnDisabled : null,
        style,
      ]}
    >
      {loading ? <ActivityIndicator /> : <Text style={[styles.btnText, solid ? styles.btnTextSolid : styles.btnTextGhost]}>{title}</Text>}
    </Pressable>
  );
}

export function Segmented({ left, right, value, onChange }) {
  return (
    <View style={styles.segWrap}>
      <View style={styles.seg}>
        <Pressable onPress={() => onChange(left.value)} style={[styles.segItem, value === left.value && styles.segActive]}>
          <Text style={[styles.segText, value === left.value && styles.segTextActive]}>{left.label}</Text>
        </Pressable>
        <Pressable onPress={() => onChange(right.value)} style={[styles.segItem, value === right.value && styles.segActive]}>
          <Text style={[styles.segText, value === right.value && styles.segTextActive]}>{right.label}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  btn: {
    height: 52,
    borderRadius: theme.radius.pill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  btnSolid: { backgroundColor: theme.colors.green },
  btnGhost: { backgroundColor: "transparent", borderWidth: 1, borderColor: theme.colors.muted },
  btnDisabled: { opacity: 0.6 },
  btnText: { fontSize: 18, fontWeight: "700" },
  btnTextSolid: { color: theme.colors.white },
  btnTextGhost: { color: theme.colors.white },

  segWrap: { width: "100%", alignItems: "center", marginTop: 14, marginBottom: 16 },
  seg: {
    width: "100%",
    backgroundColor: theme.colors.glass,
    borderWidth: 1,
    borderColor: theme.colors.glassBorder,
    borderRadius: theme.radius.pill,
    flexDirection: "row",
    overflow: "hidden",
  },
  segItem: { flex: 1, paddingVertical: 12, alignItems: "center", justifyContent: "center" },
  segActive: { backgroundColor: theme.colors.greenSoft },
  segText: { fontSize: 16, fontWeight: "800", color: "rgba(0,0,0,0.55)" },
  segTextActive: { color: "rgba(0,0,0,0.85)" },
});
