import React, { Component, forwardRef, useEffect, useState } from 'react';
import {
    View,
    Pressable,
    PressableProps,
    StyleSheet,
    ViewProps,
    StyleProp,
    ViewStyle,
    Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    withSequence,
    Easing,
} from 'react-native-reanimated';

export interface GlassViewProps extends ViewProps {
    intensity?: number;
    tint?: 'light' | 'dark' | 'default';
    style?: StyleProp<ViewStyle>;
    children?: React.ReactNode;
    experimentalBlurMethod?: 'none' | 'dimezisBlurView';
    disableExperimental?: boolean;
    /**
     * Render Liquid-Glass-style corner highlights (top-left + bottom-right).
     * Idle = static, very subtle. Combine with `pressed` for the iOS-26
     * specular-flash on touch.
     */
    glow?: boolean;
    /** Highlight tint (defaults to white). */
    glowColor?: string;
    /** Peak alpha for the highlight when pressed (0..1). Defaults to 0.32. */
    glowIntensity?: number;
    /**
     * Drives the touch-reactive specular flash. Wire this to a parent
     * Pressable's onPressIn/onPressOut, e.g.:
     *   const [pressed, setPressed] = useState(false);
     *   <Pressable onPressIn={() => setPressed(true)} onPressOut={() => setPressed(false)}>
     *     <GlassView glow pressed={pressed}>...</GlassView>
     *   </Pressable>
     */
    pressed?: boolean;
}

const IS_ANDROID = Platform.OS === 'android';

// Tint applied as a separate View layer (NOT through expo-blur's tint prop)
// This avoids the glow/additive blending artifact on Android
// Premium solid backgrounds for Android (instead of blur)
const ANDROID_SOLID_BG: Record<string, string> = {
    dark: '#0A0A0A',
    light: '#2A2A2A',
    default: '#121212',
};


// Fallback if blur crashes (iOS)
const FALLBACK_BG: Record<string, string> = {
    dark: 'rgba(18, 18, 26, 0.72)',
    light: 'rgba(255, 255, 255, 0.18)',
    default: 'rgba(25, 25, 35, 0.65)',
};

// Global kill switch — one crash disables blur for ALL instances (iOS)
let blurDisabled = false;

class BlurGuard extends Component<
    { fallback: string; children: React.ReactNode },
    { crashed: boolean }
> {
    state = { crashed: false };
    static getDerivedStateFromError() {
        blurDisabled = true;
        return { crashed: true };
    }
    componentDidCatch() {}
    render() {
        if (this.state.crashed) {
            return <View style={[StyleSheet.absoluteFill, { backgroundColor: this.props.fallback }]} />;
        }
        return this.props.children;
    }
}

// Convert "#ffffff" / "rgba(255,255,255,1)" + alpha into an rgba() string. Keeps
// the worklet-free helper trivial and avoids pulling a color lib in.
const withAlpha = (color: string, alpha: number) => {
    if (color.startsWith('rgba')) {
        return color.replace(/rgba\(([^,]+),([^,]+),([^,]+),[^)]+\)/, `rgba($1,$2,$3,${alpha})`);
    }
    if (color.startsWith('rgb(')) {
        return color.replace(/rgb\(([^)]+)\)/, `rgba($1,${alpha})`);
    }
    if (color.startsWith('#') && (color.length === 7 || color.length === 4)) {
        const hex = color.length === 4
            ? color.slice(1).split('').map(c => c + c).join('')
            : color.slice(1);
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        return `rgba(${r},${g},${b},${alpha})`;
    }
    return color;
};

// `forwardRef` so the legacy `Animated.createAnimatedComponent(GlassView)`
// path (used in app/(tabs)/index.tsx) can attach a ref to the underlying
// View. Without it, react-native's Animated API crashes with
// "Looks like you're passing a function component … which supports only
// class components. Please wrap your function component with React.forwardRef()".
export const GlassView = forwardRef<View, GlassViewProps>(({
    intensity = 45,
    tint = 'dark',
    style,
    children,
    glow = false,
    glowColor = '#ffffff',
    glowIntensity = 0.32,
    pressed = false,
    ...rest
}, ref) => {
    const androidBg = ANDROID_SOLID_BG[tint] || ANDROID_SOLID_BG.dark;
    const fallbackBg = FALLBACK_BG[tint] || FALLBACK_BG.dark;

    // 0 = idle (fully invisible — surface looks normal), 1 = pressed (full
    // specular flash). iOS-26 reference: quick brighten on touch (~140ms),
    // held while the finger is down, smooth ease-out on release.
    const press = useSharedValue(0);
    useEffect(() => {
        if (!glow) return;
        if (pressed) {
            press.value = withSequence(
                withTiming(1, { duration: 140, easing: Easing.out(Easing.cubic) }),
                withTiming(0.78, { duration: 220, easing: Easing.inOut(Easing.cubic) }),
            );
        } else {
            press.value = withTiming(0, { duration: 360, easing: Easing.in(Easing.quad) });
        }
    }, [glow, pressed, press]);

    // Idle layer opacity = 0 (invisible). Only shows during press.
    const tlStyle = useAnimatedStyle(() => ({
        opacity: press.value,
    }));
    const brStyle = useAnimatedStyle(() => ({
        opacity: press.value * 0.92,
    }));

    const tlEdge = withAlpha(glowColor, glowIntensity);
    const brEdge = withAlpha(glowColor, glowIntensity * 0.78);
    const transparent = withAlpha(glowColor, 0);

    return (
        <View ref={ref} style={[styles.container, style]} {...rest}>
            {/* iOS: native blur — works perfectly */}
            {!IS_ANDROID && !blurDisabled && (
                <BlurGuard fallback={fallbackBg}>
                    <BlurView
                        intensity={intensity}
                        tint={tint}
                        style={StyleSheet.absoluteFill}
                    />
                </BlurGuard>
            )}

            {/* iOS Fallback */}
            {!IS_ANDROID && blurDisabled && (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: fallbackBg }]} />
            )}

            {/* Android: Premium Solid Background — ZERO performance cost */}
            {IS_ANDROID && (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: androidBg }]} />
            )}

            {/* Liquid-glass edge highlights — opt-in via `glow` prop. */}
            {glow && (
                <>
                    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFillObject, tlStyle]}>
                        <LinearGradient
                            colors={[tlEdge, transparent]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 0.7, y: 0.7 }}
                            style={StyleSheet.absoluteFill}
                        />
                    </Animated.View>
                    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFillObject, brStyle]}>
                        <LinearGradient
                            colors={[transparent, brEdge]}
                            start={{ x: 0.3, y: 0.3 }}
                            end={{ x: 1, y: 1 }}
                            style={StyleSheet.absoluteFill}
                        />
                    </Animated.View>
                </>
            )}

            {children}
        </View>
    );
});

GlassView.displayName = 'GlassView';


const styles = StyleSheet.create({
    container: {
        overflow: 'hidden',
    },
});

/**
 * GlassPressable — drop-in replacement for `Pressable` that renders a
 * GlassView background with iOS-26-style touch-reactive specular flash.
 *
 * Idle: surface looks completely normal (no glow visible). On press: a
 * quick edge-flash highlights top-left + bottom-right corners, holds
 * while the finger is down, settles smoothly on release.
 *
 * Use it anywhere you'd use `<Pressable>` for an interactive glass surface.
 *
 * @example
 *   <GlassPressable
 *     onPress={handler}
 *     glowColor={activeTheme.primary}
 *     glassIntensity={40}
 *     style={{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' }}
 *   >
 *     <Icon name="search" />
 *   </GlassPressable>
 */
export interface GlassPressableProps extends Omit<PressableProps, 'children'> {
    children?: React.ReactNode;
    /** Forwarded to the inner GlassView's `intensity`. */
    glassIntensity?: number;
    /** Forwarded to the inner GlassView's `tint`. */
    glassTint?: 'light' | 'dark' | 'default';
    /** Highlight tint (defaults to white). */
    glowColor?: string;
    /** Peak alpha for the highlight when pressed. */
    glowIntensity?: number;
}

export const GlassPressable = ({
    children,
    glassIntensity = 40,
    glassTint = 'dark',
    glowColor = '#ffffff',
    glowIntensity = 0.5,
    style,
    onPressIn,
    onPressOut,
    ...rest
}: GlassPressableProps) => {
    const [pressed, setPressed] = useState(false);
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
            style={style as any}
        >
            <GlassView
                intensity={glassIntensity}
                tint={glassTint}
                glow
                glowColor={glowColor}
                glowIntensity={glowIntensity}
                pressed={pressed}
                style={StyleSheet.absoluteFillObject}
            />
            {children}
        </Pressable>
    );
};

/**
 * GlowPressable — Pressable + iOS-26-style touch-reactive specular flash
 * overlay, without adding any background. Use this on existing interactive
 * elements (tab bar buttons, filter pills, list rows, etc.) where you don't
 * want to change the surface's existing background.
 *
 * For correct clipping, the consumer should set `borderRadius` (and
 * optionally `overflow: 'hidden'`) on the passed style — GlowPressable will
 * apply `overflow: 'hidden'` automatically so corner gradients don't leak.
 *
 * @example
 *   <GlowPressable
 *     onPress={...}
 *     glowColor={activeTheme.primary}
 *     style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}
 *   >
 *     <Icon name="add" />
 *   </GlowPressable>
 */
export interface GlowPressableProps extends Omit<PressableProps, 'children'> {
    children?: React.ReactNode;
    glowColor?: string;
    glowIntensity?: number;
}

export const GlowPressable = ({
    children,
    glowColor = '#ffffff',
    glowIntensity = 0.45,
    style,
    onPressIn,
    onPressOut,
    ...rest
}: GlowPressableProps) => {
    const [pressed, setPressed] = useState(false);
    const press = useSharedValue(0);

    useEffect(() => {
        if (pressed) {
            press.value = withSequence(
                withTiming(1, { duration: 140, easing: Easing.out(Easing.cubic) }),
                withTiming(0.78, { duration: 220, easing: Easing.inOut(Easing.cubic) }),
            );
        } else {
            press.value = withTiming(0, { duration: 360, easing: Easing.in(Easing.quad) });
        }
    }, [pressed, press]);

    const tlStyle = useAnimatedStyle(() => ({ opacity: press.value }));
    const brStyle = useAnimatedStyle(() => ({ opacity: press.value * 0.92 }));

    const tlEdge = withAlpha(glowColor, glowIntensity);
    const brEdge = withAlpha(glowColor, glowIntensity * 0.78);
    const transparent = withAlpha(glowColor, 0);

    // Resolve a Pressable style object/array/function into a single base
    // style we can extend with overflow:hidden so the gradients stay clipped
    // to the consumer's borderRadius.
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
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFillObject, tlStyle]}>
                <LinearGradient
                    colors={[tlEdge, transparent]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0.7, y: 0.7 }}
                    style={StyleSheet.absoluteFill}
                />
            </Animated.View>
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFillObject, brStyle]}>
                <LinearGradient
                    colors={[transparent, brEdge]}
                    start={{ x: 0.3, y: 0.3 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                />
            </Animated.View>
            {children}
        </Pressable>
    );
};

export default GlassView;
