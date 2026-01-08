import React from "react";
import { SafeAreaView, StyleSheet, Text, View } from "react-native";

export default function FormsListScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.box}>
        <Text style={styles.title}>Forms</Text>
        <Text style={styles.sub}>Module 0-1 scaffold. Next modules will fill this.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  box: { padding: 20 },
  title: { fontSize: 22, fontWeight: "800" },
  sub: { marginTop: 8, fontSize: 14, color: "#444" },
});
