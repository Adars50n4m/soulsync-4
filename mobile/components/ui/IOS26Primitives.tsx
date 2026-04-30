import React, { useEffect, useState } from 'react';
import {
  Pressable,
  PressableProps,
  StyleSheet,
  StyleProp,
  Text,
  TextStyle,
  View,
  ViewProps,
  ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import GlassView from './GlassView';

const withAlpha = (color: string, alpha: number): string => {
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    const normalized = hex.length === 3
      ? hex.split('').map((char) => char + char).join('')
      : hex;

    if (normalized.length === 6) {
      const r = parseInt(normalized.slice(0, 2), 16);
      const g = parseInt(normalized.slice(2, 4), 16);
      const b = parseInt(normalized.slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
  }

  if (color.startsWith('rgb(')) {
    return color.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`);
  }

  if (color.startsWith('rgba(')) {
    return color.replace(/rgba\(([^,]+),([^,]+),([^,]+),[^)]+\)/, `rgba($1,$2,$3,${alpha})`);
  }

  return color;
};

type GlassPillSurfaceProps = ViewProps & {
  children?: React.ReactNode;
  radius?: number;
  intensity?: number;
  selected?: boolean;
  selectedColor?: string;
  borderColor?: string;
  overlayOpacity?: number;
  contentStyle?: StyleProp<ViewStyle>;
  /**
   * Drives the iOS 26 tap-flash overlay — a brief tinted fill + colored edge
   * that fades in on press and fades back out on release. Wire from a parent
   * Pressable's onPressIn/onPressOut. Falls back to `selectedColor` for the
   * flash color unless `pressColor` is provided.
   */
  pressed?: boolean;
  pressColor?: string;
};

export const GlassPillSurface = ({
  children,
  radius = 28,
  intensity = 35,
  selected = false,
  selectedColor = '#bc002a',
  borderColor = 'rgba(255,255,255,0.14)',
  overlayOpacity = 0.14,
  pressed = false,
  pressColor,
  style,
  contentStyle,
  ...rest
}: GlassPillSurfaceProps) => {
  const resolvedBorderColor = selected ? withAlpha(selectedColor, 0.48) : borderColor;
  const overlayColor = selected ? withAlpha(selectedColor, 0.16) : `rgba(0,0,0,${overlayOpacity})`;
  const flashColor = pressColor ?? selectedColor;

  // Tap-flash animation — fades the colored overlay + edge in on press,
  // out on release. Matches the cadence of the tab bar's tap flash so the
  // whole app reads as one consistent iOS 26 interaction language.
  const press = useSharedValue(0);
  useEffect(() => {
    if (pressed) {
      press.value = withTiming(1, { duration: 140, easing: Easing.out(Easing.cubic) });
    } else {
      press.value = withTiming(0, { duration: 320, easing: Easing.in(Easing.quad) });
    }
  }, [pressed, press]);
  const flashStyle = useAnimatedStyle(() => ({ opacity: press.value }));

  return (
    <View
      {...rest}
      style={[
        styles.surfaceShell,
        {
          borderRadius: radius,
          borderColor: resolvedBorderColor,
        },
        style,
      ]}
    >
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          {
            borderRadius: radius,
            overflow: 'hidden',
          },
        ]}
      >
        <GlassView intensity={intensity} tint="dark" style={StyleSheet.absoluteFillObject} />
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: overlayColor }]} />
        {selected && (
          <>
            <LinearGradient
              colors={[withAlpha(selectedColor, 0.18), 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0.8, y: 0.8 }}
              style={StyleSheet.absoluteFillObject}
            />
            <LinearGradient
              colors={['transparent', withAlpha(selectedColor, 0.12)]}
              start={{ x: 0.3, y: 0.3 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFillObject}
            />
          </>
        )}
      </View>
      {/* iOS 26 tap-flash — colored fill + edge, fades in/out on press. */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          {
            borderRadius: radius,
            borderWidth: 1,
            borderColor: withAlpha(flashColor, 0.6),
            backgroundColor: withAlpha(flashColor, 0.18),
          },
          flashStyle,
        ]}
      />
      <View style={[styles.surfaceContent, contentStyle]}>{children}</View>
    </View>
  );
};

type GlassChipButtonProps = Omit<PressableProps, 'children'> & {
  children?: React.ReactNode;
  label?: string;
  active?: boolean;
  themeColor?: string;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  iconOnly?: boolean;
};

export const GlassChipButton = ({
  children,
  label,
  active = false,
  themeColor = '#bc002a',
  radius = 20,
  style,
  contentStyle,
  labelStyle,
  iconOnly = false,
  ...rest
}: GlassChipButtonProps) => {
  return (
    <Pressable
      {...rest}
      style={({ pressed }) => [
        styles.chipPressable,
        pressed && styles.chipPressablePressed,
      ]}
    >
      <GlassPillSurface
        radius={radius}
        intensity={24}
        selected={active}
        selectedColor={themeColor}
        borderColor={active ? withAlpha(themeColor, 0.5) : 'rgba(255,255,255,0.1)'}
        overlayOpacity={0.08}
        style={style}
        contentStyle={[
          styles.chipContent,
          iconOnly && styles.chipContentIconOnly,
          contentStyle,
        ]}
      >
        {children ?? (
          <Text
            style={[
              styles.chipLabel,
              { color: active ? themeColor : 'rgba(255,255,255,0.56)' },
              labelStyle,
            ]}
          >
            {label}
          </Text>
        )}
      </GlassPillSurface>
    </Pressable>
  );
};

/**
 * PressableFlash — drop-in `Pressable` replacement that overlays an iOS 26
 * tap-flash (colored fill + colored edge) on press. Use anywhere you want a
 * tappable surface to acknowledge the press in the app theme color.
 *
 * The flash is clipped to `borderRadius` (default 0). Pass the same radius
 * the inner content uses so the edge follows the surface shape.
 *
 * @example
 *   <PressableFlash
 *     onPress={openChat}
 *     flashColor={activeTheme.primary}
 *     borderRadius={20}
 *     style={styles.bubble}
 *   >
 *     <Text>...</Text>
 *   </PressableFlash>
 */
export interface PressableFlashProps extends Omit<PressableProps, 'children'> {
  children?: React.ReactNode;
  flashColor?: string;
  /** Peak alpha for the colored fill overlay. */
  flashFillAlpha?: number;
  /** Peak alpha for the colored edge. Set 0 to skip the border. */
  flashEdgeAlpha?: number;
  /** Match the consumer's surface radius so the edge follows the shape. */
  borderRadius?: number;
}

export const PressableFlash = ({
  children,
  flashColor = '#bc002a',
  flashFillAlpha = 0.18,
  flashEdgeAlpha = 0.6,
  borderRadius = 0,
  style,
  onPressIn,
  onPressOut,
  ...rest
}: PressableFlashProps) => {
  const [pressed, setPressed] = useState(false);
  const press = useSharedValue(0);

  useEffect(() => {
    if (pressed) {
      press.value = withTiming(1, { duration: 140, easing: Easing.out(Easing.cubic) });
    } else {
      press.value = withTiming(0, { duration: 320, easing: Easing.in(Easing.quad) });
    }
  }, [pressed, press]);

  const flashStyle = useAnimatedStyle(() => ({ opacity: press.value }));

  const resolveStyle = (s: any) => (typeof s === 'function' ? s({ pressed: false }) : s);
  const baseStyle = resolveStyle(style);

  return (
    <Pressable
      {...rest}
      onPressIn={(e) => {
        setPressed(true);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        onPressOut?.(e);
      }}
      style={[baseStyle, { overflow: 'hidden' as const }]}
    >
      {children}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          {
            borderRadius,
            borderWidth: flashEdgeAlpha > 0 ? 1 : 0,
            borderColor: withAlpha(flashColor, flashEdgeAlpha),
            backgroundColor: withAlpha(flashColor, flashFillAlpha),
          },
          flashStyle,
        ]}
      />
    </Pressable>
  );
};

const styles = StyleSheet.create({
  surfaceShell: {
    overflow: 'hidden',
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  surfaceContent: {
    alignSelf: 'stretch',
  },
  chipPressable: {
    alignSelf: 'flex-start',
  },
  chipPressablePressed: {
    opacity: 0.84,
  },
  chipContent: {
    minHeight: 32,
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipContentIconOnly: {
    minWidth: 32,
    paddingHorizontal: 0,
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
