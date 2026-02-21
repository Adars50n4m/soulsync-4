import React from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  SharedTransition,
} from 'react-native-reanimated';
import { View } from 'react-native';

interface SharedElementProps {
  children: React.ReactNode;
  tag: string;
  style?: any;
}

export const SharedElement: React.FC<SharedElementProps> = ({ children, tag, style }) => {
  return (
    <Animated.View
      style={style}
      sharedTransitionTag={tag}
    >
      {children}
    </Animated.View>
  );
};

export const SharedElementRoot: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <View style={{ flex: 1 }}>
      {children}
    </View>
  );
};
