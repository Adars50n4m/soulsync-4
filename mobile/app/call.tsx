import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    View, Text, Image, Pressable, StyleSheet, StatusBar,
    useWindowDimensions, Platform, Alert, AppState
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Audio as ExpoAudio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useNavigation } from 'expo-router';
import GlassView from '../components/ui/GlassView';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import ExpoPip from 'expo-pip';

import { useApp } from '../context/AppContext';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withTiming,
    Easing,
    withSpring,
    runOnJS,
    interpolate
} from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useKeepAwake } from 'expo-keep-awake';
import { SoulAvatar } from '../components/SoulAvatar';
import { normalizeId } from '../utils/idNormalization';

// Load video renderers separately
const getVideoRenderModules = () => {
    try {
        const RTCViewModule = require('react-native-webrtc/lib/commonjs/RTCView');
        const RTCPIPViewModule = require('react-native-webrtc/lib/commonjs/RTCPIPView');
        return {
            RTCView: RTCViewModule.default,
            RTCPIPView: RTCPIPViewModule.default,
            startIOSPIP: RTCPIPViewModule.startIOSPIP,
            stopIOSPIP: RTCPIPViewModule.stopIOSPIP,
        };
    } catch (e: any) {
        console.log('[CallScreen] RTC video renderer not available:', e?.message || 'unknown');
        return { RTCView: null, RTCPIPView: null, startIOSPIP: null, stopIOSPIP: null };
    }
};

const getWebRTCService = () => {
    try {
        return require('../services/WebRTCService').webRTCService;
    } catch (e: any) {
        console.log('[CallScreen] WebRTC service not available:', e?.message || 'unknown');
        return null;
    }
};

const videoRenderModules = getVideoRenderModules();
const RTCView = videoRenderModules.RTCView;
const RTCPIPView = videoRenderModules.RTCPIPView;
const RemoteVideoComponent = RTCPIPView || RTCView; 
const startIOSPIP = videoRenderModules.startIOSPIP;
const stopIOSPIP = videoRenderModules.stopIOSPIP;
const webRTCService = getWebRTCService();

type CallState = 'idle' | 'ringing' | 'connecting' | 'connected' | 'ended';
const IOS_CALL_INTERRUPTION_MODE = (InterruptionModeIOS as any)?.DoNotMix ?? 1;
const ANDROID_CALL_INTERRUPTION_MODE = (InterruptionModeAndroid as any)?.DoNotMix ?? 1;

const hexToRgba = (color: string, alpha: number): string => {
    if (!color || !color.startsWith('#')) return `rgba(255, 106, 136, ${alpha})`;
    let hex = color.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map((c) => `${c}${c}`).join('');
    const int = Number.parseInt(hex, 16);
    if (Number.isNaN(int)) return `rgba(255, 106, 136, ${alpha})`;
    const r = (int >> 16) & 255;
    const g = (int >> 8) & 255;
    const b = int & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export default function CallScreen() {
    const insets = useSafeAreaInsets();
    const { width, height } = useWindowDimensions();
    const router = useRouter();
    const navigation = useNavigation();
    const { activeCall, contacts, currentUser, activeTheme, endCall: endAppCall, acceptCall: acceptAppCall, toggleMute: toggleAppMute, toggleVideo, toggleMinimizeCall } = useApp();
    useKeepAwake();

    const [callDuration, setCallDuration] = useState(0);
    const [localStream, setLocalStream] = useState<any>(null);
    const [remoteStream, setRemoteStream] = useState<any>(null);
    const [remoteStreamUpdate, setRemoteStreamUpdate] = useState(0);
    const isMinimizing = useRef(false);
    const rtcPipRef = useRef(null);
    const isMounted = useRef(false);

    const isVideo = activeCall?.type === 'video';
    const [callState, setCallState] = useState<CallState>(() => {
        // If the call is already accepted (e.g. we re-entered this screen or 
        // the acceptor clicked "Accept" already), start in 'connecting'
        if (activeCall?.isAccepted) return 'connecting';
        return 'ringing';
    });
    const [isSlowConnection, setIsSlowConnection] = useState(false);
    const [wasConnected, setWasConnected] = useState(false);
    const [isSpeaker, setIsSpeaker] = useState(() => activeCall?.type === 'video');
    const [isEdgeGlowEnabled, setIsEdgeGlowEnabled] = useState(false);
    const [androidIsInPipMode, setAndroidIsInPipMode] = useState(false);
    const [iosIsInPipMode, setIosIsInPipMode] = useState(false);
    const [showDiagnostics, setShowDiagnostics] = useState(false);
    const [stats, setStats] = useState({ bytesReceived: 0 });

    const hasRemoteTracks = useMemo(() => {
        if (!remoteStream) return false;
        try {
            const audioTracks = remoteStream.getAudioTracks?.() || [];
            const videoTracks = remoteStream.getVideoTracks?.() || [];
            const genericTracks = remoteStream.getTracks?.() || [];
            return audioTracks.length > 0 || videoTracks.length > 0 || genericTracks.length > 0;
        } catch {
            return false;
        }
    }, [remoteStream, remoteStreamUpdate]);

    const uiConnected = wasConnected || callState === 'connected' || hasRemoteTracks || stats.bytesReceived > 0;

    useEffect(() => {
        if (callState === 'connecting') {
            const timer = setTimeout(() => setIsSlowConnection(true), 12000);
            return () => { clearTimeout(timer); setIsSlowConnection(false); };
        } else {
            setIsSlowConnection(false);
        }
    }, [callState]);

    useEffect(() => {
        const interval = setInterval(() => {
            if (!webRTCService) return;
            const svcState = webRTCService.getState();
            const svcRemote = webRTCService.getRemoteStream();
            if (svcState === 'connected' && !wasConnected) {
                setWasConnected(true);
                setCallState('connected');
            }
            if (svcRemote && !remoteStream) {
                setRemoteStream(svcRemote);
                setRemoteStreamUpdate(prev => prev + 1);
            }
        }, 2000);
        return () => clearInterval(interval);
    }, [wasConnected, remoteStream]);

    const canRenderVideo = !!RTCView && !!RemoteVideoComponent;
    const edgeGlowPulse = useSharedValue(0);
    const edgeGlowStrong = useMemo(() => hexToRgba(activeTheme?.accent || '#FF6A88', 0.65), [activeTheme?.accent]);
    const edgeGlowSoft = useMemo(() => hexToRgba(activeTheme?.accent || '#FF6A88', 0), [activeTheme?.accent]);

    useEffect(() => {
        if (isEdgeGlowEnabled && isVideo && uiConnected) {
            edgeGlowPulse.value = withRepeat(
                withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.quad) }),
                -1, true
            );
        } else {
            edgeGlowPulse.value = withTiming(0, { duration: 220 });
        }
    }, [isEdgeGlowEnabled, isVideo, uiConnected]);

    useEffect(() => {
        let timeout: NodeJS.Timeout;
        const subscription = AppState.addEventListener('change', nextAppState => {
            const isVideoCall = activeCall?.type === 'video' && activeCall?.isAccepted && !isMinimizing.current;
            
            if (nextAppState.match(/inactive|background/)) {
                if (isVideoCall) {
                    if (Platform.OS === 'ios') {
                        if (startIOSPIP && rtcPipRef.current) {
                            try { startIOSPIP(rtcPipRef); } catch (e) { console.warn('startIOSPIP error:', e); }
                        }
                        timeout = setTimeout(() => setIosIsInPipMode(true), 150);
                    } else if (Platform.OS === 'android') {
                        if (typeof ExpoPip?.enterPipMode !== 'function') {
                            console.log('[CallScreen] Android PiP unavailable in this build.');
                        } else {
                            try {
                                ExpoPip.enterPipMode({
                                    width: Math.floor(width),
                                    height: Math.floor(height),
                                    autoEnterEnabled: true
                                });
                                setAndroidIsInPipMode(true);
                            } catch (e) { setAndroidIsInPipMode(false); }
                        }
                    }
                }
            } else if (nextAppState === 'active') {
                if (Platform.OS === 'ios') {
                    setIosIsInPipMode(false);
                    if (stopIOSPIP) {
                        try { stopIOSPIP(rtcPipRef); } catch (e) { console.warn('stopIOSPIP error:', e); }
                    }
                } else {
                    setAndroidIsInPipMode(false);
                }
            }
        });
        return () => subscription.remove();
    }, [activeCall?.isAccepted, activeCall?.type, width, height]);

    const isInPipMode = Platform.OS === 'android' ? androidIsInPipMode : iosIsInPipMode;

    const contact = useMemo(() => {
        const normalizedId = normalizeId(activeCall?.contactId);
        return contacts.find(c => normalizeId(c.id) === normalizedId) || {
            id: activeCall?.contactId || '',
            name: activeCall?.contactName || 'User',
            avatar: activeCall?.avatar || '',
        };
    }, [contacts, activeCall]);

    const handleMinimize = useCallback(() => {
        isMinimizing.current = true;
        toggleMinimizeCall(true);
        if (navigation.canGoBack()) navigation.goBack();
    }, [navigation, toggleMinimizeCall]);

    const ensureMicrophoneAccess = useCallback(async (): Promise<boolean> => {
        try {
            if (webRTCService?.ensureMicrophonePermission) {
                const granted = await webRTCService.ensureMicrophonePermission(true);
                if (!granted) {
                    Alert.alert(
                        'Microphone Permission Needed',
                        'Voice call ke liye microphone permission allow karna zaroori hai.'
                    );
                }
                return granted;
            }

            const permission = await ExpoAudio.requestPermissionsAsync();
            if (!permission.granted) {
                Alert.alert(
                    'Microphone Permission Needed',
                    'Voice call ke liye microphone permission allow karna zaroori hai.'
                );
                return false;
            }
            return true;
        } catch (error) {
            console.warn('[CallScreen] Failed to request microphone permission:', error);
            return false;
        }
    }, []);

    const applySpeakerOutput = useCallback(async (useSpeaker: boolean, manualOverride: boolean = true): Promise<boolean> => {
        try {
            if (webRTCService?.setAudioOutput) {
                await webRTCService.setAudioOutput(useSpeaker, manualOverride);
            } else {
                await ExpoAudio.setAudioModeAsync({
                    allowsRecordingIOS: true,
                    playsInSilentModeIOS: true,
                    staysActiveInBackground: true,
                    interruptionModeIOS: IOS_CALL_INTERRUPTION_MODE,
                    shouldDuckAndroid: false,
                    interruptionModeAndroid: ANDROID_CALL_INTERRUPTION_MODE,
                    playThroughEarpieceAndroid: !useSpeaker,
                });
                const InCallManager = require('react-native-incall-manager').default;
                InCallManager.setSpeakerphoneOn(useSpeaker);
                if (Platform.OS === 'ios') InCallManager.setForceSpeakerphoneOn(useSpeaker);
            }

            setIsSpeaker(useSpeaker);
            return true;
        } catch (error) {
            console.warn('[CallScreen] Failed to apply speaker output:', error);
            return false;
        }
    }, []);

    const handleToggleMute = useCallback(() => toggleAppMute(), [toggleAppMute]);
    const handleToggleVideo = useCallback(() => toggleVideo?.(), [toggleVideo]);
    const handleToggleEdgeGlow = useCallback(() => isVideo && setIsEdgeGlowEnabled(prev => !prev), [isVideo]);
    const handleToggleSpeaker = useCallback(async () => {
        await applySpeakerOutput(!isSpeaker, true);
    }, [isSpeaker, applySpeakerOutput]);
    const handleSwitchCamera = useCallback(() => webRTCService?.switchCamera(), []);

    const handleAcceptCall = useCallback(async () => {
        try { await acceptAppCall(); } catch (e) { console.error(e); }
    }, [acceptAppCall]);

    const selfVideoX = useSharedValue(width - 130);
    const selfVideoY = useSharedValue(120);
    const screenTranslateY = useSharedValue(0);

    const panGesture = Gesture.Pan()
        .onUpdate((event) => {
            selfVideoX.value = event.translationX + (width - 130);
            selfVideoY.value = event.translationY + 120;
        })
        .onEnd(() => {
            selfVideoX.value = withSpring(selfVideoX.value < width / 2 ? 20 : width - 130);
            selfVideoY.value = withSpring(Math.max(100, Math.min(height - 250, selfVideoY.value)));
        });

    const selfVideoStyle = useAnimatedStyle(() => ({
        transform: [
            { translateX: selfVideoX.value } as any,
            { translateY: selfVideoY.value } as any
        ]
    }));

    const screenPanGesture = Gesture.Pan()
        .onUpdate((event) => { if (event.translationY > 0) screenTranslateY.value = event.translationY; })
        .onEnd((event) => {
            if (event.translationY > 150) runOnJS(handleMinimize)();
            else screenTranslateY.value = withSpring(0);
        });

    const screenStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: screenTranslateY.value }],
        borderRadius: Platform.OS === 'android' ? (screenTranslateY.value > 10 ? 30 : 0) : interpolate(screenTranslateY.value, [0, 200], [0, 40]),
        overflow: 'hidden',
        flex: 1,
    }));

    const edgeGlowStyle = useAnimatedStyle(() => ({ opacity: edgeGlowPulse.value }));

    // Mount guard: set isMounted after the first render to prevent navigating
    // before the Root Layout navigator is ready (causes "navigate before mount" crash).
    useEffect(() => {
        isMounted.current = true;
        return () => { isMounted.current = false; };
    }, []);

    useEffect(() => {
        if (!isMounted.current) return;
        if (!activeCall && !isMinimizing.current) {
            router.replace('/(tabs)');
        }
    }, [activeCall, router]);

    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const handleEndCall = useCallback(() => {
        setLocalStream(null);
        setRemoteStream(null);
        endAppCall();
    }, [endAppCall]);

    const pulseScale = useSharedValue(1);
    const pulseOpacity = useSharedValue(0.5);

    useEffect(() => {
        if (callState === 'ringing' || callState === 'connecting') {
            pulseScale.value = withRepeat(withTiming(1.5, { duration: 1500 }), -1, false);
            pulseOpacity.value = withRepeat(withTiming(0, { duration: 1500 }), -1, false);
        } else {
            pulseScale.value = 1; pulseOpacity.value = 0;
        }
    }, [callState]);

    const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulseScale.value }], opacity: pulseOpacity.value }));

    const restoreMusicAudioMode = useCallback(async () => {
        try {
            await ExpoAudio.setAudioModeAsync({
                allowsRecordingIOS: false,
                playsInSilentModeIOS: true,
                staysActiveInBackground: true,
                interruptionModeIOS: IOS_CALL_INTERRUPTION_MODE,
                shouldDuckAndroid: true,
                interruptionModeAndroid: ANDROID_CALL_INTERRUPTION_MODE,
                playThroughEarpieceAndroid: false,
            });
        } catch (e) { console.warn(e); }
    }, []);

    // Audio session management is now handled centrally by WebRTCService
    // to prevent hardware conflicts during transition from music to call.

    // PIP params — separate effect that CAN re-run on activeCall changes
    useEffect(() => {
        if (activeCall?.isAccepted && Platform.OS === 'android' && typeof ExpoPip?.setPictureInPictureParams === 'function') {
            try {
                ExpoPip.setPictureInPictureParams({
                    autoEnterEnabled: true,
                    width: Math.floor(width),
                    height: Math.floor(width * 1.5)
                });
            } catch (e) {}
        }
    }, [activeCall?.isAccepted, width]);

    useEffect(() => {
        if (!activeCall) return;
        const audioOutput = webRTCService?.getAudioOutput?.();
        if (audioOutput === 'speaker' || audioOutput === 'earpiece') {
            setIsSpeaker(audioOutput === 'speaker');
            return;
        }
        setIsSpeaker(activeCall.type === 'video');
    }, [activeCall, callState]);

    // WebRTC init — runs once per call session (callId/roomId)
    const initializedCallSessionRef = useRef<string | null>(null);
    useEffect(() => {
        if (!activeCall) {
            initializedCallSessionRef.current = null;
            return;
        }

        const sessionKey = activeCall.callId || activeCall.roomId;
        if (!sessionKey || initializedCallSessionRef.current === sessionKey) return;
        initializedCallSessionRef.current = sessionKey;

        setWasConnected(false);
        setCallDuration(0);
        setStats({ bytesReceived: 0 });
        setCallState(activeCall.isAccepted ? 'connecting' : 'ringing');
        setLocalStream(null);
        setRemoteStream(null);

        // Capture values at init time so we don't depend on activeCall object
        const callType = activeCall.type;
        const isIncoming = activeCall.isIncoming;
        const callId = activeCall.callId || activeCall.roomId || sessionKey;

        const listener = {
            onStateChange: (s: any) => {
                setCallState(s);
                const output = webRTCService?.getAudioOutput?.();
                if (output === 'speaker' || output === 'earpiece') {
                    setIsSpeaker(output === 'speaker');
                }
                if (s === 'connected') {
                    try {
                        const { nativeCallBridge } = require('../services/NativeCallBridge');
                        nativeCallBridge.reportWebRTCConnected(callId, callType);
                    } catch (_) {}
                }
            },
            onLocalStream: (s: any) => setLocalStream(s),
            onRemoteStream: (s: any) => { setRemoteStream(s); setRemoteStreamUpdate(v => v+1); },
            onStats: (st: any) => setStats(prev => ({ ...prev, ...st })),
        };

        webRTCService?.addListener(listener);
        let cancelled = false;

        const init = async () => {
            try {
                const hasMicPermission = await ensureMicrophoneAccess();
                if (cancelled) return;
                if (!hasMicPermission) {
                    if (!isIncoming) {
                        handleEndCall();
                    }
                    return;
                }

                const defaultSpeaker = callType === 'video';
                await applySpeakerOutput(defaultSpeaker, false);

                await ExpoAudio.setAudioModeAsync({
                    allowsRecordingIOS: true,
                    playsInSilentModeIOS: true,
                    staysActiveInBackground: true,
                    interruptionModeIOS: IOS_CALL_INTERRUPTION_MODE,
                    shouldDuckAndroid: false,
                    interruptionModeAndroid: ANDROID_CALL_INTERRUPTION_MODE,
                    playThroughEarpieceAndroid: !defaultSpeaker,
                }).catch(() => {});

                // For incoming calls, answerCall() may have already initialized
                // WebRTC (offer arrived before CallScreen mounted). Skip if active.
                if (isIncoming && webRTCService?.isCallActive()) {
                    console.log('[CallScreen] WebRTC already active for incoming call, skipping init');
                } else {
                    await webRTCService?.prepareCall(callType);
                    if (cancelled) return;
                    if (!isIncoming) {
                        await webRTCService?.startCall();
                    }
                }
            } catch (e: any) {
                console.warn('[CallScreen] WebRTC init failed:', e?.message);
            }
        };
        void init();

        return () => {
            cancelled = true;
            webRTCService?.removeListener(listener);
            if (!isMinimizing.current) void restoreMusicAudioMode();
        };
    }, [activeCall?.callId, activeCall?.roomId, ensureMicrophoneAccess, applySpeakerOutput, handleEndCall, restoreMusicAudioMode]);

    useEffect(() => {
        if (uiConnected) {
            const interval = setInterval(() => setCallDuration(p => p + 1), 1000);
            return () => clearInterval(interval);
        }
    }, [uiConnected]);

    // If no active call, show nothing while navigation redirects to tabs
    if (!activeCall) return null;

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <GestureDetector gesture={screenPanGesture}>
                <Animated.View style={[styles.container, { backgroundColor: '#0F0F14', width, height }, screenStyle]}>
                    <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

                    {/* 1. Background Media Layer */}
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#111' }]}>
                        {(isVideo && canRenderVideo && remoteStream && activeCall?.isAccepted && !activeCall?.remoteVideoOff) ? (
                            <RemoteVideoComponent
                                key={`v-${remoteStreamUpdate}`}
                                ref={rtcPipRef}
                                streamURL={typeof remoteStream.toURL === 'function' ? remoteStream.toURL() : remoteStream}
                                style={StyleSheet.absoluteFill}
                                objectFit="cover"
                                zOrder={0}
                            />
                        ) : (
                            !!contact.avatar && (
                                <Image source={{ uri: contact.avatar }} style={[styles.backgroundImage, { width, height }]} blurRadius={isVideo ? 60 : 50} />
                            )
                        )}

                        {remoteStream && activeCall?.isAccepted && (!isVideo || activeCall?.remoteVideoOff) && RTCView && (
                            <View style={{ position: 'absolute', opacity: 0.01, width: 1, height: 1, top: 0, left: 0 }}>
                                <RTCView 
                                    streamURL={typeof remoteStream.toURL === 'function' ? remoteStream.toURL() : remoteStream} 
                                    style={{ width: 1, height: 1 }} 
                                    zOrder={-1} 
                                />
                            </View>
                        )}
                        <View style={[styles.overlay, { zIndex: 1 }]} />
                    </View>

                    {/* 2. Edge Glow */}
                    {isEdgeGlowEnabled && isVideo && (
                        <Animated.View pointerEvents="none" style={[styles.edgeGlowContainer, edgeGlowStyle]}>
                            {Platform.OS === 'ios' ? (
                                <LinearGradient colors={[edgeGlowStrong, edgeGlowSoft]} style={StyleSheet.absoluteFill} />
                            ) : (
                                <View style={[StyleSheet.absoluteFill, { borderWidth: 8, borderColor: edgeGlowStrong, opacity: 0.4 }]} />
                            )}
                        </Animated.View>
                    )}

                    {!isInPipMode ? (
                        <View style={styles.content}>
                            {/* Header */}
                            <View style={[styles.header, { marginTop: Math.max(insets.top, 20) }]}>
                                <Pressable onPress={handleMinimize} style={styles.iconButton}>
                                    <MaterialIcons name="keyboard-arrow-down" size={32} color="white" />
                                </Pressable>
                                <View style={styles.securityBadge}>
                                    <MaterialIcons name="lock" size={12} color="rgba(255,255,255,0.6)" />
                                    <Text style={styles.securityText}>Soul End-to-End Encrypted</Text>
                                </View>
                                <View style={{ width: 44 }} />
                            </View>

                            {/* Center Info */}
                            {(!isVideo || !uiConnected || activeCall?.remoteVideoOff) && (
                                <View style={styles.mainInfo}>
                                    <View style={styles.avatarWrapper}>
                                        <Animated.View style={[styles.pulseRing, pulseStyle]} />
                                        <SoulAvatar uri={contact.avatar} size={170} />
                                    </View>
                                    <Text style={styles.contactName}>{contact.name}</Text>
                                    <Text style={styles.callStatus}>
                                        {uiConnected ? formatDuration(callDuration) : 'Connecting...'}
                                    </Text>
                                    {uiConnected && (
                                        <Text style={[styles.callStatus, { fontSize: 10, opacity: 0.8 }]}>
                                            Data Rx: {(stats.bytesReceived / 1024).toFixed(1)} KB
                                        </Text>
                                    )}
                                </View>
                            )}

                            {/* Self Video */}
                            {isVideo && (
                                <GestureDetector gesture={panGesture}>
                                    <Animated.View style={[styles.selfVideoContainer, selfVideoStyle]}>
                                        {localStream && !activeCall?.isVideoOff && RTCView ? (
                                            <RTCView streamURL={typeof localStream.toURL === 'function' ? localStream.toURL() : localStream} style={styles.selfVideo} objectFit="cover" mirror zOrder={2} />
                                        ) : (
                                            <View style={styles.selfVideoPlaceholder}>
                                                <SoulAvatar uri={currentUser?.avatar} size={50} />
                                            </View>
                                        )}
                                    </Animated.View>
                                </GestureDetector>
                            )}

                            {/* Footer Controls */}
                            <GlassView intensity={35} tint="dark" style={[styles.controlsBar, { marginBottom: Math.max(insets.bottom, 40) }]}>
                                {callState !== 'connected' && activeCall?.isIncoming && !activeCall?.isAccepted ? (
                                    <View style={styles.incomingActionsRow}>
                                        <Pressable onPress={handleEndCall} style={[styles.controlBtn, {backgroundColor: '#ef4444'}]}><MaterialIcons name="call-end" size={28} color="white" /></Pressable>
                                        <Pressable onPress={handleAcceptCall} style={[styles.controlBtn, {backgroundColor: '#22c55e'}]}><MaterialIcons name="call" size={28} color="white" /></Pressable>
                                    </View>
                                ) : (
                                    <View style={styles.controlsRow}>
                                        <Pressable style={[styles.controlBtn, activeCall?.isMuted && styles.controlBtnActive]} onPress={handleToggleMute}><Ionicons name={activeCall?.isMuted ? "mic-off" : "mic"} size={24} color={activeCall?.isMuted ? "#000" : "white"} /></Pressable>
                                        <Pressable style={[styles.controlBtn, isSpeaker && styles.controlBtnActive]} onPress={handleToggleSpeaker}><Ionicons name={isSpeaker ? "volume-high" : "volume-low"} size={24} color={isSpeaker ? "#000" : "white"} /></Pressable>
                                        {isVideo && <Pressable style={[styles.controlBtn, activeCall?.isVideoOff && styles.controlBtnActive]} onPress={handleToggleVideo}><MaterialIcons name={activeCall?.isVideoOff ? "videocam-off" : "videocam"} size={24} color={activeCall?.isVideoOff ? "#000" : "white"} /></Pressable>}
                                        <Pressable style={styles.controlBtn} onPress={handleMinimize}><MaterialIcons name="picture-in-picture" size={24} color="white" /></Pressable>
                                        <Pressable style={[styles.controlBtn, styles.endCallBtn]} onPress={handleEndCall}><MaterialIcons name="call-end" size={28} color="white" /></Pressable>
                                    </View>
                                )}
                            </GlassView>

                            {/* Diagnostics Toggle */}
                            <Pressable style={{position: 'absolute', top: 10, right: 10, opacity: 0.1}} onLongPress={() => setShowDiagnostics(true)} delayLongPress={5000}>
                                <View style={{width: 20, height: 20}} />
                            </Pressable>

                            {showDiagnostics && (
                                <View style={styles.diagnosticsContainer}>
                                    <GlassView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
                                    <View style={{ padding: 20 }}>
                                        <Text style={styles.diagnosticTitle}>Soul Diagnostics</Text>
                                        <Text style={styles.diagnosticValue}>State: {callState}</Text>
                                        <Text style={styles.diagnosticValue}>ICE: {webRTCService?.getIceConnectionState()}</Text>
                                        <Text style={styles.diagnosticValue}>Rx Data: {(stats.bytesReceived / 1024).toFixed(1)} KB</Text>
                                        <Pressable onPress={() => setShowDiagnostics(false)} style={styles.closeDiagnostics}>
                                            <Text style={{color: '#fff', fontWeight: 'bold' }}>CLOSE</Text>
                                        </Pressable>
                                    </View>
                                </View>
                            )}
                        </View>
                    ) : (
                        !isVideo && (
                            <View style={styles.pipOverlay}>
                                <SoulAvatar uri={contact.avatar} size={width * 0.3} />
                                <Text style={styles.pipName}>{contact.name}</Text>
                            </View>
                        )
                    )}
                </Animated.View>
            </GestureDetector>
        </GestureHandlerRootView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    backgroundImage: { position: 'absolute', opacity: 0.4 },
    overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)' },
    content: { flex: 1, justifyContent: 'space-between', zIndex: 10 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20 },
    securityBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.1)', padding: 6, borderRadius: 12 },
    securityText: { color: 'rgba(255,255,255,0.6)', fontSize: 10 },
    mainInfo: { alignItems: 'center', marginTop: 40 },
    avatarWrapper: { width: 180, height: 180, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
    pulseRing: { position: 'absolute', width: 170, height: 170, borderRadius: 85, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
    contactName: { color: '#fff', fontSize: 28, fontWeight: 'bold' },
    callStatus: { color: 'rgba(255,255,255,0.6)', marginTop: 8 },
    controlsBar: { marginHorizontal: 20, borderRadius: 30, padding: 15 },
    controlsRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
    controlBtn: { width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
    controlBtnActive: { backgroundColor: '#fff' },
    controlBtnDisabled: { opacity: 0.3 },
    endCallBtn: { backgroundColor: '#ef4444' },
    selfVideoContainer: { position: 'absolute', width: 110, height: 160, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', backgroundColor: '#000', zIndex: 100 },
    selfVideo: { flex: 1 },
    selfVideoPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    edgeGlowContainer: { ...StyleSheet.absoluteFillObject, zIndex: 5 },
    pipOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    pipName: { color: '#fff', marginTop: 10, fontSize: 16 },
    incomingActionsRow: { flexDirection: 'row', justifyContent: 'space-around', width: '100%' },
    iconButton: { padding: 8 },
    diagnosticsContainer: { ...StyleSheet.absoluteFillObject, zIndex: 1000, justifyContent: 'center', alignItems: 'center' },
    diagnosticTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold', marginBottom: 10 },
    diagnosticValue: { color: 'rgba(255,255,255,0.8)', fontSize: 14, marginBottom: 5 },
    closeDiagnostics: { marginTop: 20, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
});
