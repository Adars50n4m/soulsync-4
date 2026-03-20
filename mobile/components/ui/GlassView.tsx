import React from 'react';
import { View, StyleSheet, ViewProps, StyleProp, ViewStyle, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

export interface GlassViewProps extends ViewProps {
    intensity?: number;
    tint?: 'light' | 'dark' | 'default';
    style?: StyleProp<ViewStyle>;
    children?: React.ReactNode;
    experimentalBlurMethod?: 'none' | 'dimezisBlurView';
}

const IS_ANDROID = Platform.OS === 'android';

export const GlassView = ({
    intensity = 45,
    tint = 'dark',
    style,
    children,
    experimentalBlurMethod,
    ...rest
}: GlassViewProps) => {
    const isDark = tint === 'dark' || tint === 'default';
    
    // Safety Fallback Layer Styles
    // Enhanced "Frost" simulation for Android to replace unstable experimental blur.
    const baseColor = isDark ? 'rgba(30, 30, 40, 0.22)' : 'rgba(255, 255, 255, 0.22)';
    const gradColors = isDark 
        ? ['rgba(45, 45, 60, 0.15)', 'rgba(25, 25, 35, 0.2)', 'rgba(15, 15, 20, 0.1)'] 
        : ['rgba(255, 255, 255, 0.25)', 'rgba(240, 240, 250, 0.15)', 'rgba(230, 230, 240, 0.05)'];

    // Extract borderRadius for Android safety layers if provided in style
    const flattenedStyle = StyleSheet.flatten(style) || {};
    const br = flattenedStyle.borderRadius || 0;

    return (
        <View style={[styles.container, style]}>
            {IS_ANDROID && (
                <>
                    {/* Level 1: Frosted Foundation */}
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: baseColor, borderRadius: br }]} />
                    
                    {/* Level 2: Refraction Gradient (Simulates light scattering) */}
                    <LinearGradient
                        colors={gradColors as any}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={[StyleSheet.absoluteFill, { borderRadius: br }]}
                    />

                    {/* Level 3: Edge highlight for "Glass" feel */}
                    <View style={[
                        StyleSheet.absoluteFill, 
                        { 
                            borderRadius: br, 
                            borderWidth: 1, 
                            borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.2)',
                            opacity: 0.8
                        }
                    ]} />
                </>
            )}
            
            {/* Level 4: Native Blur - Use dimezisBlurView on Android, native on iOS */}
            <BlurView
                intensity={intensity}
                tint={tint}
                style={[StyleSheet.absoluteFill, { borderRadius: br, backgroundColor: 'transparent' }]}
                experimentalBlurMethod={IS_ANDROID ? 'dimezisBlurView' : undefined}
                {...rest}
            />
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
