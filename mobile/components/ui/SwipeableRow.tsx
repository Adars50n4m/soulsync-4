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
const ACTION_WIDTH = 70;
const TOTAL_WIDTH = ACTION_WIDTH * 3;

interface SwipeableRowProps {
  children: React.ReactNode;
  onArchive: () => void;
  onDelete: () => void;
  onUnfriend: () => void;
}

/**
 * A premium swipeable row component that reveals Archive, Delete, and Unfriend actions.
 * Features smooth animations, haptic-ready states, and glassmorphic styling.
 */
export const SwipeableRow = ({ children, onArchive, onDelete, onUnfriend }: SwipeableRowProps) => {
  const translateX = useSharedValue(0);

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
      // If swiped more than 30% or moving fast enough, snap to open
      const shouldOpen = translateX.value < -ACTION_WIDTH * 1.2 || event.velocityX < -500;
      
      if (shouldOpen) {
        translateX.value = withSpring(-TOTAL_WIDTH, {
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
    const scale = interpolate(
        translateX.value,
        [-TOTAL_WIDTH, -ACTION_WIDTH * 3, -ACTION_WIDTH * 2, -ACTION_WIDTH, 0],
        [1, 1, 0.8, 0.5, 0],
        Extrapolation.CLAMP
    );
    const opacity = interpolate(
        translateX.value,
        [-ACTION_WIDTH, 0],
        [1, 0],
        Extrapolation.CLAMP
    );
    return { transform: [{ scale }], opacity };
  });

  const deleteStyle = useAnimatedStyle(() => {
    const scale = interpolate(
        translateX.value,
        [-TOTAL_WIDTH, -ACTION_WIDTH * 2, -ACTION_WIDTH, 0],
        [1, 0.9, 0.5, 0],
        Extrapolation.CLAMP
    );
    const opacity = interpolate(
        translateX.value,
        [-ACTION_WIDTH * 1.5, -ACTION_WIDTH],
        [1, 0],
        Extrapolation.CLAMP
    );
    return { transform: [{ scale }], opacity };
  });

  const unfriendStyle = useAnimatedStyle(() => {
    const scale = interpolate(
        translateX.value,
        [-TOTAL_WIDTH, -ACTION_WIDTH, 0],
        [1, 0.5, 0],
        Extrapolation.CLAMP
    );
    const opacity = interpolate(
        translateX.value,
        [-ACTION_WIDTH * 2.5, -ACTION_WIDTH * 2],
        [1, 0],
        Extrapolation.CLAMP
    );
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
