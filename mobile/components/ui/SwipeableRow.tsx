import React from 'react';
import { View, StyleSheet, Pressable, Dimensions } from 'react-native';
import { PanGestureHandler, PanGestureHandlerGestureEvent } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedGestureHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { MaterialIcons } from '@expo/vector-icons';
import GlassView from './GlassView';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ACTION_WIDTH = 54;
const SPACING = 8;
const TOTAL_WIDTH_3 = (ACTION_WIDTH + SPACING) * 3;
const TOTAL_WIDTH_4 = (ACTION_WIDTH + SPACING) * 4;

interface SwipeableRowProps {
  children: React.ReactNode;
  onArchive: () => void;
  onDelete: () => void;
  onUnfriend: () => void;
  onBlock?: () => void;
  isBlocked?: boolean;
}

/**
 * A premium swipeable row component that reveals Archive, Delete, and Unfriend actions.
 * Features smooth animations, haptic-ready states, and glassmorphic styling.
 */
export const SwipeableRow = ({ children, onArchive, onDelete, onUnfriend, onBlock, isBlocked }: SwipeableRowProps) => {
  const translateX = useSharedValue(0);
  const totalWidth = onBlock ? TOTAL_WIDTH_4 : TOTAL_WIDTH_3;

  const gestureHandler = useAnimatedGestureHandler<PanGestureHandlerGestureEvent, { startX: number }>({
    onStart: (_, ctx) => {
      ctx.startX = translateX.value;
    },
    onActive: (event, ctx) => {
      // Only allow swiping left
      const nextX = ctx.startX + event.translationX;
      translateX.value = Math.min(0, nextX);
    },
    onEnd: (event) => {
      // If swiped more than 20% or moving fast enough, snap to open
      const shouldOpen = translateX.value < -totalWidth * 0.3 || event.velocityX < -500;
      
      if (shouldOpen) {
        translateX.value = withSpring(-totalWidth, {
            damping: 20,
            stiffness: 90,
        });
      } else {
        translateX.value = withSpring(0);
      }
    },
  });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const archiveStyle = useAnimatedStyle(() => {
    const scale = interpolate(translateX.value, [-totalWidth, 0], [1, 0], Extrapolation.CLAMP);
    const opacity = interpolate(translateX.value, [-ACTION_WIDTH, 0], [1, 0], Extrapolation.CLAMP);
    return { transform: [{ scale }], opacity };
  });

  const deleteStyle = useAnimatedStyle(() => {
    const scale = interpolate(translateX.value, [-totalWidth, 0], [1, 0], Extrapolation.CLAMP);
    const opacity = interpolate(translateX.value, [-ACTION_WIDTH * 2, 0], [1, 0], Extrapolation.CLAMP);
    return { transform: [{ scale }], opacity };
  });

  const unfriendStyle = useAnimatedStyle(() => {
    const scale = interpolate(translateX.value, [-totalWidth, 0], [1, 0], Extrapolation.CLAMP);
    const opacity = interpolate(translateX.value, [-ACTION_WIDTH * 3, 0], [1, 0], Extrapolation.CLAMP);
    return { transform: [{ scale }], opacity };
  });

  const blockStyle = useAnimatedStyle(() => {
    const scale = interpolate(translateX.value, [-totalWidth, 0], [1, 0], Extrapolation.CLAMP);
    const opacity = interpolate(translateX.value, [-ACTION_WIDTH * 4, 0], [1, 0], Extrapolation.CLAMP);
    return { transform: [{ scale }], opacity };
  });

  const closeAndExecute = (action: () => void) => {
    translateX.value = withSpring(0);
    action();
  };

  return (
    <View style={styles.container}>
      <View style={styles.actionsBackground}>
        {/* Actions are positioned on the right, hidden by the children */}
        <View style={styles.actionsWrapper}>
            <Animated.View style={[styles.actionBtn, archiveStyle]}>
                <Pressable 
                    onPress={() => closeAndExecute(onArchive)}
                    style={({ pressed }) => [styles.pressable, pressed && styles.pressed, { backgroundColor: '#f59e0b' }]}
                >
                    <MaterialIcons name="archive" size={24} color="white" />
                </Pressable>
            </Animated.View>

            <Animated.View style={[styles.actionBtn, deleteStyle]}>
                <Pressable 
                    onPress={() => closeAndExecute(onDelete)}
                    style={({ pressed }) => [styles.pressable, pressed && styles.pressed, { backgroundColor: '#ef4444' }]}
                >
                    <MaterialIcons name="delete-outline" size={26} color="white" />
                </Pressable>
            </Animated.View>

            <Animated.View style={[styles.actionBtn, unfriendStyle]}>
                <Pressable 
                    onPress={() => closeAndExecute(onUnfriend)}
                    style={({ pressed }) => [styles.pressable, pressed && styles.pressed, { backgroundColor: '#6b7280' }]}
                >
                    <MaterialIcons name="person-remove" size={24} color="white" />
                </Pressable>
            </Animated.View>

            {onBlock && (
                <Animated.View style={[styles.actionBtn, blockStyle]}>
                    <Pressable 
                        onPress={() => closeAndExecute(onBlock)}
                        style={({ pressed }) => [styles.pressable, pressed && styles.pressed, { backgroundColor: isBlocked ? '#ffa500' : '#374151' }]}
                    >
                        <MaterialIcons name={isBlocked ? "check-circle" : "block"} size={24} color="white" />
                    </Pressable>
                </Animated.View>
            )}
        </View>
      </View>

      <PanGestureHandler activeOffsetX={[-10, 10]} onGestureEvent={gestureHandler}>
        <Animated.View style={[animatedStyle, styles.content]}>
          {children}
        </Animated.View>
      </PanGestureHandler>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    position: 'relative',
    marginBottom: 10,
  },
  content: {
    width: '100%',
    zIndex: 1,
  },
  actionsBackground: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingRight: 15,
  },
  actionsWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    height: '100%',
  },
  actionBtn: {
    width: 54,
    height: 54,
    borderRadius: 27,
    marginHorizontal: 4,
    overflow: 'hidden',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  pressable: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.95 }],
  },
});

export default SwipeableRow;
