import React, { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { View, Pressable, StyleSheet, useWindowDimensions, Platform } from 'react-native';
import GlassView from '../../components/ui/GlassView';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { useApp } from '../../context/AppContext';
import { ScrollMotionProvider, useScrollMotion } from '../../components/navigation/ScrollMotionProvider';

export const unstable_settings = {
  initialRouteName: 'index',
};

let hasRenderedTabBarOnce = false;

const TabIcon = ({ name, focused, size = 24 }: { name: any; focused: boolean; size?: number }) => {
  const { activeTheme } = useApp();
  const scale = useSharedValue(1);

  useEffect(() => {
    scale.value = withSpring(focused ? 1.2 : 1, { damping: 15 });
  }, [focused]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <MaterialIcons
        name={name}
        size={size}
        color={focused ? activeTheme.primary : 'rgba(255,255,255,0.4)'}
      />
    </Animated.View>
  );
};

const TabBar = ({ state, descriptors, navigation }: any) => {
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const TAB_BAR_WIDTH = SCREEN_WIDTH - 32;
  const { activeTheme } = useApp();

  const numTabs = state?.routes?.length || 3;
  const tabWidth = (TAB_BAR_WIDTH - 24) / numTabs;
  const currentIndex = state?.index ?? 0;

  const isFirstIndicatorSync = React.useRef(true);
  const translateX = useSharedValue(currentIndex * tabWidth);
  const glowProgress = useSharedValue(0);
  const tabBarOpacity = useSharedValue(hasRenderedTabBarOnce ? 0 : 1);

  // Pill position + glow flash
  useEffect(() => {
    if (isFirstIndicatorSync.current) {
      isFirstIndicatorSync.current = false;
      translateX.value = currentIndex * tabWidth;
      return;
    }
    // Flash glow during shift, fade back
    glowProgress.value = withTiming(1, { duration: 150 }, () => {
      glowProgress.value = withTiming(0, { duration: 600 });
    });
    translateX.value = withSpring(currentIndex * tabWidth, {
      damping: 18,
      stiffness: 120,
      mass: 0.8,
    });
  }, [currentIndex, tabWidth, translateX]);

  useEffect(() => {
    if (!hasRenderedTabBarOnce) {
      hasRenderedTabBarOnce = true;
      tabBarOpacity.value = 1;
      return;
    }
    tabBarOpacity.value = withDelay(
      60,
      withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) })
    );
  }, [tabBarOpacity]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
  }));

  // Soft glow blob — follows pill, fades in/out on switch
  const glowStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      transform: [
        { translateX: translateX.value - tabWidth * 0.25 } as const,
      ] as const,
      opacity: glowProgress.value,
    };
  });

  const tabBarFadeStyle = useAnimatedStyle(() => ({
    opacity: tabBarOpacity.value,
  }));

  const focusedRoute = state?.routes?.[state.index];
  const focusedOptions = focusedRoute ? descriptors?.[focusedRoute.key]?.options : undefined;
  const focusedRouteId = focusedRoute?.name || 'index';

  const { hidden: isTabBarHidden } = useScrollMotion(focusedRouteId);
  const translateY = useSharedValue(0);

  useEffect(() => {
    translateY.value = withSpring(isTabBarHidden ? 150 : 0, {
      damping: 20,
      stiffness: 160,
      mass: 0.8,
    });
  }, [isTabBarHidden, translateY]);

  const dropDownStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  if (!state || !state.routes || state.routes.length === 0 || !descriptors || !focusedRoute) {
    return null;
  }

  if (focusedOptions?.tabBarStyle?.display === 'none') {
    return null;
  }

  return (
    <Animated.View style={[styles.tabBarContainer, tabBarFadeStyle, dropDownStyle]}>
      <View style={styles.tabBarGlassContainer}>
        <GlassView intensity={35} tint="dark" style={StyleSheet.absoluteFillObject} />

        {/* Shadow-only glow — no fill, no edge, just soft light */}
        <Animated.View
          style={[
            styles.glowBlob,
            { width: tabWidth * 1.5, borderRadius: 30, shadowColor: activeTheme.primary },
            glowStyle,
          ]}
          pointerEvents="none"
        />

        {/* Indicator pill */}
        <Animated.View style={[styles.indicatorPill, { width: tabWidth }, indicatorStyle]} />

        <View style={styles.tabBarInner}>
          {state.routes.map((route: any, index: number) => {
            const isFocused = state.index === index;

            const onPress = () => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name, route.params);
              }
            };

            let iconName: any = 'home';
            if (route.name === 'index') iconName = 'chat-bubble';
            if (route.name === 'calls') iconName = 'call';
            if (route.name === 'settings') iconName = 'tune';

            return (
              <Pressable key={route.key} onPress={onPress} style={styles.tabButton}>
                <TabIcon name={iconName} focused={isFocused} />
              </Pressable>
            );
          })}
        </View>
      </View>
    </Animated.View>
  );
};

export default function TabLayout() {
  return (
    <ScrollMotionProvider>
      <Tabs
        tabBar={(props) => <TabBar {...props} />}
        screenOptions={{ headerShown: false }}
        initialRouteName="index"
        backBehavior="initialRoute"
      >
        <Tabs.Screen name="index" options={{ title: 'Chats' }} />
        <Tabs.Screen name="calls" options={{ title: 'Calls' }} />
        <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
      </Tabs>
    </ScrollMotionProvider>
  );
}

const styles = StyleSheet.create({
  tabBarContainer: {
    position: 'absolute',
    bottom: 34,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  tabBarGlassContainer: {
    width: '100%',
    borderRadius: 40,
    overflow: 'hidden',
    borderWidth: Platform.OS === 'android' ? 1 : 1.2,
    borderColor: Platform.OS === 'android' ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.22)',
    backgroundColor: Platform.OS === 'android' ? '#0A0A0A' : 'transparent',
  },
  glowBlob: {
    position: 'absolute',
    top: 10,
    height: 52,
    left: 12,
    backgroundColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 30,
    elevation: 20,
  },
  tabBarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    height: 72,
  },
  indicatorPill: {
    position: 'absolute',
    top: 10,
    left: 12,
    height: 52,
    borderRadius: 26,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
});
