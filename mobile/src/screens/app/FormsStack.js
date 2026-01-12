// mobile/src/navigation/FormsStack.js
import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import FormsListScreen from "../screens/app/FormsListScreen";
import FormAnswerScreen from "../screens/app/FormAnswerScreen";
import OfflineSyncScreen from "../screens/app/OfflineSyncScreen";

const Stack = createNativeStackNavigator();

/**
 * Routes supported:
 * - FormsList
 * - FormAnswer
 *   params:
 *     - formTypeId (required)
 *     - year (required)
 *     - mode: "new" | "draft" (optional, default "new")
 *     - draftId (required when mode="draft")
 * - OfflineSync (optional access from this stack)
 *
 * Notes:
 * - If OfflineSyncScreen is already in another navigator (Tabs/Root), remove it here.
 * - Keep "FormAnswer" route name consistent with OfflineSyncScreen + FormAnswerScreen navigation.
 */

export default function FormsStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="FormsList"
        component={FormsListScreen}
        options={{ title: "Forms" }}
      />

      <Stack.Screen
        name="FormAnswer"
        component={FormAnswerScreen}
        options={({ route }) => {
          const mode = route?.params?.mode || "new";
          const title = mode === "draft" ? "Edit Draft" : "Answer Form";
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
