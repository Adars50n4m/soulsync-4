import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AppProvider, useApp } from '../context/AppContext';
import { View } from 'react-native';
import PipOverlay from '../components/PipOverlay';
import { IncomingCallModal } from '../components/IncomingCallModal';
import '../global.css';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

function RootContent() {
  const { activeCall } = useApp();
  const router = useRouter();
  const segments = useSegments();

  // --- TRAFFIC CONTROLLER FOR CALLS ---
  useEffect(() => {
    if (!activeCall) return;

    // Check where we are
    const inCallScreen = segments[0] === 'call';

    // 1. If call is accepted and NOT minimized, force navigation to call screen
    if (activeCall.isAccepted && !activeCall.isMinimized && !inCallScreen) {
      console.log('Call active & accepted - Navigating to Call Screen');
      router.push('/call');
    }
    
    // 2. If call is incoming (ringing), we don't navigate yet, the Modal handles it.
  }, [activeCall?.isAccepted, activeCall?.isMinimized, segments]);

  return (
    <View style={{ flex: 1 }}>
       <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="call" options={{ 
          presentation: 'fullScreenModal',
          animation: 'fade',
          gestureEnabled: false 
        }} />
        <Stack.Screen name="+not-found" />
      </Stack>

      {/* Global Overlays */}
      <IncomingCallModal />
      <PipOverlay />
    </View>
  );
}

export default function RootLayout() {
  useEffect(() => {
    // Hide splash screen immediately since we're not waiting for fonts
    SplashScreen.hideAsync();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppProvider>
        <ThemeProvider value={DarkTheme}>
          <RootContent />
          <StatusBar style="light" />
        </ThemeProvider>
      </AppProvider>
    </GestureHandlerRootView>
  );
}
