import React, { useEffect, useState, useRef } from 'react';
import { Text, StyleSheet, Platform } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { MaterialIcons } from '@expo/vector-icons';

interface ConnectionBannerProps {
  connectivity: {
    isDeviceOnline: boolean;
    isServerReachable: boolean;
    isRealtimeConnected: boolean;
  };
  /** 'inline' = static flow (chat list), 'absolute' = floating (chat screen) */
  mode?: 'inline' | 'absolute';
}

type BannerState = 'connected' | 'connecting' | 'offline';

export default function ConnectionBanner({ connectivity, mode = 'inline' }: ConnectionBannerProps) {
  const [visibleState, setVisibleState] = useState<BannerState | null>(null);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const hadDisconnect = useRef(false);

  // Only check device online + server reachable. Realtime is per-chat and
  // transitions too frequently (false→true on every chat open) causing flash.
  const rawState: BannerState = !connectivity.isDeviceOnline
    ? 'offline'
    : !connectivity.isServerReachable
      ? 'connecting'
      : 'connected';

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    if (rawState === 'connected') {
      // If we had a real disconnect, briefly show "Connected" then hide
      if (hadDisconnect.current) {
        setVisibleState('connected');
        debounceTimer.current = setTimeout(() => {
          setVisibleState(null);
          hadDisconnect.current = false;
        }, 2000);
      } else {
        // No prior disconnect — just hide immediately (no flash on initial load)
        setVisibleState(null);
      }
    } else {
      // Show "Connecting..." or "Offline" only after 3s debounce
      // to avoid flashing during brief network blips
      debounceTimer.current = setTimeout(() => {
        hadDisconnect.current = true;
        setVisibleState(rawState);
      }, 3000);
    }

    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
  }, [rawState]);

  if (!visibleState) return null;

  const config = visibleState === 'offline'
    ? { bg: '#dc2626', icon: 'wifi-off' as const, text: 'Waiting for network...' }
    : visibleState === 'connecting'
      ? { bg: '#d97706', icon: 'sync' as const, text: 'Connecting...' }
      : { bg: '#16a34a', icon: 'check-circle' as const, text: 'Connected' };

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
      style={[
        styles.banner,
        { backgroundColor: config.bg },
        mode === 'absolute' && styles.absolute,
      ]}
    >
      <MaterialIcons name={config.icon} size={13} color="#fff" style={{ marginRight: 5 }} />
      <Text style={styles.text}>{config.text}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    paddingVertical: 5,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    zIndex: 2000,
  },
  absolute: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 100 : 80,
    left: 20,
    right: 20,
    borderRadius: 12,
    zIndex: 9999,
  },
  text: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
