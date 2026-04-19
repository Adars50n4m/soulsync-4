/**
 * Soul — Login Screen
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
  LayoutAnimation,
  UIManager,
} from 'react-native';
import Svg, { Circle, Path, Ellipse, G } from 'react-native-svg';
import { Feather, MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useApp } from '../context/AppContext';
import { authService } from '../services/AuthService';
import { GlassView } from '../components/ui/GlassView';

// Enable LayoutAnimation for Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ── Color Theme ──────────────────────────────────────────────────────
const STROKE = '#3A2B24';
const C = {
  bg:           '#000000',
  card:         'rgba(26, 26, 28, 0.40)',
  cardBorder:   'rgba(255, 255, 255, 0.10)',
  accent:       '#BC002A',
  accentDark:   '#9B0022',
  input:        '#222224',
  inputBorder:  '#3A3A3C',
  inputFocus:   '#BC002A',
  text:         '#FFFFFF',
  textMuted:    '#9CA3AF',
  textSub:      '#999999',
};

export default function LoginScreen() {
  const router = useRouter();
  const { setSession, currentUser, activeTheme } = useApp();
  
  // Dynamic theme colors
  const themeAccent = activeTheme.primary;

  // ── Core Auth State ───────────────────────────────────────────
  const [email, setEmail]               = useState('');
  const [password, setPassword]         = useState('');
  const [showPassword, setShowPwd]      = useState(false);
  const [isEmailFocused, setEmailFocus] = useState(false);
  const [isPassFocused, setPassFocus]   = useState(false);
  const [status, setStatus]             = useState<'idle' | 'loading' | 'success' | 'fail'>('idle');

  // ── Integrated Signup State ─────────────────────────────────────
  const [isLogin, setIsLogin]           = useState(true);
  const [username, setUsername]         = useState('');
  const [confirmPassword, setConfirm]   = useState('');
  const [showConfirm, setShowConfirm]   = useState(false);
  const [isUsernameFocused, setUserFocus] = useState(false);
  const [isConfirmFocused, setConfFocus] = useState(false);
  const [isRealEmailFocused, setRealEmailFocus] = useState(false); // For signup email field
  const [emailSignup, setEmailSignup]   = useState('');
  const [usernameState, setUsernameState] = useState<'idle'|'checking'|'available'|'taken'|'invalid'>('idle');
  const [usernameMessage, setUsernameMessage] = useState('');
  const [error, setError]               = useState('');

  // ── Multi-Step Signup State ─────────────────────────────────────
  const [signupStep, setSignupStep]     = useState<'email' | 'otp' | 'setup'>('email');
  const [otp, setOtp]                   = useState('');
  const [isOtpFocused, setOtpFocus]     = useState(false);

  // ── Forgot Password State ──────────────────────────────────────
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [isResetSuccess, setIsResetSuccess]     = useState(false);
  
  const isAnyFocused = isEmailFocused || isPassFocused || isUsernameFocused || isConfirmFocused || isRealEmailFocused || isOtpFocused;

  const toggleMode = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsLogin(!isLogin);
    setIsForgotPassword(false);
    setIsResetSuccess(false);
    setSignupStep('email');
    setError('');
    setStatus('idle');
  };

  const toggleForgotPassword = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsForgotPassword(!isForgotPassword);
    setIsResetSuccess(false);
    setError('');
    setStatus('idle');
  };

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
    if (currentUser) {
      router.replace('/(tabs)');
    }
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

  // ── Username Availability Check ──────────────────────────────
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isLogin) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!username) {
      setUsernameState('idle');
      setUsernameMessage('');
      return;
    }

    setUsernameState('checking');
    debounceRef.current = setTimeout(async () => {
      const result = await authService.checkUsernameAvailability(username);
      if (result.error) {
        setUsernameState('invalid');
        setUsernameMessage(result.error);
      } else if (result.available) {
        setUsernameState('available');
        setUsernameMessage('@' + username.toLowerCase() + ' is available!');
      } else {
        setUsernameState('taken');
        setUsernameMessage('This username is already taken.');
      }
    }, 600);
  }, [username, isLogin]);

  // ── Auth handlers ────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (status === 'loading') return;
    setError('');

    if (isLogin) {
      if (isForgotPassword) {
        if (!email.trim()) { setError('Email or Soul Id is required'); setStatus('fail'); return; }
        setStatus('loading');
        const res = await authService.sendPasswordResetEmail(email);
        if (res.success) {
          setIsResetSuccess(true);
          setStatus('idle');
        } else {
          setError(res.error || 'Failed to send reset link');
          setStatus('fail');
        }
        return;
      }

      if (!email.trim() || !password.trim()) { setStatus('fail'); return; }
      setStatus('loading');
      const result = await authService.signInWithPassword(email, password);
      if (result.success && result.user) {
        await setSession(result.user.id);
        setStatus('success');
        setTimeout(() => router.replace('/(tabs)'), 1500);
      } else {
        setError(result.error || 'Login failed');
        setStatus('fail');
      }
    } else {
      if (signupStep === 'email') {
        if (!emailSignup.trim()) { setError('Email is required'); setStatus('fail'); return; }
        setStatus('loading');
        const res = await authService.sendOTP(emailSignup);
        if (res.success) {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setSignupStep('otp');
          setStatus('idle');
        } else {
          setError(res.error || 'Failed to send OTP');
          setStatus('fail');
        }
      } 
      else if (signupStep === 'otp') {
        if (otp.length < 6) { setError('Enter 6-digit code'); setStatus('fail'); return; }
        setStatus('loading');
        const res = await authService.verifyOTP(emailSignup, otp);
        if (res.success) {
          if (res.isNewUser) {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setSignupStep('setup');
            setStatus('idle');
          } else {
            setStatus('success');
            setTimeout(() => router.replace('/(tabs)'), 1500);
          }
        } else {
          setError(res.error || 'Verification failed');
          setStatus('fail');
        }
      }
      else if (signupStep === 'setup') {
        if (!username || usernameState !== 'available') { setError('Choose a valid username'); setStatus('fail'); return; }
        if (password.length < 8) { setError('Password too short (8+)'); setStatus('fail'); return; }
        if (password !== confirmPassword) { setError('Passwords do not match'); setStatus('fail'); return; }

        setStatus('loading');
        const res = await authService.completeProfileSetup({
          username,
          password,
          displayName: username,
        });

        if (res.success) {
          setStatus('success');
          setTimeout(() => router.replace('/(tabs)'), 1500);
        } else {
          setError(res.error || 'Setup failed');
          setStatus('fail');
        }
      }
    }
  };

  const handleGoogleSignIn = async () => {
    if (status === 'loading') return;
    setStatus('loading');
    const result = await authService.signInWithGoogle();
    if (result.success) {
      setStatus('success');
      if (result.isNewUser) {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setIsLogin(false);
        setSignupStep('setup');
        setStatus('idle');
      }
      else setTimeout(() => router.replace('/(tabs)'), 1000);
    } else {
      setError(result.error || 'Google Sign-In failed');
      setStatus('fail');
    }
  };

  const trackLen = isEmailFocused ? email.length : (isPassFocused && showPassword ? password.length : 0);
  const eyeXOffset = (isEmailFocused || (isPassFocused && showPassword)) ? (Math.min(trackLen / 25, 1) * 6) - 3 : 0;
  const eyeYOffset = status === 'fail' ? 3 : (isEmailFocused || (isPassFocused && showPassword)) ? 2 : 0;
  const headXOffset = (isEmailFocused || (isPassFocused && showPassword)) ? (Math.min(trackLen / 25, 1) * 10) - 5 : 0;

  const headPath = (cx: number, cy: number) => `M ${cx} ${cy-50} C ${cx+45} ${cy-50},${cx+72} ${cy-20},${cx+72} ${cy+15} C ${cx+72} ${cy+55},${cx+40} ${cy+65},${cx} ${cy+65} C ${cx-40} ${cy+65},${cx-72} ${cy+55},${cx-72} ${cy+15} C ${cx-72} ${cy-20},${cx-45} ${cy-50},${cx} ${cy-50} Z`;

  const renderMouth = (cx: number, cy: number) => {
    const mY = cy + 18;
    if (status === 'fail') return <Path d={`M ${cx-8} ${mY+6} Q ${cx} ${mY} ${cx+8} ${mY+6}`} fill="none" stroke={STROKE} strokeWidth="4" strokeLinecap="round" />;
    if (isPassFocused && !showPassword) return <Path d={`M ${cx-4} ${mY} Q ${cx} ${mY+2} ${cx+4} ${mY}`} fill="none" stroke={STROKE} strokeWidth="4" strokeLinecap="round" />;
    let h = status === 'success' ? 16 : 12;
    if (isEmailFocused || (isPassFocused && showPassword)) h = 6 + (trackLen % 3) * 3;
    return (
      <G>
        <Path d={`M ${cx-7} ${mY} Q ${cx} ${mY+2} ${cx+7} ${mY} C ${cx+7} ${mY+h},${cx-7} ${mY+h},${cx-7} ${mY} Z`} fill={STROKE} stroke={STROKE} strokeWidth="3" strokeLinejoin="round" />
        <Path d={`M ${cx-4} ${mY+h*0.3} C ${cx-4} ${mY+h*0.8},${cx+4} ${mY+h*0.8},${cx+4} ${mY+h*0.3} Z`} fill="#FF94A8" />
      </G>
    );
  };

  const bears = [
    { id: 'boy',  cx: 145, cy: 90, color: '#FFFFFF', snout: '#FFF0F5', cheek: '#FFCAD6', peekArm: 'right' },
    { id: 'girl', cx: 255, cy: 90, color: '#D69E71', snout: '#F0C4A5', cheek: '#F08B8B', peekArm: 'left'  },
  ];

  const covering = isPassFocused && !showPassword;
  const peeking  = isPassFocused && showPassword;

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        style={[s.kav, isAnyFocused && { paddingTop: Platform.OS === 'ios' ? 120 : 140 }, { backgroundColor: activeTheme.background }]}
      >
        <Animated.View style={[s.bearsWrap, { transform: [{ translateY: Animated.add(jumpY, floatY) }, { translateX: shakeX }] }]}>
          <Svg width="400" height="240" viewBox="0 0 400 300">
            {bears.map(({ id, cx, cy, color, snout, cheek, peekArm }) => {
              const lAngle = (covering || (peeking && peekArm !== 'left'))  ? -170 : 15;
              const rAngle = (covering || (peeking && peekArm !== 'right')) ?  170 : -15;
              return (
                <G key={id}>
                  <Ellipse cx={cx-24} cy={cy+132} rx="12" ry="8" fill={color} stroke={STROKE} strokeWidth="5" />
                  <Ellipse cx={cx+24} cy={cy+132} rx="12" ry="8" fill={color} stroke={STROKE} strokeWidth="5" />
                  <Path d={`M ${cx-34} ${cy+25} C ${cx-65} ${cy+60},${cx-60} ${cy+135},${cx} ${cy+135} C ${cx+60} ${cy+135},${cx+65} ${cy+60},${cx+34} ${cy+25} Z`} fill={color} stroke={STROKE} strokeWidth="5" />
                  <G translateX={headXOffset}>
                    <Circle cx={cx-48} cy={cy-38} r="18" fill={color} stroke={STROKE} strokeWidth="5" />
                    <Circle cx={cx+48} cy={cy-38} r="18" fill={color} stroke={STROKE} strokeWidth="5" />
                    <Path d={headPath(cx, cy)} fill={color} stroke={STROKE} strokeWidth="5" />
                    <Ellipse cx={cx} cy={cy+19} rx="22" ry="16" fill={snout} />
                    <Ellipse cx={cx-42} cy={cy+16} rx="12" ry="9" fill={cheek} opacity="0.55" />
                    <Ellipse cx={cx+42} cy={cy+16} rx="12" ry="9" fill={cheek} opacity="0.55" />
                    <Circle cx={cx-24+eyeXOffset} cy={cy+5+eyeYOffset} r="6.5" fill={STROKE} />
                    <Circle cx={cx+24+eyeXOffset} cy={cy+5+eyeYOffset} r="6.5" fill={STROKE} />
                    <Path d={`M ${cx-2} ${cy+11} Q ${cx} ${cy+13} ${cx+2} ${cy+11} Z`} fill={STROKE} stroke={STROKE} strokeWidth="2" />
                    {renderMouth(cx, cy)}
                  </G>
                  <G transform={`rotate(${lAngle}, ${cx-40}, ${cy+60}) translate(${cx-40}, ${cy+60})`}>
                    <Path d={covering ? `M 14 0 C 22 30,20 65,10 80 A 15 15 0 0 1 -24 70 C -22 35,-20 20,-16 0` : `M 12 0 C 18 15,16 35,8 45 A 12 12 0 0 1 -18 38 C -16 20,-14 10,-10 0`} fill={color} stroke={STROKE} strokeWidth="5" />
                  </G>
                  <G transform={`rotate(${rAngle}, ${cx+40}, ${cy+60}) translate(${cx+40}, ${cy+60})`}>
                    <Path d={covering ? `M -14 0 C -22 30,-20 65,-10 80 A 15 15 0 0 0 24 70 C 22 35,20 20,16 0` : `M -12 0 C -18 15,-16 35,-8 45 A 12 12 0 0 0 18 38 C 16 20,14 10,10 0`} fill={color} stroke={STROKE} strokeWidth="5" />
                  </G>
                </G>
              );
            })}
          </Svg>
        </Animated.View>

        <View style={s.card}>
          <GlassView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
          <Text style={[s.title, { color: themeAccent }]}>
            {isForgotPassword ? 'Reset Soul' : (isLogin ? 'Soul' : (signupStep === 'otp' ? 'Verify Email' : (signupStep === 'setup' ? 'Setup Account' : 'Create Soul Id')))}
          </Text>
          <Text style={s.subtitle}>
            {isForgotPassword ? (isResetSuccess ? "Recovery link sent!" : "Enter email to recover") : (isLogin ? 'Soul for Soulmates' : (signupStep === 'otp' ? 'Check email for code' : 'Set your unique identity'))}
          </Text>

          {!!error && <Text style={s.err}>{error}</Text>}

          {isLogin ? (
            <>
              {!isResetSuccess && (
                <View style={[s.inputWrap, isEmailFocused && { borderColor: themeAccent }]}>
                  <Feather name={isForgotPassword ? "mail" : "user"} size={20} color={isEmailFocused ? themeAccent : '#666'} style={s.inputIcon} />
                  <TextInput style={s.input} placeholder={isForgotPassword ? "Email or Soul Id" : "Soul Id or Email"} placeholderTextColor="#666" value={email} onChangeText={setEmail} onFocus={() => setEmailFocus(true)} onBlur={() => setEmailFocus(false)} autoCapitalize="none" />
                </View>
              )}
              {!isForgotPassword && (
                <View style={[s.inputWrap, isPassFocused && { borderColor: themeAccent }, { marginBottom: 28 }]}>
                  <Feather name="lock" size={20} color={isPassFocused ? themeAccent : '#666'} style={s.inputIcon} />
                  <TextInput style={s.input} placeholder="Secret Password" placeholderTextColor="#666" value={password} onChangeText={setPassword} onFocus={() => setPassFocus(true)} onBlur={() => setPassFocus(false)} secureTextEntry={!showPassword} />
                  <TouchableOpacity onPress={() => setShowPwd(p => !p)}><Feather name={showPassword ? 'eye' : 'eye-off'} size={20} color={isPassFocused ? themeAccent : "#666"} /></TouchableOpacity>
                </View>
              )}
            </>
          ) : (
            <>
              {signupStep === 'email' && (
                <View style={[s.inputWrap, isRealEmailFocused && { borderColor: themeAccent }, { marginBottom: 20 }]}>
                  <Feather name="mail" size={20} color={isRealEmailFocused ? themeAccent : '#666'} style={s.inputIcon} />
                  <TextInput style={s.input} placeholder="Email" placeholderTextColor="#666" value={emailSignup} onChangeText={setEmailSignup} onFocus={() => setRealEmailFocus(true)} onBlur={() => setRealEmailFocus(false)} autoCapitalize="none" keyboardType="email-address" />
                </View>
              )}
              {signupStep === 'otp' && (
                <View style={[s.inputWrap, isOtpFocused && { borderColor: themeAccent }, { marginBottom: 20 }]}>
                  <Feather name="shield" size={20} color={isOtpFocused ? themeAccent : '#666'} style={s.inputIcon} />
                  <TextInput style={[s.input, { letterSpacing: 8 }]} placeholder="◯ ◯ ◯ ◯ ◯ ◯" placeholderTextColor="#444" value={otp} onChangeText={(v) => setOtp(v.replace(/[^0-9]/g, ''))} onFocus={() => setOtpFocus(true)} onBlur={() => setOtpFocus(false)} keyboardType="number-pad" maxLength={6} />
                </View>
              )}
              {signupStep === 'setup' && (
                <>
                  <View style={[s.inputWrap, isUsernameFocused && { borderColor: themeAccent }]}>
                    <Feather name="at-sign" size={20} color={isUsernameFocused ? themeAccent : '#666'} style={s.inputIcon} />
                    <TextInput style={s.input} placeholder="Username" placeholderTextColor="#666" value={username} onChangeText={setUsername} onFocus={() => setUserFocus(true)} onBlur={() => setUserFocus(false)} autoCapitalize="none" />
                  </View>
                  <View style={[s.inputWrap, isPassFocused && { borderColor: themeAccent }]}>
                    <Feather name="lock" size={20} color={isPassFocused ? themeAccent : '#666'} style={s.inputIcon} />
                    <TextInput style={s.input} placeholder="Password" placeholderTextColor="#666" value={password} onChangeText={setPassword} onFocus={() => setPassFocus(true)} onBlur={() => setPassFocus(false)} secureTextEntry={!showPassword} />
                  </View>
                  <View style={[s.inputWrap, isConfirmFocused && { borderColor: themeAccent }, { marginBottom: 28 }]}>
                    <Feather name="shield" size={20} color={isConfirmFocused ? themeAccent : '#666'} style={s.inputIcon} />
                    <TextInput style={s.input} placeholder="Confirm" placeholderTextColor="#666" value={confirmPassword} onChangeText={setConfirm} onFocus={() => setConfFocus(true)} onBlur={() => setConfFocus(false)} secureTextEntry={!showConfirm} />
                  </View>
                </>
              )}
            </>
          )}

          <TouchableOpacity style={[s.btn, { backgroundColor: themeAccent }]} onPress={isResetSuccess ? toggleForgotPassword : handleSubmit} disabled={status === 'loading'}>
            {status === 'loading' ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>{isLogin ? (isForgotPassword ? 'Reset' : 'Login') : 'Next'}</Text>}
          </TouchableOpacity>

          <View style={s.footer}>
            <TouchableOpacity onPress={toggleMode}><Text style={[s.footerAccent, { color: themeAccent }]}>{isLogin ? 'Create Soul Id' : 'Login'}</Text></TouchableOpacity>
            {!isLogin && signupStep === 'email' && <TouchableOpacity onPress={toggleForgotPassword}><Text style={s.footerMuted}>Forgot?</Text></TouchableOpacity>}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#000' },
  kav: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22 },
  bearsWrap: { width: 400, height: 170, alignItems: 'center', marginBottom: -50 },
  card: { width: '100%', backgroundColor: 'rgba(26, 26, 28, 0.4)', borderRadius: 40, padding: 28, overflow: 'hidden' },
  title: { fontSize: 38, fontWeight: '900', textAlign: 'center' },
  subtitle: { fontSize: 13, color: 'rgba(255,255,255,0.7)', textAlign: 'center', marginBottom: 26 },
  err: { color: '#FF6B6B', textAlign: 'center', marginBottom: 12 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#222', borderRadius: 16, borderWidth: 1, borderColor: '#333', paddingHorizontal: 16, height: 56, marginBottom: 14 },
  inputIcon: { marginRight: 12 },
  input: { flex: 1, color: '#fff', fontSize: 15 },
  btn: { borderRadius: 16, height: 56, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  footer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 22 },
  footerMuted: { color: '#9CA3AF', fontSize: 13 },
  footerAccent: { fontSize: 13, fontWeight: '700' },
});
