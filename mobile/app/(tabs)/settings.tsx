import React, { useState } from 'react';
import { View, Text, ScrollView, Image, Pressable, StyleSheet, StatusBar, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useApp, THEMES, ThemeName } from '../../context/AppContext';
import { BlurView } from 'expo-blur';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';

const ProgressiveBlur = ({ position = 'bottom', height = 180, intensity = 100, steps = 20 }: { position?: 'top' | 'bottom', height?: number, intensity?: number, steps?: number }) => {
    return (
        <View style={{
            position: 'absolute',
            [position]: 0,
            left: 0,
            right: 0,
            height,
            zIndex: position === 'top' ? 90 : 50,
            overflow: 'hidden',
        }} pointerEvents="none">
            {Array.from({ length: steps }).map((_, i) => {
                // Use a parabolic ratio for a more natural cinematic falloff
                // The blur will be more dense at the bottom and fade out smoothly as it goes up
                const ratio = (i + 1) / steps;
                const layerHeight = height * ratio;
                
                return (
                    <BlurView
                        key={i}
                        intensity={intensity / steps} // Cumulative intensity distribution
                        tint="dark"
                        style={{
                            position: 'absolute',
                            [position]: 0,
                            left: 0,
                            right: 0,
                            height: layerHeight,
                            // Subtly reduce opacity of higher layers to ensure the clear-to-blur transition is invisible
                            opacity: 1 - (i / (steps * 1.3)),
                        }}
                    />
                );
            })}
        </View>
    );
};
export default function SettingsScreen() {
    const router = useRouter();
    const { currentUser, logout, theme, activeTheme } = useApp();
    const [notifications, setNotifications] = useState(true);

    const handleLogout = () => {
        Alert.alert(
            'Logout',
            'Are you sure you want to logout?',
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

    const handleReportProblem = async () => {
        const url = 'mailto:work.adarshthakur@gmail.com?subject=SoulSync%20-%20Problem%20Report';
        try {
            await Linking.openURL(url);
        } catch (error) {
            Alert.alert(
                'Unable to open mail',
                'Please contact us directly at:\n\nwork.adarshthakur@gmail.com',
                [{ text: 'OK' }]
            );
        }
    };

    const handleClearCache = () => {
        Alert.alert(
            'Clear Cache',
            'This will clear cached data. Your messages and contacts will be preserved.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Clear',
                    onPress: () => {
                        Alert.alert('Success', 'Cache cleared successfully');
                    }
                }
            ]
        );
    };

    const SettingItem = ({ icon, title, subtitle, onPress, rightElement, danger }: any) => (
        <Pressable style={styles.settingItem} onPress={onPress}>
            <View style={[styles.settingIcon, { backgroundColor: danger ? 'rgba(239,68,68,0.1)' : `${activeTheme.primary}20` }]}>
                <MaterialIcons name={icon} size={22} color={danger ? '#ef4444' : activeTheme.primary} />
            </View>
            <View style={styles.settingInfo}>
                <Text style={[styles.settingTitle, danger && { color: '#ef4444' }]}>{title}</Text>
                {subtitle && <Text style={styles.settingSubtitle}>{subtitle}</Text>}
            </View>
            {rightElement || <MaterialIcons name="chevron-right" size={24} color="rgba(255,255,255,0.3)" />}
        </Pressable>
    );

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" />


            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Cinematic Profile Card */}
                <Pressable 
                    style={styles.profileCard} 
                    onPress={() => router.push('/profile-edit' as any)}
                >
                    <Image 
                        source={{ uri: currentUser?.avatar }} 
                        style={styles.profileCardImage} 
                    />
                    
                    <ProgressiveBlur position="bottom" height={310} intensity={180} steps={25} />
                    
                    <View style={styles.profileCardOverlay}>
                        <View style={styles.profileHeaderRow}>
                            <Text style={styles.profileCardName}>{currentUser?.name || 'User'}</Text>
                            <MaterialIcons name="verified" size={20} color="#fff" style={styles.verifiedBadge} />
                        </View>
                        
                        <Text style={styles.profileCardBio} numberOfLines={2}>
                            {currentUser?.bio || 'No bio yet. Tap to add one.'}
                        </Text>

                        <View style={styles.profileFooterRow}>
                            <View style={styles.profileStats}>
                                <View style={styles.statItem}>
                                    <MaterialIcons name="cake" size={16} color="rgba(255,255,255,0.7)" />
                                    <Text style={styles.statValue}>{currentUser?.birthdate || 'Not set'}</Text>
                                </View>
                            </View>

                            <Pressable 
                                style={styles.editButton}
                                onPress={() => router.push('/profile-edit' as any)}
                            >
                                <Text style={styles.editButtonText}>Edit Profile</Text>
                                <Ionicons name="pencil" size={14} color="#000" />
                            </Pressable>
                        </View>
                    </View>
                </Pressable>

                {/* Theme Section - Navigates to Theme Screen */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>APPEARANCE</Text>
                    <View style={styles.settingsGroup}>
                        <Pressable style={styles.settingItem} onPress={() => router.push('/theme')}>
                            <View style={[styles.settingIcon, { backgroundColor: `${activeTheme.primary}20` }]}>
                                <MaterialIcons name="palette" size={22} color={activeTheme.primary} />
                            </View>
                            <View style={styles.settingInfo}>
                                <Text style={styles.settingTitle}>Theme</Text>
                                <Text style={styles.settingSubtitle}>{theme.replace('-', ' ')}</Text>
                            </View>
                            <View style={styles.themePreviewMini}>
                                <View style={[styles.themeSwatchMini, { backgroundColor: activeTheme.primary }]} />
                                <View style={[styles.themeSwatchMini, { backgroundColor: activeTheme.accent }]} />
                            </View>
                            <MaterialIcons name="chevron-right" size={24} color="rgba(255,255,255,0.3)" />
                        </Pressable>
                    </View>
                </View>

                {/* Account Section */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>ACCOUNT</Text>
                    <View style={styles.settingsGroup}>
                        <SettingItem
                            icon="key"
                            title="Privacy"
                            subtitle="Last seen, profile photo, status"
                            onPress={() => Alert.alert('Privacy', 'Privacy settings coming soon')}
                        />
                        <SettingItem
                            icon="security"
                            title="Security"
                            subtitle="Two-step verification, fingerprint"
                            onPress={() => Alert.alert('Security', 'Security settings coming soon')}
                        />
                        <SettingItem
                            icon="notifications"
                            title="Notifications"
                            subtitle={notifications ? 'Enabled' : 'Disabled'}
                            onPress={() => setNotifications(!notifications)}
                            rightElement={
                                <View style={[styles.toggle, notifications && { backgroundColor: activeTheme.primary }]}>
                                    <View style={[styles.toggleKnob, notifications && styles.toggleKnobActive]} />
                                </View>
                            }
                        />
                    </View>
                </View>

                {/* Storage Section */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>STORAGE & DATA</Text>
                    <View style={styles.settingsGroup}>
                        <SettingItem
                            icon="data-usage"
                            title="Storage Usage"
                            subtitle="Manage storage and media"
                            onPress={() => router.push('/storage-management' as any)}
                        />
                        <SettingItem
                            icon="cleaning-services"
                            title="Clear Cache"
                            subtitle="Free up space"
                            onPress={handleClearCache}
                        />
                    </View>
                </View>

                {/* Help Section */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>HELP & SUPPORT</Text>
                    <View style={styles.settingsGroup}>
                        <SettingItem
                            icon="help-outline"
                            title="Help Center"
                            onPress={() => router.push('/help-center' as any)}
                        />
                        <SettingItem
                            icon="bug-report"
                            title="Report a Problem"
                            onPress={handleReportProblem}
                        />
                        <SettingItem
                            icon="info-outline"
                            title="About"
                            subtitle="Version 1.0.0"
                            onPress={() => router.push('/about' as any)}
                        />
                    </View>
                </View>

                {/* Logout Section */}
                <View style={styles.section}>
                    <View style={styles.settingsGroup}>
                        <SettingItem
                            icon="logout"
                            title="Logout"
                            danger
                            onPress={handleLogout}
                            rightElement={null}
                        />
                    </View>
                </View>

                {/* App Info */}
                <View style={styles.appInfo}>
                    <Text style={styles.appName}>SoulSync</Text>
                    <Text style={styles.appVersion}>Made with ❤️</Text>
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000000',
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingTop: 60,
        paddingBottom: 140,
    },
    profileCard: {
        height: 480,
        marginHorizontal: 16,
        borderRadius: 32,
        overflow: 'hidden',
        marginBottom: 32,
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    profileCardImage: {
        width: '100%',
        height: '100%',
        resizeMode: 'cover',
    },
    profileCardOverlay: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: 24,
        paddingBottom: 28,
        zIndex: 100, // Ensure content is above blur
    },
    profileHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
    },
    profileCardName: {
        color: '#ffffff',
        fontSize: 28,
        fontWeight: '700',
        letterSpacing: -0.5,
    },
    verifiedBadge: {
        marginTop: 4,
    },
    profileCardBio: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 15,
        lineHeight: 22,
        marginBottom: 24,
        maxWidth: '90%',
    },
    profileFooterRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    profileStats: {
        flexDirection: 'row',
        gap: 20,
    },
    statItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    statValue: {
        color: '#ffffff',
        fontSize: 15,
        fontWeight: '600',
    },
    editButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: '#ffffff',
        paddingHorizontal: 18,
        paddingVertical: 12,
        borderRadius: 24,
    },
    editButtonText: {
        color: '#000000',
        fontSize: 15,
        fontWeight: '700',
    },
    section: {
        marginBottom: 24,
    },
    sectionTitle: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 11,
        fontWeight: '900',
        letterSpacing: 2,
        paddingHorizontal: 24,
        marginBottom: 12,
    },
    settingsGroup: {
        marginHorizontal: 16,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 16,
        overflow: 'hidden',
    },
    settingItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    settingIcon: {
        width: 40,
        height: 40,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    settingInfo: {
        flex: 1,
    },
    settingTitle: {
        color: '#ffffff',
        fontSize: 15,
        fontWeight: '600',
    },
    settingSubtitle: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 12,
        marginTop: 2,
    },
    themePreviewMini: {
        flexDirection: 'row',
        gap: 4,
        marginRight: 8,
    },
    themeSwatchMini: {
        width: 16,
        height: 16,
        borderRadius: 8,
    },
    toggle: {
        width: 48,
        height: 28,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.2)',
        padding: 2,
    },

    toggleKnob: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#ffffff',
    },
    toggleKnobActive: {
        marginLeft: 20,
    },
    appInfo: {
        alignItems: 'center',
        paddingVertical: 32,
    },
    appName: {
        color: 'rgba(255,255,255,0.3)',
        fontSize: 14,
        fontWeight: '700',
    },
    appVersion: {
        color: 'rgba(255,255,255,0.2)',
        fontSize: 12,
        marginTop: 4,
    },
});
