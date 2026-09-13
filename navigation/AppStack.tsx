
import React from 'react';
import { StyleSheet } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator }   from '@react-navigation/bottom-tabs';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../theme';

import HomeMapScreen            from '../screens/HomeMapScreen';
import RouteCheckInScreen       from '../screens/RouteCheckInScreen';
import SettingsScreen           from '../screens/SettingsScreen';
import SensorDashboardScreen    from '../screens/SensorDashboardScreen';
import GuardianDashboardScreen  from '../screens/GuardianDashboardScreen';

const Stack = createNativeStackNavigator();
const Tab   = createBottomTabNavigator();

function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="HomeMap"          component={HomeMapScreen} />
      <Stack.Screen name="SensorDashboard"  component={SensorDashboardScreen} />
      <Stack.Screen name="Guardian"         component={GuardianDashboardScreen} />
    </Stack.Navigator>
  );
}

function RouteCheckInStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="RouteCheckInMain" component={RouteCheckInScreen} />
    </Stack.Navigator>
  );
}

function SettingsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="SettingsMain" component={SettingsScreen} />
    </Stack.Navigator>
  );
}

export default function AppStack() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor:   colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle:        styles.tabLabel,
        tabBarItemStyle:         styles.tabItem,
        tabBarShowLabel:         true,
      }}
    >
      <Tab.Screen name="Home" component={HomeStack}
        options={{ tabBarLabel: 'Home', tabBarIcon: ({ color }) => <Ionicons name="home-outline" size={22} color={color} /> }}
      />
      <Tab.Screen name="RouteCheckIn" component={RouteCheckInStack}
        options={{ tabBarLabel: 'Check-In', tabBarIcon: ({ color }) => <MaterialCommunityIcons name="map-marker-path" size={22} color={color} /> }}
      />
      <Tab.Screen name="Settings" component={SettingsStack}
        options={{ tabBarLabel: 'Settings', tabBarIcon: ({ color }) => <Ionicons name="settings-outline" size={22} color={color} /> }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute', left: 14, right: 14, bottom: 14, height: 64, borderRadius: 18,
    backgroundColor: colors.surface, borderTopWidth: 0, borderWidth: 1, borderColor: colors.border,
    paddingBottom: 6, paddingTop: 6,
    shadowColor: '#1A202C', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 6, elevation: 4,
  },
  tabItem:  { borderRadius: 12 },
  tabLabel: { fontFamily: 'Manrope_600SemiBold', fontSize: 11, marginTop: 2 },
});