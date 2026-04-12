import { NativeModules, Platform, PermissionsAndroid } from 'react-native';
import { normalizeId } from '../utils/idNormalization';
import Constants from 'expo-constants';
import { Audio as ExpoAudio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import { callService, CallSignal } from './CallService';
import * as ENV from '../config/env';

// Safe imports for WebRTC core modules.
// Importing the root package eagerly also loads RTCView, which can fail in
// builds where the video view manager is unavailable even if core calling works.
let RTCPeerConnection: any;
let RTCSessionDescription: any;
let RTCIceCandidate: any;
let mediaDevices: any;
let MediaStream: any;
let webRTCCoreLoadError: string | null = null;
let webRTCNativeModule: any = null;
let webRTCNativeReady = false;

try {
    webRTCNativeModule = (NativeModules as any)?.WebRTCModule ?? null;
    webRTCNativeReady =
        !!webRTCNativeModule &&
        typeof webRTCNativeModule.peerConnectionInit === 'function' &&
        typeof webRTCNativeModule.getUserMedia === 'function';
    if (!webRTCNativeReady) {
        webRTCCoreLoadError =
            'WebRTC native module missing in this build. Rebuild Android/iOS dev client after prebuild.';
        console.log('[WebRTCService] WebRTC native module unavailable:', {
            hasModule: !!webRTCNativeModule,
            hasPeerConnectionInit: typeof webRTCNativeModule?.peerConnectionInit === 'function',
            hasGetUserMedia: typeof webRTCNativeModule?.getUserMedia === 'function',
        });
    }
} catch (e: any) {
    webRTCCoreLoadError = e?.message || 'unknown-native-module-error';
    console.log('[WebRTCService] Failed to inspect WebRTC native module:', webRTCCoreLoadError);
}

try {
    RTCPeerConnection = require('react-native-webrtc/lib/commonjs/RTCPeerConnection').default;
    RTCSessionDescription = require('react-native-webrtc/lib/commonjs/RTCSessionDescription').default;
    RTCIceCandidate = require('react-native-webrtc/lib/commonjs/RTCIceCandidate').default;
    mediaDevices = require('react-native-webrtc/lib/commonjs/MediaDevices').default;
    MediaStream = require('react-native-webrtc/lib/commonjs/MediaStream').default;

    // CRITICAL: The main package entry (react-native-webrtc/index) calls setupNativeEvents()
    // which bridges native WebRTC events to JS. Since we import individual files to avoid
    // eagerly loading RTCView, we must call it explicitly — without this, NO events
    // (ICE candidates, connection state, gathering state, etc.) reach JavaScript.
    const { setupNativeEvents } = require('react-native-webrtc/lib/commonjs/EventEmitter');
    setupNativeEvents();
    console.log('[WebRTCService] ✅ setupNativeEvents() bridge activated');
} catch (e: any) {
    webRTCCoreLoadError = webRTCCoreLoadError || e?.message || 'unknown';
    console.log('[WebRTCService] Native modules not available:', webRTCCoreLoadError);
}

// Global reference for InCallManager
let InCallManager: any = null;
try {
    InCallManager = require('react-native-incall-manager').default;
    console.log('[WebRTCService] InCallManager loaded successfully');
} catch (e) {
    console.warn('[WebRTCService] InCallManager not available:', e);
}

// STUN/TURN servers for NAT traversal
//
// WHY TURN IS CRITICAL:
//   - STUN alone only works when both devices are on the same network (WiFi ↔ WiFi)
//   - When either user is on 4G/5G or behind a strict NAT/firewall, STUN fails
//   - TURN relays media through the server as a fallback — this is what WhatsApp does
//
// CURRENT SETUP:
//   1. Google STUN (fast, for same-network / simple NAT)
//   2. Open Relay Project by Metered (free TURN — works on 4G/5G cross-network, no signup)
//   3. ENV-configured TURN (for production self-hosted / paid upgrade)
//
const buildTurnEntries = (server: string, user: string, pass: string): any[] => {
  if (!server || server.length < 4 || server.includes('yourdomain') || server.includes('backup-turn')) return [];
  // Standard format: turn:host:port (avoid query params that can crash some native builds)
  return [
    { urls: 'turn:' + server, username: user, credential: pass },
  ];
};

const CUSTOM_TURN_SERVERS: any[] = [
  ...buildTurnEntries(ENV.TURN_SERVER, ENV.TURN_USERNAME, ENV.TURN_PASSWORD),
  ...buildTurnEntries(ENV.TURN_SERVER_2, ENV.TURN_USERNAME_2, ENV.TURN_PASSWORD_2),
];

// FREE TURN FALLBACK
//
// HOW TO GET WORKING TURN (required for emulator↔simulator & cross-network):
//   1. Go to https://www.metered.ca/stun-turn  (free 500GB/mo, no credit card)
//   2. Sign up → Dashboard → TURN Server → Copy credentials
//   3. Paste into .env:
//        EXPO_PUBLIC_TURN_SERVER=a]standard.relay.metered.ca:443
//        EXPO_PUBLIC_TURN_USERNAME=<your API key>
//        EXPO_PUBLIC_TURN_PASSWORD=<your API secret>
//
// Without TURN, calls only work on the SAME WiFi network.
// Emulator ↔ Simulator ALWAYS needs TURN (different virtual networks).
//
// OpenRelay Project — free public TURN, no signup needed
// Source: https://www.metered.ca/tools/openrelay/
const OPEN_RELAY_TURN_SERVERS: any[] = [
  // STUN servers (for discovering public IPs)
  { urls: 'stun:stun.relay.metered.ca:80' },
  { urls: 'stun:stun.relay.metered.ca:443' },
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  // OpenRelay TURN — free, no signup, works from any network
  // These are the officially published free credentials for the Open Relay Project
  { urls: 'turn:openrelay.metered.ca:80',  username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:80?transport=tcp',  username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
  // Cloudflare STUN
  { urls: 'stun:stun.cloudflare.com:3478' },
];

// Runtime TURN credential cache (fetched from Metered API at call time)
let _cachedMeteredTurnServers: any[] = [];
let _cachedMeteredTurnExpiry: number = 0;

async function fetchMeteredTurnCredentials(): Promise<any[]> {
  const apiKey = ENV.METERED_API_KEY;
  if (!apiKey || apiKey.length < 5) return [];

  // Return cached if fresh (credentials last 24h, we refresh every 12h)
  if (_cachedMeteredTurnServers.length > 0 && Date.now() < _cachedMeteredTurnExpiry) {
    return _cachedMeteredTurnServers;
  }

  try {
    console.log('[WebRTCService] 🔑 Fetching TURN credentials from Metered.ca...');
    const response = await fetch(
      `https://soul.metered.live/api/v1/turn/credentials?apiKey=${apiKey}`,
      { method: 'GET', headers: { 'Content-Type': 'application/json' } }
    );

    if (!response.ok) {
      console.warn('[WebRTCService] Metered API error:', response.status);
      return [];
    }

    const credentials = await response.json();
    if (Array.isArray(credentials) && credentials.length > 0) {
      _cachedMeteredTurnServers = credentials;
      _cachedMeteredTurnExpiry = Date.now() + 12 * 60 * 60 * 1000; // 12h
      console.log(`[WebRTCService] ✅ Got ${credentials.length} TURN servers from Metered`);
      return credentials;
    }
  } catch (error: any) {
    console.warn('[WebRTCService] Failed to fetch Metered TURN:', error?.message);
  }

  return [];
}

const LOCAL_TURN_USER = 'openrelayproject';
const LOCAL_TURN_PASS = 'openrelayproject';

// DYNAMIC LOCAL TURN: Correctly bridge Emulator -> Host machine
const getLocalTurnServers = (): any[] => {
  if (!Constants.isDevice) {
    // Android Emulator needs 10.0.2.2 to reach host services.
    // iOS Simulator can use 127.0.0.1.
    const host = Platform.OS === 'android' ? '10.0.2.2' : '127.0.0.1';
    return [
      { urls: `turn:${host}:3478?transport=tcp`, username: LOCAL_TURN_USER, credential: LOCAL_TURN_PASS },
      { urls: `turn:${host}:3478?transport=udp`, username: LOCAL_TURN_USER, credential: LOCAL_TURN_PASS },
      { urls: `stun:${host}:3478` }
    ];
  }
  return [];
};

const ICE_SERVERS: any[] = [
  ...getLocalTurnServers(),
  ...CUSTOM_TURN_SERVERS,
  ...OPEN_RELAY_TURN_SERVERS,
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const SAFE_FALLBACK_STUN_SERVERS: any[] = [
  ...getLocalTurnServers(), // Include local even in fallback
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

const HAS_CUSTOM_TURN =
    CUSTOM_TURN_SERVERS.length > 0;

type CallType = 'audio' | 'video';
type CallState = 'idle' | 'ringing' | 'connecting' | 'connected' | 'ended';
type AudioOutput = 'speaker' | 'earpiece';

const IOS_CALL_INTERRUPTION_MODE =
    (InterruptionModeIOS as any)?.DoNotMix ?? 1;
const ANDROID_CALL_INTERRUPTION_MODE =
    (InterruptionModeAndroid as any)?.DoNotMix ?? 1;

interface WebRTCCallbacks {
    onStateChange: (state: CallState) => void;
    onLocalStream: (stream: MediaStream | null) => void;
    onRemoteStream: (stream: MediaStream | null) => void;
    onError: (error: string) => void;
}

class WebRTCService {
    private peerConnection: RTCPeerConnection | null = null;
    private listeners: WebRTCCallbacks[] = [];
    private localStream: MediaStream | null = null;
    private remoteStream: MediaStream | null = null;
    private lastStats: any = { bytesReceived: 0 };
    private callType: CallType = 'audio';
    private callState: CallState = 'idle';
    private isInitiator: boolean = false;
    private partnerHasAccepted: boolean = false;
    private pendingCandidates: RTCIceCandidate[] = [];
    private earlySignalQueue: CallSignal[] = [];
    private pendingCandidatesMutex: boolean = false;
    private mediaStreamAttempted: boolean = false;
    private readonly SIGNAL_POLL_OVERLAP_MS = 10000;
    private readonly MAX_PENDING_CANDIDATES = 50;
    private signalingRole: 'offerer' | 'answerer' | 'none' = 'none';

    // Recovery tracking
    private reconnectAttempts: number = 0;
    private maxReconnectAttempts: number = 5;
    private reconnectTimeout: NodeJS.Timeout | null = null;
    private connectionWatchdog: NodeJS.Timeout | null = null;
    private trackMonitorTimer: NodeJS.Timeout | null = null;
    private readonly TRACK_MONITOR_INTERVAL_MS = 3000;
    private lastDisconnectTime: number = 0;
    private lastRecoveryAttemptAt: number = 0;
    private readonly RECOVERY_COOLDOWN_MS = 12000;
    private offerRetryTimer: NodeJS.Timeout | null = null;
    private offerRetryAttempts: number = 0;
    private readonly MAX_OFFER_RETRIES = 6;
    private micPermissionGranted: boolean = false;
    private isAudioSessionActive: boolean = false;
    private speakerEnabled: boolean = false;
    private hasManualAudioOutputOverride: boolean = false;

    isAvailable(): boolean {
        return webRTCNativeReady
            && !!RTCPeerConnection
            && !!RTCSessionDescription
            && !!RTCIceCandidate
            && !!mediaDevices
            && !!MediaStream;
    }

    getAvailabilityError(): string {
        if (!webRTCNativeReady) {
            return webRTCCoreLoadError
                || 'WebRTC native module missing in current binary. Build a dev client with react-native-webrtc linked.';
        }
        return webRTCCoreLoadError || 'WebRTC core modules are unavailable in the current build.';
    }

    private ensureTurnReadinessOrThrow(): void {
        if (ENV.CALL_REQUIRE_CUSTOM_TURN && !HAS_CUSTOM_TURN) {
            const message =
                'Calling is blocked: custom TURN server is not configured. Set EXPO_PUBLIC_TURN_SERVER/USERNAME/PASSWORD.';
            console.error('[WebRTCService] ' + message);
            this.broadcast('onError', message);
            throw new Error(message);
        }
    }

    private getPreferredSpeakerForCallType(callType: CallType = this.callType): boolean {
        if (!Constants.isDevice) {
            // Simulators/emulators generally do not have a real earpiece route.
            return true;
        }
        return callType === 'video';
    }

    async ensureMicrophonePermission(autoRequest: boolean = true): Promise<boolean> {
        if (this.micPermissionGranted) {
            return true;
        }

        try {
            const currentPermission = await ExpoAudio.getPermissionsAsync();
            if (currentPermission.granted) {
                this.micPermissionGranted = true;
                return true;
            }

            if (autoRequest) {
                const requestedPermission = await ExpoAudio.requestPermissionsAsync();
                if (requestedPermission.granted) {
                    this.micPermissionGranted = true;
                    return true;
                }
            }
        } catch (error: any) {
            console.warn('[WebRTCService] Expo microphone permission check failed:', error?.message || error);
        }

        if (Platform.OS === 'android' && PermissionsAndroid?.PERMISSIONS?.RECORD_AUDIO) {
            try {
                const status = await PermissionsAndroid.request(
                    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
                );
                if (status === PermissionsAndroid.RESULTS.GRANTED) {
                    this.micPermissionGranted = true;
                    return true;
                }
            } catch (error: any) {
                console.warn('[WebRTCService] Android microphone permission check failed:', error?.message || error);
            }
        }

        this.micPermissionGranted = false;
        return false;
    }

    getAudioOutput(): AudioOutput {
        return this.speakerEnabled ? 'speaker' : 'earpiece';
    }

    isSpeakerEnabled(): boolean {
        return this.speakerEnabled;
    }

    private async applyExpoCallAudioMode(): Promise<void> {
        await ExpoAudio.setAudioModeAsync({
            allowsRecordingIOS: true,
            playsInSilentModeIOS: true,
            staysActiveInBackground: true,
            interruptionModeIOS: IOS_CALL_INTERRUPTION_MODE,
            shouldDuckAndroid: false,
            interruptionModeAndroid: ANDROID_CALL_INTERRUPTION_MODE,
            playThroughEarpieceAndroid: !this.speakerEnabled,
        });
    }

    private applyNativeAudioRoute(): void {
        if (!InCallManager) return;

        try {
            InCallManager.setSpeakerphoneOn(this.speakerEnabled);
            InCallManager.setForceSpeakerphoneOn(this.speakerEnabled);
            InCallManager.setMicrophoneMute(false);
        } catch (error) {
            console.warn('[WebRTCService] Failed to apply native audio route:', error);
        }
    }

    async setAudioOutput(output: AudioOutput | boolean, manualOverride: boolean = true): Promise<void> {
        const nextSpeakerState = typeof output === 'boolean' ? output : output === 'speaker';
        this.speakerEnabled = nextSpeakerState;
        if (manualOverride) {
            this.hasManualAudioOutputOverride = true;
        }

        if (!this.isAudioSessionActive && this.callState !== 'ringing' && this.callState !== 'connecting' && this.callState !== 'connected') {
            return;
        }

        try {
            await this.applyExpoCallAudioMode();
            this.applyNativeAudioRoute();
        } catch (error) {
            console.warn('[WebRTCService] Failed to set audio output:', error);
        }
    }

    private async activateAudioSession(context: string): Promise<void> {
        const micGranted = await this.ensureMicrophonePermission(true);
        if (!micGranted) {
            throw new Error('Microphone permission is required for calling.');
        }

        if (!this.hasManualAudioOutputOverride) {
            this.speakerEnabled = this.getPreferredSpeakerForCallType(this.callType);
        }

        try {
            await this.applyExpoCallAudioMode();
        } catch (error) {
            console.warn('[WebRTCService] Failed to apply Expo call audio mode:', error);
        }

        if (InCallManager) {
            try {
                if (!this.isAudioSessionActive) {
                    InCallManager.start({ media: this.callType });
                }
                InCallManager.setKeepScreenOn(true);
                this.applyNativeAudioRoute();
            } catch (error) {
                console.warn('[WebRTCService] Failed to activate native audio session:', error);
            }
        }

        this.isAudioSessionActive = true;
        console.log(`[WebRTCService] Audio session active (${context}) output=${this.getAudioOutput()}`);
    }

    private async deactivateAudioSession(context: string): Promise<void> {
        if (InCallManager) {
            try {
                InCallManager.setKeepScreenOn(false);
                InCallManager.stop();
            } catch (error) {
                console.warn('[WebRTCService] Failed to stop native audio session:', error);
            }
        }

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
        } catch (error) {
            console.warn('[WebRTCService] Failed to reset Expo audio mode:', error);
        }

        this.isAudioSessionActive = false;
        this.hasManualAudioOutputOverride = false;
        this.speakerEnabled = false;
        console.log(`[WebRTCService] Audio session released (${context})`);
    }

    private sanitizeIceUrl(url: string): string | null {
        if (typeof url !== 'string') return null;
        const trimmedUrl = url.trim();
        if (!trimmedUrl) return null;

        const lowerUrl = trimmedUrl.toLowerCase();
        const isStun = lowerUrl.startsWith('stun:') || lowerUrl.startsWith('stuns:');
        const isTurn = lowerUrl.startsWith('turn:') || lowerUrl.startsWith('turns:');
        if (!isStun && !isTurn) return null;

        // STUN URLs with query params often break native parsers on iOS.
        if (isStun && trimmedUrl.includes('?')) {
            return trimmedUrl.split('?')[0];
        }

        return trimmedUrl;
    }

    private normalizeIceServer(server: any): any | null {
        if (!server) return null;

        const rawUrls = server.urls ?? server.url;
        const urlCandidates = Array.isArray(rawUrls) ? rawUrls : [rawUrls];
        const sanitizedUrls = urlCandidates
            .map((candidate: any) => this.sanitizeIceUrl(String(candidate || '')))
            .filter((value): value is string => !!value);

        const uniqueUrls: string[] = [];
        sanitizedUrls.forEach((url) => {
            if (!uniqueUrls.includes(url)) {
                uniqueUrls.push(url);
            }
        });

        if (uniqueUrls.length === 0) return null;

        const turnUrls = uniqueUrls.filter((url) => url.toLowerCase().startsWith('turn'));
        const stunUrls = uniqueUrls.filter((url) => !url.toLowerCase().startsWith('turn'));
        const username = typeof server.username === 'string' ? server.username : '';
        const credential = typeof server.credential === 'string' ? server.credential : '';

        // TURN without credentials can break native initialization on iOS.
        if (turnUrls.length > 0 && (!username || !credential)) {
            console.warn('[WebRTCService] Dropping TURN server due to missing credentials');
            if (stunUrls.length === 0) {
                return null;
            }
            return {
                urls: stunUrls.length === 1 ? stunUrls[0] : stunUrls,
            };
        }

        const normalized: any = {
            urls: uniqueUrls.length === 1 ? uniqueUrls[0] : uniqueUrls,
        };

        if (turnUrls.length > 0) {
            normalized.username = username;
            normalized.credential = credential;
        }

        return normalized;
    }

    private async getNormalizedIceServers(): Promise<any[]> {
        const normalizedServers: any[] = [];
        const seenKeys = new Set<string>();

        const appendServer = (server: any): void => {
            const normalized = this.normalizeIceServer(server);
            if (!normalized) return;

            const urls = Array.isArray(normalized.urls) ? normalized.urls : [normalized.urls];
            const key = `${urls.join(',')}|${normalized.username || ''}|${normalized.credential || ''}`;
            if (seenKeys.has(key)) return;

            seenKeys.add(key);
            normalizedServers.push(normalized);
        };

        // 1. Fetch fresh credentials from Metered if API key exists
        const meteredServers = await fetchMeteredTurnCredentials();
        meteredServers.forEach(appendServer);

        // 2. Add static configurations from ICE_SERVERS
        ICE_SERVERS.forEach(appendServer);
        
        if (normalizedServers.length === 0) {
            SAFE_FALLBACK_STUN_SERVERS.forEach(appendServer);
        }

        return normalizedServers;
    }

    private getPrimaryPeerConnectionConfig(iceServers: any[]): any {
        return {
            iceServers,
            sdpSemantics: 'unified-plan',
            iceCandidatePoolSize: 10,
            // 'all' allows both direct (host/srflx) and relay candidates.
            // 'relay' would ONLY work if TURN auth succeeds — risky for dev.
            iceTransportPolicy: ENV.CALL_FORCE_RELAY ? 'relay' : 'all',
        };
    }

    private getPeerConnectionConfigs(): any[] {
        // Build all available ICE servers (STUN + TURN)
        const allServers = [
            ...CUSTOM_TURN_SERVERS,
            ...OPEN_RELAY_TURN_SERVERS,
            ...SAFE_FALLBACK_STUN_SERVERS,
        ].filter(s => !!s && s?.urls);

        const turnOnlyServers = allServers.filter(
            s => typeof s.urls === 'string' && s.urls.startsWith('turn:')
        );

        // For virtual environments (Android Emulator / iOS Simulator), we prefer 'all' 
        // but prioritize our local relay entry. 'relay' policy is too strict if 
        // the local turnserver has auth issues.
        const primaryPolicy = 'all';

        console.log(`[WebRTCService] 🛠️ ICE pool: ${allServers.length} servers (${turnOnlyServers.length} TURN) | Policy: ${primaryPolicy}`);

        return [
            {
                // PRIMARY: uses 'all' to allow STUN/Host fallbacks, but local TURN is first in server list.
                iceServers: allServers,
                iceTransportPolicy: primaryPolicy,
                iceCandidatePoolSize: 10,
                sdpSemantics: 'unified-plan',
                bundlePolicy: 'max-bundle',
                rtcpMuxPolicy: 'require',
            },
            {
                // FALLBACK 1: Forced relay for strict firewalls
                iceServers: turnOnlyServers.length > 0 ? turnOnlyServers : allServers,
                iceTransportPolicy: 'relay',
                iceCandidatePoolSize: 5,
                sdpSemantics: 'unified-plan',
                bundlePolicy: 'max-bundle',
                rtcpMuxPolicy: 'require',
            },
            {
                // FALLBACK 2: TCP only 
                iceServers: allServers.filter(s => {
                    const urls = Array.isArray(s.urls) ? s.urls : [s.urls];
                    return urls.some((u: string) => u.includes('tcp') || u.startsWith('stun:') || (u.startsWith('turn:') && u.includes('443')));
                }),
                iceTransportPolicy: 'all',
                iceCandidatePoolSize: 3,
                sdpSemantics: 'unified-plan',
                bundlePolicy: 'max-bundle',
                rtcpMuxPolicy: 'require',
            },
        ];
    }

    private tryCreatePeerConnection(config: any, label: string): RTCPeerConnection {
        const iceServers = config?.iceServers || [];
        const policy = config?.iceTransportPolicy || 'all';
        
        console.log(`[WebRTCService] [BRIDGE] 🚀 Initializing [${label}]`);
        console.log(`[WebRTCService] [BRIDGE] 🛠️ Policy: ${policy.toUpperCase()}`);
        
        iceServers.forEach((s: any, idx: number) => {
            const urls = Array.isArray(s.urls) ? s.urls.join(', ') : s.urls;
            console.log(`[WebRTCService] [BRIDGE] 📍 ICE Server ${idx + 1}: ${urls}`);
        });

        const pc = new RTCPeerConnection(config);

        // --- DEFENSIVE STATE LOGGING & RECOVERY ---
        pc.oniceconnectionstatechange = () => {
            const state = pc.iceConnectionState;
            console.log(`[WebRTCService] [${label}] 🧊 ICE State: ${state.toUpperCase()}`);
            
            if (state === 'failed') {
                console.error('[WebRTCService] ❌ ICE Failed — attempting restart');
                // Try ICE restart
                this.attemptIceRestart().catch(err => {
                    console.error('[WebRTCService] ICE restart failed:', err);
                });
            }
            if (state === 'connected' || state === 'completed') {
                console.log('[WebRTCService] ✅ ICE connected — media path confirmed');
                this.setState('connected');
                this.reconnectAttempts = 0; // Reset on successful connection
            }
            if (state === 'disconnected') {
                console.warn('[WebRTCService] ⚠️ ICE disconnected — waiting for recovery');
            }
        };

        pc.onconnectionstatechange = () => {
            const state = pc.connectionState;
            console.log(`[WebRTCService] [${label}] 🌐 Peer State: ${state.toUpperCase()}`);
            
            switch (state) {
                case 'connected':
                    this.setState('connected');
                    this.reconnectAttempts = 0;
                    if (this.reconnectTimeout) {
                        clearTimeout(this.reconnectTimeout);
                        this.reconnectTimeout = null;
                    }
                    break;
                case 'disconnected':
                    console.warn('[WebRTCService] ⚠️ Peer disconnected — starting watchdog');
                    this.lastDisconnectTime = Date.now();
                    this.startConnectionWatchdog();
                    break;
                case 'failed':
                    console.error('[WebRTCService] ❌ Peer failed — attempting recovery');
                    this.attemptRecovery();
                    break;
                case 'closed':
                    console.log('[WebRTCService] 🚫 Peer closed');
                    this.endCall('peer-closed');
                    break;
            }
        };

        pc.onsignalingstatechange = () => {
            console.log(`[WebRTCService] [${label}] 📡 Signaling: ${pc.signalingState.toUpperCase()}`);
        };

        // Track monitor: ensure tracks don't go missing
        this.startTrackMonitor();

        pc.onnegotiationneeded = async () => {
            try {
                if (pc.signalingState !== 'stable') return;
                console.log(`[WebRTCService] [${label}] 🔄 Negotiation needed — ${this.isInitiator ? 'creating offer' : 'waiting for remote'}`);
                
                if (this.isInitiator) {
                    const offer = await pc.createOffer();
                    await pc.setLocalDescription(offer);
                    await callService.sendOffer(offer);
                }
            } catch (err: any) {
                console.warn('[WebRTCService] Negotiation failed:', err?.message);
            }
        };

        // ICE candidate handling is set up in createPeerConnection() via addEventListener.
        // Do NOT set pc.onicecandidate here — it would be overwritten and the property
        // assignment can conflict with addEventListener in react-native-webrtc.

        // --- DIAGNOSTICS: ICE CANDIDATE ERRORS ---
        pc.onicecandidateerror = (event: any) => {
            console.warn(`[WebRTCService] [${label}] 🧊 ICE Candidate Error:`, {
                errorCode: event.errorCode,
                errorText: event.errorText,
                url: event.url,
                msg: "If this mentions port 3478, your local turnserver is rejecting the connection!"
            });
        };

        // Track ICE gathering state
        pc.onicegatheringstatechange = () => {
            console.log(`[WebRTCService] [${label}] 🧊 ICE Gathering: ${pc.iceGatheringState.toUpperCase()}`);
        };

        return pc;
    }

    /**
     * Add a listener for WebRTC events
     */
    addListener(listener: WebRTCCallbacks): void {
        if (!this.listeners.includes(listener)) {
            this.listeners.push(listener);
            console.log(`[WebRTCService] Listener added. Total: ${this.listeners.length}`);
            
            // Immediately sync current state to new listener
            listener.onStateChange(this.callState);
            if (this.localStream) listener.onLocalStream(this.localStream);
            if (this.remoteStream) listener.onRemoteStream(this.remoteStream);
        }
    }

    /**
     * Remove a listener
     */
    removeListener(listener: WebRTCCallbacks): void {
        this.listeners = this.listeners.filter(l => l !== listener);
        console.log(`[WebRTCService] Listener removed. Total: ${this.listeners.length}`);
    }

    /**
     * @deprecated Use addListener
     */
    initialize(callbacks: WebRTCCallbacks, isInitiator: boolean): void {
        this.isInitiator = isInitiator;
        this.addListener(callbacks);
        console.log(`[WebRTCService] Initializing (Compatible Mode). Role: ${isInitiator ? 'Initiator' : 'Receiver'}`);

        if (!this.peerConnection) {
            this.localStream = null;
            this.mediaStreamAttempted = false;
            this.remoteStream = null;
            this.partnerHasAccepted = false;
            this.setState('idle');
            this.pendingCandidates = [];
        }

        // RE-LINK SIGNALING BRIDGE
        callService.addListener(async (signal) => {
            const { type, payload } = signal;
            const { candidate, offer, answer } = payload || {};
            
            // Only process signals if we are in a relevant call state.
            // ALERT: We MUST allow 'offer' while 'idle' or else the receiver will never answer!
            if (this.callState === 'ended') return;
            if (this.callState === 'idle' && type !== 'offer') return;

            const sender = (signal as any).sender_id || signal.callerId;
            console.log(`[WebRTCService] 📨 Signal received: ${type} from ${sender}`);

            try {
                switch (type) {
                    case 'offer':
                        if (!this.isInitiator && offer) {
                            await this.answerCall(this.callType, offer);
                        }
                        break;
                    case 'answer':
                        if (this.isInitiator && answer && this.peerConnection) {
                            console.log('[WebRTCService] 📝 Setting remote description (answer)');
                            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer as any));
                            await this.processPendingCandidates();
                        }
                        break;
                    case 'ice-candidate':
                        if (candidate && this.peerConnection) {
                            try {
                                // NORMALIZE: Ensure candidate has all required fields in the correct format
                                const candidateData = {
                                    candidate: candidate.candidate || candidate,
                                    sdpMid: candidate.sdpMid,
                                    sdpMLineIndex: candidate.sdpMLineIndex
                                };
                                
                                console.log(`[WebRTCService] 🧊 Applying remote candidate: ${candidateData.candidate.substring(0, 30)}...`);
                                const iceCandidate = new RTCIceCandidate(candidateData);
                                
                                if (this.peerConnection.remoteDescription && this.peerConnection.remoteDescription.type) {
                                    await this.peerConnection.addIceCandidate(iceCandidate);
                                    console.log('[WebRTCService] ✅ Remote candidate applied successfully');
                                } else {
                                    console.log('[WebRTCService] 📥 Queueing candidate (remote description not yet set)');
                                    this.pendingCandidates.push(iceCandidate);
                                }
                            } catch (e: any) {
                                console.warn('[WebRTCService] ❌ Failed to add ICE candidate:', e.message);
                            }
                        }
                        break;
                    case 'call-end':
                        this.endCall('remote-hangup');
                        break;
                }
            } catch (err) {
                console.warn(`[WebRTCService] ❌ Error processing signal [${type}]:`, err);
            }
        });
    }

    /**
     * @deprecated Use addListener/removeListener
     */
    setCallbacks(callbacks: WebRTCCallbacks | null): void {
        if (callbacks) {
            this.addListener(callbacks);
        }
    }

    /**
     * Set the role of this device (initiator/caller or receiver/callee)
     */
    setInitiator(val: boolean): void {
        this.isInitiator = val;
    }

    /**
     * Get current local stream
     */
    getLocalStream(): MediaStream | null {
        return this.localStream;
    }

    /**
     * Get current remote stream
     */
    getRemoteStream(): MediaStream | null {
        return this.remoteStream;
    }

    /**
     * Check if a call is currently active
     */
    isCallActive(): boolean {
        return !!this.peerConnection && (this.callState === 'connected' || this.callState === 'connecting' || this.callState === 'ringing');
    }

    /**
     * Prepare for a call (get media permissions and stream ONLY — no PeerConnection)
     * PeerConnection is created by startCall() or answerCall() to avoid double-creation.
     */
    async prepareCall(callType: CallType): Promise<void> {
        console.log(`[WebRTCService] 🛠️ prepareCall starting (Type: ${callType})...`);
        this.callType = callType;

        // Only get media — do NOT create PeerConnection or change state here.
        // startCall/answerCall handle PC creation and state transitions.
        if (this.localStream) {
            console.log('[WebRTCService] prepareCall: local stream already exists, skipping');
            return;
        }

        console.log('[WebRTCService] 🎙️ Getting media stream...');
        await this.getMediaStream();
        console.log('[WebRTCService] ✅ prepareCall complete. Stream ready.');
    }

    async startCall(): Promise<void> {
        if (this.isCallActive() && this.isInitiator) {
            console.log('[WebRTCService] startCall ignored: Call already active as Initiator.');
            return;
        }

        try {
            if (!this.isAvailable()) {
                const message = this.getAvailabilityError();
                this.broadcast('onError', message);
                throw new Error(message);
            }
            this.ensureTurnReadinessOrThrow();

            console.log('[WebRTCService] Starting call as Initiator');
            this.isInitiator = true;
            this.hasManualAudioOutputOverride = false;
            this.speakerEnabled = this.getPreferredSpeakerForCallType(this.callType);
            this.setState('ringing');
            await this.activateAudioSession('start-call');

            // Ensure media is ready. Wait for pending acquisition if needed.
            if (!this.localStream) {
                if (this.mediaStreamAttempted) {
                    console.log('[WebRTCService] ⏳ Waiting for pending media stream (caller)...');
                    let waited = 0;
                    while (!this.localStream && waited < 10000) {
                        await new Promise(r => setTimeout(r, 250));
                        waited += 250;
                    }
                }
                if (!this.localStream) {
                    this.mediaStreamAttempted = false;
                    await this.prepareCall(this.callType);
                }
            }

            // Create peer connection
            await this.createPeerConnection();

            // We wait for 'call-accepted' from the partner.
            console.log('[WebRTCService] ✅ Call initiated, waiting for partner to accept...');
            
            // If the partner accepted the call so fast that we received it before startCall finished:
            if (this.partnerHasAccepted) {
                console.log('[WebRTCService] ⚡ Partner already accepted before startCall finished. Generating offer instantly.');
                await this.onCallAccepted();
            }
        } catch (error: any) {
            console.error('[WebRTCService] ❌ Failed to start call:', error);
            this.broadcast('onError', `Failed to start call: ${error.message}`);
            this.endCall('start-failed');
        }
    }

    /**
     * Triggered when the initiator receives 'call-accepted'
     */
    async onCallAccepted(): Promise<void> {
        this.partnerHasAccepted = true;
        console.log(`[WebRTCService] ⚡ onCallAccepted called. PC: ${!!this.peerConnection}, initiator: ${this.isInitiator}, state: ${this.callState}`);
        
        if (this.isInitiator && this.peerConnection) {
            // Guard: don't create multiple offers if it gets called twice somehow
            if (this.peerConnection.signalingState !== 'stable') {
                console.log('[WebRTCService] ⚠️ Offer deferred: signalingState is', this.peerConnection.signalingState);
                if (this.offerRetryAttempts < this.MAX_OFFER_RETRIES && !this.offerRetryTimer) {
                    this.offerRetryAttempts++;
                    this.offerRetryTimer = setTimeout(() => {
                        this.offerRetryTimer = null;
                        if (this.callState === 'connecting' || this.callState === 'ringing') {
                            this.onCallAccepted().catch((error) => {
                                console.warn('[WebRTCService] Deferred offer retry failed:', error);
                            });
                        }
                    }, 500);
                }
                return;
            }
            
            console.log('[WebRTCService] 🚀 Partner accepted! Creating WebRTC offer NOW...');
            if (this.offerRetryTimer) {
                clearTimeout(this.offerRetryTimer);
                this.offerRetryTimer = null;
            }
            this.offerRetryAttempts = 0;
            this.signalingRole = 'offerer';
            this.setState('connecting');
            await this.createOffer();
            console.log('[WebRTCService] ✅ Offer created and sent!');
        } else {
            console.log(`[WebRTCService] ⏳ Partner accepted but we are not ready. PC: ${!!this.peerConnection}, initiator: ${this.isInitiator}`);
        }
    }

    /**
     * Answer an incoming call
     */
    async answerCall(callType: CallType, offer: RTCSessionDescriptionInit, roomId?: string): Promise<void> {
        try {
            this.ensureTurnReadinessOrThrow();

            if (this.peerConnection && this.peerConnection.signalingState !== 'stable') {
                console.log('[WebRTCService] Ignoring offer: signalingState is not stable:', this.peerConnection.signalingState);
                return;
            }

            // FORCE LATCH ROOM: Ensure CallService knows where the answer should go
            if (roomId) {
                callService.joinRoom(roomId);
            }

            this.callType = callType;
            this.isInitiator = false;
            this.signalingRole = 'answerer';
            this.hasManualAudioOutputOverride = false;
            this.speakerEnabled = this.getPreferredSpeakerForCallType(callType);
            this.setState('connecting');
            await this.activateAudioSession('answer-call');

            // Ensure media is ready. If another code path (e.g. CallScreen init)
            // already started getMediaStream, wait for it to finish rather than
            // skipping — otherwise the answer SDP will have no audio tracks.
            if (!this.localStream) {
                if (this.mediaStreamAttempted) {
                    // Another caller started getMediaStream — wait up to 10s
                    console.log('[WebRTCService] ⏳ Waiting for pending media stream...');
                    let waited = 0;
                    while (!this.localStream && waited < 10000) {
                        await new Promise(r => setTimeout(r, 250));
                        waited += 250;
                    }
                }
                // If still no stream, acquire it ourselves
                if (!this.localStream) {
                    this.mediaStreamAttempted = false;
                    await this.prepareCall(callType);
                }
            }

            // Create peer connection
            await this.createPeerConnection();

            // Set remote description (offer)
            const remoteDesc = new RTCSessionDescription(offer as any);
            await this.peerConnection!.setRemoteDescription(remoteDesc as any);

            // Process pending ICE candidates
            await this.processPendingCandidates();

            // Create and send answer
            await this.createAnswer();
            console.log('[WebRTCService] ✅ Call answered successfully');

        } catch (error: any) {
            console.error('[WebRTCService] ❌ Failed to answer call:', error);
            this.broadcast('onError', `Failed to answer call: ${error.message}`);
            this.endCall('answer-failed');
        }
    }

    /**
     * Handle incoming WebRTC signals
     */
    async handleSignal(signal: CallSignal): Promise<void> {
        console.log(`[WebRTCService] 📨 handleSignal: type=${signal.type}, from=${signal.callerId?.substring(0,8)}, hasPayload=${!!signal.payload}, callState=${this.callState}`);
        
        // [AUTO-CUT FIX] Ignore signals sent by OURSELVES (loopy signaling)
        const myId = callService.getUserId();
        if (myId) {
            const normalizedMyId = normalizeId(myId);
            const normalizedSenderId = normalizeId(signal.callerId || (signal as any).sender_id);
            
            if (normalizedMyId === normalizedSenderId) {
                console.log(`[WebRTCService] 🔇 Dropping self-echo: ${signal.type}`);
                return;
            }
        }

        try {
            // [STABILITY FIX] If PC isn't ready, QUEUE the signal instead of dropping it
            // Exception: 'offer' triggers the PC creation so it shouldn't be queued
            if (!this.peerConnection && signal.type !== 'offer') {
                console.log(`[WebRTCService] 📥 Queueing early signal: ${signal.type} (PC not ready)`);
                this.earlySignalQueue.push(signal);
                // Keep queue size manageable
                if (this.earlySignalQueue.length > 30) this.earlySignalQueue.shift();
                return;
            }

            switch (signal.type) {
                case 'offer':
                    console.log('Received WebRTC offer. Current state:', this.peerConnection?.signalingState);
                    
                    // GLARE PROTECTION: If we both send an offer, the "polite" peer lets the other win.
                    // We define "polite" as having the alphabetically later ID.
                    if (this.peerConnection?.signalingState === 'have-local-offer') {
                        const myId = callService.getUserId() || '';
                        const partnerId = signal.callerId || '';
                        if (myId.toLowerCase() < partnerId.toLowerCase()) {
                            console.log('[WebRTCService] 🚨 Signaling glare! We are "impolite", keeping our offer.');
                            return;
                        } else {
                            console.log('[WebRTCService] 🚨 Signaling glare! We are "polite", rolling back our offer to accept theirs.');
                            await this.peerConnection.setLocalDescription({ type: 'rollback' } as any);
                            
                            // Wait a short moment for state to settle to 'stable'
                            let waitState = 0;
                             while ((this.peerConnection.signalingState as string) !== 'stable' && waitState < 2000) {
                                await new Promise(r => setTimeout(r, 50));
                                waitState += 50;
                            }
                        }
                    }
                    
                    // PASS signal.callId to ensure CallService latches the room
                    await this.answerCall(signal.callType, signal.payload, signal.roomId || signal.callId);
                    break;

                case 'answer':
                    console.log(`Received WebRTC answer. Current state: ${this.peerConnection?.signalingState}`);
                    if (this.peerConnection && signal.payload) {
                        // Guard: Only apply answer if we are in a state that can transition.
                        // We allow 'stable' as a fallback to handle race conditions where an answer is re-sent.
                        const state = this.peerConnection.signalingState;
                        if (state !== 'have-local-offer' && state !== 'stable') {
                            console.log('[WebRTCService] ⚠️ Ignoring answer: signalingState is', state);
                            return;
                        }
                        
                        try {
                            const remoteDesc = new RTCSessionDescription(signal.payload);
                            await this.peerConnection.setRemoteDescription(remoteDesc);
                            console.log('[WebRTCService] ✅ Remote description (answer) set successfully');
                            await this.processPendingCandidates();
                        } catch (err) {
                            console.warn('[WebRTCService] ❌ Failed to set remote answer:', err);
                        }
                    }
                    break;

                case 'ice-candidate':
                    if (signal.payload) {
                        try {
                            const candidate = new RTCIceCandidate(signal.payload);
                            console.log(`[WebRTCService] 🧊 Adding remote ICE candidate: ${candidate.candidate?.split(' ').slice(0, 3).join(' ')}...`);
                            if (this.peerConnection?.remoteDescription) {
                                await this.peerConnection.addIceCandidate(candidate);
                            } else {
                                // FIX #1: Limit pending candidates to prevent memory leak
                                if (this.pendingCandidates.length >= this.MAX_PENDING_CANDIDATES) {
                                    console.warn('[WebRTCService] ICE candidate queue full, dropping oldest candidate');
                                    this.pendingCandidates.shift();
                                }
                                this.pendingCandidates.push(candidate);
                                console.log(`[WebRTCService] 📦 Buffered candidate (Total: ${this.pendingCandidates.length})`);
                            }
                        } catch (e) {
                            console.warn('[WebRTCService] Failed to add ICE candidate:', e);
                        }
                    }
                    break;

                case 'call-end':
                    console.log('Remote user ended call');
                    this.endCall();
                    break;
            }
        } catch (error: any) {
            // Check for known "wrong state" errors and suppress them if state is already correct
            if (error.message?.includes('stable') && this.peerConnection?.signalingState === 'stable') {
                console.log('[WebRTCService] Suppressed safe signaling state error');
                return;
            }
            console.error('Failed to handle signal:', error);
            this.broadcast('onError', `Signal handling failed: ${error.message}`);
        }
    }

    /**
     * End the current call
     */
    endCall(reason: string = 'manual'): void {
        console.log(`[WebRTCService] 🚨 endCall() called. Reason: ${reason}. Current state: ${this.callState}`);

        // Guard: prevent double-end
        if (this.callState === 'ended' || this.callState === 'idle') {
            console.log(`[WebRTCService] endCall() ignored (reason: ${reason}) - already ${this.callState}`);
            return;
        }

        // Mark state FIRST to prevent re-entrant calls
        this.setState('ended');

        // Stop local tracks
        if (this.localStream) {
            try {
                this.localStream.getTracks().forEach((track: any) => {
                    if (track && typeof track.stop === 'function') {
                        try {
                            track.stop();
                        } catch (e) {
                            console.warn('[WebRTCService] Error stopping track:', e);
                        }
                    }
                });
            } catch (e) {
                console.warn('[WebRTCService] Error getting tracks for stop:', e);
            }
            this.localStream = null;
        }

        // Close peer connection
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }

        this.remoteStream = null;
        this.pendingCandidates = [];
        this.partnerHasAccepted = false;
        this.isInitiator = false;
        this.signalingRole = 'none';
        if (this.offerRetryTimer) {
            clearTimeout(this.offerRetryTimer);
            this.offerRetryTimer = null;
        }
        this.offerRetryAttempts = 0;

        // STOP AUDIO SESSION: Release hardware
        void this.deactivateAudioSession(`end-call:${reason}`);

        // Notify listeners
        this.broadcast('onLocalStream', null);
        this.broadcast('onRemoteStream', null);

        // NOTE: Do NOT call callService.endCall() here.
        // The endCall signal is sent by AppContext.endCall() to avoid
        // a double-signal loop (AppContext -> webRTCService.endCall() -> callService.endCall() -> signal loop).

        // Reset state after short delay, but only if not cleaned up
        setTimeout(() => {
            if (this.listeners.length > 0 && this.callState === 'ended') {
                this.setState('idle');
            }
        }, 1000);
    }

    /**
     * Toggle mute on local audio
     */
    toggleMute(): boolean {
        if (this.localStream) {
            const audioTracks = this.localStream.getAudioTracks();
            if (audioTracks.length > 0) {
                const isCurrentlyEnabled = audioTracks[0].enabled;
                audioTracks.forEach((track: any) => {
                    track.enabled = !isCurrentlyEnabled;
                });
                return isCurrentlyEnabled; // Return true if now muted
            }
        }
        return false;
    }

    /**
     * Toggle local video
     */
    toggleVideo(): boolean {
        if (this.localStream && this.callType === 'video') {
            const videoTracks = this.localStream.getVideoTracks();
            if (videoTracks.length > 0) {
                const isCurrentlyEnabled = videoTracks[0].enabled;
                videoTracks.forEach((track: any) => {
                    track.enabled = !isCurrentlyEnabled;
                });
                return isCurrentlyEnabled; // Return true if video is now off
            }
        }
        return false;
    }

    /**
     * Switch call media mode between audio and video during an active call.
     * This keeps the same room/session and triggers renegotiation.
     */
    async switchCallType(nextType: CallType): Promise<void> {
        if (nextType === this.callType) return;

        console.log(`[WebRTCService] Switching call mode: ${this.callType} -> ${nextType}`);

        if (!this.peerConnection) {
            this.callType = nextType;
            if (!this.hasManualAudioOutputOverride) {
                this.speakerEnabled = this.getPreferredSpeakerForCallType(nextType);
            }
            await this.setAudioOutput(this.speakerEnabled, false);
            if (!this.localStream) {
                await this.prepareCall(nextType);
            }
            return;
        }

        if (nextType === 'video') {
            if (!mediaDevices?.getUserMedia) {
                throw new Error(this.getAvailabilityError());
            }

            if (!this.localStream) {
                this.callType = 'video';
                await this.getMediaStream();
            } else {
                const existingVideo = this.localStream.getVideoTracks();
                if (existingVideo.length === 0) {
                    const camStream = await mediaDevices.getUserMedia({
                        audio: false,
                        video: { facingMode: 'user' },
                    });
                    const videoTracks = camStream?.getVideoTracks?.() || [];
                    for (const track of videoTracks) {
                        track.enabled = true;
                        try { this.localStream.addTrack(track); } catch (_) {}
                        try { this.peerConnection.addTrack(track, this.localStream); } catch (_) {}
                    }
                } else {
                    existingVideo.forEach((track: any) => { track.enabled = true; });
                }
            }
        } else {
            // Downgrade to audio: remove local video tracks and related senders
            if (this.localStream) {
                const videoTracks = this.localStream.getVideoTracks();
                for (const track of videoTracks) {
                    try { track.enabled = false; } catch (_) {}
                    try { track.stop(); } catch (_) {}
                    try { this.localStream.removeTrack(track); } catch (_) {}
                }
            }

            try {
                const senders = this.peerConnection.getSenders?.() || [];
                for (const sender of senders) {
                    const senderTrack = sender?.track;
                    if (senderTrack?.kind === 'video') {
                        try { await sender.replaceTrack(null); } catch (_) {}
                        try { this.peerConnection.removeTrack(sender); } catch (_) {}
                    }
                }
            } catch (error) {
                console.warn('[WebRTCService] Failed to remove video sender during audio downgrade:', error);
            }
        }

        this.callType = nextType;
        this.broadcast('onLocalStream', this.localStream);

        // Update audio routing for the new mode
        if (!this.hasManualAudioOutputOverride) {
            this.speakerEnabled = this.getPreferredSpeakerForCallType(nextType);
        }
        await this.setAudioOutput(this.speakerEnabled, false);

        // Trigger renegotiation from this side if we're in a stable state.
        if (this.peerConnection.signalingState === 'stable') {
            await this.createOffer();
        } else {
            console.log(`[WebRTCService] Skipping immediate renegotiation, signalingState=${this.peerConnection.signalingState}`);
        }
    }

    /**
     * Switch camera (front/back)
     */
    async switchCamera(): Promise<void> {
        if (this.localStream && this.callType === 'video') {
            const videoTrack = this.localStream.getVideoTracks()[0] as any;
            if (videoTrack && videoTrack._switchCamera) {
                videoTrack._switchCamera();
            }
        }
    }

    /**
     * Get current call state
     */
    getState(): CallState {
        return this.callState;
    }

    getSignalingState(): string {
        return (this.peerConnection as any)?.signalingState || 'idle';
    }

    getIceConnectionState(): string {
        return (this.peerConnection as any)?.iceConnectionState || 'idle';
    }

    // Private methods

    private async getMediaStream(): Promise<void> {
        let timer: NodeJS.Timeout | null = null;
        try {
            console.log('Getting media stream for', this.callType);

            if (!mediaDevices?.getUserMedia) {
                throw new Error(this.getAvailabilityError());
            }

            const micGranted = await this.ensureMicrophonePermission(true);
            if (!micGranted) {
                throw new Error('Microphone permission denied.');
            }
            
            // Mark as attempted so we don't try again and cause a double 8-second delay
            this.mediaStreamAttempted = true;

            const constraints: any = {
                audio: true,
                video: this.callType === 'video' ? {
                    facingMode: 'user',
                } : false,
            };

            const mediaPromise = (mediaDevices.getUserMedia(constraints) as Promise<MediaStream>).then(res => {
                if (timer) clearTimeout(timer);
                return res;
            });
            
            // INCREASE TIMEOUT: 5s is too short for some hardware/permissions prompts
            const timeoutPromise = new Promise<MediaStream>((_, reject) => {
                timer = setTimeout(() => reject(new Error('getUserMedia timed out after 15 seconds')), 15000);
            });

            this.localStream = await Promise.race([mediaPromise, timeoutPromise]);
            
            // CRITICAL: Explicitly enable tracks. Sometimes they are created in a disabled or muted state.
            this.localStream.getTracks().forEach(track => {
                track.enabled = true;
                console.log(`[WebRTCService] ✅ Local ${track.kind} track ready: ${track.id} (enabled: ${track.enabled})`);
            });
            
            // If we already have a PeerConnection, add these tracks NOW
            if (this.peerConnection && this.localStream) {
                console.log('[WebRTCService] Adding local tracks to existing PeerConnection');
                let tracksAdded = false;
                this.localStream.getTracks().forEach((track: any) => {
                    try {
                        this.peerConnection!.addTrack(track, this.localStream!);
                        tracksAdded = true;
                    } catch (e) {
                        console.warn('[WebRTCService] Failed to add track to existing PC:', e);
                    }
                });

                // CRITICAL: If we added tracks late, we MUST re-negotiate
                if (tracksAdded && this.peerConnection.signalingState === 'stable') {
                    console.log('[WebRTCService] 🔄 Late tracks added, triggering re-negotiation...');
                    this.createOffer().catch(e => console.warn('Late offer failed:', e));
                }
            }

            this.broadcast('onLocalStream', this.localStream);
            console.log('[WebRTCService] Local stream obtained successfully');

        } catch (error: any) {
            if (timer) clearTimeout(timer);
            const isSimulator = !Constants.isDevice;
            const errorMessage = String(error?.message || 'unknown');
            console.warn(`[WebRTCService] ⚠️ getMediaStream failed (Simulator=${isSimulator}):`, errorMessage);

            const lowerErrorMessage = errorMessage.toLowerCase();
            const isPermissionError =
                lowerErrorMessage.includes('permission') ||
                lowerErrorMessage.includes('denied') ||
                lowerErrorMessage.includes('not authorized');

            if (isPermissionError) {
                const message = 'Microphone permission denied. Please allow microphone access from settings.';
                this.broadcast('onError', message);
                throw new Error(message);
            }
            
            if (isSimulator && Platform.OS === 'ios') {
                console.log('[WebRTCService] 🛡️ Simulator detected. Proceeding with null local stream to avoid hardware crash.');
                this.localStream = null;
                this.broadcast('onLocalStream', null);
                // NOTE: We still allow the call to connect so signaling can be verified
                return;
            }
            
            // If the failure was a timeout or missing hardware, try audio-only fallback
            if ((Platform.OS === 'ios' || Platform.OS === 'android') && 
                (errorMessage.includes('found') || errorMessage.includes('time') || errorMessage.includes('device'))) {
                
                console.log('[WebRTCService] 🛡️ Proceeding with audio-only fallback stream...');
                let audioTimer: NodeJS.Timeout | null = null;
                try {
                    const audioOnlyPromise = (mediaDevices.getUserMedia({ audio: true, video: false }) as Promise<MediaStream>).then(res => {
                        if (audioTimer) clearTimeout(audioTimer);
                        return res;
                    });
                    const audioTimeout = new Promise<MediaStream>((_, reject) => {
                        audioTimer = setTimeout(() => reject(new Error('Audio-only fallback also timed out')), 10000);
                    });
                    
                    this.localStream = await Promise.race([audioOnlyPromise, audioTimeout]);
                    
                    // If we already have a PeerConnection, add these tracks NOW
                    if (this.peerConnection && this.localStream) {
                        this.localStream.getTracks().forEach((track: any) => {
                            try { this.peerConnection!.addTrack(track, this.localStream!); } catch (e) {}
                        });
                    }

                    this.broadcast('onLocalStream', this.localStream);
                    return;
                } catch (e: any) {
                    if (audioTimer) clearTimeout(audioTimer);
                    console.warn('[WebRTCService] ⚠️ Audio fallback also failed or timed out:', e.message);
                }
            }
            
            // Critical fail-soft: even if NO media is available (Simulator/Busy Hardware), 
            // do NOT crash. Let signaling proceed so the call can at least connect.
            this.localStream = null;
            this.broadcast('onLocalStream', null);
            console.log('[WebRTCService] ⚠️ Proceeding with NO local stream. Signaling will still attempt to connect.');
        }
    }

    private async createPeerConnection(): Promise<void> {
        // Guard: skip if PC already exists (prevents double-creation)
        if (this.peerConnection) {
            console.log('[WebRTCService] PeerConnection already exists, skipping creation');
            return;
        }

        if (!webRTCNativeReady) {
            throw new Error(this.getAvailabilityError());
        }

        if (!RTCPeerConnection) {
            console.error('RTCPeerConnection is not defined. Check react-native-webrtc installation.');
            throw new Error('WebRTC engine not available. You are likely using Expo Go. Please use a Development Build.');
        }

        const normalizedIceServers = await this.getNormalizedIceServers();
        // Use our new High-Reliability configuration layer
        const configs = this.getPeerConnectionConfigs();

        const connectionAttempts = configs.map((config, index) => ({
            label: index === 0 ? 'primary-relay' : `fallback-${index}`,
            config,
        }));

        let createdPeerConnection: RTCPeerConnection | null = null;
        let lastCreateError: any = null;

        for (const attempt of connectionAttempts) {
            try {
                createdPeerConnection = this.tryCreatePeerConnection(attempt.config, attempt.label);
                if (attempt.label !== 'primary') {
                    console.warn(`[WebRTCService] PeerConnection recovered using ${attempt.label} config`);
                }
                break;
            } catch (pcError: any) {
                lastCreateError = pcError;
                const attemptMessage = String(pcError?.message || pcError || 'unknown');
                console.warn(`[WebRTCService] PeerConnection init failed (${attempt.label}): ${attemptMessage}`);
            }
        }

        if (!createdPeerConnection) {
            const msg = String(lastCreateError?.message || lastCreateError || 'unknown');
            if (msg.includes('peerConnectionInit') || msg.includes('null')) {
                throw new Error(
                    'WebRTC native module is not initialized in this app build. Please rebuild dev client (expo prebuild + expo run:android/ios).'
                );
            }
            throw new Error(`Failed to initialize PeerConnection, check the native logs! (${msg})`);
        }

        this.peerConnection = createdPeerConnection;

        // UNIFIED PLAN TRACK MANAGEMENT
        // With 'unified-plan', we use addTrack to link tracks to streams correctly.
        // We avoid manual addTransceiver for basic 1:1 calls to prevent SDP bloat/conflicts,
        // as addTrack automatically creates the necessary transceivers.

        // Add existing local tracks to connection
        if (this.localStream) {
            this.localStream.getTracks().forEach((track: any) => {
                try {
                    this.peerConnection!.addTrack(track, this.localStream!);
                } catch (e) {
                    console.warn('[WebRTCService] Error adding track during PC creation:', e);
                }
            });
        }

        // Cast peerConnection for event handlers (react-native-webrtc types)
        const pc = this.peerConnection as any;

        // Handle incoming tracks
        pc.addEventListener('track', (event: any) => {
            const kind = event.track?.kind;
            const track = event.track;
            
            // IGNORE if no track
            if (!track) return;

            console.log(`[WebRTCService] 📡 Remote track received: ${kind} | State: ${track.readyState} | Enabled: ${track.enabled}`);
            
            // CRITICAL: Explicitly enable the track. Sometimes they arrive disabled.
            try {
                if (track.enabled === false) {
                    console.log(`[WebRTCService] 🛠 Enabling disabled remote track: ${kind}`);
                    track.enabled = true;
                }
            } catch (e) {
                console.warn('[WebRTCService] Failed to explicitly enable track:', e);
            }

            if (event.streams && event.streams[0]) {
                this.remoteStream = event.streams[0];
                console.log(`[WebRTCService] 📡 Remote stream attached: ${this.remoteStream.id}`);
            } else {
                console.warn('[WebRTCService] 📡 Track received but no streams found in event — creating local container');
                // Fallback: if we have a track but it's not in a stream, create one
                if (!this.remoteStream) {
                    this.remoteStream = new MediaStream();
                }
                
                // Only add if not already present
                const tracks = this.remoteStream.getTracks();
                const exists = tracks.some((t: any) => t.id === track.id);
                if (!exists) {
                    this.remoteStream.addTrack(track);
                }
            }

            if (this.remoteStream) {
                // Double-check: ensure all tracks in the container are enabled and live
                this.remoteStream.getTracks().forEach((t: any) => {
                    if (!t.enabled) {
                        console.log(`[WebRTCService] 🛠 Auto-enabling track ${t.id} in stream container`);
                        t.enabled = true;
                    }
                });

                this.broadcast('onRemoteStream', this.remoteStream);

                const iceReady =
                    pc.iceConnectionState === 'connected'
                    || pc.iceConnectionState === 'completed';
                const peerReady = pc.connectionState === 'connected';

                if (iceReady || peerReady) {
                    this.setState('connected');
                } else {
                    console.log(
                        `[WebRTCService] Remote track received before transport connected. ICE=${pc.iceConnectionState} Peer=${pc.connectionState}`
                    );
                }
                
                // Verify encryption
                this.verifyEncryption();
            }
        });

        // --- ICE Candidate Management & Batching ---
        let candidateBatch: any[] = [];
        let batchTimer: NodeJS.Timeout | null = null;

        const flushCandidates = () => {
            if (candidateBatch.length === 0) return;
            console.log(`[WebRTCService] 🧊 Flushing batch of ${candidateBatch.length} ICE candidates`);
            candidateBatch.forEach(c => callService.sendIceCandidate(c));
            candidateBatch = [];
            batchTimer = null;
        };

        pc.addEventListener('icecandidate', (event: any) => {
            if (event.candidate) {
                candidateBatch.push(event.candidate);
                if (!batchTimer) {
                    batchTimer = setTimeout(flushCandidates, 150);
                }
            } else {
                flushCandidates();
                console.log('[WebRTCService] ICE candidates collection finished (End-of-Candidates)');
            }
        });

        // Update connection state handler with recovery logic
        pc.addEventListener('connectionstatechange', () => {
            const state = pc.connectionState;
            console.log('[WebRTCService] 📶 Connection state changed:', state.toUpperCase());

            switch (state) {
                case 'connected':
                    this.setState('connected');
                    // Reset recovery attempts on successful reconnection
                    this.reconnectAttempts = 0;
                    if (this.reconnectTimeout) {
                        clearTimeout(this.reconnectTimeout);
                        this.reconnectTimeout = null;
                    }
                    break;

                case 'disconnected':
                    // IMPORTANT: 'disconnected' is TRANSIENT state, NOT final
                    // WebRTC stack will automatically attempt to recover
                    this.lastDisconnectTime = Date.now();
                    console.warn('[WebRTCService] ⚠️ Connection transiently disconnected. Waiting for automatic recovery...');

                    // Give WebRTC 10 seconds to auto-recover before manual intervention
                    if (!this.reconnectTimeout) {
                        this.reconnectTimeout = setTimeout(() => {
                            // After 10 seconds, if still disconnected, attempt manual recovery
                            if (pc.connectionState === 'disconnected' && this.reconnectAttempts < this.maxReconnectAttempts) {
                                this.reconnectAttempts++;
                                console.log(`[WebRTCService] Attempting manual recovery (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
                                this.attemptRecovery();
                            } else if (pc.connectionState === 'disconnected') {
                                console.error('[WebRTCService] Max recovery attempts exceeded. Ending call.');
                                this.endCall('recovery-exhausted');
                            }
                        }, 10000);
                    }
                    break;

                case 'failed':
                case 'closed':
                    // 'failed' and 'closed' ARE FINAL states
                    console.warn(`[WebRTCService] Connection permanently ${state}. Ending call.`);
                    if (this.reconnectTimeout) {
                        clearTimeout(this.reconnectTimeout);
                        this.reconnectTimeout = null;
                    }
                    this.reconnectAttempts = 0;
                    this.endCall(`pc-state-${state}`);
                    break;
            }
        });

        // Add ICE connection state handler with recovery
        pc.addEventListener('iceconnectionstatechange', () => {
            const iceState = pc.iceConnectionState;
            console.log('[WebRTCService] 🧊 ICE state changed:', iceState);

            switch (iceState) {
                case 'connected':
                case 'completed':
                    // Once media is flowing (which we check in 'track' event), 
                    // ICE states like 'completed' just confirm stability.
                    this.setState('connected');
                    break;

                case 'disconnected':
                    // ICE layer disconnection is often transient
                    // Wait for auto-recovery before taking action
                    console.warn('[WebRTCService] ⚠️ ICE transiently disconnected. Waiting for auto-repair...');
                    break;

                case 'checking':
                    console.log('[WebRTCService] ICE is checking connection candidates...');
                    break;

                case 'failed':
                    console.warn('[WebRTCService] ❌ ICE connection failed');
                    console.warn('[WebRTCService] Note: On 4G/5G networks, ensure TURN server is configured');
                    // Don't immediately end - connectionstatechange handler will handle final failure
                    break;

                case 'closed':
                    console.log('[WebRTCService] ICE connection closed');
                    this.endCall('ice-closed');
                    break;
            }
        });

        // ICE gathering state — critical for diagnosing "stuck at connecting"
        pc.addEventListener('icegatheringstatechange', () => {
            console.log('[WebRTCService] 🧊 ICE gathering state:', pc.iceGatheringState);
        });

        console.log('[WebRTCService] Peer connection created. ICE gathering:', pc.iceGatheringState);
    }

    private async createOffer(): Promise<void> {
        if (!this.peerConnection) return;

        // GUARD: If we are already in the middle of signaling, wait or ignore
        if (this.peerConnection.signalingState !== 'stable') {
            console.log(`[WebRTCService] createOffer ignored: signalingState is ${this.peerConnection.signalingState}`);
            return;
        }

        const offerOptions = {
            offerToReceiveAudio: true,
            offerToReceiveVideo: this.callType === 'video',
            iceRestart: false
        };

        const offer = await this.peerConnection.createOffer(offerOptions);
        await this.peerConnection.setLocalDescription(offer);

        console.log('Sending offer...');
        callService.sendOffer(offer);
    }

    private async createAnswer(): Promise<void> {
        if (!this.peerConnection) return;

        const answerOptions = {
            offerToReceiveAudio: true,
            offerToReceiveVideo: this.callType === 'video',
        };

        const answer = await this.peerConnection.createAnswer(answerOptions);
        await this.peerConnection.setLocalDescription(answer);

        const pc = this.peerConnection as any;
        console.log(`[WebRTCService] POST-SLD: gathering=${pc.iceGatheringState} signaling=${pc.signalingState} connection=${pc.connectionState} ice=${pc.iceConnectionState}`);

        console.log('[WebRTCService] Sending answer...');
        callService.sendAnswer(answer);
    }

    private async processPendingCandidates(): Promise<void> {
        if (!this.peerConnection || !this.peerConnection.remoteDescription) return;
        if (this.pendingCandidatesMutex) return;
        this.pendingCandidatesMutex = true;

        try {
            console.log(`[WebRTCService] 🧊 Processing ${this.pendingCandidates.length} queued remote candidates...`);
            const candidates = [...this.pendingCandidates];
            this.pendingCandidates = [];

            for (const candidate of candidates) {
                try {
                    await this.peerConnection.addIceCandidate(candidate);
                } catch (e: any) {
                    console.warn('[WebRTCService] Failed to apply queued candidate:', e.message);
                }
            }
        } finally {
            this.pendingCandidatesMutex = false;
        }

        // Also check if we have any other queued signals to process now that description is set
        if (this.earlySignalQueue.length > 0) {
            void this.processQueuedSignals();
        }
    }

    private async processQueuedSignals(): Promise<void> {
        if (!this.peerConnection) return;
        console.log(`[WebRTCService] 📤 Flushing ${this.earlySignalQueue.length} early signals...`);
        const signals = [...this.earlySignalQueue];
        this.earlySignalQueue = [];
        
        for (const signal of signals) {
            await this.handleSignal(signal);
        }
    }

    private setState(state: CallState): void {
        // PREVENT DOWNGRADE: If we are already connected, don't go back to connecting
        // unless the state is failed, ended, or idle.
        if (this.callState === 'connected' && state === 'connecting') {
            console.log('[WebRTCService] 🛡️ Ignoring state downgrade from connected to connecting');
            return;
        }

        console.log(`[WebRTCService] State change: ${this.callState} -> ${state}`);
        this.callState = state;
        
        // Force broadcast multiple times to ensure and handle any race conditions in listeners
        this.broadcast('onStateChange', state);
        if (state === 'connected') {
            // Also broadcast streams again to be absolutely sure
            console.log('[WebRTCService] 📡 Connected! Broadcasting tracks. Local:', this.localStream?.getTracks().length, 'Remote:', this.remoteStream?.getTracks().length);
            this.broadcast('onLocalStream', this.localStream);
            this.broadcast('onRemoteStream', this.remoteStream);
            void this.activateAudioSession('state-connected').catch((error: any) => {
                console.warn('[WebRTCService] Failed to enforce audio session on connected state:', error?.message || error);
            });
        }

        // Start/Stop media tracking
        if (state === 'connected') {
            this.startTrackMonitoring();
        } else if (state === 'ended' || state === 'idle') {
            this.stopTrackMonitoring();
        }

        // Connection Watchdog: If we stay in 'connecting' too long, fail the call
        if (this.connectionWatchdog) {
            clearTimeout(this.connectionWatchdog);
            this.connectionWatchdog = null;
        }

        if (state === 'connecting') {
            const timeoutMs = 25000; // Reduced from 35s to 25s for better UX
            this.connectionWatchdog = setTimeout(() => {
                if (this.callState === 'connecting') {
                    console.warn(`[WebRTCService] 🚨 Connection watchdog timeout after ${timeoutMs}ms!`);
                    this.endCall('connection-timeout');
                    this.broadcast('onError', 'Connection timed out. Please check your network or try again.');
                }
            }, timeoutMs);

            // Add an intermediate diagnostic check at 10s
            setTimeout(() => {
                if (this.callState === 'connecting') {
                    console.log('[WebRTCService] ℹ️ Still connecting at 10s. Checking for signaling issues...');
                    // Logic here could trigger a re-poll or extra diagnostic if needed
                }
            }, 10000);
        }
    }

    private broadcast(method: string, data: any): void {
        this.listeners.forEach((listener: any) => {
            if (typeof listener[method] === 'function') {
                listener[method](data);
            }
        });
    }

    // FIX #13: Verify DTLS/SRTP encryption is established
    private async verifyEncryption(): Promise<void> {
        if (!this.peerConnection) return;

        try {
            const senders = this.peerConnection.getSenders();
            for (const sender of senders) {
                if (sender.transport) {
                    const state = sender.transport.state;
                    console.log('[WebRTCService] Sender transport state:', state);
                    if (state !== 'connected' && state !== 'new') {
                        console.warn('[WebRTCService] ⚠️ Encryption may not be properly established');
                    }
                }
            }
        } catch (error) {
            console.error('[WebRTCService] Error verifying encryption:', error);
        }
    }

    private stopTrackMonitoring(): void {
        if (this.trackMonitorTimer) {
            console.log('[WebRTCService] 🔍 Stopping media track monitor');
            clearInterval(this.trackMonitorTimer);
            this.trackMonitorTimer = null;
        }
    }

    private startTrackMonitoring(): void {
        this.stopTrackMonitoring();
        console.log('[WebRTCService] 🔍 Starting media track monitor');
        
        let counter = 0;
        let hasStatsSample = false;
        let lastRxBytes = 0;
        let lastRxBytesChangedAt = Date.now();

        this.trackMonitorTimer = setInterval(() => {
            if (!this.peerConnection) {
                this.stopTrackMonitoring();
                return;
            }
            
            counter++;
            const localAudio = this.localStream?.getAudioTracks() || [];
            const remoteAudio = this.remoteStream?.getAudioTracks() || [];
            const remoteVideo = this.remoteStream?.getVideoTracks() || [];
            const iceState = this.getIceConnectionState();
            const sigState = this.getSignalingState();

            const lAudioInfo = localAudio.map((t: any) => `${t.readyState}${t.enabled?'✔️':'❌'}${t.muted?'🔇':''}`).join(',');
            const rAudioInfo = remoteAudio.map((t: any) => `${t.readyState}${t.enabled?'✔️':'❌'}${t.muted?'🔇':''}`).join(',');

            // Log stats every 1s (aggressive)
            if (counter <= 30) {
                // Ensure audio routing is stable on first tick only
                if (counter === 1) {
                    void this.setAudioOutput(this.speakerEnabled, false).catch(() => {});
                }

                // TRY TO GET BYTES RECEIVED
                if (this.peerConnection && typeof (this.peerConnection as any).getStats === 'function') {
                    (this.peerConnection as any).getStats().then((stats: any) => {
                        let totalBytes = 0;
                        let hasAudioInboundReport = false;

                        stats.forEach((report: any) => {
                            const type = String(report?.type || '').toLowerCase();
                            if (type !== 'inbound-rtp') return;

                            const kind = String(report?.kind || report?.mediaType || '').toLowerCase();
                            const codec = String(report?.mimeType || report?.codecMimeType || '').toLowerCase();
                            const isAudioInbound =
                                kind === 'audio'
                                || kind.includes('audio')
                                || codec.includes('audio');

                            if (isAudioInbound) {
                                hasAudioInboundReport = true;
                                totalBytes += Number(report?.bytesReceived || 0);
                            }
                        });

                        // Fallback for runtimes that omit kind/mediaType on inbound-rtp reports.
                        if (!hasAudioInboundReport) {
                            stats.forEach((report: any) => {
                                if (String(report?.type || '').toLowerCase() === 'inbound-rtp') {
                                    totalBytes += Number(report?.bytesReceived || 0);
                                }
                            });
                        }

                        if (!Number.isFinite(totalBytes) || totalBytes < 0) {
                            totalBytes = 0;
                        }

                        hasStatsSample = true;
                        if (totalBytes > lastRxBytes) {
                            lastRxBytes = totalBytes;
                            lastRxBytesChangedAt = Date.now();
                        }

                        const statsData = { bytesReceived: totalBytes };
                        this.lastStats = statsData;
                        this.broadcast('onStats', statsData);
                    }).catch(() => {});
                }
                
                if (counter % 5 === 0) {
                    console.log(`[WebRTC_STATS] Role: ${this.isInitiator ? 'In' : 'Rx'} | ICE: ${iceState} | SIG: ${sigState} | Audio-L: [${lAudioInfo}] Audio-R: [${rAudioInfo}] | Video-R: ${remoteVideo.length}`);
                }
            }
            
            // AUTO-RECOVERY: If we are connected but have 0 bytes received after 5 seconds,
            // it's a network bridge failure. Force ICE restart.
            if (this.callState === 'connected' && counter > 5) {
                const statsValue: any = this.lastStats || { bytesReceived: 0 };
                const hasNoAudio = remoteAudio.length === 0;
                const allMuted = remoteAudio.length > 0 && remoteAudio.every((t: any) => t.muted);
                const now = Date.now();
                const transportReady = iceState === 'connected' || iceState === 'completed';
                const noAudioBytesFlow =
                    transportReady
                    && hasStatsSample
                    && remoteAudio.length > 0
                    && counter > 10
                    && (Number(statsValue.bytesReceived || 0) <= 0 || (now - lastRxBytesChangedAt) > 18000);

                if (noAudioBytesFlow) {
                    if (now - this.lastRecoveryAttemptAt >= this.RECOVERY_COOLDOWN_MS) {
                        this.lastRecoveryAttemptAt = now;
                        console.warn('[WebRTCService] 🚨 Audio data flow stalled. Triggering controlled recovery...');
                        this.attemptRecovery().catch(() => {});
                    }
                }
                
                if (transportReady && (hasNoAudio || allMuted)) {
                    console.warn(`[WebRTCService] ⚠️ ${hasNoAudio ? '0 remote tracks' : 'Muted remote tracks'} detected! Attempting recovery...`);
                    // If we have transceivers, check their direction
                    try {
                        const transceivers = this.peerConnection.getTransceivers();
                        transceivers.forEach((tr: any) => {
                            if (tr.receiver && tr.receiver.track && tr.receiver.track.kind === 'audio') {
                                if (!tr.receiver.track.enabled) tr.receiver.track.enabled = true;
                            }
                        });
                    } catch (e) {}

                    if (now - this.lastRecoveryAttemptAt >= this.RECOVERY_COOLDOWN_MS) {
                        this.lastRecoveryAttemptAt = now;
                        this.attemptRecovery().catch((e) => {
                            console.warn('[WebRTCService] Recovery trigger from monitor failed:', e);
                        });
                    }
                }
            }
        }, 1000); // NUCLEAR: Check stats and kick hardware every 1 second 
    }

    // Add recovery attempt method
    private async attemptRecovery(): Promise<void> {
        try {
            console.log('[WebRTCService] Attempting manual recovery...');
            
            if (!this.peerConnection) {
                console.log('[WebRTCService] No peer connection available');
                return;
            }
            
            if (typeof this.peerConnection.restartIce === 'function') {
                try {
                    this.peerConnection.restartIce();
                    console.log('[WebRTCService] restartIce() invoked');
                } catch (e) {
                    console.warn('[WebRTCService] restartIce() failed:', e);
                }
            }

            // Controlled renegotiation with ICE restart.
            // Keep the initiator as the owner of recovery offers to avoid
            // the receiver entering have-local-offer during initial setup.
            if (this.peerConnection.signalingState === 'stable' && this.isInitiator) {
                const offerOptions = {
                    iceRestart: true,
                    offerToReceiveAudio: true,
                    offerToReceiveVideo: this.callType === 'video',
                };
                const offer = await this.peerConnection.createOffer(offerOptions);
                await this.peerConnection.setLocalDescription(offer);
                callService.sendOffer(offer);
            } else {
                console.log(
                    `[WebRTCService] Skipping recovery offer, role=${this.isInitiator ? 'initiator' : 'receiver'} signalingState=${this.peerConnection.signalingState}`
                );
            }
            
            console.log('[WebRTCService] Recovery attempt initiated. Waiting for reconnection...');
            
        } catch (error) {
            console.error('[WebRTCService] Recovery attempt failed:', error);
        }
    }

    /**
     * Start connection watchdog - monitors for stuck connections
     */
    private startConnectionWatchdog(): void {
        if (this.connectionWatchdog) {
            clearTimeout(this.connectionWatchdog);
        }

        // Wait 7 seconds for auto-recovery (whatsapp-grade speed)
        this.connectionWatchdog = setTimeout(() => {
            if (this.callState === 'connecting' || this.callState === 'ringing') {
                const pc = this.peerConnection as any;
                if (pc && (pc.connectionState !== 'connected' && pc.iceConnectionState !== 'connected')) {
                    console.warn('[WebRTCService] ⏰ Connection watchdog timeout — forcing recovery');
                    this.attemptRecovery();
                }
            }
        }, 7000);
    }

    /**
     * Track monitor - ensures tracks remain attached to PC
     */
    private startTrackMonitor(): void {
        if (this.trackMonitorTimer) clearInterval(this.trackMonitorTimer);
        
        this.trackMonitorTimer = setInterval(() => {
            if (this.callState !== 'connecting' && this.callState !== 'connected') {
                if (this.trackMonitorTimer) clearInterval(this.trackMonitorTimer);
                this.trackMonitorTimer = null;
                return;
            }

            const pc = this.peerConnection;
            if (pc && this.localStream) {
                const senders = (pc as any).getSenders?.() || [];
                const localTrackCount = this.localStream.getTracks().length;
                
                if (senders.length < localTrackCount && this.callState === 'connected') {
                    console.warn(`[WebRTCService] 🚨 Track mismatch detected (${senders.length} senders vs ${localTrackCount} tracks). Re-attaching...`);
                    this.localStream.getTracks().forEach((track: any) => {
                        const exists = senders.some((s: any) => s.track?.id === track.id);
                        if (!exists) {
                            try { (pc as any).addTrack(track, this.localStream!); } catch (_) {}
                        }
                    });
                }
            }
        }, this.TRACK_MONITOR_INTERVAL_MS);
    }

    /**
     * Attempt ICE restart - creates new ICE candidates
     */
    private async attemptIceRestart(): Promise<void> {
        if (!this.peerConnection) {
            console.warn('[WebRTCService] Cannot restart ICE: no peer connection');
            return;
        }

        // Prevent rapid-fire ICE restarts
        const now = Date.now();
        if (now - this.lastRecoveryAttemptAt < this.RECOVERY_COOLDOWN_MS) {
            console.warn('[WebRTCService] Skipping ICE restart (cooldown active)');
            return;
        }
        this.lastRecoveryAttemptAt = now;

        try {
            console.log('[WebRTCService] 🔄 Attempting ICE restart...');
            
            // Check if restartIce is available
            if (typeof this.peerConnection.restartIce === 'function') {
                this.peerConnection.restartIce();
                console.log('[WebRTCService] ✅ ICE restart initiated');
            } else {
                // Fallback: create new offer with iceRestart
                if (this.peerConnection.signalingState === 'stable') {
                    const offer = await this.peerConnection.createOffer({ iceRestart: true });
                    await this.peerConnection.setLocalDescription(offer);
                    callService.sendOffer(offer);
                    console.log('[WebRTCService] ✅ ICE restart via offer created');
                }
            }
        } catch (error: any) {
            console.error('[WebRTCService] ❌ ICE restart failed:', error.message);
        }
    }

    /**
     * Cleanup resources
     */
    cleanup(): void {
        this.listeners = []; // Clear all listeners
        if (this.callState === 'idle' || this.callState === 'ended') {
            void this.deactivateAudioSession('cleanup');
        }
        this.endCall();
    }
}

export const webRTCService = new WebRTCService();
export type { CallState, CallType, WebRTCCallbacks };
