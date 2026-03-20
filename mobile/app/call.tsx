import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BlurView } from 'expo-blur';
import {
    View, Text, Image, Pressable, StyleSheet, StatusBar,
    useWindowDimensions, Platform, Alert, AppState, ActivityIndicator
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera } from 'expo-camera';
import { Audio as ExpoAudio } from 'expo-av';
import { useRouter, useNavigation } from 'expo-router';
import GlassView from '../components/ui/GlassView';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import ExpoPip from 'expo-pip';
import Constants from 'expo-constants';
import { useApp } from '../context/AppContext';
import { callService, CallSignal } from '../services/CallService';
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

// Safe require for WebRTC to prevent Expo Go crashes
const getWebRTCModules = () => {
    try {
        const webrtc = require('react-native-webrtc');
        return {
            RTCView: webrtc.RTCView,
            RTCPIPView: webrtc.RTCPIPView,
            startIOSPIP: webrtc.startIOSPIP,
            stopIOSPIP: webrtc.stopIOSPIP,
            MediaStream: webrtc.MediaStream,
            webRTCService: require('../services/WebRTCService').webRTCService
        };
    } catch (e) {
        console.log('[CallScreen] Native WebRTC not available (Expo Go)');
        return { RTCView: null, RTCPIPView: null, startIOSPIP: null, stopIOSPIP: null, MediaStream: null, webRTCService: null };
    }
};

const webrtcModules = getWebRTCModules();
const RTCView = webrtcModules.RTCView;
const RemoteVideoComponent = RTCView; 
const startIOSPIP = webrtcModules.startIOSPIP;
const stopIOSPIP = webrtcModules.stopIOSPIP;
const webRTCService = webrtcModules.webRTCService;

// CallState type
type CallState = 'idle' | 'ringing' | 'connecting' | 'connected' | 'ended';

export default function CallScreen() {
    const insets = useSafeAreaInsets();
    const { width, height } = useWindowDimensions();
    const router = useRouter();
    const navigation = useNavigation();
    const { activeCall, contacts, currentUser, otherUser, activeTheme, endCall: endAppCall, acceptCall: acceptAppCall, toggleMute: toggleAppMute, toggleVideo, toggleMinimizeCall } = useApp();
    useKeepAwake(); 

    const [callDuration, setCallDuration] = useState(0);
    const [localStream, setLocalStream] = useState<any>(null);
    const [remoteStream, setRemoteStream] = useState<any>(null);
    const webrtcListenerRef = useRef<any>(null);
    const [callState, setCallState] = useState<CallState>(() => {
        if (activeCall?.isIncoming && activeCall?.isAccepted) return 'connecting';
        return 'ringing';
    });
    const [remoteStreamUpdate, setRemoteStreamUpdate] = useState(0);
    const [isSpeaker, setIsSpeaker] = useState(true); // Force speaker by default for visibility
    const [iosIsInPipMode, setIosIsInPipMode] = useState(false);
    const [showDiagnostics, setShowDiagnostics] = useState(false);

    // REFS FOR STABLE CALLBACKS
    const activeCallRef = useRef(activeCall);
    useEffect(() => { activeCallRef.current = activeCall; }, [activeCall]);
    const isMinimizing = useRef(false);
    const rtcPipRef = useRef(null);

    const handleToggleSpeaker = useCallback(async (forceValue?: boolean) => {
        const next = forceValue !== undefined ? forceValue : !isSpeaker;
        setIsSpeaker(next);
        try {
            await ExpoAudio.setAudioModeAsync({
                allowsRecordingIOS: true,
                playsInSilentModeIOS: true,
                staysActiveInBackground: true,
                interruptionModeIOS: 1,
                shouldDuckAndroid: true,
                interruptionModeAndroid: 1,
                playThroughEarpieceAndroid: !next,
            });
            console.log(`[CallScreen] 🔊 Speaker set to: ${next}`);
        } catch (e) {
            console.error('[CallScreen] ❌ Failed to set audio mode:', e);
        }
    }, [isSpeaker]);

    const hasRemoteTracks = remoteStream && (
        (remoteStream.getAudioTracks && remoteStream.getAudioTracks().length > 0) || 
        (remoteStream.getVideoTracks && remoteStream.getVideoTracks().length > 0) ||
        (remoteStream._tracks && remoteStream._tracks.length > 0)
    );
    
    const isActuallyConnected = callState === 'connected' || (hasRemoteTracks && activeCall?.isAccepted);
    const [wasConnected, setWasConnected] = useState(false);
    
    useEffect(() => {
        if (isActuallyConnected && !wasConnected) {
            console.log('[CallScreen] 🎯 Connection confirmed. Forcing audio session re-init...');
            setWasConnected(true);
            // Re-apply audio mode (SPEAKER ON) to ensure media starts playing
            handleToggleSpeaker(true); 
        }
    }, [isActuallyConnected, wasConnected, handleToggleSpeaker]);

    // Safety Sync
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

    useEffect(() => {
        if (!activeCall && !isMinimizing.current) {
            // Safeguard: Check if this was a momentary flicker
            console.log(`[CallScreen] ⚠️ activeCall is null! isMinimizing: ${isMinimizing.current}. Starting 500ms guard...`);
            
            const timer = setTimeout(() => {
                // Check if it's still null after 500ms
                if (!activeCallRef.current && !isMinimizing.current) {
                    console.log(`[CallScreen] 🚨 Guard failed - activeCall still null after 500ms. Navigating back. Router can go back: ${router.canGoBack()}`);
                    if (router.canGoBack()) router.back();
                    else router.replace('/(tabs)');
                } else if (activeCallRef.current) {
                    console.log('[CallScreen] ✅ Guard saved us! activeCall restored during delay.');
                }
            }, 500);
            
            return () => clearTimeout(timer);
        }
    }, [activeCall]);

    // PiP and AppState
    const { isInPipMode: androidIsInPipMode } = Platform.OS === 'android' ? ExpoPip.useIsInPip() : { isInPipMode: false };
    useEffect(() => {
        let timeout: NodeJS.Timeout;
        const subscription = AppState.addEventListener('change', nextAppState => {
            const isVideoCall = activeCall?.type === 'video' && activeCall?.isAccepted && !isMinimizing.current;
            if (nextAppState.match(/inactive|background/)) {
                if (isVideoCall) {
                    if (Platform.OS === 'ios') {
                        if (startIOSPIP && rtcPipRef.current) {
                            try { startIOSPIP(rtcPipRef); } catch (e) {}
                        }
                        timeout = setTimeout(() => setIosIsInPipMode(true), 150);
                    } else if (Platform.OS === 'android') {
                        try { 
                            ExpoPip.enterPipMode({ 
                                width: Math.floor(width), 
                                height: Math.floor(height),
                                autoEnterEnabled: true 
                            }); 
                        } catch (e) {}
                    }
                }
            } else if (nextAppState === 'active') {
                if (Platform.OS === 'ios') {
                    setIosIsInPipMode(false);
                    if (stopIOSPIP) try { stopIOSPIP(); } catch (e) {}
                }
            }
        });
        return () => {
            if (timeout) clearTimeout(timeout);
            subscription.remove();
        };
    }, [activeCall?.type, activeCall?.isAccepted, width, height]);

    const isInPipMode = Platform.OS === 'android' ? androidIsInPipMode : iosIsInPipMode;

    // Latest ref for listeners
    const endAppCallRef = useRef(endAppCall);
    useEffect(() => { endAppCallRef.current = endAppCall; }, [endAppCall]);

    useEffect(() => {
        if (activeCall?.isAccepted && callState === 'ringing') {
            setCallState('connecting');
        }
    }, [activeCall?.isAccepted]);

    // Animations
    const pulseScale = useSharedValue(1);
    const pulseOpacity = useSharedValue(0.5);
    const selfVideoX = useSharedValue(width - 130);
    const selfVideoY = useSharedValue(120);
    const contextX = useSharedValue(0);
    const contextY = useSharedValue(0);
    const screenTranslateY = useSharedValue(0);

    const contact = contacts.find(c => c.id === activeCall?.contactId);
    const isVideo = activeCall?.type === 'video';

    const handleMinimize = useCallback(() => {
        isMinimizing.current = true;
        toggleMinimizeCall(true);
        if (navigation.canGoBack()) navigation.goBack();
    }, [navigation, toggleMinimizeCall]);

    const handleToggleMute = useCallback(() => {
        toggleAppMute();
    }, [toggleAppMute]);

    const handleToggleVideo = useCallback(() => {
        if (toggleVideo) toggleVideo();
    }, [toggleVideo]);


    const handleSwitchCamera = useCallback(() => {
        if (webRTCService) {
            try { webRTCService.switchCamera(); } catch (e) {}
        }
    }, []);

    const handleAcceptCall = useCallback(async () => {
        try {
            await acceptAppCall();
        } catch (e) {}
    }, [acceptAppCall]);

    const panGesture = Gesture.Pan()
        .onStart(() => {
            contextX.value = selfVideoX.value;
            contextY.value = selfVideoY.value;
        })
        .onUpdate((event) => {
            selfVideoX.value = contextX.value + event.translationX;
            selfVideoY.value = contextY.value + event.translationY;
        })
        .onEnd(() => {
            const midX = width / 2;
            const destX = selfVideoX.value < midX ? 20 : width - 130;
            const destY = Math.max(100, Math.min(height - 250, selfVideoY.value));
            selfVideoX.value = withSpring(destX);
            selfVideoY.value = withSpring(destY);
        });

    const selfVideoStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: selfVideoX.value }, { translateY: selfVideoY.value }] as any
    }));

    const screenPanGesture = Gesture.Pan()
        .onUpdate((event) => {
            if (event.translationY > 0) screenTranslateY.value = event.translationY;
        })
        .onEnd((event) => {
            if (event.translationY > 150) runOnJS(handleMinimize)();
            else screenTranslateY.value = withSpring(0);
        });

    const screenStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: screenTranslateY.value }],
        borderRadius: interpolate(screenTranslateY.value, [0, 200], [0, 40]),
        overflow: 'hidden',
        flex: 1,
    }));

    useEffect(() => {
        (async () => {
            await ExpoAudio.requestPermissionsAsync();
            if (activeCall?.type === 'video') {
                try { await Camera.requestCameraPermissionsAsync(); } catch (e) {}
            }
        })();
    }, [activeCall?.type]);

    const hasInitiated = useRef(false);
    const uiConnected = wasConnected || isActuallyConnected || (!!remoteStream && activeCall?.isAccepted);

    useEffect(() => {
        if (!activeCall || !currentUser) return;

        const initCall = async () => {
            try {
                const callbacks = {
                    onStateChange: (state: CallState) => {
                        console.log('[CallScreen] WebRTC state changed:', state);
                        setCallState(prev => (state === 'connecting' && prev === 'connected') ? prev : state);
                        if (state === 'ended') {
                            if (endAppCallRef.current) endAppCallRef.current();
                        }
                    },
                    onLocalStream: (stream: any) => {
                        setLocalStream(stream);
                    },
                    onRemoteStream: (stream: any) => {
                        if (!stream) {
                            setRemoteStream(null);
                            return;
                        }
                        console.log(`[CallScreen] 📡 Remote stream updated!`);
                        setRemoteStream(stream);
                        setRemoteStreamUpdate(prev => prev + 1);
                    },
                    onError: (error: string) => {
                        console.error('[CallScreen] WebRTC error:', error);
                    },
                };

                webrtcListenerRef.current = callbacks;
                webRTCService.addListener(callbacks);

                if (hasInitiated.current) return;
                
                if (webRTCService.isCallActive()) {
                    hasInitiated.current = true;
                    setLocalStream(webRTCService.getLocalStream());
                    setRemoteStream(webRTCService.getRemoteStream());
                    setCallState(webRTCService.getState());
                    return;
                }

                hasInitiated.current = true;

                try {
                    await ExpoAudio.setAudioModeAsync({
                        allowsRecordingIOS: true,
                        playsInSilentModeIOS: true,
                        staysActiveInBackground: true,
                        interruptionModeIOS: 1,
                        shouldDuckAndroid: true,
                        interruptionModeAndroid: 1,
                        playThroughEarpieceAndroid: Platform.OS === 'android' ? false : !isSpeaker,
                    });
                } catch (audioError) {}

                await webRTCService.prepareCall(activeCall.type);
                if (activeCall.isIncoming) {
                    console.log('[CallScreen] Waiting for offer...');
                } else {
                    console.log('[CallScreen] Starting signaling...');
                    await webRTCService.startCall();
                }
            } catch (e) {
                console.warn('WebRTC initialization failed:', e);
                handleEndCall();
            }
        };

        initCall();

        return () => {
            if (webRTCService && webrtcListenerRef.current) {
                webRTCService.removeListener(webrtcListenerRef.current);
                webrtcListenerRef.current = null;
            }
            if (!isMinimizing.current) {
                restoreMusicAudioMode();
            }
        }
    }, []);

    useEffect(() => {
        if (!uiConnected) return;
        const interval = setInterval(() => setCallDuration(prev => prev + 1), 1000);
        return () => clearInterval(interval);
    }, [uiConnected]);

    const getStatusText = () => {
        if (callState === 'connected') return formatDuration(callDuration);
        if (callState === 'connecting') {
            return callDuration > 10 ? 'Checking network...' : 'Connecting...';
        }
        if (callState === 'ringing') return 'Ringing...';
        if (callState === 'idle') return 'Starting...';
        return callState;
    };

    useEffect(() => {
        if (callState === 'ringing' || callState === 'connecting') {
            pulseScale.value = withRepeat(withTiming(1.5, { duration: 1500, easing: Easing.out(Easing.ease) }), -1, false);
            pulseOpacity.value = withRepeat(withTiming(0, { duration: 1500, easing: Easing.out(Easing.ease) }), -1, false);
        } else {
            pulseScale.value = withTiming(1);
            pulseOpacity.value = withTiming(0);
        }
    }, [callState]);

    const pulseStyle = useAnimatedStyle(() => ({
        transform: [{ scale: pulseScale.value }],
        opacity: pulseOpacity.value,
    }));

    const restoreMusicAudioMode = useCallback(async () => {
        try {
            await ExpoAudio.setAudioModeAsync({
                allowsRecordingIOS: false,
                playsInSilentModeIOS: true,
                staysActiveInBackground: true,
                interruptionModeIOS: 1,
                shouldDuckAndroid: true,
                interruptionModeAndroid: 1,
                playThroughEarpieceAndroid: false,
            });
        } catch (e) {}
    }, []);

    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const handleEndCall = useCallback(() => {
        setLocalStream(null);
        setRemoteStream(null);
        if (endAppCallRef.current) endAppCallRef.current();
        restoreMusicAudioMode();
    }, [restoreMusicAudioMode]);

    if (!activeCall || !contact) {
        return (
            <View style={[styles.container, { backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }]}>
                <StatusBar hidden />
                <ActivityIndicator size="large" color="#BC002A" />
            </View>
        );
    }

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <GestureDetector gesture={screenPanGesture}>
                <Animated.View style={[styles.container, { backgroundColor: '#000', width, height }, screenStyle]}>
                    <StatusBar hidden />
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#111' }]}>
                        {(isVideo && remoteStream && activeCall.isAccepted && !activeCall.remoteVideoOff) ? (
                            <RemoteVideoComponent
                                key={`remote-video-v${remoteStreamUpdate}`}
                                ref={rtcPipRef}
                                streamURL={typeof remoteStream.toURL === 'function' ? remoteStream.toURL() : remoteStream}
                                style={[StyleSheet.absoluteFill, { zIndex: 0 }]}
                                objectFit="cover"
                                mirror={false}
                                zOrder={0}
                            />
                        ) : (
                            !!contact.avatar && (
                                <Image source={{ uri: contact.avatar }} style={[styles.backgroundImage, { width, height }]} blurRadius={isVideo ? 60 : 50} />
                            )
                        )}
                        <View style={[styles.overlay, { zIndex: 1 }]} />
                        {!isVideo && remoteStream && uiConnected && (
                            <View style={{ position: 'absolute', opacity: 0, width: 1, height: 1, zIndex: -100 }}>
                                <RemoteVideoComponent
                                    key={`remote-audio-v${remoteStreamUpdate}`}
                                    streamURL={typeof remoteStream.toURL === 'function' ? remoteStream.toURL() : remoteStream}
                                />
                            </View>
                        )}
                    </View>

                    {isVideo && activeCall.remoteVideoOff && (
                        <View style={[StyleSheet.absoluteFill, { justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' }]}>
                            <SoulAvatar uri={contact.avatar || ''} size={150} />
                        </View>
                    )}
                    
                    {!isInPipMode ? (
                        <View style={styles.content}>
                            {showDiagnostics && (
                                <View style={styles.diagnosticsContainer}>
                                    <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
                                    <Text style={styles.diagnosticTitle}>Soul Diagnostics</Text>
                                    <Text style={styles.diagnosticValue}>ICE: {webRTCService?.getIceConnectionState()?.toUpperCase()}</Text>
                                    <Text style={styles.diagnosticValue}>Tracks: R:{remoteStream?.getAudioTracks().length || 0}</Text>
                                    <Pressable onPress={() => setShowDiagnostics(false)} style={styles.closeDiagnostics}><Text style={{color:'#fff'}}>CLOSE</Text></Pressable>
                                </View>
                            )}

                            <View style={[styles.header, { marginTop: Math.max(insets.top, 20) }]}>
                                <Pressable onPress={handleMinimize} style={styles.iconButton}><MaterialIcons name="keyboard-arrow-down" size={32} color="white" /></Pressable>
                                <View style={styles.securityBadge}><MaterialIcons name="lock" size={12} color="rgba(255,255,255,0.6)" /><Text style={styles.securityText}>Soul Secure</Text></View>
                                <View style={{ width: 44 }} />
                            </View>

                            {(!isVideo || !uiConnected) && (
                                <View style={styles.mainInfo}>
                                    <View style={styles.avatarWrapper}>
                                        <Animated.View style={[styles.pulseRing, pulseStyle]} />
                                        <SoulAvatar uri={contact.avatar} size={170} />
                                    </View>
                                    <View style={styles.textContainer}>
                                        <Text style={styles.contactName}>{contact.name}</Text>
                                        <Pressable onLongPress={() => setShowDiagnostics(true)} delayLongPress={2000}>
                                            <Text style={styles.callStatus}>{getStatusText()}</Text>
                                        </Pressable>
                                    </View>
                                </View>
                            )}

                            {isVideo && (
                                <GestureDetector gesture={panGesture}>
                                    <Animated.View style={[styles.selfVideoContainer, selfVideoStyle]}>
                                        {localStream && !activeCall.isVideoOff ? (
                                            <RTCView streamURL={typeof localStream.toURL === 'function' ? localStream.toURL() : localStream} style={styles.selfVideo} objectFit="cover" mirror={true} zOrder={2} />
                                        ) : (
                                            <View style={styles.selfVideoPlaceholder}><SoulAvatar uri={currentUser?.avatar} size={50} /></View>
                                        )}
                                    </Animated.View>
                                </GestureDetector>
                            )}

                            <GlassView intensity={35} tint="dark" style={[styles.controlsBar, { marginBottom: Math.max(insets.bottom, 40) }]}>
                                {callState !== 'connected' && activeCall.isIncoming && !activeCall.isAccepted ? (
                                    <View style={styles.incomingActionsRow}>
                                        <Pressable style={[styles.actionButton, { backgroundColor: '#ef4444' }]} onPress={handleEndCall}><MaterialIcons name="call-end" size={32} color="white" /></Pressable>
                                        <Pressable style={[styles.actionButton, { backgroundColor: '#22c55e' }]} onPress={handleAcceptCall}><MaterialIcons name={isVideo ? "videocam" : "call"} size={32} color="white" /></Pressable>
                                    </View>
                                ) : (
                                    <View style={styles.controlsRow}>
                                        <Pressable style={[styles.controlBtn, activeCall.isMuted && styles.controlBtnActive]} onPress={handleToggleMute}><MaterialIcons name={activeCall.isMuted ? "mic-off" : "mic"} size={28} color={activeCall.isMuted ? "#000" : "white"} /></Pressable>
                                        <Pressable style={[styles.controlBtn, isSpeaker && styles.controlBtnActive]} onPress={() => handleToggleSpeaker()}><MaterialIcons name={isSpeaker ? "volume-up" : "volume-down"} size={28} color={isSpeaker ? "#000" : "white"} /></Pressable>
                                        <Pressable style={[styles.controlBtn, styles.endCallBtn]} onPress={handleEndCall}><MaterialIcons name="call-end" size={36} color="white" /></Pressable>
                                    </View>
                                )}
                            </GlassView>
                        </View>
                    ) : (
                        !isVideo && (
                            <View style={styles.pipOverlay}>
                                <SoulAvatar uri={contact.avatar} size={width * 0.4} />
                                <View style={styles.pipTitleBar}><Text style={styles.pipName}>{contact.name}</Text></View>
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
    diagnosticsContainer: { position: 'absolute', top: 100, left: 20, right: 20, padding: 20, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 1000 },
    diagnosticTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 15, textAlign: 'center' },
    diagnosticValue: { color: '#fff', fontSize: 14, marginBottom: 5 },
    closeDiagnostics: { marginTop: 15, backgroundColor: '#BC002A', padding: 10, borderRadius: 10, alignItems: 'center' },
    backgroundImage: { resizeMode: 'cover', opacity: 0.6 },
    overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)' },
    selfVideoContainer: { position: 'absolute', width: 110, height: 160, borderRadius: 16, overflow: 'hidden', backgroundColor: '#333', zIndex: 50 },
    selfVideo: { flex: 1 },
    selfVideoPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1f1f1f' },
    content: { flex: 1, justifyContent: 'space-between', zIndex: 20 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20 },
    securityBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, gap: 6 },
    securityText: { color: 'rgba(255,255,255,0.6)', fontSize: 10 },
    mainInfo: { alignItems: 'center', marginBottom: 40 },
    avatarWrapper: { width: 180, height: 180, justifyContent: 'center', alignItems: 'center', marginBottom: 30 },
    pulseRing: { position: 'absolute', width: 170, height: 170, borderRadius: 85, borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)' },
    textContainer: { alignItems: 'center' },
    contactName: { color: 'white', fontSize: 32, fontWeight: 'bold' },
    callStatus: { color: 'rgba(255,255,255,0.7)', fontSize: 18, marginTop: 8 },
    controlsBar: { marginHorizontal: 20, borderRadius: 35, paddingVertical: 15, paddingHorizontal: 10 },
    controlsRow: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center' },
    controlBtn: { width: 54, height: 54, borderRadius: 27, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
    controlBtnActive: { backgroundColor: 'rgba(255,255,255,0.9)' },
    iconButton: { padding: 8, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)' },
    incomingActionsRow: { flexDirection: 'row', justifyContent: 'space-around', width: '100%' },
    actionButton: { width: 70, height: 70, borderRadius: 35, justifyContent: 'center', alignItems: 'center' },
    endCallBtn: { backgroundColor: '#ef4444', width: 64, height: 64, borderRadius: 32 },
    pipOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
    pipTitleBar: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)', padding: 10, borderRadius: 15 },
    pipName: { color: 'white', fontSize: 12, fontWeight: 'bold' },
});
