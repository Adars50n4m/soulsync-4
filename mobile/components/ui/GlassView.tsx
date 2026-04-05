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

const FALLBACK_COLORS: Record<string, string> = {
    dark: 'rgba(20, 20, 30, 0.75)',
    light: 'rgba(255, 255, 255, 0.2)',
    default: 'rgba(30, 30, 40, 0.65)',
};

const TINT_OVERLAY: Record<string, string> = {
    dark: 'rgba(10, 10, 18, 0.3)',
    light: 'rgba(255, 255, 255, 0.06)',
    default: 'rgba(20, 20, 30, 0.2)',
};

/**
 * Catches Android BlurView crashes and falls back to solid color.
 * This prevents the black screen issue on some Android devices.
 */
class BlurErrorBoundary extends Component<
    { fallbackColor: string; children: React.ReactNode },
    { failed: boolean }
> {
    state = { failed: false };

    static getDerivedStateFromError() {
        return { failed: true };
    }

    componentDidCatch() {
        // Silent — just switch to fallback
    }

    render() {
        if (this.state.failed) {
            return (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: this.props.fallbackColor }]} />
            );
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
    // Android: slightly reduced intensity to prevent rendering issues
    const androidIntensity = Math.min(80, Math.round(intensity * 0.85));
    const fallbackColor = FALLBACK_COLORS[tint] || FALLBACK_COLORS.dark;

    return (
        <View style={[styles.container, style]} {...rest}>
            {/* iOS: native expo-blur — rock solid */}
            {!IS_ANDROID && (
                <BlurView
                    intensity={intensity}
                    tint={tint}
                    style={StyleSheet.absoluteFill}
                />
            )}

            {/* Android: real blur via dimezisBlurView, wrapped in error boundary */}
            {IS_ANDROID && (
                <BlurErrorBoundary fallbackColor={fallbackColor}>
                    <BlurView
                        intensity={androidIntensity}
                        tint={tint}
                        style={StyleSheet.absoluteFill}
                        experimentalBlurMethod="dimezisBlurView"
                        blurReductionFactor={2}
                    />
                    {/* Tint overlay for glass color depth */}
                    <View
                        style={[
                            StyleSheet.absoluteFill,
                            { backgroundColor: TINT_OVERLAY[tint] || TINT_OVERLAY.dark }
                        ]}
                    />
                </BlurErrorBoundary>
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
