import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Animated,
  Easing,
  PanResponder,
  StyleSheet,
  Platform,
} from 'react-native';
import LottieView from 'lottie-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { hapticService } from '../../services/HapticService';
import * as Haptics from 'expo-haptics';

const PULL_LOTTIE = require('../../assets/animations/pull-refresh.json');

const THRESHOLD = 110;
const MAX_PULL = 220;
const REFRESH_HEIGHT = 160;
const TOTAL_REFRESH = 2500;

const PullLottieIndicator = ({ isRefreshing, pullPercentage }: { isRefreshing: boolean; pullPercentage: number }) => {
  const lottieRef = useRef<LottieView>(null);
  const wasRefreshing = useRef(false);
  const exitAnim = useRef(new Animated.Value(0)).current;
  const [isExiting, setIsExiting] = useState(false);

  React.useEffect(() => {
    if (isRefreshing && !wasRefreshing.current) {
      wasRefreshing.current = true;
      setIsExiting(false);
      exitAnim.setValue(0);
      // Start loop from frame 30 to 151 (loading state)
      lottieRef.current?.play(30, 151);
    }
    if (!isRefreshing && wasRefreshing.current) {
      wasRefreshing.current = false;
      setIsExiting(true);
      // Dive down animation when refresh completes
      Animated.timing(exitAnim, {
        toValue: 1,
        duration: 2200, // Slightly longer for more "weight"
        easing: Easing.bezier(0.4, 0, 0.2, 1), // More natural easing
        useNativeDriver: true,
      }).start(() => {
        exitAnim.setValue(0);
        setIsExiting(false);
      });
    }
  }, [exitAnim, isRefreshing]);

  React.useEffect(() => {
    if (!isRefreshing && lottieRef.current) {
      // Scrubbing: Seek to specific frame based on pull percentage (0 to 30)
      const frame = Math.floor(pullPercentage * 30);
      lottieRef.current?.play(frame, frame);
    }
  }, [pullPercentage, isRefreshing]);

  const opacityExit = exitAnim.interpolate({
    inputRange: [0, 0.7, 1],
    outputRange: [1, 1, 0],
  });

  const translateY = exitAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 480], // Deep dive into the abyss
  });

  const scaleExit = exitAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.7],
  });

  return (
    <View style={styles.lottieContainer}>
      <Animated.View style={{
        opacity: isRefreshing ? 1 : (isExiting || pullPercentage > 0.05 ? opacityExit : 0),
        transform: [
          { scale: isRefreshing ? 1 : (isExiting ? scaleExit : Math.max(0.5, pullPercentage)) },
          { translateY: translateY }
        ],
      }}>
        <LottieView
          ref={lottieRef}
          source={PULL_LOTTIE}
          loop={isRefreshing}
          autoPlay={false}
          speed={1}
          style={styles.lottie}
        />
      </Animated.View>
    </View>
  );
};


export const SoulPullToRefresh = ({ children, onRefresh }: { children: any; onRefresh: () => Promise<void> }) => {
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState('idle');

  const pullY = useRef(new Animated.Value(0)).current;
  const pullYValue = useRef(0);
  const statusRef = useRef('idle');
  const startY = useRef(0);
  const scrollTop = useRef(0);

  const setStatusSync = (s: string) => {
    statusRef.current = s;
    setStatus(s);
  };

  const onScroll = useCallback((e: any) => {
    scrollTop.current = e.nativeEvent.contentOffset.y;
  }, []);

  const snapBack = useCallback(() => {
    Animated.spring(pullY, {
      toValue: 0,
      useNativeDriver: false,
      tension: 80,
      friction: 10,
    }).start();
    pullYValue.current = 0;
  }, [pullY]);

  const lockAt = useCallback((h: number) => {
    Animated.spring(pullY, {
      toValue: h,
      useNativeDriver: false,
      tension: 120,
      friction: 14,
    }).start();
    pullYValue.current = h;
  }, [pullY]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) => {
        const isPullingDown = gs.dy > 5 && Math.abs(gs.dy) > Math.abs(gs.dx);
        return (
          scrollTop.current <= 0 &&
          isPullingDown &&
          statusRef.current !== 'loading'
        );
      },
      onPanResponderGrant: (e) => {
        startY.current = e.nativeEvent.pageY;
        setStatusSync('pulling');
      },
      onPanResponderMove: (e) => {
        if (statusRef.current === 'loading') return;
        const dy = e.nativeEvent.pageY - startY.current;
        if (dy <= 0) {
          pullY.setValue(0);
          pullYValue.current = 0;
          return;
        }

        const resistance = MAX_PULL * (1 - Math.exp(-dy / 180));
        pullY.setValue(resistance);
        pullYValue.current = resistance;

        if (resistance >= THRESHOLD && statusRef.current !== 'armed') {
          setStatusSync('armed');
          if (Platform.OS !== 'web') {
            hapticService.impact(Haptics.ImpactFeedbackStyle.Medium);
          }
        } else if (resistance < THRESHOLD && statusRef.current === 'armed') {
          setStatusSync('pulling');
        }
      },
      onPanResponderRelease: () => {
        if (statusRef.current === 'armed') {
          setStatusSync('loading');
          lockAt(REFRESH_HEIGHT);

          onRefresh().finally(() => {
            setTimeout(() => {
              snapBack();
              setStatusSync('idle');
            }, Math.max(0, TOTAL_REFRESH - 500));
          });
        } else {
          snapBack();
          setStatusSync('idle');
        }
      },
    })
  ).current;

  const pullYDisplay = pullY.interpolate({
    inputRange: [0, MAX_PULL],
    outputRange: [0, MAX_PULL],
    extrapolate: 'clamp',
  });

  const pullPercentage =
    status === 'loading'
      ? 1
      : Math.min(1, pullYValue.current / THRESHOLD);

  return (
    <View style={styles.root} {...panResponder.panHandlers}>
      <View style={[styles.header, { paddingTop: insets.top + 54 }]} pointerEvents="none">
        <PullLottieIndicator
          isRefreshing={status === 'loading'}
          pullPercentage={pullPercentage}
        />
      </View>

      <Animated.View
        style={[
          styles.sheet,
          {
            transform: [{ translateY: pullYDisplay }],
            borderTopLeftRadius: pullYValue.current > 5 ? 32 : 0,
            borderTopRightRadius: pullYValue.current > 5 ? 32 : 0,
          },
        ]}
      >
        {typeof children === 'function' ? children({ onScroll }) : children}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 180,
    alignItems: 'center',
    justifyContent: 'flex-end',
    zIndex: 0,
  },
  sheet: {
    flex: 1,
    backgroundColor: '#0a0a0c',
    overflow: 'hidden',
    borderColor: 'rgba(255,255,255,0.05)',
    borderTopWidth: 1,
    zIndex: 10,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -8 },
        shadowOpacity: 0.9,
        shadowRadius: 20,
      },
      android: {
        elevation: 20,
      },
    }),
  },
  lottieContainer: {
    width: 220,
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lottie: {
    width: 180,
    height: 180,
  },
});
