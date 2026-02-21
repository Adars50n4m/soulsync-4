import React from 'react';
import {
    View, Text, StyleSheet, Pressable, StatusBar, 
    Image, Dimensions, ScrollView, Platform
} from 'react-native';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';

const { width } = Dimensions.get('window');

export default function AboutScreen() {
    const router = useRouter();
    const { activeTheme } = useApp();

    const AboutItem = ({ icon, title, onPress }: { icon: string, title: string, onPress?: () => void }) => (
        <Pressable style={styles.item} onPress={onPress}>
            <MaterialIcons name={icon as any} size={22} color="rgba(255,255,255,0.6)" />
            <Text style={styles.itemTitle}>{title}</Text>
            <MaterialIcons name="chevron-right" size={24} color="rgba(255,255,255,0.2)" />
        </Pressable>
    );

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" />
            
            {/* Header */}
            <View style={styles.header}>
                <Pressable onPress={() => router.back()} style={styles.headerButton}>
                    <MaterialIcons name="arrow-back" size={24} color="white" />
                </Pressable>
                <Text style={styles.headerTitle}>About</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                {/* Branding Section */}
                <View style={styles.brandingSection}>
                    <View style={[styles.logoGlow, { backgroundColor: activeTheme.primary + '30' }]} />
                    <View style={[styles.logoContainer, { borderColor: activeTheme.primary }]}>
                        <Ionicons name="infinite" size={50} color={activeTheme.primary} />
                    </View>
                    <Text style={styles.appName}>SoulSync</Text>
                    <Text style={styles.version}>Version 1.0.0 (Build 104)</Text>
                    <Text style={styles.tagline}>Sync your soul, cinematic style.</Text>
                </View>

                {/* Info Groups */}
                <View style={styles.groupContainer}>
                    <BlurView intensity={10} tint="dark" style={styles.glassGroup}>
                        <AboutItem icon="description" title="Terms of Service" />
                        <View style={styles.separator} />
                        <AboutItem icon="privacy-tip" title="Privacy Policy" />
                        <View style={styles.separator} />
                        <AboutItem icon="assignment" title="Licenses" />
                    </BlurView>
                </View>

                {/* Developer Credit */}
                <View style={styles.footer}>
                    <Text style={styles.footerText}>Designed & Developed with ❤️</Text>
                    <Text style={styles.developerName}>by Adarsh Thakur</Text>
                    <Text style={styles.copyright}>© 2026 SoulSync Labs. All rights reserved.</Text>
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: Platform.OS === 'ios' ? 60 : 40,
        paddingHorizontal: 16,
        paddingBottom: 16,
    },
    headerButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#fff',
    },
    scrollContent: {
        paddingBottom: 40,
    },
    brandingSection: {
        alignItems: 'center',
        marginTop: 40,
        marginBottom: 60,
    },
    logoGlow: {
        position: 'absolute',
        width: 120,
        height: 120,
        borderRadius: 60,
        top: -10,
        filter: 'blur(30px)',
    },
    logoContainer: {
        width: 100,
        height: 100,
        borderRadius: 50,
        borderWidth: 2,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    appName: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#fff',
        letterSpacing: 1,
    },
    version: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.4)',
        marginTop: 8,
    },
    tagline: {
        fontSize: 16,
        color: 'rgba(255,255,255,0.6)',
        marginTop: 16,
        fontStyle: 'italic',
    },
    groupContainer: {
        paddingHorizontal: 16,
        marginBottom: 40,
    },
    glassGroup: {
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 24,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    item: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 20,
    },
    itemTitle: {
        flex: 1,
        fontSize: 16,
        color: '#fff',
        marginLeft: 16,
    },
    separator: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.05)',
        marginLeft: 56,
    },
    footer: {
        alignItems: 'center',
        marginTop: 20,
    },
    footerText: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.3)',
    },
    developerName: {
        fontSize: 16,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.6)',
        marginTop: 4,
    },
    copyright: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.2)',
        marginTop: 20,
    }
});
