import React, { useRef } from 'react';
import { Animated, Pressable, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';
import { MaterialIcons } from '@expo/vector-icons';

interface SwiftUIButtonProps {
    title: string;
    icon?: keyof typeof MaterialIcons.glyphMap;
    onPress: () => void;
    type?: 'primary' | 'glass' | 'danger';
    style?: ViewStyle;
    textStyle?: TextStyle;
}

export const SwiftUIButton: React.FC<SwiftUIButtonProps> = ({
    title,
    icon,
    onPress,
    type = 'glass',
    style,
    textStyle
}) => {
    // Spring Animation Value
    const scaleAnim = useRef(new Animated.Value(1)).current;

    const handlePressIn = () => {
        // Light haptic feedback exactly like iOS
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        
        // Spring scale down
        Animated.spring(scaleAnim, {
            toValue: 0.94, // Apple typically scales down to 94-96%
            useNativeDriver: true,
            speed: 50,
            bounciness: 10,
        }).start();
    };

    const handlePressOut = () => {
        // Spring scale back to normal
        Animated.spring(scaleAnim, {
            toValue: 1,
            useNativeDriver: true,
            speed: 50,
            bounciness: 12,
        }).start();
    };

    const renderContent = () => (
        <>
            {icon && (
                <MaterialIcons 
                    name={icon} 
                    size={22} 
                    color={type === 'glass' ? '#fff' : type === 'primary' ? '#000' : '#fff'} 
                    style={styles.icon} 
                />
            )}
            <Text style={[
                styles.text, 
                type === 'primary' && styles.textPrimary,
                type === 'danger' && styles.textDanger,
                textStyle
            ]}>
                {title}
            </Text>
        </>
    );

    return (
        <Animated.View style={[{ transform: [{ scale: scaleAnim }] }, style]}>
            <Pressable
                onPress={onPress}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                style={styles.pressable}
            >
                {type === 'glass' ? (
                    <BlurView intensity={80} tint="dark" style={styles.glassContainer}>
                        {renderContent()}
                    </BlurView>
                ) : (
                    <Animated.View style={[
                        styles.solidContainer,
                        type === 'primary' ? styles.bgPrimary : styles.bgDanger
                    ]}>
                        {renderContent()}
                    </Animated.View>
                )}
            </Pressable>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    pressable: {
        borderRadius: 20, // High border radius for Squircle effect
        overflow: 'hidden',
        width: '100%',
    },
    glassContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        paddingHorizontal: 24,
        backgroundColor: 'rgba(255, 255, 255, 0.08)', // Subtle white wash overlay
    },
    solidContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        paddingHorizontal: 24,
    },
    bgPrimary: {
        backgroundColor: '#fff', // Apple uses high contrast White/Black for primary
    },
    bgDanger: {
        backgroundColor: '#FF3B30', // Exact iOS Red
    },
    icon: {
        marginRight: 8,
    },
    text: {
        fontSize: 17, // Standard iOS Button text size
        fontWeight: '600',
        letterSpacing: -0.4, // iOS tight tracking
        color: '#fff',
    },
    textPrimary: {
        color: '#000',
    },
    textDanger: {
        color: '#fff',
    },
});

export default SwiftUIButton;
