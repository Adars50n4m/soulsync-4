import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    View,
    Text,
    Image,
    Pressable,
    StyleSheet,
    Dimensions,
    TextInput,
    KeyboardAvoidingView,
    Platform,
    StatusBar,
    ActivityIndicator,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    withSpring,
    runOnJS,
    interpolate,
    Extrapolation,
    Easing,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Video, ResizeMode } from 'expo-av';
import { MORPH_EASING, MORPH_OUT_EASING } from '../constants/transitions';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface LayoutRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface EnhancedMediaViewerProps {
    visible: boolean;
    media: {
        url: string;
        type: 'image' | 'video' | 'audio' | 'status_reply';
        caption?: string;
    } | null;
    sourceLayout: LayoutRect | null;
    onClose: () => void;
    onSendComment?: (comment: string) => void;
    onDownload?: () => void;
    onReply?: () => void;
    onForward?: () => void;
    onReaction?: (emoji: string) => void;
}

export const EnhancedMediaViewer: React.FC<EnhancedMediaViewerProps> = ({
    visible,
    media,
    sourceLayout,
    onClose,
    onSendComment,
    onDownload,
    onReply,
    onForward,
    onReaction,
}) => {
    const [isFullyOpen, setIsFullyOpen] = useState(false);
    const [comment, setComment] = useState('');
    const [showMenu, setShowMenu] = useState(false);
    
    // Shared values for animation
    const animationProgress = useSharedValue(0);
    const translateY = useSharedValue(0);
    const scale = useSharedValue(1);
    const menuProgress = useSharedValue(0);

    const isClosing = useRef(false);

    useEffect(() => {
        if (visible && media && sourceLayout) {
            isClosing.current = false;
            translateY.value = 0;
            scale.value = 1;
            animationProgress.value = 0;
            
            animationProgress.value = withTiming(1, {
                duration: 450,
                easing: MORPH_EASING,
            }, (finished) => {
                if (finished) runOnJS(setIsFullyOpen)(true);
            });
            
            StatusBar.setBarStyle('light-content');
        } else if (!visible) {
            setIsFullyOpen(false);
            setComment('');
            setShowMenu(false);
        }
    }, [visible, media, sourceLayout]);

    const handleClose = useCallback(() => {
        if (isClosing.current) return;
        isClosing.current = true;
        setIsFullyOpen(false);
        setShowMenu(false);
        
        animationProgress.value = withTiming(0, {
            duration: 350,
            easing: MORPH_OUT_EASING,
        }, (finished) => {
            if (finished) runOnJS(onClose)();
        });
    }, [onClose]);

    // Swipe down gesture
    const panGesture = Gesture.Pan()
        .onUpdate((event) => {
            if (event.translationY > 0) {
                translateY.value = event.translationY;
                scale.value = interpolate(
                    event.translationY,
                    [0, 300],
                    [1, 0.8],
                    Extrapolation.CLAMP
                );
            }
        })
        .onEnd((event) => {
            if (event.translationY > 150 || event.velocityY > 1000) {
                runOnJS(handleClose)();
            } else {
                translateY.value = withSpring(0);
                scale.value = withSpring(1);
            }
        });

    // Long press for menu
    const longPressGesture = Gesture.LongPress()
        .onStart(() => {
            runOnJS(setShowMenu)(true);
            menuProgress.value = withSpring(1);
        });

    const animatedContainerStyle = useAnimatedStyle(() => {
        const p = animationProgress.value;
        const opacity = interpolate(p, [0, 0.2], [0, 1]);
        return {
            opacity,
        };
    });

    const animatedMediaStyle = useAnimatedStyle(() => {
        const p = animationProgress.value;
        if (!sourceLayout) return {};

        // Morph from source bubble to refined card layout
        const HORIZONTAL_MARGIN = 24;
        const targetWidth = SCREEN_WIDTH - (HORIZONTAL_MARGIN * 2);
        const aspectRatio = sourceLayout.height / sourceLayout.width;
        const targetHeight = targetWidth * aspectRatio;
        
        // Ensure it doesn't get too tall
        const maxHeight = SCREEN_HEIGHT * 0.7;
        const finalHeight = Math.min(targetHeight, maxHeight);
        const finalWidth = finalHeight / aspectRatio;
        
        const targetX = (SCREEN_WIDTH - finalWidth) / 2;
        const targetY = (SCREEN_HEIGHT - finalHeight) / 2;

        return {
            position: 'absolute',
            left: interpolate(p, [0, 1], [sourceLayout.x, targetX]),
            top: interpolate(p, [0, 1], [sourceLayout.y, targetY]) + translateY.value,
            width: interpolate(p, [0, 1], [sourceLayout.width, finalWidth]),
            height: interpolate(p, [0, 1], [sourceLayout.height, finalHeight]),
            borderRadius: interpolate(p, [0, 1], [16, 24]),
            transform: [{ scale: scale.value }],
            overflow: 'hidden',
        };
    });

    const animatedOverlayStyle = useAnimatedStyle(() => ({
        opacity: interpolate(animationProgress.value, [0.8, 1], [0, 1]),
        transform: [{ translateY: interpolate(animationProgress.value, [0.8, 1], [20, 0]) }]
    }));

    const menuStyle = useAnimatedStyle(() => ({
        opacity: menuProgress.value,
        transform: [{ scale: interpolate(menuProgress.value, [0, 1], [0.8, 1]) }]
    }));

    const handleReaction = (emoji: string) => {
        if (onReaction) runOnJS(onReaction)(emoji);
        menuProgress.value = withTiming(0, { duration: 150 }, () => runOnJS(setShowMenu)(false));
    };

    if (!visible || !media || !sourceLayout) return null;

    return (
        <View style={StyleSheet.absoluteFill} pointerEvents="auto">
            <Animated.View style={[StyleSheet.absoluteFill, animatedContainerStyle]}>
                <BlurView intensity={65} tint="dark" style={StyleSheet.absoluteFill} />
                <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
            </Animated.View>

            <GestureDetector gesture={Gesture.Exclusive(panGesture, longPressGesture)}>
                <Animated.View style={animatedMediaStyle}>
                    {media.type === 'video' ? (
                        <Video
                            source={{ uri: media.url }}
                            style={styles.fullMedia}
                            resizeMode={ResizeMode.CONTAIN}
                            shouldPlay
                            isLooping
                        />
                    ) : (
                        <Image source={{ uri: media.url }} style={styles.fullMedia} resizeMode="contain" />
                    )}
                </Animated.View>
            </GestureDetector>

            {/* Top Bar - Close Button */}
            <Animated.View style={[styles.topBar, animatedOverlayStyle]}>
                <Pressable onPress={handleClose} style={styles.iconButton}>
                    <MaterialIcons name="close" size={26} color="white" />
                </Pressable>
            </Animated.View>

            {/* Bottom Keyboard Area */}
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.bottomArea}
            >
                <Animated.View style={[styles.inputContainer, animatedOverlayStyle]}>
                    <BlurView intensity={40} tint="dark" style={styles.inputBlur}>
                        <TextInput
                            style={styles.input}
                            placeholder="Add a comment..."
                            placeholderTextColor="rgba(255,255,255,0.4)"
                            value={comment}
                            onChangeText={setComment}
                            multiline
                        />
                        <Pressable 
                            style={[styles.sendButton, !comment.trim() && { opacity: 0.5 }]}
                            onPress={() => onSendComment?.(comment)}
                        >
                            <MaterialIcons name="send" size={20} color="white" />
                        </Pressable>
                    </BlurView>
                </Animated.View>
            </KeyboardAvoidingView>

            {/* Long Press Menu Overlay */}
            {showMenu && (
                <View style={styles.menuOverlay}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => {
                        menuProgress.value = withTiming(0, { duration: 150 }, () => setShowMenu(false));
                    }} />
                    <Animated.View style={[styles.menuContainer, menuStyle]}>
                        <BlurView intensity={95} tint="dark" style={styles.menuBlur}>
                            <View style={styles.reactionRow}>
                                {['❤️', '🔥', '😂', '😮', '😢'].map(emoji => (
                                    <Pressable key={emoji} onPress={() => handleReaction(emoji)} style={styles.reactionItem}>
                                        <Text style={styles.reactionText}>{emoji}</Text>
                                    </Pressable>
                                ))}
                            </View>
                            <View style={styles.menuDivider} />
                            <Pressable style={styles.menuItem} onPress={() => {
                                onReply?.();
                                menuProgress.value = withTiming(0, { duration: 150 }, () => setShowMenu(false));
                            }}>
                                <MaterialIcons name="reply" size={22} color="white" />
                                <Text style={styles.menuItemText}>Reply</Text>
                            </Pressable>
                            <View style={styles.menuDivider} />
                            <Pressable style={styles.menuItem} onPress={() => {
                                onForward?.();
                                menuProgress.value = withTiming(0, { duration: 150 }, () => setShowMenu(false));
                            }}>
                                <MaterialIcons name="forward" size={22} color="white" />
                                <Text style={styles.menuItemText}>Forward</Text>
                            </Pressable>
                            <View style={styles.menuDivider} />
                            <Pressable style={styles.menuItem} onPress={() => {
                                onDownload?.();
                                menuProgress.value = withTiming(0, { duration: 150 }, () => setShowMenu(false));
                            }}>
                                <MaterialIcons name="file-download" size={22} color="white" />
                                <Text style={styles.menuItemText}>Save to Gallery</Text>
                            </Pressable>
                        </BlurView>
                    </Animated.View>
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    fullMedia: {
        width: '100%',
        height: '100%',
    },
    topBar: {
        position: 'absolute',
        top: 50,
        left: 0,
        right: 0,
        paddingHorizontal: 20,
        flexDirection: 'row',
        justifyContent: 'flex-start',
    },
    iconButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    bottomArea: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    },
    inputContainer: {
        paddingHorizontal: 20,
    },
    inputBlur: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 25,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        paddingHorizontal: 15,
        paddingVertical: 8,
        backgroundColor: 'rgba(255,255,255,0.05)',
        overflow: 'hidden',
    },
    input: {
        flex: 1,
        color: 'white',
        fontSize: 15,
        maxHeight: 100,
        paddingTop: Platform.OS === 'ios' ? 0 : 4,
    },
    sendButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#F50057',
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 10,
    },
    menuOverlay: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.3)',
        zIndex: 1000,
    },
    menuContainer: {
        width: '80%',
        maxWidth: 300,
    },
    menuBlur: {
        borderRadius: 20,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        backgroundColor: 'rgba(30,30,35,0.8)',
    },
    reactionRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        paddingVertical: 15,
        paddingHorizontal: 10,
    },
    reactionItem: {
        padding: 5,
    },
    reactionText: {
        fontSize: 28,
    },
    menuDivider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 15,
        gap: 15,
    },
    menuItemText: {
        color: 'white',
        fontSize: 16,
        fontWeight: '500',
    },
});

export default EnhancedMediaViewer;
