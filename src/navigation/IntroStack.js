import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import IntroRobotScreen from '../screens/IntroRobotScreen';
import IntroIdeasScreen from '../screens/IntroIdeasScreen';
import IntroWelcomeScreen from '../screens/IntroWelcomeScreen';

const Stack = createNativeStackNavigator();

export default function IntroStack({ onDone }) {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="IntroRobot" component={IntroRobotScreen} />
      <Stack.Screen name="IntroIdeas" component={IntroIdeasScreen} />
      {/* We pass onDone as a prop to the last screen */}
      <Stack.Screen name="IntroWelcome">
        {(props) => <IntroWelcomeScreen {...props} onDone={onDone} />}
      </Stack.Screen>
    </Stack.Navigator>
  );
}
