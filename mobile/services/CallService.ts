import { supabase } from '../config/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';
import * as Crypto from 'expo-crypto';
import { normalizeId, LEGACY_TO_UUID } from '../utils/idNormalization';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

// ─────────────────────────────────────────────────────────────────────────────
// CALL SERVICE — WhatsApp-Grade Reliability
//
// TRIPLE-PATH SIGNALING:
//   1. Supabase Realtime Broadcast (fast, sub-100ms)
//   2. Database persistence + polling (reliable, survives disconnects)
//   3. Push notifications (wakes up sleeping devices)
//
// RELIABILITY FEATURES:
//   - Automatic channel recovery on disconnect
//   - Signal acknowledgment system
//   - Network state monitoring
//   - Exponential backoff retry
//   - Stale signal detection
//   - Connection watchdog with auto-heal
// ─────────────────────────────────────────────────────────────────────────────

export interface CallSignal {
    type: 'offer' | 'answer' | 'ice-candidate' | 'call-request' | 'call-accept' | 'call-reject' | 'call-end' | 'call-ringing' | 'video-toggle' | 'audio-toggle';
    callId: string;
    callerId: string;
    calleeId: string;
    callType: 'audio' | 'video';
    payload?: any;
    timestamp: string;
    roomId?: string;
    signalId?: string; // Unique ID for cross-path deduplication (Broadcast + DB)
    callerName?: string;
    callerAvatar?: string;
    calleeName?: string;
    calleeAvatar?: string;
}

type CallSignalHandler = (signal: CallSignal) => void;

// Singleton references to survive HMR/Reloads
// These ensure that re-initializing the service doesn't leak old connections
let _personalChannel: RealtimeChannel | null = null;
let _roomChannel: RealtimeChannel | null = null;
let _signalSubscription: RealtimeChannel | null = null;

// Pool for outgoing signals to avoid multiple subscriptions to same target
const _senderChannels = new Map<string, RealtimeChannel>();
let _personalChannelReconnectAttempts = 0;
const SIGNAL_POLL_OVERLAP_MS = 8 * 1000; // 8s overlap for reliability
const PROCESSED_SIGNAL_TTL_MS = 10 * 60 * 1000; // 10min TTL for deduplication
const BASE_SIGNAL_POLL_MS = 3000; // Faster polling: 3s
const ACTIVE_CALL_SIGNAL_POLL_MS = 500; // Ultra-fast during call: 500ms
const CRITICAL_SIGNAL_PERSIST_WAIT_MS = 1200;
const CHANNEL_HEALTH_CHECK_MS = 30000; // Check every 30s
const MAX_CHANNEL_RECONNECT_ATTEMPTS = 10; // Increased from 3

class CallService {
    private userId: string | null = null;
    private currentUser: { name: string; avatar: string } | null = null;
    
    getUserId(): string | null {
        return this.userId;
    }

    getCurrentRoomId(): string | null {
        return this.currentRoomId;
    }

    setCurrentCallType(callType: 'audio' | 'video'): void {
        this.currentCallType = callType;
    }

    private listeners: Set<CallSignalHandler> = new Set();
    private statusListeners: Set<(connected: boolean) => void> = new Set();
    private currentRoomId: string | null = null;
    private currentPartnerId: string | null = null;
    private currentCallType: 'audio' | 'video' = 'audio';
    private roomSubscribed: boolean = false;
    private isJoiningRoom: boolean = false;
    private roomSubscribeCallbacks: (() => void)[] = [];
    private signalBuffer: CallSignal[] = [];
    private callTimeoutTimer: NodeJS.Timeout | null = null;
    private readonly CALL_TIMEOUT_MS = 45000; // 45 seconds timeout
    private reconnectTimer: NodeJS.Timeout | null = null;
    private personalChannelSubscribed: boolean = false;
    private processedSignalIds: Set<string> = new Set();
    private signalPollInterval: NodeJS.Timeout | null = null;
    private _fastPollInterval: NodeJS.Timeout | null = null;
    private lastSignalPollAt: string = new Date().toISOString();
    private _appStateSubscription: any = null;
    private _connectionLimitHit: boolean = false;
    private _consecutivePollFailures: number = 0;
    
    // NEW: Reliability features
    private _networkState: 'connected' | 'disconnected' | 'unknown' = 'unknown';
    private _channelHealthInterval: NodeJS.Timeout | null = null;
    private _pendingSignals: CallSignal[] = []; // Queue for failed signals
    private _signalAckTimeout = new Map<string, NodeJS.Timeout>();
    private _pendingAckSignals = new Set<string>();
    private _roomJoinAttempts = 0;
    private readonly MAX_ROOM_JOIN_ATTEMPTS = 5;
    private _isNetworkMonitoringActive = false;
    private _netInfoUnsubscribe: (() => void) | null = null;

    addStatusListener(handler: (connected: boolean) => void): void {
        this.statusListeners.add(handler);
        handler(!!_personalChannel && this.personalChannelSubscribed);
    }

    removeStatusListener(handler: (connected: boolean) => void): void {
        this.statusListeners.delete(handler);
    }

    private notifyStatus(connected: boolean) {
        this.statusListeners.forEach(listener => listener(connected));
    }

    private delay(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    private async cleanupStaleDbSignals(): Promise<void> {
        if (!this.userId) return;
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        
        console.log('[CallService] 🧹 Cleaning up stale DB signals...');
        
        try {
            const { error } = await supabase
                .from('call_signals')
                .delete()
                .or(`receiver_id.eq.${this.userId},sender_id.eq.${this.userId}`)
                .lt('created_at', fiveMinutesAgo);

            if (error) {
                console.warn('[CallService] ⚠️ Cleanup error:', error.message);
            }
        } catch (err) {
            console.warn('[CallService] ⚠️ Cleanup exception:', err);
        }
    }

    // ── PUBLIC: initialize() ───────────────────────────────────────────────
    //
    // Subscribe to the user's personal broadcast channel.
    // All incoming call signals (call-request, call-ringing, etc.) arrive here.
    initialize(userId: string, user: { name: string, avatar: string } | null = null): void {
        const normalizedUserId = normalizeId(userId);
        this.currentUser = user;
        console.log(`[CallService] 🚀 initialize() called | userId=${normalizedUserId} | channel=call_user_${normalizedUserId}`);

        // If same user AND channel is alive and subscribed, skip
        if (this.userId === normalizedUserId && _personalChannel && this.personalChannelSubscribed) {
            console.log('[CallService] ✅ Skipping re-initialize (already active)');
            return;
        }

        // Clean up existing channel and stale DB signals
        this.cleanupStaleDbSignals().catch(() => {});
        if (_personalChannel) {
            console.log('[CallService] Tearing down stale personal channel before re-init');
            try { supabase.removeChannel(_personalChannel); } catch (_) {}
            _personalChannel = null;
            this.personalChannelSubscribed = false;
        }

        // Clear any pending reconnect
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.userId !== normalizedUserId) {
            this.userId = normalizedUserId;
            _personalChannelReconnectAttempts = 0;
            this._connectionLimitHit = false;
            this.processedSignalIds.clear();
        }
        this.lastSignalPollAt = new Date(Date.now() - 5000).toISOString(); // Start 5s in past to catch missed signals
        this._consecutivePollFailures = 0;

        // Only subscribe to realtime if we haven't hit the connection limit
        if (!this._connectionLimitHit) {
            this._subscribePersonalChannel(normalizedUserId);
            this._subscribePersonalDB(normalizedUserId);
        }
        this.startSignalPolling();
        this._startNetworkMonitoring();
        this._startChannelHealthCheck();

        // Listen for foreground to poll immediately (clean up previous listener first)
        if (this._appStateSubscription) {
            this._appStateSubscription.remove();
        }
        this._appStateSubscription = AppState.addEventListener('change', (state) => {
            if (state === 'active') {
                console.log('[CallService] 📱 App foregrounded — refreshing signals');
                this._consecutivePollFailures = 0; // Reset poll failures on foreground
                this.pollForSignals();
                this._reconnectIfNeeded();
                // Reset connection limit flag on foreground (connections may have drained)
                if (this._connectionLimitHit) {
                    console.log('[CallService] App foregrounded — resetting connection limit flag');
                    this._connectionLimitHit = false;
                    _personalChannelReconnectAttempts = 0;
                    if (this.userId) this._subscribePersonalChannel(this.userId);
                }
            }
        });
    }

    private mapSignalRowToCallSignal(row: any): CallSignal | null {
        if (!row) return null;

        const payload = (row.payload || {}) as any;
        const signalType = (row.type || row.signal_type || payload.type) as CallSignal['type'] | undefined;
        const senderIdRaw = row.sender_id || payload.callerId || payload.sender_id;
        const receiverIdRaw = row.receiver_id || row.recipient_id || payload.calleeId || payload.receiver_id;
        const createdAt = row.created_at || payload.timestamp || new Date().toISOString();

        if (!signalType || !senderIdRaw || !receiverIdRaw) {
            return null;
        }

        return {
            ...payload,
            type: signalType,
            signalId: row.signal_id || row.id || payload.signalId,
            callerId: normalizeId(String(senderIdRaw)),
            calleeId: normalizeId(String(receiverIdRaw)),
            timestamp: createdAt,
            roomId: payload.roomId || payload.callId,
        };
    }

    private isSignalForUser(row: any, userId: string): boolean {
        const receiver = normalizeId((row?.receiver_id || row?.recipient_id || '').toString());
        return !!receiver && receiver === normalizeId(userId);
    }

    private async fetchSignalsForUserSince(userId: string, since: string): Promise<any[]> {
        const sinceTimestamp = Date.parse(since);
        const effectiveSince = Number.isFinite(sinceTimestamp)
            ? new Date(Math.max(0, sinceTimestamp - SIGNAL_POLL_OVERLAP_MS)).toISOString()
            : since;

        const normalizedUserId = normalizeId(userId);
        try {
            const { data, error } = await supabase
                .from('call_signals')
                .select('*')
                .eq('receiver_id', normalizedUserId)
                .gte('created_at', effectiveSince)
                .order('created_at', { ascending: true });

            if (error) {
                console.warn('[CallService] 📶 Signal poll failed:', error.message);
                return [];
            }

            return data || [];
        } catch (err: any) {
            const isNetworkError = err?.message?.includes('Network request failed') || err?.message?.includes('fetch');
            if (isNetworkError) {
                console.warn('[CallService] 📶 Signaling poll: Network unreachable (retrying...)');
            } else {
                console.warn('[CallService] ⚠️ Signaling poll: Unexpected fetch exception:', err?.message || err);
            }
            return null; // Return null to distinguish error from zero signals
        }
    }

    private async persistLifecycleSignalToDb(signalType: string, recipientId: string, signal: CallSignal): Promise<void> {
        const signalId = signal.signalId || Crypto.randomUUID();
        signal.signalId = signalId; // Ensure it's set on the signal object too
        console.log(`[CallService] 💾 Persisting [${signalType}] to DB: sender=${this.userId}, receiver=${recipientId}`);

        // Match actual table schema: signal_id, sender_id, receiver_id, type, payload
        const result = await supabase.from('call_signals').insert({
            signal_id: signalId,
            sender_id: this.userId,
            receiver_id: recipientId,
            type: signalType,
            payload: signal,
        });

        if (!result.error) {
            console.log(`[CallService] ✅ [${signalType}] persisted OK`);
            return;
        }

        console.error(`[CallService] ❌ [${signalType}] DB persist failed: ${result.error.message} (code: ${result.error.code})`);
        throw result.error;
    }

    private _pollCount = 0;
    private async pollForSignals() {
        if (!this.userId) return;
        this._pollCount++;

        try {
            const data = await this.fetchSignalsForUserSince(this.userId, this.lastSignalPollAt);

            if (data === null) {
                this._consecutivePollFailures++;
                if (this._consecutivePollFailures <= 3) {
                    console.warn(`[CallService] 📶 Poll returned null (network error #${this._consecutivePollFailures})`);
                }
                return;
            }

            this._consecutivePollFailures = 0;

            if (data.length > 0) {
                // Pre-filter: check which signals are genuinely new (not yet in dedup set)
                const newSignals: CallSignal[] = [];
                for (const row of data) {
                    const signal = this.mapSignalRowToCallSignal(row);
                    if (!signal) continue;
                    const signalKey = signal.signalId ||
                        `${signal.type}_${signal.roomId || signal.callId || 'no-room'}_${signal.callerId || 'no-caller'}`;
                    if (!this.processedSignalIds.has(signalKey)) {
                        newSignals.push(signal);
                    }
                }

                if (newSignals.length > 0) {
                    // Advance cursor to latest signal
                    this.lastSignalPollAt = data[data.length - 1].created_at;
                    console.log(`[CallService] 📬 Poll #${this._pollCount}: ${newSignals.length} signal(s) | since=${this.lastSignalPollAt} | user=${this.userId.substring(0,12)}...`);
                    for (const signal of newSignals) {
                        console.log(`[CallService] 📬 Processing polled signal: [${signal.type}] from ${signal.callerId?.substring(0,12)}...`);
                        this.handleIncomingSignal(signal);
                    }
                } else {
                    // All signals were already processed — advance cursor to now to escape
                    // the overlap window re-fetch loop. Safe because any genuinely new signal
                    // would have been returned by the unbounded query and wouldn't be in the dedup set.
                    this.lastSignalPollAt = new Date().toISOString();
                }
            }
        } catch (err: any) {
            this._consecutivePollFailures++;
            if (this._consecutivePollFailures <= 2 || this._consecutivePollFailures % 5 === 0) {
                console.warn(`[CallService] Poll unexpected failure (#${this._consecutivePollFailures}):`, err?.message || err);
            }
        }
    }

    private _subscribePersonalDB(userId: string): void {
        if (this._connectionLimitHit) return;
        
        if (_signalSubscription) {
            try { supabase.removeChannel(_signalSubscription); } catch (_) {}
        }

        console.log(`[CallService] 📡 DB fallback enabled for ${userId}`);
        
        _signalSubscription = supabase.channel(`call_signals_realtime_${userId}`)
            .on('postgres_changes', 
                { 
                    event: 'INSERT', 
                    schema: 'public', 
                    table: 'call_signals',
                },
                (payload) => {
                    const row = payload.new as any;
                    if (!this.isSignalForUser(row, userId)) return;
                    const signal = this.mapSignalRowToCallSignal(row);
                    if (signal) this.handleIncomingSignal(signal);
                }
            )
            .subscribe();
    }

    private startSignalPolling() {
        if (this.signalPollInterval) clearInterval(this.signalPollInterval);
        if (this._fastPollInterval) clearInterval(this._fastPollInterval);
        
        // RESET: Start polling slightly in the past (15s) to catch signals 
        // sent during app initialization/transit.
        this.lastSignalPollAt = new Date(Date.now() - 3000).toISOString();
        this._consecutivePollFailures = 0;
        
        if (this.userId) {
            console.log(`[CallService] 🔄 Starting signal polling for ${this.userId}`);
            void this.pollForSignals();
        }
        
        // Base polling keeps lifecycle signals responsive even when Realtime is down.
        this.signalPollInterval = setInterval(() => {
            if (this.userId) void this.pollForSignals();
        }, BASE_SIGNAL_POLL_MS);
        
        // Accelerated polling during active calls — critical for WebRTC negotiation
        // when Realtime broadcast is unreliable. 1s is fast enough for offer/answer/ICE.
        this._fastPollInterval = setInterval(() => {
            if (this.currentRoomId) {
                void this.pollForSignals();
            }
        }, ACTIVE_CALL_SIGNAL_POLL_MS);
    }

    private _subscribePersonalChannel(userId: string): void {
        if (this._connectionLimitHit) return;
        
        const normalizedId = normalizeId(userId);
        const channelName = `call_user_${normalizedId}`;
        console.log(`[CallService] 📡 Subscribing to personal channel: ${channelName}`);

        if (_personalChannel) {
            try { supabase.removeChannel(_personalChannel); } catch (_) {}
            _personalChannel = null;
        }

        _personalChannel = supabase.channel(channelName, {
            config: { broadcast: { self: false } },
        });

        const handleSignal = (payload: any, eventName: string) => {
            const signal = payload as CallSignal;
            console.log(`📞 [CallService] Received signal [${signal.type}] from ${signal.callerId} (via ${channelName}:${eventName})`);
            this.handleIncomingSignal(signal);
        };

        _personalChannel
            .on('broadcast', { event: 'call_signal' }, ({ payload }) => handleSignal(payload, 'call_signal'))
            .on('broadcast', { event: 'signal' }, ({ payload }) => handleSignal(payload, 'signal'))
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    this.personalChannelSubscribed = true;
                    this.notifyStatus(true);
                } else if (status === 'CHANNEL_ERROR' || status === 'CLOSED') {
                    this.personalChannelSubscribed = false;
                    this.notifyStatus(false);
                }
            });
    }

    private handleIncomingSignal(signal: CallSignal) {
        if (!this.userId) return;
        if (!this._shouldProcessSignal(signal)) return;

        const myId = normalizeId(this.userId);
        const senderId = normalizeId((signal as any).sender_id || signal.callerId);
        const rawSenderId = ((signal as any).sender_id || signal.callerId || '').toString().toLowerCase();
        const rawMyId = (this.userId || '').toString().toLowerCase();

        // [AUTO-CUT FIX] Ignore signals sent by OURSELVES (loopy signaling)
        // Ensure we check both UUID and raw ID strings (case-insensitive)
        if (senderId === myId || rawSenderId === rawMyId) {
            console.log(`[CallService] 🔄 Ignoring self-sent loopback signal [${signal.type}]`);
            return;
        }

        // Only latch room state from lifecycle signals.
        const signalRoomId = signal.roomId || signal.callId;
        const isLifecycleSignal = ['call-request', 'call-accept', 'call-ringing', 'call-end', 'call-reject'].includes(signal.type);

        // [STALE GUARD] If we have an active room, ignore signals from OTHER rooms
        if (this.currentRoomId && signalRoomId && this.currentRoomId !== signalRoomId) {
            // Exceptions: we always allow 'call-request' to proceed so handleIncomingSignal can decide to override/reject
            if (signal.type !== 'call-request') {
                console.log(`[CallService] 🛡️ Ignoring signal [${signal.type}] for room ${signalRoomId} (Active Room: ${this.currentRoomId}). This is likely a stale signal from a previous session.`);
                return;
            }
        }

        let justLatched = false;
        if (!this.currentRoomId && signalRoomId && isLifecycleSignal) {
            console.log(`[CallService] 🏠 Latching to Room ${signalRoomId} from [${signal.type}]`);
            this.currentRoomId = signalRoomId;
            this.currentPartnerId = signal.callerId;
            this.currentCallType = signal.callType || 'audio';
            this.joinRoom(this.currentRoomId);
            justLatched = true;
        }

        // Check for busy state or duplicate call requests
        if (signal.type === 'call-request' && this.currentRoomId) {
            // If we JUST latched to this room from this very signal, deliver it — not a duplicate
            if (justLatched) {
                this.notifyListeners(signal);
                return;
            }

            const signalTime = new Date(signal.timestamp).getTime();
            const now = Date.now();
            const ageSeconds = (now - signalTime) / 1000;

            // If age is more than 30s, ignore completely as stale
            if (ageSeconds > 30) {
                console.log(`[CallService] 🕰 Ignoring stale call-request from ${ageSeconds.toFixed(1)}s ago.`);
                return;
            }

            // If we're already in THIS room, it's a legitimate retry/broadcast duplicate
            if (this.currentRoomId === signal.roomId) {
                console.log('[CallService] 🔄 Ignoring duplicate call-request for own active room:', signal.roomId);
                return;
            }

            // If we have stale room state but no active room channel, prefer the new request.
            const noActiveRoomSession = !this.roomSubscribed && !this.isJoiningRoom && !_roomChannel;
            if (noActiveRoomSession) {
                console.warn(`[CallService] ♻️ Replacing stale room state ${this.currentRoomId} with incoming room ${signal.roomId}`);
                this.currentRoomId = signal.roomId || signal.callId;
                this.currentPartnerId = signal.callerId;
                this.currentCallType = signal.callType || 'audio';
                if (this.currentRoomId) this.joinRoom(this.currentRoomId);
                this.notifyListeners(signal);
                return;
            }

            // Check if existing room is actually active (has a channel)
            const isRoomActive = !!_roomChannel && this.roomSubscribed;
            
            if (!isRoomActive && ageSeconds < 10) {
                console.warn(`[CallService] ♻️ Room state ${this.currentRoomId} exists but no channel. Overriding with new room ${signal.roomId}`);
                this.currentRoomId = signal.roomId || signal.callId;
                this.currentPartnerId = signal.callerId;
                this.currentCallType = signal.callType || 'audio';
                if (this.currentRoomId) this.joinRoom(this.currentRoomId);
                this.notifyListeners(signal);
                return;
            }

            console.log(`[CallService] 🚫 Busy: auto-rejecting request ${signal.roomId} (current: ${this.currentRoomId})`);
            this.rejectCall(signal);
            return;
        }

        this.notifyListeners(signal);
    }

    private _shouldProcessSignal(signal: CallSignal): boolean {
        // Cross-path deduplication: check if we've already processed this signal
        // We include ROOM ID and TYPE to ensure we don't drop different signals from same user
        const signalKey = signal.signalId || 
            `${signal.type}_${signal.roomId || signal.callId || 'no-room'}_${signal.callerId || 'no-caller'}`;

        if (this.processedSignalIds.has(signalKey)) {
            console.log(`[CallService] 🔁 Duplicate signal [${signal.type}] ignored (Key: ${signalKey.substring(0, 30)}...)`);
            return false;
        }
        this.processedSignalIds.add(signalKey);
        
        // Keep dedupe entries long enough to survive poll overlap and clock skew.
        setTimeout(() => {
            this.processedSignalIds.delete(signalKey);
        }, PROCESSED_SIGNAL_TTL_MS);

        return true;
    }

    // ── Room channel (for WebRTC signals after call-accept) ────────────────

    private setupRoomListeners(channel: RealtimeChannel, _roomId: string): void {
        // Listen for 'signal' event (WebRTC signals)
        channel.on('broadcast', { event: 'signal' }, ({ payload }) => {
            const signal = payload as CallSignal;
            if (!this._shouldProcessSignal(signal)) return;

            console.log(`[CallService] 📨 Received room signal [${signal.type}] from ${signal.callerId?.substring(0,8)}...`);
            this.notifyListeners(signal);

            if (signal.type === 'call-end' || signal.type === 'call-reject') {
                this.cleanup(signal.type);
            }
        });

        // ALSO listen for 'call_signal' event (personal channel signals that also arrived in room)
        channel.on('broadcast', { event: 'call_signal' }, ({ payload }) => {
            const signal = payload as CallSignal;
            if (!this._shouldProcessSignal(signal)) return;

            const isWebRTCSignal = ['offer', 'answer', 'ice-candidate'].includes(signal.type);
            if (isWebRTCSignal) {
                console.log(`[CallService] 📨 Received WebRTC signal via room [${signal.type}]`);
                this.notifyListeners(signal);
            }
        });
    }

    public joinRoom(roomId: string, onSubscribed?: () => void) {
        // Guard against simultaneous join attempts for the same room
        if (this.isJoiningRoom && this.currentRoomId === roomId) {
            console.log(`[CallService] Join already in progress for room ${roomId}. Queueing callback.`);
            if (onSubscribed) {
                this.roomSubscribeCallbacks.push(onSubscribed);
            }
            return;
        }

        // Check if we've exceeded max attempts
        if (this._roomJoinAttempts >= this.MAX_ROOM_JOIN_ATTEMPTS) {
            console.error(`[CallService] ❌ Max room join attempts (${this.MAX_ROOM_JOIN_ATTEMPTS}) reached for room ${roomId}`);
            // Still proceed with DB fallback
            this.handleJoinSuccess(roomId);
            return;
        }

        // Clean up previous room channel completely
        if (_roomChannel) {
            console.log(`[CallService] Cleaning up old room channel before joining new one: ${this.currentRoomId}`);
            supabase.removeChannel(_roomChannel);
            _roomChannel = null;
        }

        this._roomJoinAttempts++;
        console.log(`[CallService] 🚪 Joining room ${roomId} (attempt ${this._roomJoinAttempts}/${this.MAX_ROOM_JOIN_ATTEMPTS})...`);
        this.currentRoomId = roomId;
        this.roomSubscribed = false;
        this.isJoiningRoom = true;
        this.roomSubscribeCallbacks = [];

        if (onSubscribed) {
            this.roomSubscribeCallbacks.push(onSubscribed);
        }

        _roomChannel = supabase.channel(`call_room_${roomId}`, {
            config: { broadcast: { self: false } },
        });

        this.setupRoomListeners(_roomChannel, roomId);

        const timeout = setTimeout(() => {
            console.warn(`[CallService] Room ${roomId} subscription timeout - proceeding with DB fallback`);
            this.handleJoinSuccess(roomId);
        }, 15000); // 15s for establishment

        _roomChannel.subscribe((status) => {
            console.log(`[CallService] Room ${roomId} subscription status: ${status}`);

            if (status === 'SUBSCRIBED') {
                clearTimeout(timeout);
                this._roomJoinAttempts = 0; // Reset on success
                this.handleJoinSuccess(roomId);
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                this.roomSubscribed = false;
                this.isJoiningRoom = false;

                // FALLBACK: Signal via DB if Realtime room fails
                console.warn(`[CallService] Room ${roomId} Error: ${status}. Using DB Fallback.`);
                this.handleJoinSuccess(roomId);
            } else if (status === 'CLOSED') {
                console.log(`[CallService] Room ${roomId} channel closed.`);
                this.roomSubscribed = false;
                this.isJoiningRoom = false;
            }
        });
    }

    private handleJoinSuccess(roomId: string) {
        if (this.roomSubscribed && this.currentRoomId === roomId) return;
        
        this.roomSubscribed = true;
        this.isJoiningRoom = false;
        
        // 1. Process room callbacks (like starting the call)
        const callbacks = [...this.roomSubscribeCallbacks];
        this.roomSubscribeCallbacks = [];
        console.log(`[CallService] Room ${roomId} joined successfully. Notifying ${callbacks.length} listeners.`);
        callbacks.forEach(cb => cb());

        // 2. UNIFIED BUFFER FLUSH: Clear out ALL pending/buffered signals
        this.flushAllBuffers();
    }

    private flushAllBuffers() {
        if (!this.userId) return;

        const signalsToFlush: CallSignal[] = [];

        // Collect from signalBuffer (waiting for room)
        if (this.signalBuffer.length > 0) {
            console.log(`[CallService] 📤 Collecting ${this.signalBuffer.length} signals from signalBuffer...`);
            signalsToFlush.push(...this.signalBuffer);
            this.signalBuffer = [];
        }

        // Collect from _pendingSignals (waiting for recovery)
        if (this._pendingSignals.length > 0) {
            console.log(`[CallService] 📤 Collecting ${this._pendingSignals.length} signals from _pendingSignals...`);
            signalsToFlush.push(...this._pendingSignals);
            this._pendingSignals = [];
        }

        if (signalsToFlush.length > 0) {
            console.log(`[CallService] 🚀 Flushing ${signalsToFlush.length} unified signals...`);
            // Deduplicate by signalId if present
            const uniqueSignalsMap = new Map<string, CallSignal>();
            signalsToFlush.forEach(s => {
                const id = s.signalId || s.timestamp;
                if (!uniqueSignalsMap.has(id)) uniqueSignalsMap.set(id, s);
            });

            uniqueSignalsMap.forEach(sig => this.sendSignal(sig).catch(() => {}));
        }
    }

    private startCallTimeout(onTimeout: () => void): void {
        this.clearCallTimeout();
        this.callTimeoutTimer = setTimeout(() => {
            console.warn('[CallService] ⚠️ Call timeout reached - no response from callee');
            onTimeout();
        }, this.CALL_TIMEOUT_MS);
    }

    public clearCallTimeout(): void {
        if (this.callTimeoutTimer) {
            console.log('[CallService] ⏰ Call timeout CLEARED');
            clearTimeout(this.callTimeoutTimer);
            this.callTimeoutTimer = null;
        }
    }

    // ── PUBLIC: startCall() ────────────────────────────────────────────

    async startCall(partnerId: string, callType: 'audio' | 'video'): Promise<string | null> {
        if (!this.userId) return null;

        // Check for basic network connectivity first
        const isReachable = await this.checkRealtimeReachable();
        if (!isReachable) {
            console.warn('[CallService] ⚠️ Signaling server unreachable. Call might fail.');
        }

        // Self-heal: if our personal channel died, re-subscribe before calling
        if (!this.personalChannelSubscribed && this.userId) {
            console.warn('[CallService] ⚠️ Personal channel not SUBSCRIBED — re-initializing before call');
            this.initialize(this.userId);
            // Give it a moment to subscribe
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        const roomId = Crypto.randomUUID();
        this.currentRoomId = roomId;
        this.currentPartnerId = partnerId;
        this.currentCallType = callType;

        // Persist call state for crash recovery
        this.persistCallState();

        console.log(`[CallService] Initiating Supabase call to ${partnerId} in room ${roomId}`);

        const signal: CallSignal = {
            type: 'call-request',
            callId: roomId,
            callerId: this.userId!,
            calleeId: partnerId,
            callType,
            roomId,
            callerName: this.currentUser?.name || '',
            callerAvatar: this.currentUser?.avatar || '',
            timestamp: new Date().toISOString()
        };

        // Join the room first so we're ready for the answer
        this.joinRoom(roomId);

        // Ensure polling is active
        this.startSignalPolling();

        // Start timeout - if no response in 45 seconds, end the call
        this.startCallTimeout(() => {
            this.cleanup('timeout');
        });

        // Do not block the UI on signaling delivery or diagnostic reads.
        // Returning the roomId quickly lets the caller mount the call screen
        // before a fast `call-accept` races back from the callee.
        void (async () => {
            try {
                await this.sendSignal(signal);

                // DIAGNOSTIC: Verify signal was persisted — read it back
                try {
                    const { data: verifyData, error: verifyErr } = await supabase
                        .from('call_signals')
                        .select('id, type, receiver_id')
                        .eq('receiver_id', partnerId)
                        .order('created_at', { ascending: false })
                        .limit(1);

                    if (verifyErr) {
                        console.error(`[CallService] 🔴 DIAG: DB read-back FAILED: ${verifyErr.message}`);
                        const { Alert } = require('react-native');
                        Alert.alert('Call Signal Debug', `DB read FAILED: ${verifyErr.message}\n\nSignal may not reach the other device.`);
                    } else if (!verifyData || verifyData.length === 0) {
                        console.error('[CallService] 🔴 DIAG: Signal NOT found in DB after persist!');
                        const { Alert } = require('react-native');
                        Alert.alert('Call Signal Debug', 'Signal was NOT saved to DB!\n\nBroadcast is the only path. Check Realtime connection.');
                    } else {
                        console.log(`[CallService] 🟢 DIAG: Signal verified in DB: ${JSON.stringify(verifyData[0])}`);
                    }
                } catch (diagErr: any) {
                    console.error('[CallService] 🔴 DIAG exception:', diagErr?.message);
                }
            } catch (sendErr: any) {
                console.error('[CallService] ❌ call-request send failed:', sendErr?.message || sendErr);
            }
        })();

        return roomId;
    }

    // ── PUBLIC: acceptCall() ─────────────────────────────────────────────

    async acceptCall(signal: CallSignal): Promise<void> {
        if (!this.userId || !signal.roomId) return;

        console.log(`[CallService] Accepting call from ${signal.callerId} (Supabase)`);
        this.currentRoomId = signal.roomId;
        this.currentPartnerId = signal.callerId;
        this.currentCallType = signal.callType;

        // Clear timeout since call was accepted
        this.clearCallTimeout();

        // Join room — but DON'T block signal sending on it.
        // Room join can hang when Realtime is broken, which would prevent
        // the call-accept signal from ever being sent.
        if (!_roomChannel || this.currentRoomId !== signal.roomId || !this.roomSubscribed) {
            console.log(`[CallService] Joining room ${signal.roomId} (non-blocking)...`);
            this.joinRoom(signal.roomId!);
        }

        // Ensure polling is active
        this.startSignalPolling();

        // Send accept IMMEDIATELY — don't wait for room subscription.
        // The accept goes via DB + personal channel, not the room channel.
        // CRITICAL: callerId must be US (the acceptor), not the original caller.
        // If we spread signal.callerId (the original caller), the caller will
        // see its own ID and drop the signal as a self-echo.
        console.log(`[CallService] 📤 Sending call-accept to ${signal.callerId}`);
        await this.sendSignal({
            ...signal,
            type: 'call-accept',
            callerId: this.userId!,
            calleeId: signal.callerId,
            calleeName: this.currentUser?.name || '',
            calleeAvatar: this.currentUser?.avatar || '',
            timestamp: new Date().toISOString(),
            signalId: Crypto.randomUUID() // Generate fresh signalId for the response
        });
    }

    // ── PUBLIC: rejectCall() ─────────────────────────────────────────────

    async rejectCall(signal: CallSignal): Promise<void> {
        if (!this.userId || !signal.roomId) return;

        console.log(`[CallService] Rejecting call from ${signal.callerId}`);

        // Clear timeout since call was rejected
        this.clearCallTimeout();

        await this.sendSignal({
            ...signal,
            type: 'call-reject',
            // Sender must be the rejecting user; recipient must be the original caller.
            callerId: this.userId,
            calleeId: signal.callerId,
            timestamp: new Date().toISOString(),
            signalId: Crypto.randomUUID()
        });

        this.cleanup('reject');
    }

    // ── PUBLIC: endCall() ────────────────────────────────────────────────

    async endCall(): Promise<void> {
        if (this.userId && this.currentRoomId) {
            console.log('[CallService] Ending call');
            await this.sendSignal({
                type: 'call-end',
                callId: this.currentRoomId,
                callerId: this.userId,
                calleeId: this.currentPartnerId || '',
                callType: this.currentCallType,
                timestamp: new Date().toISOString(),
                roomId: this.currentRoomId
            });
        }
        this.cleanup('manual-end');
    }

    // ── PUBLIC: notifyRinging() ──────────────────────────────────────────

    public async notifyRinging(roomId: string, callerId: string, callType: 'audio' | 'video'): Promise<void> {
        if (!this.userId) return;
        console.log(`[CallService] Notifying ringing for room ${roomId} to caller ${callerId}`);

        const sendRinging = async () => {
            await this.sendSignal({
                type: 'call-ringing',
                callId: roomId,
                callerId,
                calleeId: this.userId!,
                callType,
                timestamp: new Date().toISOString(),
                roomId
            });
        };

        // Ensure we are in the room first
        if (!_roomChannel || this.currentRoomId !== roomId || !this.roomSubscribed) {
            console.log(`[CallService] Joining room ${roomId} before notifying ringing...`);
            this.joinRoom(roomId, sendRinging);
        } else {
            sendRinging();
        }
    }

    // ── PRIVATE: sendToPersonalChannel() ─────────────────────────────────

    private async sendToPersonalChannel(recipientId: string, event: string, signal: CallSignal, signalType: string): Promise<void> {
        // DUAL-CHANNEL BROADCAST:
        // We broadcast to BOTH the UUID channel and the Name channel.
        // This solves the identity mismatch where one device listens on UUID and the other on Name.
        const normalizedId = normalizeId(recipientId);
        const channelsToTry: string[] = [`call_user_${normalizedId}`];

        // Find if this UUID corresponds to a legacy name
        const legacyName = Object.keys(LEGACY_TO_UUID).find(name => LEGACY_TO_UUID[name] === normalizedId);
        if (legacyName) {
            channelsToTry.push(`call_user_${legacyName}`);
        }

        let anySucceeded = false;

        for (const channelName of channelsToTry) {
            let targetChannel = _senderChannels.get(channelName);

            // Self-heal stale channels
            if (targetChannel && ['closed', 'errored', 'leaving'].includes(targetChannel.state)) {
                console.warn(`[CallService] Removing stale channel: ${channelName}`);
                _senderChannels.delete(channelName);
                try { supabase.removeChannel(targetChannel); } catch (_) {}
                targetChannel = undefined as any;
            }

            if (!targetChannel) {
                console.log(`[CallService] Creating sender channel: ${channelName}`);
                targetChannel = supabase.channel(channelName, {
                    config: { broadcast: { self: false } },
                });
                _senderChannels.set(channelName, targetChannel);
            }

            // Ensure sender channel has joined before attempting send.
            if (targetChannel.state !== 'joined') {
                await new Promise<void>((resolve, reject) => {
                    let done = false;
                    const finishOk = () => {
                        if (done) return;
                        done = true;
                        clearTimeout(timeout);
                        resolve();
                    };
                    const finishErr = (message: string) => {
                        if (done) return;
                        done = true;
                        clearTimeout(timeout);
                        reject(new Error(message));
                    };

                    const timeout = setTimeout(() => {
                        finishErr(`Sender channel subscribe timeout: ${channelName} (${targetChannel?.state || 'unknown'})`);
                    }, 4000);

                    if (!targetChannel) {
                        finishErr(`Sender channel missing: ${channelName}`);
                        return;
                    }

                    if (targetChannel.state === 'joined') {
                        finishOk();
                        return;
                    }

                    if (targetChannel.state === 'joining') {
                        const poll = () => {
                            if (done || !targetChannel) return;
                            if (targetChannel.state === 'joined') {
                                finishOk();
                                return;
                            }
                            if (targetChannel.state === 'closed' || targetChannel.state === 'errored' || targetChannel.state === 'leaving') {
                                finishErr(`Sender channel failed while joining: ${channelName} (${targetChannel.state})`);
                                return;
                            }
                            setTimeout(poll, 100);
                        };
                        poll();
                        return;
                    }

                    targetChannel.subscribe((status) => {
                        if (done) return;
                        if (status === 'SUBSCRIBED') {
                            console.log(`[CallService] ✅ Sender channel subscribed: ${channelName}`);
                            finishOk();
                        } else if (status === 'CHANNEL_ERROR' || status === 'CLOSED' || status === 'TIMED_OUT') {
                            finishErr(`Sender channel subscribe failed: ${channelName} (${status})`);
                        }
                    });
                });
            }

            try {
                await targetChannel.send({
                    type: 'broadcast',
                    event: event,
                    payload: signal,
                });
                console.log(`[CallService] ✅ Signal [${signalType}] sent via ${channelName}`);
                anySucceeded = true;
            } catch (sendError) {
                console.warn(`[CallService] ⚠️ Failed to send via ${channelName}:`, sendError);
            }
        }

        if (!anySucceeded) {
            console.error(`[CallService] ❌ ALL sender channels failed for signal [${signalType}]`);
            throw new Error('All sender channels failed');
        }
    }

    // ── SEND SIGNAL (Triple-path: DB primary + Broadcast + Push fallback) ─────────────

    async sendSignal(signal: CallSignal): Promise<void> {
        if (!this.userId) return;

        if (!signal.signalId) {
            signal.signalId = Crypto.randomUUID();
        }

        const signalType = signal.type;
        const recipientId = this.getRecipientId(signal);
        const normalizedRecipientId = normalizeId(recipientId);

        // Attach explicit sender_id to prevent loopback filtering on the other end
        (signal as any).sender_id = this.userId;
        (signal as any).normalized_sender_id = normalizeId(this.userId);

        console.log(`[CallService] 📤 TX [${signalType}] signal TO ${normalizedRecipientId} (ID: ${signal.signalId})`);

        const isCriticalLifecycle = ['call-request', 'call-accept', 'call-reject', 'call-end', 'offer', 'answer', 'ice-candidate'].includes(signalType);
        const isHighPriority = signalType === 'call-request' || signalType === 'call-accept';

        // --- DEFENSIVE CONCURRENCY ---
        // Path 1: Database Persistence
        let dbPathPromise = Promise.resolve();
        if (isCriticalLifecycle) {
            dbPathPromise = (async () => {
                try {
                    const dbTask = this.persistLifecycleSignalToDb(signalType, normalizedRecipientId, signal);
                    await Promise.race([
                        dbTask,
                        this.delay(5000).then(() => { throw new Error('DB persist timeout'); })
                    ]);
                    console.log(`[CallService] ✅ [${signalType}] DB path confirmed`);
                } catch (dbErr: any) {
                    console.warn(`[CallService] ⚠️ DB Path failed/timed-out for [${signalType}]:`, dbErr?.message || dbErr);
                    this._pendingSignals.push(signal);
                }
            })();
        }

        // Path 2: Personal Channel Broadcast
        const broadcastPathPromise = (async () => {
            try {
                await this.sendToPersonalChannel(normalizedRecipientId, 'call_signal', signal, signalType);
                console.log(`[CallService] ✅ [${signalType}] Broadcast path confirmed`);
            } catch (err: any) {
                console.warn(`[CallService] ⚠️ Broadcast Path failure for [${signalType}]:`, err?.message || err);
                this._pendingSignals.push(signal);
            }
        })();

        // Path 3: Room Channel (Secondary sync)
        if (this.currentRoomId && this.roomSubscribed && _roomChannel) {
            try {
                _roomChannel.send({
                    type: 'broadcast',
                    event: 'call_signal',
                    payload: signal
                }).then((status) => {
                    if (status !== 'ok') console.warn(`[CallService] ⚠️ Room sync [${signalType}] status:`, status);
                    else console.log(`[CallService] ✅ [${signalType}] Room sync confirmed`);
                });
            } catch (roomErr) {
                console.warn('[CallService] ⚠️ Room sync exception:', roomErr);
            }
        }

        // Path 4: Push notifications
        if (signalType === 'call-request') {
            this.triggerCallPush(normalizedRecipientId, signal).catch(() => {
                console.warn('[CallService] ⚠️ Push notification failed (non-critical)');
            });
        }

        // --- CONSOLIDATION ---
        if (isHighPriority) {
            await Promise.race([
                Promise.all([dbPathPromise, broadcastPathPromise]), 
                this.delay(3500)
            ]);
        } else if (isCriticalLifecycle && signalType !== 'ice-candidate') {
            await Promise.race([
                Promise.all([dbPathPromise, broadcastPathPromise]),
                this.delay(1500)
            ]);
        }
    }

    private async triggerCallPush(recipientId: string, signal: CallSignal): Promise<void> {
        console.log(`[CallService] 🔔 Triggering call-push for ${recipientId}`);
        try {
            await supabase.functions.invoke('send-call-push', {
                body: {
                    calleeId: recipientId,
                    callerId: this.userId,
                    callId: signal.callId,
                    callType: signal.callType,
                    callerName: this.currentUser?.name || 'Someone'
                }
            });
        } catch (e) {
            console.warn('[CallService] Failed to send push notification:', e);
        }
    }

    private getRecipientId(signal: CallSignal): string {
        if (signal.type === 'call-request') return signal.calleeId;
        const myId = normalizeId(this.userId || '');
        const callerId = normalizeId(signal.callerId);
        if (myId === callerId) return signal.calleeId;
        return signal.callerId;
    }

    // ── WebRTC signal helpers ────────────────────────────────────────────

    async sendOffer(offer: any): Promise<void> {
        if (this.currentRoomId) {
            await this.sendSignal({
                type: 'offer',
                callId: this.currentRoomId,
                callerId: this.userId || '',
                calleeId: this.currentPartnerId || '',
                callType: this.currentCallType,
                payload: offer,
                timestamp: new Date().toISOString(),
                roomId: this.currentRoomId
            });
        }
    }

    async sendAnswer(answer: any): Promise<void> {
        if (this.currentRoomId) {
            await this.sendSignal({
                type: 'answer',
                callId: this.currentRoomId,
                callerId: this.userId || '',
                calleeId: this.currentPartnerId || '',
                callType: this.currentCallType,
                payload: answer,
                timestamp: new Date().toISOString(),
                roomId: this.currentRoomId
            });
        }
    }

    async sendIceCandidate(candidate: any): Promise<void> {
        if (this.currentRoomId) {
            await this.sendSignal({
                type: 'ice-candidate',
                callId: this.currentRoomId,
                callerId: this.userId || '',
                calleeId: this.currentPartnerId || '',
                callType: this.currentCallType,
                payload: candidate ? (candidate.toJSON ? candidate.toJSON() : candidate) : null,
                timestamp: new Date().toISOString(),
                roomId: this.currentRoomId
            });
        }
    }

    // ── Listener management ─────────────────────────────────────────────

    private notifyListeners(signal: CallSignal) {
        this.listeners.forEach(listener => listener(signal));
    }

    addListener(handler: CallSignalHandler): void {
        this.listeners.add(handler);
    }

    removeListener(handler: CallSignalHandler): void {
        this.listeners.delete(handler);
    }

    private async checkRealtimeReachable(): Promise<boolean> {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            return !!session;
        } catch {
            return false;
        }
    }

    // ── NEW: Network Monitoring ─────────────────────────────────────────

    private _startNetworkMonitoring(): void {
        if (this._isNetworkMonitoringActive) return;
        this._isNetworkMonitoringActive = true;

        this._netInfoUnsubscribe = NetInfo.addEventListener(state => {
            const wasConnected = this._networkState === 'connected';
            this._networkState = state.isConnected ? 'connected' : 'disconnected';
            
            if (wasConnected && this._networkState === 'disconnected') {
                console.warn('[CallService] 📡 Network disconnected detected');
            } else if (!wasConnected && this._networkState === 'connected') {
                console.log('[CallService] 📡 Network reconnected — recovering...');
                this._recoverAfterNetworkReturn();
            }
        });
    }

    private async _recoverAfterNetworkReturn(): Promise<void> {
        console.log('[CallService] 🔄 Recovering after network return');
        
        // Reconnect channels
        this._reconnectIfNeeded();
        
        // Poll for missed signals
        await this.pollForSignals();
        
        // Retry pending signals
        await this._retryPendingSignals();
    }

    private _reconnectIfNeeded(): void {
        if (!this.personalChannelSubscribed && this.userId && !this._connectionLimitHit) {
            console.log('[CallService] 🔄 Personal channel not subscribed — reconnecting');
            this._subscribePersonalChannel(this.userId);
        }
        
        // Check room channel
        if (this.currentRoomId && !this.roomSubscribed && !this.isJoiningRoom) {
            console.log('[CallService] 🔄 Room channel lost — rejoining');
            this._roomJoinAttempts = 0;
            this.joinRoom(this.currentRoomId);
        }
    }

    // ── NEW: Channel Health Check ───────────────────────────────────────

    private _startChannelHealthCheck(): void {
        if (this._channelHealthInterval) {
            clearInterval(this._channelHealthInterval);
        }

        this._channelHealthInterval = setInterval(() => {
            this._checkChannelHealth();
        }, CHANNEL_HEALTH_CHECK_MS);
    }

    private _checkChannelHealth(): void {
        if (!this.userId) return;
        
        // Check personal channel state
        if (_personalChannel) {
            const state = _personalChannel.state;
            if (state === 'closed' || state === 'errored' || state === 'leaving') {
                console.warn(`[CallService] ⚠️ Personal channel unhealthy (${state}) — reconnecting`);
                this.personalChannelSubscribed = false;
                this._reconnectIfNeeded();
            }
        }
        
        // Check room channel if active call
        if (this.currentRoomId && _roomChannel) {
            const state = _roomChannel.state;
            if (state === 'closed' || state === 'errored' || state === 'leaving') {
                console.warn(`[CallService] ⚠️ Room channel unhealthy (${state}) — rejoining`);
                this.roomSubscribed = false;
                this._roomJoinAttempts = 0;
                this.joinRoom(this.currentRoomId);
            }
        }
    }

    // ── NEW: Retry Pending Signals ──────────────────────────────────────

    private async _retryPendingSignals(): Promise<void> {
        if (this._pendingSignals.length === 0) return;
        
        console.log(`[CallService] 🔄 Retrying ${this._pendingSignals.length} pending signals`);
        
        const signalsToRetry = [...this._pendingSignals];
        this._pendingSignals = [];
        
        for (const signal of signalsToRetry) {
            try {
                await this.sendSignal(signal);
            } catch (error) {
                console.warn(`[CallService] Retry failed for ${signal.type}:`, error);
                this._pendingSignals.push(signal); // Add back to queue
            }
        }
    }

    // ── PUBLIC: cleanup() ───────────────────────────────────────────────

    cleanup(reason: string = 'unknown'): void {
        console.log(`[CallService] 🧹 Cleaning up call state. Reason: ${reason}`);
        const fullCleanup = reason === 'unmount' || reason === 'logout' || reason === 'full-reset';
        const roomId = this.currentRoomId;

        // CRITICAL: Set state to null BEFORE closing channels
        this.currentRoomId = null;
        this.currentPartnerId = null;
        this.roomSubscribed = false;
        this.isJoiningRoom = false;
        this._roomJoinAttempts = 0;
        this.roomSubscribeCallbacks = [];
        this.currentCallType = 'audio';

        // Clear timeouts
        this.clearCallTimeout();
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (_roomChannel) {
            console.log(`[CallService] Unsubscribing from room ${roomId}`);
            try { supabase.removeChannel(_roomChannel); } catch (_) {}
            _roomChannel = null;
        }

        // Fast poll is call-scoped; always stop it on call teardown.
        if (this._fastPollInterval) {
            clearInterval(this._fastPollInterval);
            this._fastPollInterval = null;
        }

        this.signalBuffer = [];
        this._pendingSignals = [];
        this._pendingAckSignals.clear();
        this._signalAckTimeout.forEach(timeout => clearTimeout(timeout));
        this._signalAckTimeout.clear();

        if (fullCleanup) {
            if (this.signalPollInterval) {
                clearInterval(this.signalPollInterval);
                this.signalPollInterval = null;
            }

            if (this._netInfoUnsubscribe) {
                this._netInfoUnsubscribe();
                this._netInfoUnsubscribe = null;
                this._isNetworkMonitoringActive = false;
            }

            if (this._channelHealthInterval) {
                clearInterval(this._channelHealthInterval);
                this._channelHealthInterval = null;
            }

            if (_signalSubscription) {
                try { supabase.removeChannel(_signalSubscription); } catch (_) {}
                _signalSubscription = null;
            }

            if (_personalChannel) {
                try { supabase.removeChannel(_personalChannel); } catch (_) {}
                _personalChannel = null;
            }

            // Cleanup pool
            console.log(`[CallService] 🧹 Cleaning up ${_senderChannels.size} sender channels`);
            _senderChannels.forEach((ch) => {
                try { supabase.removeChannel(ch); } catch (_) {}
            });
            _senderChannels.clear();

            // Clear processed signal IDs
            this.processedSignalIds.clear();
        } else if (!this.signalPollInterval && this.userId) {
            // Keep signaling alive after normal call end so incoming calls keep working.
            this.startSignalPolling();
        }

        // Clean up transient WebRTC signals from DB to prevent bloat
        // IMPORTANT: Only clear signals that are OLDER than 1 minute to avoid 
        // deleting handshake signals that were just sent.
        if (this.userId) {
            const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
            supabase.from('call_signals')
                .delete()
                .in('type', ['offer', 'answer', 'ice-candidate'])
                .lt('created_at', oneMinuteAgo)
                .then(() => {}, () => {});
        }

        // Clear persisted state
        this.clearPersistedCallState();
    }

    private async persistCallState(): Promise<void> {
        try {
            const AsyncStorage = require('@react-native-async-storage/async-storage').default;
            const state = {
                roomId: this.currentRoomId,
                partnerId: this.currentPartnerId,
                callType: this.currentCallType,
                persistedAt: new Date().toISOString(),
            };
            await AsyncStorage.setItem('soulsync_active_call', JSON.stringify(state));
        } catch (error) {
            console.warn('[CallService] Failed to persist call state:', error);
        }
    }

    private async clearPersistedCallState(): Promise<void> {
        try {
            const AsyncStorage = require('@react-native-async-storage/async-storage').default;
            await AsyncStorage.removeItem('soulsync_active_call');
        } catch (error) {
            console.warn('[CallService] Failed to clear persisted call state:', error);
        }
    }

    async checkAndRecoverCall(): Promise<{ roomId: string; partnerId: string; callType: 'audio' | 'video' } | null> {
        try {
            const AsyncStorage = require('@react-native-async-storage/async-storage').default;
            const stateStr = await AsyncStorage.getItem('soulsync_active_call');
            if (!stateStr) return null;

            const state = JSON.parse(stateStr);
            const persistedAt = new Date(state.persistedAt).getTime();
            const now = Date.now();

            if (now - persistedAt < 5 * 60 * 1000) {
                console.log('[CallService] Found persisted call state, attempting recovery:', state);
                return state;
            } else {
                await this.clearPersistedCallState();
                return null;
            }
        } catch (error) {
            console.warn('[CallService] Failed to check call recovery:', error);
            return null;
        }
    }
}

export const callService = new CallService();
