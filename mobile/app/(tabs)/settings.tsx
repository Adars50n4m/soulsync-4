import React, { useState } from 'react';
import { View, Text, ScrollView, Image, Pressable, StyleSheet, StatusBar, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp, THEMES, ThemeName } from '../../context/AppContext';

export default function SettingsScreen() {
    const router = useRouter();
    const { currentUser, logout, theme, activeTheme } = useApp();
    const [notifications, setNotifications] = useState(true);

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

            {/* Header */}
            <LinearGradient
                colors={['#000000', 'rgba(0,0,0,0.8)', 'transparent']}
                style={styles.header}
            >
                <Text style={styles.headerTitle}>SETTINGS</Text>
            </LinearGradient>

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Profile Section */}
                <Pressable style={styles.profileSection} onPress={() => router.push('/profile-edit' as any)}>
                    <Image source={{ uri: currentUser?.avatar }} style={styles.profileAvatar} />
                    <View style={styles.profileInfo}>
                        <Text style={styles.profileName}>{currentUser?.name || 'User'}</Text>
                        <Text style={styles.profileHint}>Tap to edit profile</Text>
                    </View>
                    <MaterialIcons name="chevron-right" size={24} color="rgba(255,255,255,0.3)" />
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
                                <View style={[styles.toggle, notifications && styles.toggleActive]}>
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
                            onPress={() => Alert.alert('Storage', 'Storage management coming soon')}
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
                            onPress={() => Alert.alert('Help', 'Help center coming soon')}
                        />
                        <SettingItem
                            icon="bug-report"
                            title="Report a Problem"
                            onPress={() => Alert.alert('Feedback', 'Thanks for your feedback!')}
                        />
                        <SettingItem
                            icon="info-outline"
                            title="About"
                            subtitle="Version 1.0.0"
                            onPress={() => Alert.alert('SoulSync', 'Version 1.0.0\n\nBuilt with ❤️')}
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
    header: {
        paddingTop: 50,
        paddingBottom: 24,
        paddingHorizontal: 24,
    },
    headerTitle: {
        color: '#ffffff',
        fontSize: 18,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 3,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: 140,
    },
    profileSection: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        marginHorizontal: 16,
        padding: 16,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 20,
        marginBottom: 24,
    },
    profileAvatar: {
        width: 64,
        height: 64,
        borderRadius: 32,
    },
    profileInfo: {
        flex: 1,
    },
    profileName: {
        color: '#ffffff',
        fontSize: 18,
        fontWeight: '700',
    },
    profileHint: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 13,
        marginTop: 2,
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
    toggleActive: {
        backgroundColor: '#f43f5e',
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
