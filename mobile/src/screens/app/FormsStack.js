// mobile/src/navigation/FormsStack.js
import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import FormsListScreen from "../screens/app/FormsListScreen";
import FormAnswerScreen from "../screens/app/FormAnswerScreen";
import OfflineSyncScreen from "../screens/app/OfflineSyncScreen";

const Stack = createNativeStackNavigator();

/**
 * FIX #1 (Draft Open):
 * - Ensure the route name is EXACTLY "FormAnswer"
 * - Keep only one answering screen route and use it everywhere:
 *     navigation.navigate("FormAnswer", { mode:"draft", draftId, ... })
 *
 * This stack guarantees that "FormAnswer" exists.
 */

export default function FormsStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerBackTitleVisible: false,
      }}
    >
      <Stack.Screen
        name="FormsList"
        component={FormsListScreen}
        options={{ title: "Forms" }}
      />

      <Stack.Screen
        name="FormAnswer"
        component={FormAnswerScreen}
        options={({ route }) => {
          const mode = String(route?.params?.mode || "new").toLowerCase();
          const isDraft = mode === "draft";
          const title = isDraft ? "Edit Draft" : "Answer Form";
          return { title };
        }}
      />

      <Stack.Screen
        name="OfflineSync"
        component={OfflineSyncScreen}
        options={{ title: "Offline Sync" }}
      />
    </Stack.Navigator>
  );
}
