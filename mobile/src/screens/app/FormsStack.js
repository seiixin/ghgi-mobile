// mobile/src/screens/app/FormsStack.js
import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import FormsListScreen from './FormsListScreen'; // Import FormsListScreen
import NewSubmissionScreen from './NewSubmissionScreen'; // Import NewSubmissionScreen

const Stack = createStackNavigator();

function FormsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {/* FormsListScreen should be the first screen */}
      <Stack.Screen name="FormsList" component={FormsListScreen} />
      {/* NewSubmissionScreen should be the second screen */}
      <Stack.Screen name="NewSubmissionScreen" component={NewSubmissionScreen} />
    </Stack.Navigator>
  );
}

export default FormsStack;
