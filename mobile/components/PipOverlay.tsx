import React, { useRef } from 'react';
import { View, Image, Pressable, Dimensions, Text, StyleSheet, Animated, PanResponder } from 'react-native';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { MaterialIcons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const OVERLAY_WIDTH = 110;
const OVERLAY_HEIGHT = 150;

export default function PipOverlay() {
    const router = useRouter();
    const { activeCall, contacts, toggleMinimizeCall, endCall } = useApp();
    const contact = contacts.find(c => c.id === activeCall?.contactId);

    const position = useRef(new Animated.ValueXY({
        x: SCREEN_WIDTH - OVERLAY_WIDTH - 20,
        y: 100
    })).current;

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderGrant: () => {
                position.setOffset({
                    x: (position.x as any)._value,
                    y: (position.y as any)._value,
                });
                position.setValue({ x: 0, y: 0 });
            },
            onPanResponderMove: Animated.event(
                [null, { dx: position.x, dy: position.y }],
                { useNativeDriver: false }
            ),
            onPanResponderRelease: () => {
                position.flattenOffset();

                let finalX = (position.x as any)._value;
                let finalY = (position.y as any)._value;

                if (finalX < 0) finalX = 10;
                if (finalX > SCREEN_WIDTH - OVERLAY_WIDTH) finalX = SCREEN_WIDTH - OVERLAY_WIDTH - 10;
                if (finalY < 50) finalY = 60;
                if (finalY > SCREEN_HEIGHT - OVERLAY_HEIGHT - 120) finalY = SCREEN_HEIGHT - OVERLAY_HEIGHT - 120;

                Animated.spring(position, {
                    toValue: { x: finalX, y: finalY },
                    useNativeDriver: false,
                    tension: 40,
                    friction: 8,
                }).start();
            },
        })
    ).current;

    const handlePress = () => {
        if (!activeCall || !contact) return;
        toggleMinimizeCall(false);
        router.push('/call');
    };

    const handleEndCall = () => {
        endCall();
    };

    if (!activeCall || !activeCall.isMinimized || !contact) return null;

    const isVideo = activeCall.type === 'video';

    return (
        <Animated.View
            style={[
                styles.container,
                { transform: position.getTranslateTransform() },
            ]}
            {...panResponder.panHandlers}
        >
            <Pressable onPress={handlePress} style={styles.pressable}>
                <BlurView intensity={80} tint="dark" style={styles.blur}>
                    {isVideo ? (
                        <Image
                            source={{ uri: contact.avatar }}
                            style={styles.videoImage}
                            resizeMode="cover"
                        />
                    ) : (
                        <View style={styles.audioContent}>
                            <View style={styles.avatarContainer}>
                                <Image source={{ uri: contact.avatar }} style={styles.avatar} />
                            </View>
                            <View style={styles.pulseContainer}>
                                <View style={styles.pulseDot} />
                                <View style={styles.pulseDot} />
                                <View style={styles.pulseDot} />
                            </View>
                        </View>
                    )}

                    <Pressable style={styles.endButton} onPress={handleEndCall}>
                        <MaterialIcons name="call-end" size={16} color="#ffffff" />
                    </Pressable>

                    <View style={styles.brandLabel}>
                        <Text style={styles.brandText}>SOULSYNC</Text>
                    </View>
                </BlurView>
            </Pressable>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        zIndex: 999,
        width: OVERLAY_WIDTH,
        height: OVERLAY_HEIGHT,
    },
    pressable: {
        width: '100%',
        height: '100%',
        borderRadius: 24,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 16,
        elevation: 10,
    },
    blur: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.4)',
    },
    videoImage: {
        width: '100%',
        height: '100%',
        opacity: 0.8,
    },
    audioContent: {
        alignItems: 'center',
        gap: 12,
    },
    avatarContainer: {
        width: 56,
        height: 56,
        borderRadius: 28,
        borderWidth: 2,
        borderColor: 'rgba(244, 63, 94, 0.3)',
        padding: 2,
    },
    avatar: {
        width: '100%',
        height: '100%',
        borderRadius: 26,
    },
    pulseContainer: {
        flexDirection: 'row',
        gap: 6,
    },
    pulseDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#f43f5e',
    },
    endButton: {
        position: 'absolute',
        bottom: 30,
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#ef4444',
        alignItems: 'center',
        justifyContent: 'center',
    },
    brandLabel: {
        position: 'absolute',
        bottom: 8,
        width: '100%',
        alignItems: 'center',
    },
    brandText: {
        fontSize: 6,
        fontWeight: '900',
        letterSpacing: 2,
        color: 'rgba(255,255,255,0.25)',
        textTransform: 'uppercase',
    },
});
