import React from "react";
import { Image, ImageBackground, StyleSheet, View } from "react-native";
import { theme } from "../../ui/theme";

export default function AuthShell({ children }) {
  return (
    <ImageBackground
      source={require("../../../assets/bg.png")}
      style={styles.bg}
      resizeMode="cover"
    >
      {/* Decorative overlay must not block touches */}
      <View pointerEvents="none" style={styles.overlay} />
      <View style={styles.wrap} pointerEvents="box-none">
        <Image source={require("../../../assets/logo.png")} style={styles.logo} />
        {children}
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: theme.colors.overlay },
  wrap: { flex: 1, paddingHorizontal: 20, paddingTop: 80 },
  logo: { width: 110, height: 110, alignSelf: "center", marginBottom: 18, tintColor: "white" },
});
