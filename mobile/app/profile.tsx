import React, { useRef } from 'react';
import {
    View, Text, Image, StyleSheet, StatusBar, ScrollView, Animated, Dimensions
} from 'react-native';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { MaterialIcons } from '@expo/vector-icons';
import { Pressable } from 'react-native';
import { useApp } from '../context/AppContext';

const { width } = Dimensions.get('window');
const HEADER_HEIGHT = 300;

export default function ProfileScreen() {
    const router = useRouter();
    const { currentUser, activeTheme } = useApp();
    const scrollY = useRef(new Animated.Value(0)).current;

    if (!currentUser) {
        return (
            <View style={styles.container}>
                <Text style={styles.errorText}>Please log in to view profile</Text>
            </View>
        );
    }

    // Parallax Animations
    const headerHeight = scrollY.interpolate({
        inputRange: [0, HEADER_HEIGHT],
        outputRange: [HEADER_HEIGHT, 100],
        extrapolate: 'clamp'
    });

    const avatarScale = scrollY.interpolate({
        inputRange: [0, HEADER_HEIGHT],
        outputRange: [1, 0.5],
        extrapolate: 'clamp'
    });

    const avatarOpacity = scrollY.interpolate({
        inputRange: [0, HEADER_HEIGHT / 2],
        outputRange: [1, 0],
        extrapolate: 'clamp'
    });

    const nameOpacity = scrollY.interpolate({
        inputRange: [HEADER_HEIGHT / 2, HEADER_HEIGHT],
        outputRange: [0, 1],
        extrapolate: 'clamp'
    });

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" />

            {/* Animated Header */}
            <Animated.View style={[styles.header, { height: headerHeight }]}>
                <View style={styles.bgGlow} />
                
                {/* Top Bar */}
                <View style={styles.topBar}>
                <Pressable onPress={() => router.back()} style={styles.backButton}>
                    <MaterialIcons name="arrow-back" size={24} color="#ffffff" />
                </Pressable>
                <Animated.Text style={[styles.headerTitle, { opacity: nameOpacity }]}>
                    {currentUser.name}
                </Animated.Text>
                <View style={styles.headerSpacer} />
                </View>

                {/* Large Avatar */}
                <Animated.View style={[styles.largeAvatarContainer, { opacity: avatarOpacity, transform: [{ scale: avatarScale }] }]}>
                    <Image source={{ uri: currentUser.avatar }} style={styles.largeAvatar} />
                    <Text style={styles.largeName}>{currentUser.name}</Text>
                </Animated.View>
            </Animated.View>

            <Animated.ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
                scrollEventThrottle={16}
            >
                <View style={{ height: 20 }} />

                {/* Info Card */}
                <BlurView intensity={30} tint="dark" style={styles.infoCard}>
                    <View style={styles.infoRow}>
                        <MaterialIcons name="person" size={20} color="rgba(255,255,255,0.4)" />
                        <Text style={styles.infoLabel}>Username</Text>
                        <Text style={styles.infoValue}>{currentUser.id}</Text>
                    </View>
                    <View style={styles.divider} />
                    <View style={styles.infoRow}>
                        <MaterialIcons name="favorite" size={20} color={activeTheme.primary} />
                        <Text style={styles.infoLabel}>Status</Text>
                        <Text style={styles.infoValue}>Connected</Text>
                    </View>
                </BlurView>

                {/* Note */}
                <Text style={styles.noteText}>
                    Profile editing is disabled in this version.
                    Your profile is linked to your SoulSync identity.
                </Text>
            </Animated.ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#09090b' },
    header: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, backgroundColor: '#09090b', overflow: 'hidden', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
    bgGlow: { position: 'absolute', top: -50, left: '50%', marginLeft: -150, width: 300, height: 300, borderRadius: 150, backgroundColor: 'rgba(244, 63, 94, 0.15)', opacity: 0.6 },
    topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 60, paddingHorizontal: 20, height: 100 },
    backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.05)' },
    headerTitle: { color: '#ffffff', fontSize: 18, fontWeight: '700' },
    headerSpacer: { width: 40 },
    
    largeAvatarContainer: { alignItems: 'center', justifyContent: 'center', marginTop: -20 },
    largeAvatar: { width: 120, height: 120, borderRadius: 60, borderWidth: 4, borderColor: 'rgba(255,255,255,0.1)' },
    largeName: { color: '#ffffff', fontSize: 28, fontWeight: '900', letterSpacing: 1, marginTop: 16 },
    
    scrollView: { flex: 1, marginTop: 100 }, // Push content down initially
    scrollContent: { paddingHorizontal: 20, paddingBottom: 100, paddingTop: 200 }, // Add padding top to clear header
    
    infoCard: { borderRadius: 20, padding: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', overflow: 'hidden', marginTop: 20 },
    infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
    infoLabel: { flex: 1, color: 'rgba(255,255,255,0.4)', fontSize: 14, fontWeight: '500' },
    infoValue: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
    divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginVertical: 8 },
    noteText: { color: 'rgba(255,255,255,0.3)', fontSize: 12, textAlign: 'center', paddingHorizontal: 20, marginTop: 32, lineHeight: 18 },
    errorText: { color: '#ef4444', fontSize: 16, textAlign: 'center', marginTop: 100 },
});
