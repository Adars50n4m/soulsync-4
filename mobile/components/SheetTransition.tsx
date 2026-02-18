import React, { useEffect, useCallback } from 'react';
import { StyleSheet, Dimensions, Platform } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming,
    interpolate,
    Extrapolate,
    runOnJS,
    cancelAnimation,
} from 'react-native-reanimated';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { MORPH_EASING, MORPH_IN_DURATION, MORPH_OUT_DURATION } from '../constants/transitions';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const SCREEN_WIDTH = Dimensions.get('window').width;

interface SheetTransitionProps {
    children: React.ReactNode;
    onClose: () => void;
    isOpen?: boolean;
    springConfig?: {
        damping: number;
        stiffness: number;
        mass: number;
    };
    scaleFactor?: number;
    dragThreshold?: number;
    initialBorderRadius?: number;
    opacityOnGestureMove?: boolean;
    containerRadiusSync?: boolean;
    sourceY?: number;
    headerTop?: number;
}

export function SheetTransition({
    children,
    onClose,
    isOpen = true,
    springConfig = { damping: 18, stiffness: 80, mass: 0.8 },
    scaleFactor = 0.92,
    dragThreshold = 100,
    initialBorderRadius = 36,
    opacityOnGestureMove = true,
    containerRadiusSync = true,
    sourceY,
    headerTop = 50,
}: SheetTransitionProps) {
    const distance = sourceY !== undefined ? sourceY - headerTop : SCREEN_HEIGHT;
    const translateY = useSharedValue(distance); 
    const scale = useSharedValue(0.9);
    const opacity = useSharedValue(0);
    const borderRadius = useSharedValue(initialBorderRadius);

    const handleClose = useCallback(() => {
        // Linear-style exit: predictable and high-performance
        translateY.value = withTiming(distance, { 
            duration: MORPH_OUT_DURATION, 
            easing: MORPH_EASING 
        }, (finished) => {
            if (finished) {
                runOnJS(onClose)();
            }
        });
        
        scale.value = withTiming(scaleFactor, { 
            duration: MORPH_OUT_DURATION, 
            easing: MORPH_EASING 
        });
        
        opacity.value = withTiming(0, { 
            duration: MORPH_OUT_DURATION - 50, 
            easing: MORPH_EASING 
        });
    }, [onClose, distance, scaleFactor]);

    // Animate in/out on prop change
    useEffect(() => {
        if (isOpen) {
            // Predictable entrance for perfect "Reshape" feel
            translateY.value = withTiming(0, { 
                duration: MORPH_IN_DURATION, 
                easing: MORPH_EASING 
            });
            scale.value = withTiming(1, { 
                duration: MORPH_IN_DURATION, 
                easing: MORPH_EASING 
            });
            opacity.value = withTiming(1, { 
                duration: MORPH_IN_DURATION, 
                easing: MORPH_EASING 
            });
            borderRadius.value = withTiming(0, { 
                duration: MORPH_IN_DURATION + 100, 
                easing: MORPH_EASING 
            });
        } else {
            handleClose();
        }
    }, [isOpen, handleClose]);

    const panGesture = Gesture.Pan()
        .activeOffsetY([10, Number.MAX_SAFE_INTEGER])
        .onUpdate((event) => {
            if (event.translationY > 0) {
                translateY.value = event.translationY;
                
                if (opacityOnGestureMove) {
                    opacity.value = interpolate(
                        event.translationY,
                        [0, SCREEN_HEIGHT],
                        [1, 0.5],
                        Extrapolate.CLAMP
                    );
                }
                
                if (containerRadiusSync) {
                    borderRadius.value = interpolate(
                        event.translationY,
                        [0, SCREEN_HEIGHT],
                        [0, initialBorderRadius],
                        Extrapolate.CLAMP
                    );
                }
                
                scale.value = interpolate(
                    event.translationY,
                    [0, SCREEN_HEIGHT],
                    [scaleFactor, 1],
                    Extrapolate.CLAMP
                );
            }
        })
        .onEnd((event) => {
            if (event.translationY > dragThreshold) {
                handleClose();
            } else {
                translateY.value = withSpring(0, springConfig);
                scale.value = withSpring(1, springConfig);
                opacity.value = withTiming(1);
                borderRadius.value = withTiming(0);
            }
        });

    const containerStyle = useAnimatedStyle(() => ({
        flex: 1,
        transform: [{ scale: scale.value }],
        opacity: scale.value,
    }));

    const sheetStyle = useAnimatedStyle(() => ({
        flex: 1,
        transform: [{ translateY: translateY.value }],
        opacity: opacity.value,
        borderRadius: borderRadius.value,
        overflow: 'hidden',
    }));

    return (
        <Animated.View style={containerStyle}>
            <GestureDetector gesture={panGesture}>
                <Animated.View style={sheetStyle}>
                    {children}
                </Animated.View>
            </GestureDetector>
        </Animated.View>
    );
}

export default SheetTransition;
