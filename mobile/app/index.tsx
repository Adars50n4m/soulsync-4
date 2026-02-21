// cache bust 1
import Animated, { useSharedValue, useAnimatedStyle } from 'react-native-reanimated';

import { Redirect } from 'expo-router';

export default function Index() {
  return <Redirect href="/(tabs)/" />;
}
