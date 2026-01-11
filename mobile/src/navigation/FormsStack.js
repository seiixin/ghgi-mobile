// mobile/src/navigation/FormsStack.js
import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import FormsListScreen from "../screens/app/FormsListScreen";
import FormAnswerScreen from "../screens/app/FormAnswerScreen";

const Stack = createNativeStackNavigator();

export default function FormsStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="FormsList" component={FormsListScreen} options={{ title: "Forms" }} />
      <Stack.Screen name="FormAnswer" component={FormAnswerScreen} options={{ title: "Answer Form" }} />
    </Stack.Navigator>
  );
}
