import React from "react";
import { Image, ImageBackground, StyleSheet, Text, View } from "react-native";
import { PillButton } from "../../ui/components";
import { theme } from "../../ui/theme";

export default function WelcomeScreen({ navigation }) {
  return (
    <ImageBackground
      source={require("../../../assets/bg.png")}
      style={styles.bg}
      resizeMode="cover"
    >
      {/* Decorative overlay must not block touches */}
      <View pointerEvents="none" style={styles.overlay} />

      <View style={styles.center} pointerEvents="box-none">
        <Image source={require("../../../assets/logo.png")} style={styles.logo} />
        <Text style={styles.title}>GHGI Laguna</Text>
        <Text style={styles.sub}>Mobile Inventory</Text>

        <View style={styles.btns}>
          <PillButton title="Sign Up" onPress={() => navigation.navigate("Signup")} />
          <View style={{ height: 14 }} />
          <PillButton
            title="Login"
            variant="ghost"
            onPress={() => navigation.navigate("Login")}
          />
        </View>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: theme.colors.overlay },
  center: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 24 },
  logo: { width: 92, height: 92, marginBottom: 14, tintColor: "white" },
  title: { color: "white", fontSize: 34, fontWeight: "900", letterSpacing: 0.2 },
  sub: { color: theme.colors.muted, fontSize: 14, marginTop: 6, marginBottom: 28 },
  btns: { width: "92%", marginTop: 24 },
});
