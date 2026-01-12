// mobile/src/navigation/AppTabs.js
import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import DashboardScreen from "../screens/app/DashboardScreen";
import HistoryScreen from "../screens/app/HistoryScreen";
import OfflineSyncScreen from "../screens/app/OfflineSyncScreen";
import SettingsScreen from "../screens/app/SettingsScreen";
import FormsStack from "./FormsStack";

const Stack = createNativeStackNavigator();

function iconFor(routeName, focused) {
  switch (routeName) {
    case "Dashboard":
      return focused ? "home" : "home-outline";
    case "Forms":
      return focused ? "clipboard" : "clipboard-outline";
    case "History":
      return focused ? "time" : "time-outline";
    case "Sync":
      return focused ? "cloud-upload" : "cloud-upload-outline";
    case "Settings":
      return focused ? "settings" : "settings-outline";
    default:
      return focused ? "ellipse" : "ellipse-outline";
  }
}

function TopTabsHeader({ currentRouteName, onNavigate }) {
  const insets = useSafeAreaInsets();
  const tabs = ["Dashboard", "Forms", "History", "Sync", "Settings"];

  return (
    <View style={[styles.headerWrap, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        {tabs.map((name) => {
          const focused = currentRouteName === name;
          const color = focused ? "#16a34a" : "#64748b";

          return (
            <Pressable
              key={name}
              onPress={() => onNavigate(name)}
              style={[styles.topItem, focused && styles.topItemActive]}
              hitSlop={10}
            >
              <Ionicons
                name={iconFor(name, focused)}
                size={Platform.OS === "ios" ? 22 : 20}
                color={color}
                style={styles.topIcon}
              />
              <Text
                numberOfLines={1}
                style={[styles.topLabel, { color }, focused && styles.topLabelActive]}
              >
                {name}
              </Text>
              {focused ? <View style={styles.activeUnderline} /> : <View style={styles.underlineSpacer} />}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function AppTabs({ onLogout }) {
  return (
    <Stack.Navigator
      screenOptions={({ navigation, route }) => ({
        // Use our custom header (NOT overlay, not absolute)
        headerShown: true,
        header: () => (
          <TopTabsHeader
            currentRouteName={route.name}
            onNavigate={(name) => {
              if (route.name !== name) navigation.navigate(name);
            }}
          />
        ),

        // Important: keeps content below header in the stack layout
        contentStyle: { backgroundColor: "#fff" },
      })}
    >
      <Stack.Screen name="Dashboard" component={DashboardScreen} />

      <Stack.Screen name="Forms" component={FormsStack} />

      <Stack.Screen name="History" component={HistoryScreen} />

      <Stack.Screen name="Sync" component={OfflineSyncScreen} />

      <Stack.Screen name="Settings">
        {(props) => <SettingsScreen {...props} onLogout={onLogout} />}
      </Stack.Screen>
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  headerWrap: {
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(15, 23, 42, 0.08)",
    zIndex: 9999,
    elevation: 50,
  },

  topBar: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "space-between",
    paddingHorizontal: 10,

    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },

  topItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    borderRadius: 14,
    marginHorizontal: 4,
  },

  topItemActive: {
    backgroundColor: "rgba(22, 163, 74, 0.08)",
  },

  topIcon: { marginBottom: 2 },

  topLabel: { fontSize: 11, fontWeight: "700" },

  topLabelActive: { fontWeight: "800" },

  activeUnderline: {
    marginTop: 6,
    height: 3,
    width: 18,
    borderRadius: 999,
    backgroundColor: "#16a34a",
  },

  underlineSpacer: {
    marginTop: 6,
    height: 3,
    width: 18,
    borderRadius: 999,
    backgroundColor: "transparent",
  },
});
