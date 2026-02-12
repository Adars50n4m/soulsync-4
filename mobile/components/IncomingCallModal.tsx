import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, Image, Dimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withTiming,
    Easing,
    withSequence
} from 'react-native-reanimated';

const { width } = Dimensions.get('window');

interface IncomingCallModalProps {
    visible: boolean;
    callerName: string;
    callerAvatar?: string;
    callType: 'audio' | 'video';
    onAccept: () => void;
    onDecline: () => void;
}

export const IncomingCallModal = ({
    visible,
    callerName,
    callerAvatar,
    callType,
    onAccept,
    onDecline
}: IncomingCallModalProps) => {
    const [timeLeft, setTimeLeft] = useState(60);
    const rippleScale = useSharedValue(1);
    const rippleOpacity = useSharedValue(0.8);
    const avatarScale = useSharedValue(1);

    useEffect(() => {
        if (visible) {
            setTimeLeft(60);

            // Ripple effect
            rippleScale.value = withRepeat(
                withTiming(1.5, { duration: 1500, easing: Easing.out(Easing.ease) }),
                -1,
                false
            );
            rippleOpacity.value = withRepeat(
                withTiming(0, { duration: 1500, easing: Easing.out(Easing.ease) }),
                -1,
                false
            );

            // Heartbeat effect for avatar
            avatarScale.value = withRepeat(
                withSequence(
                    withTiming(1.05, { duration: 600 }),
                    withTiming(1, { duration: 600 })
                ),
                -1,
                true
            );

            const timer = setInterval(() => {
                setTimeLeft((prev) => {
                    if (prev <= 1) {
                        clearInterval(timer);
                        onDecline(); // Auto-decline on timeout
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);

            return () => clearInterval(timer);
        } else {
            rippleScale.value = 1;
            rippleOpacity.value = 0.8;
            avatarScale.value = 1;
        }
    }, [visible]);

    const rippleStyle = useAnimatedStyle(() => ({
        transform: [{ scale: rippleScale.value }],
        opacity: rippleOpacity.value,
    }));

    const avatarAnimatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: avatarScale.value }],
    }));

    if (!visible) return null;

    return (
        <Modal visible={visible} transparent animationType="fade">
            <View style={styles.container}>
                <BlurView intensity={90} tint="systemThinMaterialDark" style={styles.blurContainer}>
                    {/* Background Gradient or Image could go here */}
                    <Image
                        source={{ uri: callerAvatar || 'https://via.placeholder.com/150' }}
                        style={[StyleSheet.absoluteFillObject, { opacity: 0.3 }]}
                        blurRadius={50}
                    />

                    <View style={styles.content}>
                        {/* Caller Info */}
                        <View style={styles.callerInfo}>
                            <View style={styles.avatarWrapper}>
                                <Animated.View style={[styles.rippleRing, rippleStyle]} />
                                <Animated.View style={[styles.rippleRing, rippleStyle, { animationDelay: '500ms' }]} />
                                <Animated.View style={[styles.avatarContainer, avatarAnimatedStyle]}>
                                    <Image
                                        source={{ uri: callerAvatar || 'https://via.placeholder.com/150' }}
                                        style={styles.avatar}
                                    />
                                </Animated.View>
                            </View>

                            <Text style={styles.name}>{callerName}</Text>
                            <Text style={styles.status}>
                                {callType === 'video' ? 'Incoming Video Call...' : 'Incoming Voice Call...'}
                            </Text>
                        </View>

                        {/* Slide to Answer Hint or just buttons */}
                        <View style={styles.actionsContainer}>
                            <View style={styles.actionColumn}>
                                <Pressable
                                    style={[styles.actionButton, styles.declineButton]}
                                    onPress={onDecline}
                                >
                                    <MaterialIcons name="call-end" size={32} color="white" />
                                </Pressable>
                                <Text style={styles.actionText}>Decline</Text>
                            </View>

                            <View style={styles.actionColumn}>
                                <Pressable
                                    style={[styles.actionButton, styles.acceptButton]}
                                    onPress={onAccept}
                                >
                                    <MaterialIcons name={callType === 'video' ? "videocam" : "call"} size={32} color="white" />
                                </Pressable>
                                <Text style={styles.actionText}>Accept</Text>
                            </View>
                        </View>
                    </View>
                </BlurView>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    blurContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    content: {
        width: '100%',
        height: '100%',
        justifyContent: 'space-around',
        paddingVertical: 80,
        alignItems: 'center',
    },
    callerInfo: {
        alignItems: 'center',
        width: '100%',
    },
    avatarWrapper: {
        width: 160,
        height: 160,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 30,
    },
    avatarContainer: {
        width: 120,
        height: 120,
        borderRadius: 60,
        overflow: 'hidden',
        borderWidth: 4,
        borderColor: 'rgba(255,255,255,0.2)',
        shadowColor: 'black',
        shadowOpacity: 0.5,
        shadowRadius: 10,
        elevation: 10,
    },
    avatar: {
        width: '100%',
        height: '100%',
    },
    rippleRing: {
        position: 'absolute',
        width: 120,
        height: 120,
        borderRadius: 60,
        borderWidth: 2,
        borderColor: 'rgba(255,255,255, 0.3)',
        backgroundColor: 'rgba(255,255,255, 0.1)',
    },
    name: {
        color: '#ffffff',
        fontSize: 36,
        fontWeight: '200',
        marginBottom: 8,
        letterSpacing: 1,
        textShadowColor: 'rgba(0,0,0,0.5)',
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 4,
    },
    status: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 16,
        letterSpacing: 1.5,
        fontWeight: '500',
        textTransform: 'uppercase',
    },
    actionsContainer: {
        flexDirection: 'row',
        width: '80%',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
    },
    actionColumn: {
        alignItems: 'center',
        gap: 12,
    },
    actionButton: {
        width: 72,
        height: 72,
        borderRadius: 36,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
    },
    declineButton: {
        backgroundColor: '#ef4444',
    },
    acceptButton: {
        backgroundColor: '#22c55e',
    },
    actionText: {
        color: 'white',
        fontSize: 14,
        fontWeight: '600',
        letterSpacing: 0.5,
    }
});
