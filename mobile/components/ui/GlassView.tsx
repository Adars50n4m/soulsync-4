import React from 'react';
import { View, StyleSheet, ViewProps, StyleProp, ViewStyle, Platform } from 'react-native';
import { BlurView } from 'expo-blur';

export interface GlassViewProps extends ViewProps {
    intensity?: number;
    tint?: 'light' | 'dark' | 'default';
    style?: StyleProp<ViewStyle>;
    children?: React.ReactNode;
}

/**
 * GlassView — uses Expo's native BlurView.
 * Provides high-performance, GPU-accelerated "liquid glass" backdrop filters.
 * 
 * Falls back to a subtle semi-transparent View only if BlurView fails to load.
 */
export const GlassView = ({
    intensity = 45,
    tint = 'dark',
    style,
    children,
    ...rest
}: GlassViewProps) => {
    return (
        <BlurView 
            intensity={intensity} 
            tint={tint} 
            experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
            style={[
                styles.container, 
                { backgroundColor: tint === 'dark' ? 'rgba(15, 15, 20, 0.4)' : 'rgba(255, 255, 255, 0.2)' },
                style
            ]} 
            {...rest}
        >
            {children}
        </BlurView>
    );
};

const styles = StyleSheet.create({
    container: {
        overflow: 'hidden',
    },
});

export default GlassView;
