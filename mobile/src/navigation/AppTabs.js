import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import DashboardScreen from "../screens/app/DashboardScreen";
import FormsListScreen from "../screens/app/FormsListScreen";
import HistoryScreen from "../screens/app/HistoryScreen";
import OfflineSyncScreen from "../screens/app/OfflineSyncScreen";
import SettingsScreen from "../screens/app/SettingsScreen";

const Tab = createBottomTabNavigator();

export default function AppTabs({ onLogout }) {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Forms" component={FormsListScreen} />
      <Tab.Screen name="History" component={HistoryScreen} />
      <Tab.Screen name="Sync" component={OfflineSyncScreen} />
      <Tab.Screen name="Settings">
        {(props) => <SettingsScreen {...props} onLogout={onLogout} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}
