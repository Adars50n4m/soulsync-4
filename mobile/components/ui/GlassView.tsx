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
    // Android: Use a semi-transparent View instead of BlurView to prevent "Black Screen" issues.
    // The experimental blur method is unstable on many Android emulators and devices.
    if (IS_ANDROID) {
        return (
            <View
                style={[
                    styles.container, 
                    { backgroundColor: tint === 'dark' ? 'rgba(12, 12, 14, 0.88)' : 'rgba(255, 255, 255, 0.85)' },
                    style
                ]}
                {...rest}
            >
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
