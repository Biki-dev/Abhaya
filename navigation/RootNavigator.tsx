// navigation/RootNavigator.tsx
import React, { useEffect, useState, createContext, useContext } from 'react';
import { View, ActivityIndicator, Alert } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';

import OnboardingScreen from '../screens/OnboardingScreen';
import AppStack from './AppStack';
import { initContactsFromBackend } from '../services/emergencyContacts';

const Stack = createNativeStackNavigator();

type AuthState = {
  isLoading: boolean;
  userToken: string | null;
};

type AuthContextType = {
  signOut: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default function RootNavigator() {
  const [authState, setAuthState] = useState<AuthState>({
    isLoading: true,
    userToken: null,
  });

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const raw = await AsyncStorage.getItem('saathiUserData');
        if (raw) {
          const userData = JSON.parse(raw);

          // Attempt backend sync quietly
          syncUserQuietly(userData).catch(() => {});

          // Seed emergency contacts from backend (offline-safe — uses cache if offline)
          initContactsFromBackend().catch(() => {});

          setAuthState({ isLoading: false, userToken: userData.phone ?? null });
        } else {
          setAuthState({ isLoading: false, userToken: null });
        }
      } catch {
        setAuthState({ isLoading: false, userToken: null });
      }
    };
    bootstrap();
  }, []);

  const handleOnboardingComplete = (phone: string) => {
    // After onboarding, pull contacts from backend in background
    initContactsFromBackend().catch(() => {});
    setAuthState({ isLoading: false, userToken: phone });
  };

  const signOut = async () => {
    try {
      const { logoutUser, clearLocalUserData } = await import('../services/api');
      if (authState.userToken) {
        await logoutUser(authState.userToken).catch(err => console.warn('Backend logout failed', err));
      }
      await clearLocalUserData();
      setAuthState({ isLoading: false, userToken: null });
    } catch (error) {
      Alert.alert('Error', 'Failed to log out properly');
    }
  };

  return (
    <AuthContext.Provider value={{ signOut }}>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false, animation: 'default' }}>
          {authState.isLoading ? (
            <Stack.Screen name="Splash" component={SplashScreen} options={{ animation: 'none' }} />
          ) : authState.userToken == null ? (
            <Stack.Screen
              name="Onboarding"
              children={(props) => (
                <OnboardingScreen {...props} onComplete={handleOnboardingComplete} />
              )}
              options={{ contentStyle: { backgroundColor: '#0A0A0F' } }}
            />
          ) : (
            <Stack.Screen name="App" component={AppStack} options={{ animation: 'none' }} />
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </AuthContext.Provider>
  );
}

// Sync user profile to backend silently — never throw, never spam logs
async function syncUserQuietly(userData: { phone?: string; name?: string; email?: string }) {
  if (!userData.phone || !userData.name) return;
  const { getApiBaseUrlCandidates } = await import('../services/api');
  const candidates = getApiBaseUrlCandidates();
  for (const base of candidates) {
    try {
      const res = await fetch(`${base}/api/users/upsert`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          phone: userData.phone,
          name:  userData.name,
          email: userData.email ?? '',
        }),
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok) return;
    } catch {
      // offline — try next candidate silently
    }
  }
}

function SplashScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: '#0A0A0F', justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" color="#7C3AED" />
    </View>
  );
}