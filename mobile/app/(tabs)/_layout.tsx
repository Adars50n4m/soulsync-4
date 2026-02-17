import React, { useRef, useEffect } from 'react';
import { Tabs } from 'expo-router';
import { View, Pressable, StyleSheet, Dimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring, 
  withTiming 
} from 'react-native-reanimated';
import { useApp } from '../../context/AppContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TAB_BAR_WIDTH = SCREEN_WIDTH - 32;

const TabIcon = ({ name, focused, size = 24 }: { name: any; focused: boolean; size?: number }) => {
  const { activeTheme } = useApp();
  const scale = useSharedValue(1);

  useEffect(() => {
    scale.value = withSpring(focused ? 1.2 : 1, { damping: 15 });
  }, [focused]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }]
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
  const { activeTheme } = useApp();
  const numTabs = state.routes.length;
  const tabWidth = (TAB_BAR_WIDTH - 24) / numTabs; // Padding considered
  
  const translateX = useSharedValue(0);

  useEffect(() => {
    translateX.value = withSpring(state.index * tabWidth, {
      damping: 18,
      stiffness: 120,
      mass: 0.8
    });
  }, [state.index, tabWidth]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    backgroundColor: `${activeTheme.primary}1A`, // 10% opacity for shifting pill to keep icons visible
  }));

  return (
    <View style={styles.tabBarContainer}>
      <View style={styles.tabBarSolid}>
        <View style={styles.tabBarInner}>
          {/* Shifting Indicator */}
          <Animated.View 
            style={[
              styles.indicatorPill, 
              { width: tabWidth }, 
              indicatorStyle
            ]} 
          />

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
              <Pressable
                key={route.key}
                onPress={onPress}
                style={styles.tabButton}
              >
                <TabIcon name={iconName} focused={isFocused} />
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
};

export default function TabLayout() {
  return (
    <Tabs
      tabBar={props => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Chats',
        }}
      />
      <Tabs.Screen
        name="calls"
        options={{
          title: 'Calls',
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBarContainer: {
    position: 'absolute',
    bottom: 30, // Elevated floating look
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  tabBarSolid: {
    width: TAB_BAR_WIDTH,
    borderRadius: 40,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#09090b', // Solid Midnight Black
  },
  tabBarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    height: 64,
  },
  indicatorPill: {
    position: 'absolute',
    left: 12, // Match inner horizontal padding
    height: 44,
    borderRadius: 22,
    zIndex: -1,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
});
