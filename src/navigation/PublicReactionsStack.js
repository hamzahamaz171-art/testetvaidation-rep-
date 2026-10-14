import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import ReactionsScreen from '../screens/ReactionsScreen';
import ReactionsDetailsScreen from '../screens/ReactionsDetailsScreen';

const Stack = createNativeStackNavigator();

// Minimal stack used when the app is opened via the QR deep-link (/reactions).
// This keeps the old behavior: scanning the QR opens directly the reactions UI.
export default function PublicReactionsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Reactions" component={ReactionsScreen} />
      <Stack.Screen name="ReactionsDetails" component={ReactionsDetailsScreen} />
    </Stack.Navigator>
  );
}
