/**
 * SoulSync — Login Screen
 * Design: Exact teddy bear couple from reference + dark theme
 * Auth:   Supabase email/password + Google Sign-In
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Animated,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import Svg, { Circle, Path, Ellipse, G, Line } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useApp } from '../context/AppContext';
import { authService } from '../services/AuthService';
import { GlassView } from '../components/ui/GlassView';

const { width: SCREEN_W } = Dimensions.get('window');

// ── Color Theme ──────────────────────────────────────────────────────
const STROKE = '#3A2B24';
const C = {
  bg:           '#000000',
  card:         'rgba(26, 26, 28, 0.40)',
  cardBorder:   'rgba(255, 255, 255, 0.10)',
  accent:       '#F08B8B',
  accentDark:   '#E56B85',
  input:        '#262628',
  inputBorder:  '#3A3A3C',
  inputFocus:   '#F08B8B',
  text:         '#FFFFFF',
  textMuted:    '#9CA3AF',
  textSub:      '#999999',
};

export default function LoginScreen() {
  const router = useRouter();
  const { login, setSession, currentUser } = useApp();

  const [email, setEmail]               = useState('');
  const [password, setPassword]         = useState('');
  const [isEmailFocused, setEmailFocus] = useState(false);
  const [isPassFocused, setPassFocus]   = useState(false);
  const [showPassword, setShowPwd]      = useState(false);
  const [status, setStatus]             = useState<'idle'|'loading'|'success'|'fail'>('idle');

  // ── Animated Values ──────────────────────────────────────────────
  const jumpY      = useRef(new Animated.Value(0)).current;
  const shakeX     = useRef(new Animated.Value(0)).current;
  const heartScale = useRef(new Animated.Value(0)).current;
  const heartFloat = useRef(new Animated.Value(0)).current;
  const boyBreathe = useRef(new Animated.Value(0)).current;
  const girlBreathe = useRef(new Animated.Value(0)).current;
  const floatY = useRef(new Animated.Value(0)).current;

  // Redirect if already logged in
  useEffect(() => {
    if (currentUser) router.replace('/(tabs)');
  }, [currentUser]);

  // Breathe loops
  useEffect(() => {
    const loop = (anim: Animated.Value, delay = 0) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: 1, duration: 2000, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0, duration: 2000, useNativeDriver: true }),
        ])
      ).start();
    loop(boyBreathe, 0);
    loop(girlBreathe, 600);

    // Smooth floating motion
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatY, { toValue: -8, duration: 2200, useNativeDriver: true }),
        Animated.timing(floatY, { toValue: 0,  duration: 2200, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // Status animations
  useEffect(() => {
    if (status === 'success') {
      Animated.sequence([
        Animated.timing(jumpY, { toValue: -18, duration: 220, useNativeDriver: true }),
        Animated.spring(jumpY, { toValue: 0, useNativeDriver: true, tension: 180, friction: 7 }),
      ]).start();
      Animated.spring(heartScale, { toValue: 1, tension: 220, friction: 5, useNativeDriver: true }).start();
      Animated.loop(
        Animated.sequence([
          Animated.timing(heartFloat, { toValue: -12, duration: 900, useNativeDriver: true }),
          Animated.timing(heartFloat, { toValue: 0,   duration: 900, useNativeDriver: true }),
        ])
      ).start();
      setTimeout(() => {
        Animated.timing(heartScale, { toValue: 0, duration: 200, useNativeDriver: true }).start();
        heartFloat.stopAnimation();
        heartFloat.setValue(0);
      }, 3000);
    } else if (status === 'fail') {
      Animated.sequence([
        Animated.timing(shakeX, { toValue: -9, duration: 80, useNativeDriver: true }),
        Animated.timing(shakeX, { toValue:  9, duration: 80, useNativeDriver: true }),
        Animated.timing(shakeX, { toValue: -6, duration: 80, useNativeDriver: true }),
        Animated.timing(shakeX, { toValue:  6, duration: 80, useNativeDriver: true }),
        Animated.timing(shakeX, { toValue:  0, duration: 80, useNativeDriver: true }),
      ]).start();
      const t = setTimeout(() => setStatus('idle'), 2000);
      return () => clearTimeout(t);
    }
  }, [status]);

  // ── Auth handlers ────────────────────────────────────────────────
  const handleLogin = async () => {
    if (status === 'loading') return;
    if (!email.trim() || !password.trim()) { setStatus('fail'); return; }
    setStatus('loading');
    const result = await authService.signInWithPassword(email, password);
    if (result.success && result.user) {
      await setSession(result.user.id);
      setStatus('success');
      setTimeout(() => router.replace('/(tabs)'), 1500);
    } else {
      setStatus('fail');
    }
  };

  const handleGoogleSignIn = async () => {
    if (status === 'loading') return;
    setStatus('loading');
    const result = await authService.signInWithGoogle();
    if (result.success) {
      setStatus('success');
      if (result.isNewUser) setTimeout(() => router.push('/username-setup'), 1000);
      else setTimeout(() => router.replace('/(tabs)'), 1000);
    } else {
      setStatus('fail');
    }
  };

  // ── Eye tracking ─────────────────────────────────────────────────
  const trackLen = isEmailFocused ? email.length
    : (isPassFocused && showPassword ? password.length : 0);

  const eyeXOffset = (isEmailFocused || (isPassFocused && showPassword))
    ? (Math.min(trackLen / 25, 1) * 6) - 3 : 0;
  const eyeYOffset = status === 'fail' ? 3
    : (isEmailFocused || (isPassFocused && showPassword)) ? 2 : 0;

  // ── SVG path helpers (exact from reference) ───────────────────────
  const headPath = (cx: number, cy: number) =>
    `M ${cx} ${cy-50} C ${cx+45} ${cy-50},${cx+72} ${cy-20},${cx+72} ${cy+15} C ${cx+72} ${cy+55},${cx+40} ${cy+65},${cx} ${cy+65} C ${cx-40} ${cy+65},${cx-72} ${cy+55},${cx-72} ${cy+15} C ${cx-72} ${cy-20},${cx-45} ${cy-50},${cx} ${cy-50} Z`;

  // Body starts wider (cx±40) to overlap with head bottom — no visible neck gap
  const bodyPath = (cx: number, cy: number) =>
    `M ${cx-40} ${cy+30} C ${cx-55} ${cy+80},${cx-50} ${cy+165},${cx-35} ${cy+175} L ${cx-2} ${cy+175} C ${cx} ${cy+165},${cx} ${cy+165},${cx+2} ${cy+175} L ${cx+35} ${cy+175} C ${cx+50} ${cy+165},${cx+55} ${cy+80},${cx+40} ${cy+30} Z`;

  const leftArm  = `M 16 0 C 24 30,22 65,10 85 A 18 18 0 0 1 -26 75 C -24 40,-20 20,-16 0`;
  const rightArm = `M -16 0 C -24 30,-22 65,-10 85 A 18 18 0 0 0 26 75 C 24 40,20 20,16 0`;

  // ── Mouth renderer (exact from reference) ─────────────────────────
  const renderMouth = (cx: number, cy: number) => {
    const mY = cy + 18;
    if (status === 'fail') {
      return <Path d={`M ${cx-8} ${mY+6} Q ${cx} ${mY} ${cx+8} ${mY+6}`} fill="none" stroke={STROKE} strokeWidth="4" strokeLinecap="round" />;
    }
    if (isPassFocused && !showPassword) {
      return <Path d={`M ${cx-4} ${mY} Q ${cx} ${mY+2} ${cx+4} ${mY}`} fill="none" stroke={STROKE} strokeWidth="4" strokeLinecap="round" />;
    }
    let h = status === 'success' ? 16 : 12;
    if (isEmailFocused || (isPassFocused && showPassword)) {
      h = 6 + (trackLen % 3) * 3;
    }
    return (
      <G>
        <Path d={`M ${cx-7} ${mY} Q ${cx} ${mY+2} ${cx+7} ${mY} C ${cx+7} ${mY+h},${cx-7} ${mY+h},${cx-7} ${mY} Z`} fill={STROKE} stroke={STROKE} strokeWidth="3" strokeLinejoin="round" />
        <Path d={`M ${cx-4} ${mY+h*0.3} C ${cx-4} ${mY+h*0.8},${cx+4} ${mY+h*0.8},${cx+4} ${mY+h*0.3} Z`} fill="#FF94A8" />
      </G>
    );
  };

  // ── Bear configs (exact from reference) ───────────────────────────
  const bears = [
    { id: 'boy',  cx: 120, cy: 90, color: '#FFFFFF', snout: '#FFF0F5', cheek: '#FFCAD6', peekArm: 'right' },
    { id: 'girl', cx: 280, cy: 90, color: '#D69E71', snout: '#F0C4A5', cheek: '#F08B8B', peekArm: 'left'  },
  ];

  const covering = isPassFocused && !showPassword;
  const peeking  = isPassFocused && showPassword;

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.kav}>

        {/* ── Bears SVG ─────────────────────────────────────── */}
        <Animated.View style={[s.bearsWrap, { transform: [{ translateY: Animated.add(jumpY, floatY) }, { translateX: shakeX }] }]}>
          <Svg width="400" height="240" viewBox="0 0 400 300">
            {bears.map(({ id, cx, cy, color, snout, cheek, peekArm }) => {
              const lAngle = (covering || (peeking && peekArm !== 'left'))  ? -170 : 15;
              const rAngle = (covering || (peeking && peekArm !== 'right')) ?  170 : -15;

              return (
                <G key={id}>
                  {/* Body */}
                  <Path d={bodyPath(cx, cy)} fill={color} stroke={STROKE} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
                  {/* Toe lines */}
                  {[-24, -14, 14, 24].map(x => (
                    <Line key={x} x1={cx+x} y1={cy+175} x2={cx+x} y2={cy+165} stroke={STROKE} strokeWidth="3" strokeLinecap="round" />
                  ))}

                  {/* Ears */}
                  <Circle cx={cx-48} cy={cy-38} r="18" fill={color} stroke={STROKE} strokeWidth="5" />
                  <Circle cx={cx+48} cy={cy-38} r="18" fill={color} stroke={STROKE} strokeWidth="5" />

                  {/* Head */}
                  <Path d={headPath(cx, cy)} fill={color} stroke={STROKE} strokeWidth="5" strokeLinejoin="round" />

                  {/* Snout */}
                  <Ellipse cx={cx} cy={cy+19} rx="22" ry="16" fill={snout} />

                  {/* Cheeks */}
                  <Ellipse cx={cx-42} cy={cy+16} rx="12" ry="9" fill={cheek} opacity="0.55" />
                  <Ellipse cx={cx+42} cy={cy+16} rx="12" ry="9" fill={cheek} opacity="0.55" />

                  {/* Eyes */}
                  {status === 'success' ? (
                    <G>
                      <Path d={`M ${cx-32} ${cy+7} Q ${cx-24} ${cy-2} ${cx-16} ${cy+7}`} stroke={STROKE} strokeWidth="5" strokeLinecap="round" fill="transparent" />
                      <Path d={`M ${cx+16} ${cy+7} Q ${cx+24} ${cy-2} ${cx+32} ${cy+7}`} stroke={STROKE} strokeWidth="5" strokeLinecap="round" fill="transparent" />
                    </G>
                  ) : (
                    <G>
                      <Circle cx={cx-24+eyeXOffset} cy={cy+5+eyeYOffset} r="6.5" fill={STROKE} />
                      <Circle cx={cx-21.5+eyeXOffset} cy={cy+2.5+eyeYOffset} r="2" fill="#fff" />
                      <Circle cx={cx+24+eyeXOffset} cy={cy+5+eyeYOffset} r="6.5" fill={STROKE} />
                      <Circle cx={cx+26.5+eyeXOffset} cy={cy+2.5+eyeYOffset} r="2" fill="#fff" />
                    </G>
                  )}

                  {/* Nose */}
                  <Path d={`M ${cx-2} ${cy+11} Q ${cx} ${cy+13} ${cx+2} ${cy+11} Z`} fill={STROKE} stroke={STROKE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

                  {/* Mouth */}
                  {renderMouth(cx, cy)}

                  {/* Left arm */}
                  <G transform={`rotate(${lAngle}, ${cx-36}, ${cy+82})`}>
                    <G transform={`translate(${cx-36}, ${cy+82})`}>
                      <Path d={leftArm} fill={color} stroke={STROKE} strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" />
                      <Path d="M -12 76 L -14 86" fill="none" stroke={STROKE} strokeWidth="3" strokeLinecap="round" />
                      <Path d="M 0 78 L -2 89"   fill="none" stroke={STROKE} strokeWidth="3" strokeLinecap="round" />
                    </G>
                  </G>

                  {/* Right arm */}
                  <G transform={`rotate(${rAngle}, ${cx+36}, ${cy+82})`}>
                    <G transform={`translate(${cx+36}, ${cy+82})`}>
                      <Path d={rightArm} fill={color} stroke={STROKE} strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" />
                      <Path d="M 12 76 L 14 86" fill="none" stroke={STROKE} strokeWidth="3" strokeLinecap="round" />
                      <Path d="M 0 78 L 2 89"   fill="none" stroke={STROKE} strokeWidth="3" strokeLinecap="round" />
                    </G>
                  </G>
                </G>
              );
            })}


          </Svg>
        </Animated.View>

        {/* ── Form Card ─────────────────────────────────────────── */}
        <View style={s.card}>
          {/* Blur backdrop */}
          <GlassView intensity={Platform.OS === 'ios' ? 80 : 60} tint="dark" style={StyleSheet.absoluteFill} />

          <Text style={s.title}>Soul</Text>
          <Text style={s.subtitle}>Soul for Soulmates</Text>

          {/* Soul ID */}
          <View style={[s.inputWrap, isEmailFocused && s.inputWrapFocused]}>
            <Feather name="user" size={20} color={isEmailFocused ? C.accent : '#666'} style={s.inputIcon} />
            <TextInput
              style={s.input}
              placeholder="Soul Id"
              placeholderTextColor="#666"
              value={email}
              onChangeText={setEmail}
              onFocus={() => setEmailFocus(true)}
              onBlur={() => setEmailFocus(false)}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {/* Password */}
          <View style={[s.inputWrap, isPassFocused && s.inputWrapFocused, { marginBottom: 28 }]}>
            <Feather name="lock" size={20} color={isPassFocused ? C.accent : '#666'} style={s.inputIcon} />
            <TextInput
              style={[s.input, { flex: 1 }]}
              placeholder="Secret Password"
              placeholderTextColor="#666"
              value={password}
              onChangeText={setPassword}
              onFocus={() => setPassFocus(true)}
              onBlur={() => setPassFocus(false)}
              secureTextEntry={!showPassword}
            />
            <TouchableOpacity onPress={() => setShowPwd(p => !p)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Feather name={showPassword ? 'eye' : 'eye-off'} size={20} color="#666" />
            </TouchableOpacity>
          </View>

          {/* Login */}
          <TouchableOpacity style={s.btn} onPress={handleLogin} activeOpacity={0.82} disabled={status === 'loading'}>
            {status === 'loading' ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.btnText}>
                {status === 'success' ? 'Hearts Synced ♥' : 'Hearts Sync Karein'}
              </Text>
            )}
          </TouchableOpacity>

          {/* Divider */}
          <View style={s.divider}>
            <View style={s.dividerLine} />
            <Text style={s.dividerText}>or</Text>
            <View style={s.dividerLine} />
          </View>

          {/* Google */}
          <TouchableOpacity style={s.googleBtn} onPress={handleGoogleSignIn} activeOpacity={0.82} disabled={status === 'loading'}>
            <Text style={s.googleIcon}>G</Text>
            <Text style={s.googleText}>Continue with Google</Text>
          </TouchableOpacity>

          {/* Footer */}
          <View style={s.footer}>
            <TouchableOpacity onPress={() => router.push('/forgot-password')}>
              <Text style={s.footerMuted}>Forget Password?</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/signup')}>
              <Text style={s.footerAccent}>Create Soul Id</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  kav: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  bearsWrap: {
    width: 400,
    height: 170,
    alignItems: 'center',
    marginBottom: -50,
    zIndex: 0,
  },
  card: {
    width: '100%',
    backgroundColor: C.card,
    borderRadius: 40,
    paddingHorizontal: 28,
    paddingTop: 44,
    paddingBottom: 32,
    borderWidth: 1,
    borderColor: C.cardBorder,
    overflow: 'hidden',
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.5,
    shadowRadius: 28,
    elevation: 14,
  },
  cardGlow: {
    position: 'absolute',
    top: -50,
    alignSelf: 'center',
    width: '100%',
    height: 120,
    backgroundColor: C.accent,
    opacity: 0.2,
    borderRadius: 60,
  },
  title: {
    fontSize: 38,
    fontWeight: '900',
    color: C.accent,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 26,
    fontWeight: '500',
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.input,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.inputBorder,
    paddingHorizontal: 16,
    height: 56,
    marginBottom: 14,
  },
  inputWrapFocused: {
    borderColor: C.inputFocus,
    backgroundColor: '#2A2A2C',
  },
  iconText: { fontSize: 15, marginRight: 10, opacity: 0.45 },
  iconFocused: { opacity: 1 },
  inputIcon: { marginRight: 12 },
  input: {
    flex: 1,
    color: C.text,
    fontSize: 15,
    fontWeight: '500',
    paddingVertical: 0,
  },
  eyeIcon: { fontSize: 16, marginLeft: 6 },
  btn: {
    backgroundColor: C.accent,
    borderRadius: 16,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  btnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 18,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.08)' },
  dividerText: { color: C.textMuted, fontSize: 13, paddingHorizontal: 12 },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    height: 56,
    gap: 10,
  },
  googleIcon: { fontSize: 18, fontWeight: '800', color: '#4285F4' },
  googleText: { color: C.text, fontSize: 15, fontWeight: '500' },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 22,
  },
  footerMuted: { color: C.textMuted, fontSize: 13, fontWeight: '700' },
  footerAccent: { color: C.accent, fontSize: 13, fontWeight: '700' },
});
