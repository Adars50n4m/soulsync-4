import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    runOnJS,
    Easing,
    interpolate,
} from 'react-native-reanimated';
import { ChatStyles } from './ChatStyles';
import { MaterialIcons } from '@expo/vector-icons';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const HORIZONTAL_INSET = 16;

export interface FlyingBubbleData {
    id: string;
    messageId?: string;
    text: string;
    timestamp?: string;
    status?: string | 'pending' | 'delivered' | 'read';
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    width: number;
    height: number;
}

interface FlyingBubbleProps {
    data: FlyingBubbleData;
    onComplete: (id: string, messageId?: string) => void;
}

const FlyingBubble = ({ data, onComplete }: FlyingBubbleProps) => {
    const progress = useSharedValue(0);

    useEffect(() => {
        // Pure motion handoff: no opacity tween.
        progress.value = withTiming(1, { 
            duration: 250, 
            easing: Easing.bezier(0.33, 1, 0.68, 1) 
        }, (finished) => {
            if (finished) {
                runOnJS(onComplete)(data.id, data.messageId);
            }
        });
    }, [data.id, data.messageId, onComplete, progress]);

    const animatedStyle = useAnimatedStyle(() => {
        const translateY = data.startY + (data.endY - data.startY) * progress.value;
        return {
            transform: [
                { translateY } as any,
            ],
            opacity: 1,
        };
    });

    return (
        <Animated.View style={[
            styles.flyingWrapper,
            animatedStyle
        ]}>
            <View style={ChatStyles.bubbleReactionAnchor}>
                <View style={[
                    ChatStyles.bubbleContainer,
                    ChatStyles.bubbleContainerMe,
                ]}>
                    <View style={ChatStyles.messageContent}>
                    <Text style={ChatStyles.messageText} numberOfLines={3}>
                        {data.text}
                    </Text>
                    </View>
                </View>

                <View style={[
                  ChatStyles.messageFooter,
                  ChatStyles.messageFooterMe,
                ]}>
                  <Text style={ChatStyles.timestamp}>
                    {data.timestamp ? new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}
                  </Text>
                  <MaterialIcons 
                    name={
                      data.status === 'pending' ? 'schedule' :
                      data.status === 'delivered' || data.status === 'read' ? 'done-all' :
                      'done'
                    } 
                    size={10} 
                    color={data.status === 'read' ? '#34B7F1' : 'rgba(255,255,255,0.3)'} 
                    style={{ marginLeft: 3 }} 
                  />
                </View>
            </View>
        </Animated.View>
    );
};

interface FlyingBubbleLayerProps {
    bubbles: FlyingBubbleData[];
    onComplete: (id: string, messageId?: string) => void;
}

/**
 * FlyingBubbleLayer
 * 
 * A portal-like layer that renders temporary flying bubbles on top of the chat screen.
 */
export const FlyingBubbleLayer = ({ bubbles, onComplete }: FlyingBubbleLayerProps) => {
    if (bubbles.length === 0) return null;

    return (
        <View style={styles.layer} pointerEvents="none">
            {bubbles.map((bubble) => (
                <FlyingBubble 
                    key={bubble.id} 
                    data={bubble} 
                    onComplete={onComplete} 
                />
            ))}
        </View>
    );
};

const styles = StyleSheet.create({
    layer: {
        ...StyleSheet.absoluteFillObject,
        paddingHorizontal: HORIZONTAL_INSET,
    },
    flyingWrapper: {
        position: 'absolute',
        top: 0,
        right: 0,
        width: SCREEN_WIDTH - (HORIZONTAL_INSET * 2),
        alignItems: 'flex-end',
        zIndex: 999,
    },
});

export default FlyingBubbleLayer;
