import React from 'react';
import { View, StyleSheet, ViewProps, StyleProp, ViewStyle, Platform } from 'react-native';
import { BlurView } from 'expo-blur';

export interface GlassViewProps extends ViewProps {
    intensity?: number;
    tint?: 'light' | 'dark' | 'default';
    style?: StyleProp<ViewStyle>;
    children?: React.ReactNode;
}

const IS_ANDROID = Platform.OS === 'android';

export const GlassView = ({
    intensity = 45,
    tint = 'dark',
    style,
    children,
    ...rest
}: GlassViewProps) => {
    // Android: wrap in a View with a dark backing so the BlurView has
    // real pixels to blur. experimentalBlurMethod="dimezisBlurView" uses
    // a native Android blur renderer that actually blurs what's beneath.
    const androidIntensity = Math.min(Math.round(intensity * 1.5), 80);

    if (IS_ANDROID) {
        return (
            <View
                style={[styles.container, style]}
                {...rest}
            >
                <BlurView
                    intensity={androidIntensity}
                    tint={tint}
                    experimentalBlurMethod="dimezisBlurView"
                    style={StyleSheet.absoluteFill}
                />
                {children}
            </View>
        );
    }

    return (
        <BlurView
            intensity={intensity}
            tint={tint}
            style={[styles.container, style]}
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
