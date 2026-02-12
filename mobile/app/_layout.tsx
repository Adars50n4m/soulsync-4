import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments, useRootNavigationState } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useEffect, useState } from 'react';

import { AppProvider, useApp } from '../context/AppContext';
import PipOverlay from '../components/PipOverlay';

export const unstable_settings = {
  anchor: '(tabs)',
};

import { IncomingCallModal } from '../components/IncomingCallModal';

function NavigationGuard({ children }: { children: React.ReactNode }) {
  const { currentUser, activeCall, endCall, acceptCall, isReady } = useApp();
  const segments = useSegments();
  const router = useRouter();
  const navigationState = useRootNavigationState();
  const [showIncomingCall, setShowIncomingCall] = useState(false);
  useEffect(() => {
    if (activeCall && !activeCall.isAccepted && activeCall.isIncoming) {
      setShowIncomingCall(true);
    } else {
      setShowIncomingCall(false);
    }
  }, [activeCall]);

  const handleAccept = () => {
    setShowIncomingCall(false);
    acceptCall(); // This should navigate to /call
  };

  const handleDecline = () => {
    setShowIncomingCall(false);
    endCall();
  };

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isReady || !navigationState?.key) return;

    if (!currentUser && segments[0] !== 'login') {
      router.replace('/login');
    }
  }, [isReady, currentUser, segments, navigationState]);

  // Centralized call navigation: works from any screen
  useEffect(() => {
    if (!activeCall || activeCall.isMinimized) return;

    // Check if already on call screen to prevent loop/refresh
    const isOnCallScreen = (segments as string[]).includes('call');
    if (isOnCallScreen) return;

    // For incoming calls, navigate only after user accepts.
    if (activeCall.isIncoming && !activeCall.isAccepted) return;

    router.push('/call');
  }, [activeCall?.callId, activeCall?.isMinimized, segments]);

  return (
    <>
      {children}
      <IncomingCallModal
        visible={showIncomingCall}
        callerName={activeCall?.callerName || "Unknown"}
        callerAvatar={activeCall?.callerAvatar}
        callType={activeCall?.type || 'audio'}
        onAccept={handleAccept}
        onDecline={handleDecline}
      />
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppProvider>
        <ThemeProvider value={DarkTheme}>
          <NavigationGuard>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="login" options={{ headerShown: false }} />
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="call" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
              <Stack.Screen name="chat/[id]" options={{ headerShown: false }} />
              <Stack.Screen name="theme" options={{ headerShown: false }} />
              <Stack.Screen name="profile" options={{ headerShown: false }} />
              <Stack.Screen name="profile/[id]" options={{ headerShown: false }} />
              <Stack.Screen name="add-status" options={{ headerShown: false }} />
              <Stack.Screen name="view-status" options={{ headerShown: false }} />
              <Stack.Screen name="music" options={{ headerShown: false, presentation: 'transparentModal', contentStyle: { backgroundColor: 'transparent' } }} />
            </Stack>
          </NavigationGuard>
          <PipOverlay />
          <StatusBar style="light" />
        </ThemeProvider>
      </AppProvider>
    </GestureHandlerRootView>
  );
}
