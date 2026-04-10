import React, { Component } from 'react';
import { View, StyleSheet, ViewProps, StyleProp, ViewStyle, Platform } from 'react-native';
import { BlurView } from 'expo-blur';

export interface GlassViewProps extends ViewProps {
    intensity?: number;
    tint?: 'light' | 'dark' | 'default';
    style?: StyleProp<ViewStyle>;
    children?: React.ReactNode;
    experimentalBlurMethod?: 'none' | 'dimezisBlurView';
    disableExperimental?: boolean;
}

const IS_ANDROID = Platform.OS === 'android';

// Tint applied as a separate View layer (NOT through expo-blur's tint prop)
// This avoids the glow/additive blending artifact on Android
// Premium solid backgrounds for Android (instead of blur)
const ANDROID_SOLID_BG: Record<string, string> = {
    dark: '#0A0A0A',
    light: '#2A2A2A',
    default: '#121212',
};


// Fallback if blur crashes (iOS)
const FALLBACK_BG: Record<string, string> = {
    dark: 'rgba(18, 18, 26, 0.72)',
    light: 'rgba(255, 255, 255, 0.18)',
    default: 'rgba(25, 25, 35, 0.65)',
};

// Global kill switch — one crash disables blur for ALL instances (iOS)
let blurDisabled = false;

class BlurGuard extends Component<
    { fallback: string; children: React.ReactNode },
    { crashed: boolean }
> {
    state = { crashed: false };
    static getDerivedStateFromError() {
        blurDisabled = true;
        return { crashed: true };
    }
    componentDidCatch() {}
    render() {
        if (this.state.crashed) {
            return <View style={[StyleSheet.absoluteFill, { backgroundColor: this.props.fallback }]} />;
        }
        return this.props.children;
    }
}

export const GlassView = ({
    intensity = 45,
    tint = 'dark',
    style,
    children,
    ...rest
}: GlassViewProps) => {
    const androidBg = ANDROID_SOLID_BG[tint] || ANDROID_SOLID_BG.dark;
    const fallbackBg = FALLBACK_BG[tint] || FALLBACK_BG.dark;

    return (
        <View style={[styles.container, style]} {...rest}>
            {/* iOS: native blur — works perfectly */}
            {!IS_ANDROID && !blurDisabled && (
                <BlurGuard fallback={fallbackBg}>
                    <BlurView
                        intensity={intensity}
                        tint={tint}
                        style={StyleSheet.absoluteFill}
                    />
                </BlurGuard>
            )}

            {/* iOS Fallback */}
            {!IS_ANDROID && blurDisabled && (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: fallbackBg }]} />
            )}

            {/* Android: Premium Solid Background — ZERO performance cost */}
            {IS_ANDROID && (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: androidBg }]} />
            )}

            {children}
        </View>
    );
};


const styles = StyleSheet.create({
    container: {
        overflow: 'hidden',
    },
});

export default GlassView;
