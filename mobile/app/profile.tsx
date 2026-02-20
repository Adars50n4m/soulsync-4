import React, { useRef } from 'react';
import {
    View, Text, Image, StyleSheet, StatusBar, ScrollView, Animated, Dimensions
} from 'react-native';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { Pressable, Alert } from 'react-native';
import { useApp } from '../context/AppContext';

const { width } = Dimensions.get('window');
const HEADER_HEIGHT = 300;

export default function ProfileScreen() {
    const router = useRouter();
    const { currentUser, logout, activeTheme } = useApp();
    const scrollY = useRef(new Animated.Value(0)).current;

    if (!currentUser) {
        return (
            <View style={styles.container}>
                <Text style={styles.errorText}>Please log in to view profile</Text>
            </View>
        );
    }

    // Parallax Animations
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

    const handleLogout = () => {
        Alert.alert(
            'Logout',
            'Are you sure you want to disconnect your SoulSync?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Logout',
                    style: 'destructive',
                    onPress: async () => {
                        await logout();
                        router.replace('/login' as any);
                    }
                }
            ]
        );
    };

    const MenuItem = ({ icon, title, subtitle, onPress, isLast, danger }: any) => (
        <Pressable 
            style={({ pressed }) => [
                styles.menuItem,
                pressed && { opacity: 0.7 },
                !isLast && styles.menuItemBorder
            ]} 
            onPress={onPress}
        >
            <View style={[styles.menuIconContainer, danger && { backgroundColor: 'rgba(239, 68, 68, 0.1)' }]}>
                <Ionicons name={icon} size={22} color={danger ? '#ef4444' : '#fff'} />
            </View>
            <View style={styles.menuTextContainer}>
                <Text style={[styles.menuTitle, danger && { color: '#ef4444' }]}>{title}</Text>
                {subtitle && <Text style={styles.menuSubtitle}>{subtitle}</Text>}
            </View>
            <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.2)" />
        </Pressable>
    );

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" translucent />

            {/* Ambient Background Orbs */}
            <View style={StyleSheet.absoluteFill}>
                <LinearGradient
                    colors={['rgba(244, 63, 94, 0.1)', 'transparent']}
                    style={[styles.orb, { top: -100, left: -50 }]}
                />
                <LinearGradient
                    colors={['rgba(168, 85, 247, 0.1)', 'transparent']}
                    style={[styles.orb, { bottom: 100, right: -100 }]}
                />
                <LinearGradient
                    colors={['rgba(59, 130, 246, 0.05)', 'transparent']}
                    style={[styles.orb, { top: '40%', right: -50 }]}
                />
                <LinearGradient
                    colors={['rgba(244, 63, 94, 0.08)', 'transparent']}
                    style={[styles.orb, { top: '60%', left: -100 }]}
                />
            </View>

            {/* Header Content */}
            <View style={styles.topBar}>
                <Pressable onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="chevron-back" size={28} color="#ffffff" />
                </Pressable>
                <Animated.Text style={[styles.headerTitle, { opacity: nameOpacity }]}>
                    Profile
                </Animated.Text>
                <View style={{ width: 44 }} />
            </View>

            <Animated.ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
                scrollEventThrottle={16}
            >
                {/* Hero Profile Section */}
                <Animated.View style={[styles.heroSection, { opacity: avatarOpacity, transform: [{ scale: avatarScale }] }]}>
                    <View style={styles.avatarGlowContainer}>
                        <Image source={{ uri: currentUser.avatar }} style={styles.profileAvatar} />
                        <View style={styles.avatarGlassBorder} />
                    </View>
                    <Text style={styles.userName}>{currentUser.name}</Text>
                    <Text style={styles.userHandle}>@{currentUser.id || 'soul_sync'}</Text>
                </Animated.View>

                {/* Glassmorphism Menu Cards */}
                <View style={styles.menuContainer}>
                    <BlurView intensity={20} tint="dark" style={styles.glassCard}>
                        <MenuItem 
                            icon="person-outline" 
                            title="Profile Status" 
                            subtitle="Always connected"
                            onPress={() => {}} 
                        />
                        <MenuItem 
                            icon="images-outline" 
                            title="Shared Photos" 
                            subtitle="128 high quality captures"
                            onPress={() => {}} 
                        />
                        <MenuItem 
                            icon="settings-outline" 
                            title="Account Settings" 
                            subtitle="Privacy, Security, Presence"
                            onPress={() => router.push('/settings' as any)} 
                        />
                        <MenuItem 
                            icon="log-out-outline" 
                            title="Log Out" 
                            danger 
                            isLast
                            onPress={handleLogout} 
                        />
                    </BlurView>
                </View>

                <Text style={styles.footerNote}>
                    Your profile is synced with the SoulSync network.
                </Text>
            </Animated.ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#09090E',
    },
    orb: {
        position: 'absolute',
        width: 300,
        height: 300,
        borderRadius: 150,
        opacity: 0.6,
    },
    topBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 60,
        paddingHorizontal: 20,
        zIndex: 10,
    },
    backButton: {
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 22,
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    headerTitle: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: '800',
        letterSpacing: 1,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingTop: 20,
        paddingBottom: 100,
    },
    heroSection: {
        alignItems: 'center',
        paddingVertical: 40,
    },
    avatarGlowContainer: {
        position: 'relative',
        padding: 10,
    },
    profileAvatar: {
        width: 140,
        height: 140,
        borderRadius: 70,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    avatarGlassBorder: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: 80,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
        margin: -5,
    },
    userName: {
        color: '#ffffff',
        fontSize: 32,
        fontWeight: '900',
        marginTop: 20,
        letterSpacing: -0.5,
    },
    userHandle: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 16,
        fontWeight: '500',
        marginTop: 4,
    },
    menuContainer: {
        paddingHorizontal: 20,
        marginTop: 20,
    },
    glassCard: {
        borderRadius: 30,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        backgroundColor: 'rgba(255,255,255,0.02)',
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 20,
        paddingVertical: 22,
    },
    menuItemBorder: {
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    menuIconContainer: {
        width: 44,
        height: 44,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 16,
    },
    menuTextContainer: {
        flex: 1,
    },
    menuTitle: {
        color: '#ffffff',
        fontSize: 17,
        fontWeight: '600',
    },
    menuSubtitle: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 13,
        marginTop: 2,
    },
    footerNote: {
        color: 'rgba(255,255,255,0.2)',
        fontSize: 12,
        textAlign: 'center',
        marginTop: 40,
        lineHeight: 18,
    },
    errorText: {
        color: '#ef4444',
        fontSize: 16,
        textAlign: 'center',
        marginTop: 100,
    },
});
