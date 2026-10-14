import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import WelcomeScreen from '../screens/WelcomeScreen';
import ReactionsScreen from '../screens/ReactionsScreen';
import ReactionsDetailsScreen from '../screens/ReactionsDetailsScreen';
import ReactionsQRScreen from '../screens/ReactionsQRScreen';
import BatteryDetailsScreen from '../screens/BatteryDetailsScreen';
import TemperatureDetailsScreen from '../screens/TemperatureDetailsScreen';
import NotificationsDetailsScreen from '../screens/NotificationsDetailsScreen';
import PlaylistScreen from '../screens/PlaylistScreen';
import AdsStatusScreen from '../screens/AdsStatusScreen';

const Stack = createNativeStackNavigator();

export default function AppStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="ReactionsQR" component={ReactionsQRScreen} />
      <Stack.Screen name="Reactions" component={ReactionsScreen} />
      <Stack.Screen name="ReactionsDetails" component={ReactionsDetailsScreen} />
      <Stack.Screen name="BatteryDetails" component={BatteryDetailsScreen} />
      <Stack.Screen name="TemperatureDetails" component={TemperatureDetailsScreen} />
      <Stack.Screen
        name="NotificationsDetails"
        component={NotificationsDetailsScreen}
      />
    
      <Stack.Screen name="Playlist" component={PlaylistScreen} />
      <Stack.Screen name="AdsStatus" component={AdsStatusScreen} />
</Stack.Navigator>
  );
}
