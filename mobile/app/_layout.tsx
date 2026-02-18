import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AppProvider, useApp } from '../context/AppContext';
import { View } from 'react-native';
import PipOverlay from '../components/PipOverlay';
import { IncomingCallModal } from '../components/IncomingCallModal';
import '../global.css';

function RootContent() {
  const { activeCall } = useApp();
  const router = useRouter();
  const segments = useSegments();

    // --- TRAFFIC CONTROLLER FOR CALLS ---
    useEffect(() => {
        if (!activeCall) return;

        const inCallScreen = segments[0] === 'call';

        // 1. If call is outgoing (just initiated) or accepted, navigate to call screen
        const shouldBeInCallScreen = !activeCall.isIncoming || activeCall.isAccepted;

        if (shouldBeInCallScreen && !activeCall.isMinimized && !inCallScreen) {
            console.log('Call active & (Outgoing or Accepted) - Navigating to Call Screen');
            router.push('/call');
        }
    }, [activeCall?.isAccepted, activeCall?.isIncoming, activeCall?.isMinimized, segments]);

  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }} initialRouteName="(tabs)">
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="call" options={{
          presentation: 'fullScreenModal',
          animation: 'fade',
          gestureEnabled: false
        }} />
        <Stack.Screen name="music" options={{
          presentation: 'transparentModal',
          animation: 'fade',
          headerShown: false
        }} />
        <Stack.Screen name="chat/[id]" options={{
          presentation: 'transparentModal',
          animation: 'none',
          headerShown: false,
          gestureEnabled: true,
          contentStyle: { backgroundColor: 'transparent' },
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
