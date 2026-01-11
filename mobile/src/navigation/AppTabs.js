// mobile/src/navigation/AppTabs.js
import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";

import DashboardScreen from "../screens/app/DashboardScreen";
import HistoryScreen from "../screens/app/HistoryScreen";
import OfflineSyncScreen from "../screens/app/OfflineSyncScreen";
import SettingsScreen from "../screens/app/SettingsScreen";

// ✅ use the Forms stack instead of the list screen directly
import FormsStack from "./FormsStack";

const Tab = createBottomTabNavigator();

export default function AppTabs({ onLogout }) {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Dashboard" component={DashboardScreen} />

      {/* ✅ Forms tab now has its own Stack: FormsList -> FormAnswer */}
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