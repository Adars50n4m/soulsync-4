import React from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import Animated, { useAnimatedStyle, interpolate, Extrapolation, SharedValue } from 'react-native-reanimated';
import ProgressiveBlur from './chat/ProgressiveBlur';

interface ProfileHeaderProps {
    image: string | any;
    name: string;
    subtitle?: string;
    username: string;
    onEditPress?: () => void;
    isVerified?: boolean;
    scrollY?: SharedValue<number>;
}

/**
 * ProfileHeader — Reusable component with iOS-style progressive blur.
 * Matches design specs: 320 height, 28 radius, misty glass blur.
 */
const ProfileHeader = ({
    image,
    name,
    subtitle,
    username,
    onEditPress,
    isVerified = true,
    scrollY,
}: ProfileHeaderProps) => {
    const animatedImageStyle = useAnimatedStyle(() => {
        if (!scrollY) return {};
        
        const translateY = interpolate(
            scrollY.value,
            [-320, 0, 320],
            [-100, 0, 100],
            Extrapolation.CLAMP
        );
        
        const scale = interpolate(
            scrollY.value,
            [-320, 0],
            [1.5, 1],
            Extrapolation.CLAMP
        );

        return {
            transform: [{ translateY }, { scale }] as any,
        };
    });

    return (
        <View style={styles.container}>
            <View style={styles.imageContainer}>
                <Animated.View style={[styles.imageWrapper, animatedImageStyle as any]}>
                    <Image
                        source={typeof image === 'string' ? { uri: image } : image}
                        style={styles.image}
                        contentFit="cover"
                        transition={200}
                    />
                </Animated.View>
                
                {/* iOS-style progressive blur — fades from clear (top) to blurred (bottom) */}
                <ProgressiveBlur
                    position="bottom"
                    height={260}
                    intensity={70}
                />

                {/* Content Overlay */}
                <View style={styles.contentOverlay}>
                    <View style={styles.mainInfo}>
                        <View style={styles.nameRow}>
                            <Text style={styles.name}>{name}</Text>
                            {isVerified && (
                                <MaterialIcons name="verified" size={20} color="#fff" style={styles.verifiedIcon} />
                            )}
                        </View>
                        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
                    </View>

                    <View style={styles.footerRow}>
                        <View style={styles.usernameRow}>
                            <Text style={styles.username}>{username.startsWith('@') ? username : `@${username}`}</Text>
                        </View>

                        <Pressable style={styles.editButton} onPress={onEditPress}>
                            <Text style={styles.editButtonText}>Edit Profile</Text>
                            <Ionicons name="pencil" size={14} color="#000" />
                        </Pressable>
                    </View>
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        height: 320,
        marginHorizontal: 16,
        marginBottom: 24,
    },
    imageContainer: {
        flex: 1,
        borderRadius: 28,
        overflow: 'hidden',
        backgroundColor: '#1a1a1a',
    },
    imageWrapper: {
        width: '100%',
        height: '140%', // Extra height for parallax movement
        position: 'absolute',
        top: -40, // Offset to account for extra height
    },
    image: {
        width: '100%',
        height: '100%',
    },
    contentOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'flex-end',
        padding: 20,
        paddingBottom: 4, // Moved even further down for ultra-low placement
        zIndex: 10,
    },
    mainInfo: {
        marginBottom: 1,
    },
    nameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    name: {
        color: '#ffffff',
        fontSize: 28,
        fontWeight: '700',
        letterSpacing: -0.5,
    },
    verifiedIcon: {
        marginTop: 4,
    },
    subtitle: {
        color: 'rgba(255,255,255,0.9)',
        fontSize: 15,
        fontWeight: '500',
        marginTop: 2,
    },
    footerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 12,
    },
    usernameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    username: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 14,
        fontWeight: '600',
    },
    editButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: '#ffffff',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 20,
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.1,
                shadowRadius: 4,
            },
            android: {
                elevation: 3,
            },
        }),
    },
    editButtonText: {
        color: '#000000',
        fontSize: 14,
        fontWeight: '700',
    },
});

export default ProfileHeader;
