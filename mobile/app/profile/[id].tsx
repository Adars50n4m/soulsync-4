import React, { useState, useRef, useEffect } from 'react';
import {
    View, Text, Image, Pressable, StyleSheet, StatusBar,
    ScrollView, Animated, Dimensions
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { MaterialIcons } from '@expo/vector-icons';
import { useApp } from '../../context/AppContext';

const { width } = Dimensions.get('window');

export default function ProfileScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const { currentUser, otherUser, messages, activeTheme } = useApp();

    // Determine which user's profile to show
    const isOwnProfile = id === currentUser?.id;
    const profileUser = isOwnProfile ? currentUser : otherUser;

    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(30)).current;

    // Get shared media from messages
    const chatMessages = messages[otherUser?.id || ''] || [];
    const sharedMedia = chatMessages
        .filter(m => m.media?.type === 'image')
        .map(m => m.media?.url)
        .filter(Boolean);

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 400,
                useNativeDriver: true,
            }),
            Animated.spring(slideAnim, {
                toValue: 0,
                tension: 50,
                friction: 10,
                useNativeDriver: true,
            }),
        ]).start();
    }, []);

    if (!profileUser) {
        return (
            <View style={styles.container}>
                <Text style={styles.errorText}>Profile not found</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" />

            {/* Background Glow - Removed */}

            {/* Header */}
            <BlurView intensity={60} tint="dark" style={styles.header}>
                <Pressable onPress={() => router.back()} style={styles.backButton}>
                    <MaterialIcons name="arrow-back" size={24} color="#ffffff" />
                </Pressable>
                <Text style={styles.headerTitle}>PROFILE</Text>
                <View style={styles.headerSpacer} />
            </BlurView>

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                <Animated.View
                    style={[
                        styles.profileSection,
                        {
                            opacity: fadeAnim,
                            transform: [{ translateY: slideAnim }]
                        }
                    ]}
                >
                    {/* Avatar */}
                    <View style={styles.avatarContainer}>
                        <Image
                            source={{ uri: profileUser.avatar }}
                            style={styles.avatar}
                        />
                        <View style={styles.onlineIndicator} />
                    </View>

                    {/* Name & Bio */}
                    <Text style={styles.userName}>{profileUser.name}</Text>
                    <Text style={styles.userBio}>{profileUser.bio}</Text>

                    {/* Stats */}
                    <BlurView intensity={40} tint="dark" style={styles.statsCard}>
                        <View style={styles.statItem}>
                            <Text style={styles.statValue}>{chatMessages.length}</Text>
                            <Text style={styles.statLabel}>MESSAGES</Text>
                        </View>
                        <View style={styles.statDivider} />
                        <View style={styles.statItem}>
                            <Text style={styles.statValue}>{sharedMedia.length}</Text>
                            <Text style={styles.statLabel}>MEDIA</Text>
                        </View>
                        <View style={styles.statDivider} />
                        <View style={styles.statItem}>
                            <Text style={styles.statValue}>∞</Text>
                            <Text style={styles.statLabel}>BOND</Text>
                        </View>
                    </BlurView>

                    {/* Quick Actions */}
                    {!isOwnProfile && (
                        <View style={styles.actionsRow}>
                            <Pressable
                                style={({ pressed }) => [
                                    styles.actionButton,
                                    { backgroundColor: `${activeTheme.primary}1A`, borderColor: `${activeTheme.primary}33` },
                                    pressed && styles.actionButtonPressed
                                ]}
                                onPress={() => router.push(`/chat/${profileUser.id}`)}
                            >
                                <MaterialIcons name="chat-bubble" size={20} color={activeTheme.primary} />
                                <Text style={[styles.actionText, { color: activeTheme.primary }]}>MESSAGE</Text>
                            </Pressable>
                            <Pressable
                                style={({ pressed }) => [
                                    styles.actionButton,
                                    { backgroundColor: `${activeTheme.primary}1A`, borderColor: `${activeTheme.primary}33` },
                                    pressed && styles.actionButtonPressed
                                ]}
                            >
                                <MaterialIcons name="call" size={20} color={activeTheme.primary} />
                                <Text style={[styles.actionText, { color: activeTheme.primary }]}>CALL</Text>
                            </Pressable>
                            <Pressable
                                style={({ pressed }) => [
                                    styles.actionButton,
                                    { backgroundColor: `${activeTheme.primary}1A`, borderColor: `${activeTheme.primary}33` },
                                    pressed && styles.actionButtonPressed
                                ]}
                            >
                                <MaterialIcons name="videocam" size={20} color={activeTheme.primary} />
                                <Text style={[styles.actionText, { color: activeTheme.primary }]}>VIDEO</Text>
                            </Pressable>
                        </View>
                    )}
                </Animated.View>

                {/* Shared Media Section */}
                <Animated.View
                    style={[
                        styles.mediaSection,
                        {
                            opacity: fadeAnim,
                            transform: [{ translateY: slideAnim }]
                        }
                    ]}
                >
                    <Text style={styles.sectionTitle}>SHARED MEDIA</Text>

                    {sharedMedia.length > 0 ? (
                        <View style={styles.mediaGrid}>
                            {sharedMedia.slice(0, 9).map((url, index) => (
                                <Pressable key={index} style={styles.mediaItem}>
                                    <Image
                                        source={{ uri: url as string }}
                                        style={styles.mediaImage}
                                    />
                                </Pressable>
                            ))}
                        </View>
                    ) : (
                        <BlurView intensity={30} tint="dark" style={styles.emptyMedia}>
                            <MaterialIcons name="photo-library" size={32} color="rgba(255,255,255,0.2)" />
                            <Text style={styles.emptyText}>No shared media yet</Text>
                        </BlurView>
                    )}
                </Animated.View>

                {/* Connection Info */}
                <BlurView intensity={30} tint="dark" style={styles.infoCard}>
                    <View style={styles.infoRow}>
                        <MaterialIcons name="access-time" size={18} color="rgba(255,255,255,0.4)" />
                        <Text style={styles.infoText}>Connected since the beginning</Text>
                    </View>
                    <View style={styles.infoRow}>
                        <MaterialIcons name="favorite" size={18} color={activeTheme.primary} />
                        <Text style={styles.infoText}>Synced forever</Text>
                    </View>
                </BlurView>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#09090b',
    },
    bgGlow: {
        // Removed - no pink glow
        display: 'none',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 60,
        paddingHorizontal: 20,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    backButton: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    headerTitle: {
        color: '#ffffff',
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 4,
    },
    headerSpacer: {
        width: 40,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingBottom: 120,
    },
    profileSection: {
        alignItems: 'center',
        paddingTop: 32,
    },
    avatarContainer: {
        position: 'relative',
        marginBottom: 20,
    },
    avatar: {
        width: 120,
        height: 120,
        borderRadius: 60,
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.15)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
    },
    onlineIndicator: {
        position: 'absolute',
        bottom: 6,
        right: 6,
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: '#10b981',
        borderWidth: 3,
        borderColor: '#09090b',
    },
    userName: {
        color: '#ffffff',
        fontSize: 28,
        fontWeight: '900',
        letterSpacing: 4,
        marginBottom: 8,
    },
    userBio: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 14,
        fontWeight: '500',
        marginBottom: 24,
    },
    statsCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
        width: '100%',
        borderRadius: 24,
        paddingVertical: 20,
        paddingHorizontal: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        overflow: 'hidden',
        marginBottom: 24,
    },
    statItem: {
        alignItems: 'center',
        flex: 1,
    },
    statValue: {
        color: '#ffffff',
        fontSize: 24,
        fontWeight: '800',
    },
    statLabel: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 9,
        fontWeight: '700',
        letterSpacing: 2,
        marginTop: 4,
    },
    statDivider: {
        width: 1,
        height: 32,
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    actionsRow: {
        flexDirection: 'row',
        gap: 12,
    },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 12,
        paddingHorizontal: 20,
        backgroundColor: 'rgba(244, 63, 94, 0.1)',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(244, 63, 94, 0.2)',
    },
    actionButtonPressed: {
        transform: [{ scale: 0.95 }],
        opacity: 0.8,
    },
    actionText: {
        color: '#f43f5e',
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 1,
    },
    mediaSection: {
        marginTop: 40,
    },
    sectionTitle: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 3,
        marginBottom: 16,
    },
    mediaGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 4,
    },
    mediaItem: {
        width: (width - 48) / 3,
        height: (width - 48) / 3,
        borderRadius: 12,
        overflow: 'hidden',
    },
    mediaImage: {
        width: '100%',
        height: '100%',
    },
    emptyMedia: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 40,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
        overflow: 'hidden',
    },
    emptyText: {
        color: 'rgba(255,255,255,0.3)',
        fontSize: 12,
        fontWeight: '500',
        marginTop: 12,
    },
    infoCard: {
        marginTop: 32,
        borderRadius: 20,
        padding: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
        overflow: 'hidden',
        gap: 16,
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    infoText: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 13,
        fontWeight: '500',
    },
    errorText: {
        color: '#ef4444',
        fontSize: 16,
        textAlign: 'center',
        marginTop: 100,
    },
});
