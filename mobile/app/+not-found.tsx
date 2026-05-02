import React, { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, StatusBar } from 'react-native';
import { useRouter, usePathname, useSegments, useGlobalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';

// Custom +not-found route. The default expo-router `Unmatched` component
// calls `Linking.createURL('/')` to display the requested URL, which crashes
// when expo-constants can't read the app manifest at runtime ("expo-linking
// needs access to the expo-constants manifest"). Providing our own route
// bypasses that internal call entirely — and lets us surface a friendly
// fallback instead of a black screen full of error text.
export default function NotFoundScreen() {
    const router = useRouter();
    const pathname = usePathname();
    const segments = useSegments();
    const params = useGlobalSearchParams();
    const { activeTheme, currentUser, isReady } = useApp();

    // Log diagnostic info so we can see *why* we landed here. The logs make
    // it obvious whether the navigation came from a stale push, a route
    // mismatch, or an upstream crash that fell back to +not-found.
    useEffect(() => {
        console.warn('[+not-found] Rendered. Diagnostic:', {
            pathname,
            segments,
            params,
            currentUserId: currentUser?.id || null,
            isReady,
        });
    }, [pathname, segments, params, currentUser?.id, isReady]);

    const goHome = () => {
        // If we landed here because of a transient race during boot, the
        // user is already authenticated — send them straight back to the
        // home tab. Otherwise, let the root index.tsx redirect run again.
        if (currentUser) {
            router.replace('/(tabs)' as any);
        } else {
            router.replace('/login' as any);
        }
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" />
            <Ionicons name="compass-outline" size={64} color="rgba(255,255,255,0.3)" />
            <Text style={styles.title}>Page not found</Text>
            <Text style={styles.subtitle}>
                The screen you tried to open doesn't exist.
            </Text>
            <Pressable
                onPress={goHome}
                style={[styles.button, { backgroundColor: activeTheme?.primary || '#8C0016' }]}
            >
                <Text style={styles.buttonText}>Take me home</Text>
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 32,
        gap: 12,
    },
    title: {
        color: '#fff',
        fontSize: 20,
        fontWeight: '700',
        marginTop: 8,
    },
    subtitle: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 16,
    },
    button: {
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 24,
    },
    buttonText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '600',
    },
});
