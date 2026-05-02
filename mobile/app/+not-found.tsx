import React from 'react';
import { View, Text, Pressable, StyleSheet, StatusBar } from 'react-native';
import { useRouter } from 'expo-router';
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
    const { activeTheme } = useApp();

    const goHome = () => {
        if (router.canGoBack()) {
            router.back();
        } else {
            router.replace('/(tabs)' as any);
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
