/**
 * Soul — Login Screen
 *
 * Performance Optimized Anatomy:
 * - Isolated Physics Engine (RAF) for 60FPS visuals.
 * - ZERO re-renders on the main component during interaction (fixes Keyboard issues).
 * - "Peek" animation: Left swan peeks when password is visible.
 * - "Blush" effect: Swans glow when they get closer.
 * - "Breathing" pulse: Subtle life-like movement.
 */

import React, { useState, useRef, useEffect, useCallback, useImperativeHandle } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Platform, SafeAreaView,
  StatusBar, Easing, ActivityIndicator,
  Animated as RNAnimated,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useFrameCallback,
} from 'react-native-reanimated';
import type { ViewStyle } from 'react-native';
import Svg, { Path, Ellipse, G, Defs, RadialGradient, Stop } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useApp } from '../context/AppContext';

// ─── Imperative handle ref type ───────────────
type SwanRef = {
  setFocused: (field: 'email' | 'password' | null) => void;
  setEmailLength: (len: number) => void;
  setShowPassword: (show: boolean) => void;
  setStatus: (status: 'idle' | 'loading' | 'success' | 'fail') => void;
};

// ─── Theme ───────────────────────────────────
const T = {
  bg:          '#000000',
  card:        '#1A0A0C',
  border:      '#3D1215',
  primary:     '#E5143C',
  accent:      '#A855F7',
  iconBg:      '#3D0A0A',
  white:       '#FFFFFF',
  textMuted:   'rgba(255,255,255,0.45)',
  textSub:     'rgba(255,255,255,0.6)',
};

// ─── SVG Scale Factor ──────────────────────────
const S = 320 / 200; // 1.6

// ─── CuteSwans: Reanimated Logic ──────────────
// Android fix: ALL SVG in one static layer, Animated.View for overlays only
const CuteSwans = React.memo(React.forwardRef<SwanRef, {}>((props, ref) => {
  const cCl = useSharedValue(0), cRoL = useSharedValue(0), cRoR = useSharedValue(0);
  const cEyL = useSharedValue(1), cEyR = useSharedValue(1), cHt = useSharedValue(0);
  const cTe = useSharedValue(0), cBl = useSharedValue(0), cFly = useSharedValue(0), cRt = useSharedValue(0);

  const tCl = useSharedValue(0), tRoL = useSharedValue(0), tRoR = useSharedValue(0);
  const tEyL = useSharedValue(1), tEyR = useSharedValue(1), tHt = useSharedValue(0);
  const tTe = useSharedValue(0), tBl = useSharedValue(0);

  const emailLen = useSharedValue(0);
  const isFocused = useSharedValue<null | 'email' | 'password'>(null);

  useImperativeHandle(ref, () => ({
    setFocused: (field) => {
      isFocused.value = field;
      if (field === 'password') {
        tRoL.value = -15; tRoR.value = -15; tEyL.value = 0; tEyR.value = 0; tCl.value = 0; tBl.value = 0;
      } else {
        tRoL.value = 0; tRoR.value = 0; tEyL.value = 1; tEyR.value = 1;
        const cl = field === 'email' ? Math.min((emailLen.value / 20) * 8, 10) : 0;
        tCl.value = cl; tBl.value = cl / 10;
      }
    },
    setEmailLength: (len) => {
      emailLen.value = len;
      if (isFocused.value === 'email') {
        const cl = Math.min((len / 20) * 8, 10);
        tCl.value = cl; tBl.value = cl / 10;
      }
    },
    setShowPassword: (show) => {
      if (isFocused.value === 'password') {
        tEyL.value = show ? 1.1 : 0;
        tRoL.value = show ? 0 : -15;
      }
    },
    setStatus: (status) => {
      if (status === 'success') {
        tHt.value = 1; tCl.value = 16; tRoL.value = 8; tRoR.value = 8; tEyL.value = 1; tEyR.value = 1; tTe.value = 0; tBl.value = 1;
      } else if (status === 'fail') {
        tHt.value = 0; tCl.value = 2; tRoL.value = -12; tRoR.value = -12; tEyL.value = 0; tEyR.value = 0; tTe.value = 1; tBl.value = 0;
      } else {
        tHt.value = 0; tTe.value = 0; tEyL.value = 1; tEyR.value = 1; tRoL.value = 0; tRoR.value = 0;
        tCl.value = isFocused.value === 'email' ? Math.min((emailLen.value / 20) * 8, 10) : 0;
        tBl.value = tCl.value / 10;
      }
    }
  }));

  useFrameCallback((frameInfo) => {
    const dt = frameInfo.timeSincePreviousFrame ? Math.min(frameInfo.timeSincePreviousFrame / 1000, 0.1) : 0.016;
    const time = frameInfo.timeSinceFirstFrame / 1000;
    cCl.value += (tCl.value - cCl.value) * 12 * dt;
    cRoL.value += (tRoL.value - cRoL.value) * 10 * dt;
    cRoR.value += (tRoR.value - cRoR.value) * 10 * dt;
    cEyL.value += (tEyL.value - cEyL.value) * 15 * dt;
    cEyR.value += (tEyR.value - cEyR.value) * 15 * dt;
    cHt.value += (tHt.value - cHt.value) * 12 * dt;
    cTe.value += (tTe.value - cTe.value) * 10 * dt;
    cBl.value += (tBl.value - cBl.value) * 10 * dt;
    const pulse = 1 + Math.sin(time * 2) * 0.02;
    cFly.value = Math.sin(time * 1.5) * -4 * pulse;
    cRt.value = (time * 0.4) % 2;
  });

  // Eye/blush/tear styles (safe on both platforms — plain Animated.View)
  const leftEyeStyle = useAnimatedStyle((): ViewStyle => ({
    transform: [{ scaleY: cEyL.value }],
  }));
  const rightEyeStyle = useAnimatedStyle((): ViewStyle => ({
    transform: [{ scaleY: cEyR.value }],
  }));
  const blushStyle = useAnimatedStyle((): ViewStyle => ({
    opacity: cBl.value * 0.4,
  }));
  const tearStyle = useAnimatedStyle((): ViewStyle => ({
    opacity: cTe.value > 0.1 ? cTe.value * 0.6 : 0,
  }));
  const heartStyle = useAnimatedStyle((): ViewStyle => ({
    opacity: Math.min(cHt.value * 0.9, 0.9),
    transform: [{ scale: Math.max(0.001, cHt.value * 1.2) }],
  }));
  const ripple1Style = useAnimatedStyle((): ViewStyle => ({
    transform: [{ scaleX: 1 + Math.sin(cRt.value * Math.PI) * 0.07 }],
    opacity: 0.05 + Math.sin(cRt.value * Math.PI) * 0.10,
  }));
  const ripple2Style = useAnimatedStyle((): ViewStyle => ({
    transform: [{ scaleX: 1 + Math.sin(cRt.value * Math.PI) * 0.07 }],
    opacity: (0.05 + Math.sin(cRt.value * Math.PI) * 0.10) * 0.5,
  }));

  // ── SWAN BODY PATHS (reused) ──
  const swanBodyPaths = (
    <>
      <Path d="M 75 130 C 85 130, 97 145, 97 155 C 97 165, 80 170, 60 170 C 30 170, 10 155, 15 140 C 15 125, 30 115, 45 120 C 50 120, 55 130, 55 130 Z" fill="#FFF" stroke="#F1F5F9" strokeWidth="0.5" />
      <Path d="M 25 145 C 35 135, 55 135, 65 150" stroke="#E2E8F0" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.8" />
      <Path d="M 30 155 C 45 145, 65 145, 75 160" stroke="#E2E8F0" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.6" />
      <Path d="M 60 130 C 38 110, 28 75, 42 52 C 50 33, 80 33, 90 49 C 94 58, 93 67, 86 72 L 83 75 C 75 58, 56 55, 52 75 C 48 95, 56 115, 75 130 Z" fill="#FFF" stroke="#F1F5F9" strokeWidth="0.5" />
      <G>
        <Path d="M 86 72 C 82 67, 78 67, 78 70 C 78 73, 81 74, 83 75 Z" fill="#111827" />
        <Path d="M 86 72 L 95 86 L 83 75 Z" fill={T.primary} />
      </G>
    </>
  );

  // Overlay helper for eye/blush/tear positioned absolutely
  const EyeOverlay = ({ style }: { style: any }) => (
    <Animated.View style={[{
      position: 'absolute', width: 1.4 * 2 * S, height: 1.4 * 2 * S,
      borderRadius: 1.4 * S, backgroundColor: '#111827',
    }, style]} />
  );
  const BlushOverlay = ({ style }: { style: any }) => (
    <Animated.View style={[{
      position: 'absolute', width: 4 * 2 * S, height: 2.5 * 2 * S,
      borderRadius: 4 * S, backgroundColor: T.primary,
    }, style]} />
  );

  /*
   * ANDROID: One single static SVG with both swans baked in.
   *          Animated.View overlays sit on TOP for eyes/blush/tear.
   *          No SVG inside any Animated.View = no Canvas crash.
   *
   * iOS:     We can freely animate SVGs since iOS doesn't have the Canvas issue.
   */

  return (
    <View style={styles.swanWrapper} pointerEvents="none">

      {/* ── SINGLE STATIC SVG — both swans + pool + heart path ── */}
      <Svg width={320} height={320} viewBox="0 0 200 200" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="rg" cx="50%" cy="100%" r="50%">
            <Stop offset="0%" stopColor={T.primary} stopOpacity="0.15" />
            <Stop offset="100%" stopColor={T.primary} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        {/* Pool glow */}
        <Ellipse cx="100" cy="160" rx="95" ry="28" fill="url(#rg)" />
        {/* Static ripples */}
        <Ellipse cx="100" cy="168" rx="80" ry="4" fill={T.primary} opacity="0.08" />
        <Ellipse cx="100" cy="170" rx="52" ry="2.5" fill={T.primary} opacity="0.04" />
        {/* Left Swan (at default position) */}
        <G>
          {swanBodyPaths}
        </G>
        {/* Right Swan (mirrored) */}
        <G transform="translate(200,0) scale(-1,1)">
          {swanBodyPaths}
        </G>
      </Svg>

      {/* ── ANIMATED OVERLAYS (no SVG inside, Android-safe) ── */}

      {/* Left Eye — positioned over left swan's eye location */}
      <EyeOverlay style={[{
        left: 80 * S - 1.4 * S, top: 58 * S - 1.4 * S,
      }, leftEyeStyle]} />

      {/* Left Blush */}
      <BlushOverlay style={[{
        left: 62 * S - 4 * S, top: 78 * S - 2.5 * S,
      }, blushStyle]} />

      {/* Left Tear */}
      <Animated.View style={[{
        position: 'absolute', left: 80 * S - 1, top: 62 * S,
        width: 3, height: 22, borderRadius: 2, backgroundColor: T.primary,
      }, tearStyle]} />

      {/* Right Eye — mirrored position: SVG mirror is translate(200,0) scale(-1,1)
           so SVG x=80 becomes screen x = (200-80) = 120 in SVG space */}
      <EyeOverlay style={[{
        left: (200 - 80) * S - 1.4 * S, top: 58 * S - 1.4 * S,
      }, rightEyeStyle]} />

      {/* Right Blush — mirrored: SVG x=62 becomes screen x = (200-62) = 138 */}
      <BlushOverlay style={[{
        left: (200 - 62) * S - 4 * S, top: 78 * S - 2.5 * S,
      }, blushStyle]} />

      {/* Heart — pure View, no SVG */}
      <Animated.View style={[{
        position: 'absolute', left: 100 * S - 25, top: 105 * S - 35,
        width: 50, height: 50, alignItems: 'center', justifyContent: 'center',
      }, heartStyle]}>
        <Text style={{ fontSize: 36, color: T.primary }}>❤️</Text>
      </Animated.View>

    </View>
  );
}));

// ─── Main Login ───────────────────────────────
export default function SoulLogin() {
  const router = useRouter();
  const { login, currentUser } = useApp();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'fail'>('idle');

  const swanRef = useRef<SwanRef>(null);
  const shakeAnim = useRef(new RNAnimated.Value(0)).current;
  const fadeCard = useRef(new RNAnimated.Value(0)).current;
  const slideCard = useRef(new RNAnimated.Value(40)).current;

  useEffect(() => { if (currentUser) router.replace('/(tabs)'); }, [currentUser]);

  useEffect(() => {
    RNAnimated.parallel([
      RNAnimated.timing(fadeCard, { toValue: 1, duration: 600, delay: 100, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      RNAnimated.timing(slideCard, { toValue: 0, duration: 500, delay: 100, easing: Easing.out(Easing.back(1.1)), useNativeDriver: true }),
    ]).start();
  }, []);

  const doShake = useCallback(() => {
    RNAnimated.sequence([
      RNAnimated.timing(shakeAnim, { toValue: -7, duration: 55, useNativeDriver: true }),
      RNAnimated.timing(shakeAnim, { toValue: 7, duration: 55, useNativeDriver: true }),
      RNAnimated.timing(shakeAnim, { toValue: -7, duration: 55, useNativeDriver: true }),
      RNAnimated.timing(shakeAnim, { toValue: 7, duration: 55, useNativeDriver: true }),
      RNAnimated.timing(shakeAnim, { toValue: 0, duration: 55, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleSubmit = useCallback(async () => {
    if (status === 'loading') return;
    const u = email.trim();
    const p = password.trim();
    if (!u || !p) {
      setStatus('fail'); swanRef.current?.setStatus('fail');
      doShake();
      setTimeout(() => { setStatus('idle'); swanRef.current?.setStatus('idle'); }, 1500);
      return;
    }
    setStatus('loading'); swanRef.current?.setStatus('loading');
    const success = await login(u, p);
    if (success) {
      setStatus('success'); swanRef.current?.setStatus('success');
      setTimeout(() => router.replace('/(tabs)'), 700);
    } else {
      setStatus('fail'); swanRef.current?.setStatus('fail');
      doShake();
      setTimeout(() => { setStatus('idle'); swanRef.current?.setStatus('idle'); }, 2500);
    }
  }, [status, email, password, login, doShake, router]);

  const btnBg = status === 'fail' ? '#B01030' : T.primary;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={T.bg} />
      <SafeAreaView style={styles.safe}>
        <View style={styles.content}>
          <CuteSwans ref={swanRef} />

          <RNAnimated.View style={[styles.card, { opacity: fadeCard, transform: [{ translateY: slideCard }] }]}>
            <View style={styles.header}>
              <Text style={styles.appName}>Soul</Text>
              <Text style={styles.subtitle}>Connect. Reflect. Belong.</Text>
            </View>

            <View style={styles.inputWrapper}>
              <View style={styles.iconBg}><Feather name="user" size={16} color={T.primary} /></View>
                <TextInput
                style={styles.input} value={email}
                placeholder="Soul ID" placeholderTextColor={T.textMuted}
                autoCapitalize="none" autoCorrect={false}
                onChangeText={(t) => { setEmail(t); swanRef.current?.setEmailLength(t.length); }}
                onFocus={() => swanRef.current?.setFocused('email')}
                onBlur={() => swanRef.current?.setFocused(null)}
              />
            </View>

            <View style={styles.inputWrapper}>
              <View style={styles.iconBg}><Feather name="lock" size={16} color={T.primary} /></View>
              <TextInput
                style={styles.input} value={password}
                placeholder="Password" placeholderTextColor={T.textMuted}
                secureTextEntry={!showPassword}
                autoCapitalize="none" autoCorrect={false}
                onChangeText={setPassword}
                onFocus={() => swanRef.current?.setFocused('password')}
                onBlur={() => swanRef.current?.setFocused(null)}
                onSubmitEditing={handleSubmit}
              />
              <TouchableOpacity
                onPress={() => {
                  const s = !showPassword; setShowPassword(s);
                  swanRef.current?.setShowPassword(s);
                }}
                style={styles.eyeBtn}
              >
                <Feather name={showPassword ? 'eye-off' : 'eye'} size={17} color={T.textMuted} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.forgotBtn}><Text style={styles.forgotText}>Forgot Password?</Text></TouchableOpacity>

            <RNAnimated.View style={{ transform: [{ translateX: shakeAnim }], marginTop: 8 }}>
              <TouchableOpacity style={[styles.button, { backgroundColor: btnBg }]} onPress={handleSubmit} disabled={status === 'loading'}>
                {status === 'loading' ? <ActivityIndicator color={T.white} /> : (
                  <View style={styles.btnRow}>
                    <Text style={styles.btnText}>{status === 'success' ? 'Welcome Back' : 'Sign In'}</Text>
                    <Feather name={status === 'success' ? 'heart' : 'arrow-right'} size={17} color={T.white} style={styles.btnIcon} />
                  </View>
                )}
              </TouchableOpacity>
            </RNAnimated.View>

            <View style={styles.divider}><View style={styles.divLine} /><Text style={styles.divText}>or</Text><View style={styles.divLine} /></View>
            <TouchableOpacity style={styles.createBtn}><Text style={styles.createText}>New here?{'  '}<Text style={styles.createHighlight}>Create Account</Text></Text></TouchableOpacity>
          </RNAnimated.View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  safe: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 24 },
  swanWrapper: { width: 320, height: 320, alignSelf: 'center', marginBottom: -88, zIndex: 2 },
  card: { width: '100%', maxWidth: 420, backgroundColor: T.card, borderRadius: 28, paddingHorizontal: 24, paddingTop: 104, paddingBottom: 28, borderWidth: 1, borderColor: T.border, shadowColor: T.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 18, elevation: 12, zIndex: 1 },
  header: { alignItems: 'center', marginBottom: 28 },
  logoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  logoDot: { width: 11, height: 11, borderRadius: 6 },
  appName: { fontSize: 30, color: T.white, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', letterSpacing: 2.5, marginBottom: 5 },
  subtitle: { color: T.textSub, fontSize: 12.5, fontWeight: '300', letterSpacing: 0.8 },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0D0406', borderWidth: 1, borderColor: T.border, borderRadius: 12, marginBottom: 12, paddingHorizontal: 12, height: 52 },
  iconBg: { width: 30, height: 30, borderRadius: 8, backgroundColor: T.iconBg, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  input: { flex: 1, color: T.white, fontSize: 15, fontWeight: '300' },
  eyeBtn: { padding: 5 },
  forgotBtn: { alignSelf: 'flex-end', marginBottom: 4, marginTop: -4 },
  forgotText: { color: T.primary, fontSize: 12 },
  button: { height: 52, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  btnRow: { flexDirection: 'row', alignItems: 'center' },
  btnText: { color: T.white, fontSize: 16, fontWeight: '600', letterSpacing: 0.5 },
  btnIcon: { marginHorizontal: 8 },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 20 },
  divLine: { flex: 1, height: 1, backgroundColor: T.border },
  divText: { color: T.textMuted, fontSize: 12, marginHorizontal: 12 },
  createBtn: { alignItems: 'center' },
  createText: { color: T.textMuted, fontSize: 13, fontWeight: '300' },
  createHighlight: { color: T.primary, fontWeight: '500' },
});
