import React from 'react';
import { View, Text, Pressable, StyleSheet, StatusBar, ScrollView } from 'react-native';
import { useNavigation } from 'expo-router';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { useApp, THEMES, ThemeName } from '../context/AppContext';

export default function ThemeScreen() {
    const navigation = useNavigation();
    const { theme, setTheme, activeTheme } = useApp();

    const handleSelectTheme = (themeName: ThemeName) => {
        setTheme(themeName);
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" />

            {/* Header */}
            <View style={styles.header}>
                <Pressable 
                    onPress={() => {
                        if (navigation.canGoBack()) navigation.goBack();
                    }} 
                    style={styles.backButton}
                >
                    <MaterialIcons name="arrow-back" size={24} color="#ffffff" />
                </Pressable>
                <Text style={styles.headerTitle}>THEME</Text>
                <View style={styles.placeholder} />
            </View>

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                <Text style={styles.sectionTitle}>CHOOSE YOUR VIBE</Text>

                <View style={styles.themeGrid}>
                    {(Object.keys(THEMES ?? {}) as ThemeName[]).map((themeName) => {
                        const themeConfig = THEMES[themeName];
                        const isSelected = theme === themeName;

                        return (
                            <Pressable
                                key={themeName}
                                style={[
                                    styles.themeCard,
                                    isSelected && { borderColor: themeConfig.primary }
                                ]}
                                onPress={() => handleSelectTheme(themeName)}
                            >
                                {/* Theme Preview — faithful miniature of the real
                                    chat screen so the picked vibe shows exactly
                                    how everything will look: header row with
                                    "Soul" + menu, status card, filter chips,
                                    chat-list pills, and the glass navbar. */}
                                <View style={[styles.themePreview, { backgroundColor: themeConfig.background }]}>
                                    {/* Header: Soul title + 3-dot menu */}
                                    <View style={styles.miniHeaderRow}>
                                        <Text style={styles.miniAppTitle}>Soul</Text>
                                        <MaterialIcons name="more-vert" size={10} color="rgba(255,255,255,0.5)" />
                                    </View>

                                    {/* My Status card row */}
                                    <View style={styles.miniStatusRow}>
                                        <View style={[styles.miniStatusCard, { backgroundColor: themeConfig.surface }]}>
                                            <View style={[styles.miniStatusAvatar, { backgroundColor: `${themeConfig.primary}55` }]} />
                                            <View style={[styles.miniStatusBadge, { backgroundColor: themeConfig.primary }]} />
                                        </View>
                                    </View>

                                    {/* Filter chip row — All (active) / Unread / Fav */}
                                    <View style={styles.miniChipRow}>
                                        <View style={[styles.miniChipActive, { backgroundColor: `${themeConfig.primary}33`, borderColor: themeConfig.primary }]}>
                                            <View style={[styles.miniChipText, { backgroundColor: themeConfig.primary }]} />
                                        </View>
                                        <View style={[styles.miniChip, { borderColor: 'rgba(255,255,255,0.18)' }]}>
                                            <View style={styles.miniChipDimText} />
                                        </View>
                                        <View style={[styles.miniChip, { borderColor: 'rgba(255,255,255,0.18)' }]}>
                                            <View style={styles.miniChipDimText} />
                                        </View>
                                    </View>

                                    {/* Chat list pills */}
                                    <View style={styles.miniChatRow}>
                                        <View style={[styles.miniAvatarPill, { backgroundColor: themeConfig.surface }]} />
                                        <View style={[styles.miniContentPill, { backgroundColor: themeConfig.surface }]}>
                                            <View style={styles.miniNameLine} />
                                            <View style={[styles.miniMsgLine, { backgroundColor: themeConfig.primary }]} />
                                        </View>
                                    </View>
                                    <View style={styles.miniChatRow}>
                                        <View style={[styles.miniAvatarPill, { backgroundColor: themeConfig.surface }]} />
                                        <View style={[styles.miniContentPill, { backgroundColor: themeConfig.surface }]}>
                                            <View style={styles.miniNameLine} />
                                            <View style={styles.miniMsgLine} />
                                        </View>
                                    </View>

                                    {/* Bottom navbar: glass pill (chat/phone/settings)
                                        with chat as the active tab in primary, plus
                                        a separate circular search FAB on the right. */}
                                    <View style={styles.miniNavRow}>
                                        <View style={[styles.miniNavBar, { backgroundColor: themeConfig.surface }]}>
                                            <View style={[styles.miniNavTab, { backgroundColor: `${themeConfig.primary}40` }]}>
                                                <Ionicons name="chatbubble-ellipses" size={7} color={themeConfig.primary} />
                                            </View>
                                            <Ionicons name="call" size={8} color="rgba(255,255,255,0.55)" />
                                            <Ionicons name="settings-sharp" size={8} color="rgba(255,255,255,0.55)" />
                                        </View>
                                        <View style={[styles.miniSearchFab, { backgroundColor: themeConfig.surface }]}>
                                            <Ionicons name="search" size={8} color="rgba(255,255,255,0.7)" />
                                        </View>
                                    </View>
                                </View>

                                {/* Theme Name */}
                                <View style={styles.themeInfo}>
                                    <Text style={[
                                        styles.themeName,
                                        isSelected && { color: themeConfig.primary }
                                    ]}>
                                        {themeName.replace('-', ' ').toUpperCase()}
                                    </Text>
                                    {isSelected && (
                                        <MaterialIcons name="check-circle" size={20} color={themeConfig.primary} />
                                    )}
                                </View>

                                {/* Color Swatches */}
                                <View style={styles.swatches}>
                                    <View style={[styles.swatch, { backgroundColor: themeConfig.primary }]} />
                                    <View style={[styles.swatch, { backgroundColor: themeConfig.accent }]} />
                                    <View style={[styles.swatch, { backgroundColor: themeConfig.background, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }]} />
                                </View>
                            </Pressable>
                        );
                    })}
                </View>

                {/* Apply Button */}
                <Pressable
                    style={[styles.applyButton, { backgroundColor: activeTheme.primary }]}
                    onPress={() => {
                        if (navigation.canGoBack()) navigation.goBack();
                    }}
                >
                    <Text style={styles.applyButtonText}>APPLY THEME</Text>
                </Pressable>
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
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 50,
        paddingBottom: 16,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    backButton: {
        padding: 8,
    },
    headerTitle: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: '900',
        letterSpacing: 2,
    },
    placeholder: {
        width: 40,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 20,
        paddingBottom: 40,
    },
    sectionTitle: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 11,
        fontWeight: '900',
        letterSpacing: 2,
        marginBottom: 20,
    },
    themeGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    themeCard: {
        // 47.5% × 2 + 12px gap fits comfortably inside 100% on every phone
        // size; the previous `width: 47%` + `margin: 8` total of `94% + 32px`
        // overflowed and forced a single-column wrap.
        width: '48%',
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 16,
        padding: 12,
        borderWidth: 2,
        borderColor: 'transparent',
    },
    themePreview: {
        height: 195,
        borderRadius: 10,
        padding: 8,
        marginBottom: 12,
        gap: 5,
    },
    miniHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    miniAppTitle: {
        color: '#fff',
        fontSize: 9,
        fontWeight: '900',
        letterSpacing: 0.4,
    },
    miniStatusRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    miniStatusCard: {
        width: 32,
        height: 36,
        borderRadius: 7,
        padding: 4,
        position: 'relative',
    },
    miniStatusAvatar: {
        width: 16,
        height: 16,
        borderRadius: 8,
        alignSelf: 'center',
        marginTop: 3,
    },
    miniStatusBadge: {
        position: 'absolute',
        bottom: 3,
        right: 3,
        width: 7,
        height: 7,
        borderRadius: 3.5,
    },
    miniChipRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    miniChipActive: {
        height: 11,
        paddingHorizontal: 5,
        borderRadius: 6,
        borderWidth: 0.5,
        alignItems: 'center',
        justifyContent: 'center',
    },
    miniChip: {
        height: 11,
        paddingHorizontal: 6,
        borderRadius: 6,
        borderWidth: 0.5,
        alignItems: 'center',
        justifyContent: 'center',
    },
    miniChipText: {
        height: 2,
        width: 12,
        borderRadius: 1,
    },
    miniChipDimText: {
        height: 2,
        width: 12,
        borderRadius: 1,
        backgroundColor: 'rgba(255,255,255,0.35)',
    },
    miniChatRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        height: 16,
    },
    miniAvatarPill: {
        width: 16,
        height: 16,
        borderRadius: 8,
    },
    miniContentPill: {
        flex: 1,
        height: 16,
        borderRadius: 8,
        paddingHorizontal: 5,
        justifyContent: 'center',
        gap: 2,
    },
    miniNameLine: {
        height: 2.5,
        width: '55%',
        borderRadius: 1.5,
        backgroundColor: 'rgba(255,255,255,0.7)',
    },
    miniMsgLine: {
        height: 2,
        width: '40%',
        borderRadius: 1,
        backgroundColor: 'rgba(255,255,255,0.3)',
    },
    miniNavRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginTop: 'auto',
    },
    miniNavBar: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
        height: 18,
        borderRadius: 9,
        paddingHorizontal: 4,
    },
    miniNavTab: {
        width: 18,
        height: 13,
        borderRadius: 6.5,
        alignItems: 'center',
        justifyContent: 'center',
    },
    miniSearchFab: {
        width: 18,
        height: 18,
        borderRadius: 9,
        alignItems: 'center',
        justifyContent: 'center',
    },
    themeInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    themeName: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 1,
    },
    swatches: {
        flexDirection: 'row',
        gap: 6,
    },
    swatch: {
        marginRight: 6,
        height: 20,
        borderRadius: 10,
    },
    applyButton: {
        marginTop: 32,
        paddingVertical: 16,
        borderRadius: 16,
        alignItems: 'center',
    },
    applyButtonText: {
        color: '#ffffff',
        fontSize: 14,
        fontWeight: '900',
        letterSpacing: 2,
    },
});
