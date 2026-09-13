import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet, View, Text, ScrollView, ActivityIndicator } from 'react-native';
import {
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  useFonts,
} from '@expo-google-fonts/manrope';
import RootNavigator from './navigation/RootNavigator';

// ── Global Error Boundary ──────────────────────────────────────────────────────────────
// Catches any JS render error and shows it on-screen instead of a blank page.
// This is critical for diagnosing issues during development.
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error.message);
    console.error('[ErrorBoundary] Stack:', error.stack);
    console.error('[ErrorBoundary] Component stack:', info.componentStack);
  }

  render() {
    if (this.state.error) {
      const err = this.state.error as Error;
      return (
        <View style={eb.container}>
          <Text style={eb.title}>❌ App Crash</Text>
          <Text style={eb.msg}>{err.message}</Text>
          <ScrollView style={eb.stackBox}>
            <Text style={eb.stack}>{err.stack}</Text>
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
}

const eb = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0f', justifyContent: 'center', padding: 20, paddingTop: 60 },
  title:     { color: '#ff4444', fontSize: 20, fontWeight: 'bold', marginBottom: 12 },
  msg:       { color: '#fff', fontSize: 14, marginBottom: 16 },
  stackBox:  { maxHeight: 400, backgroundColor: '#1a1a2e', borderRadius: 8, padding: 12 },
  stack:     { color: '#aaa', fontSize: 11, fontFamily: 'monospace' },
});

// ── App ───────────────────────────────────────────────────────────────────────
function AppInner() {
  const [fontsLoaded, fontError] = useFonts({
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
  });

  useEffect(() => {
    if (fontError) console.error('[App] Font loading error:', fontError);
    if (fontsLoaded) console.log('[App] Fonts loaded successfully');
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    console.log('[App] Waiting for fonts...');
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color="#7C3AED" />
        <Text style={{ color: '#666', marginTop: 10 }}>Initializing Fonts...</Text>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
          <RootNavigator />
          <StatusBar style="dark" backgroundColor="#FAFBFC" />
        </SafeAreaView>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  flex:   { flex: 1, backgroundColor: '#FAFBFC' },
  splash: { flex: 1, backgroundColor: '#0A0A0F', justifyContent: 'center', alignItems: 'center' },
});
