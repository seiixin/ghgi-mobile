// mobile/src/navigation/AppTabs.js
import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import DashboardScreen from "../screens/app/DashboardScreen";
import HistoryScreen from "../screens/app/HistoryScreen";
import OfflineSyncScreen from "../screens/app/OfflineSyncScreen";
import SettingsScreen from "../screens/app/SettingsScreen";
import FormsStack from "./FormsStack";

import { Ionicons } from "@expo/vector-icons";

const Tab = createBottomTabNavigator();

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

function FancyTabBar({ state, descriptors, navigation }) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.barWrap,
        { paddingBottom: Math.max(insets.bottom, 10) },
      ]}
    >
      <View style={styles.bar}>
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const { options } = descriptors[route.key];

          const label =
            options.tabBarLabel ??
            options.title ??
            route.name;

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });

            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          const onLongPress = () => {
            navigation.emit({ type: "tabLongPress", target: route.key });
          };

          const color = focused ? "#16a34a" : "#64748b";

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel}
              testID={options.tabBarTestID}
              onPress={onPress}
              onLongPress={onLongPress}
              style={styles.item}
            >
              <View style={[styles.iconPill, focused && styles.iconPillActive]}>
                <Ionicons
                  name={iconFor(route.name, focused)}
                  size={Platform.OS === "ios" ? 22 : 20}
                  color={color}
                />
              </View>

              <Text
                numberOfLines={1}
                style={[styles.label, { color }, focused && styles.labelActive]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function AppTabs({ onLogout }) {
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <FancyTabBar {...props} />}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />

      <Tab.Screen
        name="Forms"
        component={FormsStack}
        options={{ headerShown: false }}
      />

      <Tab.Screen name="History" component={HistoryScreen} />
      <Tab.Screen name="Sync" component={OfflineSyncScreen} />

      <Tab.Screen name="Settings">
        {(props) => <SettingsScreen {...props} onLogout={onLogout} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  barWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 14,
  },
  bar: {
    backgroundColor: "#ffffff",
    borderRadius: 18,

    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",

    paddingTop: 10,
    paddingHorizontal: 8,

    // shadow
    elevation: 18,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
  },
  item: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
  },
  iconPill: {
    width: 42,
    height: 32,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  iconPillActive: {
    backgroundColor: "rgba(22, 163, 74, 0.12)",
  },
  label: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: "600",
  },
  labelActive: {
    fontWeight: "700",
  },
});
