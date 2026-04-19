import * as React from 'react';
import { useState, useEffect, createContext, useContext, useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import { supabase } from '../config/supabase';
import { callService, CallSignal } from '../services/CallService';
// Safe import — WebRTC not available in Expo Go
let webRTCService: any = null;
try { webRTCService = require('../services/WebRTCService').webRTCService; } catch (_) {}
import { nativeCallBridge } from '../services/NativeCallBridge';
import { useAuth } from './AuthContext';
import { ActiveCall, CallLog } from '../types';
import { callDbService } from '../services/CallDBService';
import { normalizeId, getSuperuserName } from '../utils/idNormalization';

interface CallContextType {
    activeCall: ActiveCall | null;
    calls: CallLog[];
    startCall: (contactId: string, type: 'audio' | 'video') => Promise<void>;
    acceptCall: () => Promise<void>;
    endCall: () => Promise<void>;
    toggleMinimizeCall: (val: boolean) => void;
    toggleMute: () => void;
    toggleVideo: () => void;
    deleteCall: (id: string) => Promise<void>;
    clearCalls: () => Promise<void>;
    startGroupCall: (groupId: string, participantIds: string[], type: 'audio' | 'video') => Promise<void>;
}

export const CallContext = createContext<CallContextType | undefined>(undefined);

export const CallProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { currentUser } = useAuth();
    const currentUserId = currentUser?.id ? normalizeId(currentUser.id) : null;
    const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
    const [calls, setCalls] = useState<CallLog[]>([]);
    const activeCallRef = useRef(activeCall);
    const callStartTimeRef = useRef<number | null>(null);
    const incomingSignalRef = useRef<CallSignal | null>(null);
    const pendingAcceptedRoomRef = useRef<string | null>(null);

    useEffect(() => { activeCallRef.current = activeCall; }, [activeCall]);

    // Timeout detection for unanswered calls
    const callTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const endCallLocalOnlyRef = useRef<() => Promise<void>>(async () => {});

    const startCallTimeout = useCallback((roomId: string) => {
        if (callTimeoutRef.current) {
            clearTimeout(callTimeoutRef.current);
        }
        
        console.log(`[CallContext] ⏰ Starting 60s call timeout for room ${roomId}`);
        callTimeoutRef.current = setTimeout(() => {
            const current = activeCallRef.current;
            // If call is still active and not accepted, it's timed out
            if (current && !current.isAccepted && (current.roomId === roomId || current.callId === roomId)) {
                console.warn(`[CallContext] ⚠️ Call timeout - no answer after 60s`);
                Alert.alert(
                    'No Answer',
                    'The other person didn\'t pick up.',
                    [{ text: 'OK' }]
                );
                void endCallLocalOnlyRef.current();
            }
        }, 60000); // 60 seconds timeout
    }, []);

    const clearCallTimeout = useCallback(() => {
        if (callTimeoutRef.current) {
            clearTimeout(callTimeoutRef.current);
            callTimeoutRef.current = null;
        }
    }, []);

    const fetchCalls = useCallback(async () => {
        if (!currentUserId) return;

        // 1. Load from local SQLite first
        try {
            const localLogs = await callDbService.getCallLogs();
            if (localLogs.length > 0) {
                setCalls(localLogs);
            }
        } catch (e) {
            // DB might not be ready yet — non-fatal
        }

        // 2. Fetch from Supabase as secondary
        try {
            const { data, error } = await supabase
                .from('call_logs')
                .select('*')
                .or(`caller_id.eq.${currentUserId},callee_id.eq.${currentUserId}`)
                .order('created_at', { ascending: false })
                .limit(50);

            if (!error && data) {
                const mappedLogs: CallLog[] = data.map(log => ({
                    id: log.id,
                    contactId: log.caller_id === currentUserId ? log.callee_id : log.caller_id,
                    contactName: getSuperuserName(log.caller_id === currentUserId ? log.callee_id : log.caller_id) || 'User',
                    avatar: '',
                    time: log.created_at,
                    type: log.caller_id === currentUserId ? 'outgoing' : 'incoming',
                    status: log.status || 'completed',
                    callType: log.call_type || 'audio',
                    duration: log.duration
                }));

                for (const log of mappedLogs) {
                    await callDbService.saveCallLog(log);
                }

                const finalLogs = await callDbService.getCallLogs();
                setCalls(finalLogs);
            }
        } catch (err) {
            console.warn('[CallContext] Supabase fetch failed:', err);
        }
    }, [currentUserId]);

    const acceptCall = useCallback(async () => {
        const signal = incomingSignalRef.current;
        if (!signal) return;

        clearCallTimeout(); // Clear timeout when call is accepted
        setActiveCall(prev => prev ? { ...prev, isAccepted: true } : null);
        callStartTimeRef.current = Date.now();
        callService.acceptCall(signal).catch(() => {});
        incomingSignalRef.current = null;
    }, [clearCallTimeout]);

    const endCallLocalOnly = useCallback(async () => {
        console.log('[CallContext] ⚠️ endCallLocalOnly called!', new Error().stack?.split('\n').slice(1, 4).join(' | '));
        const active = activeCallRef.current;
        if (active) {
            const duration = callStartTimeRef.current ? Math.floor((Date.now() - callStartTimeRef.current) / 1000) : 0;
            await callDbService.saveCallLog({
                id: active.callId || active.roomId || 'unknown',
                contactId: active.contactId,
                contactName: active.contactName || getSuperuserName(active.contactId) || 'User',
                avatar: active.avatar || '',
                time: callStartTimeRef.current ? new Date(callStartTimeRef.current).toISOString() : new Date().toISOString(),
                type: active.isIncoming ? 'incoming' : 'outgoing',
                status: active.isAccepted ? 'completed' : 'rejected',
                callType: active.type,
                duration
            });
            fetchCalls();
        }

        if (webRTCService) try { webRTCService.cleanup(); } catch (_) {}
        callService.cleanup('local-only-end');
        setActiveCall(null);
        callStartTimeRef.current = null;
        incomingSignalRef.current = null;
        pendingAcceptedRoomRef.current = null;
    }, [fetchCalls]);

    useEffect(() => {
        endCallLocalOnlyRef.current = endCallLocalOnly;
    }, [endCallLocalOnly]);

    useEffect(() => {
        if (!currentUserId) {
            // Ensure no active call survives logout
            if (activeCallRef.current) {
                console.log('[CallContext] Clearing active call on logout');
                setActiveCall(null);
            }
            return;
        }

        callService.initialize(currentUserId, {
            name: currentUser.name || currentUser.username || 'User',
            avatar: currentUser.avatar || ''
        });

        nativeCallBridge.initialize(currentUserId, {
            onCallAnswered: () => acceptCall(),
            // Native callbacks for remote termination should NOT re-send call-end.
            onCallDeclined: () => endCallLocalOnly(),
            onCallConnected: () => {},
            onCallEnded: () => endCallLocalOnly(),
            onMuteToggled: (muted) => setActiveCall(prev => prev ? { ...prev, isMuted: muted } : null)
        }).catch(err => console.warn('[CallContext] NativeCallBridge init failed:', err));

        const signalHandler = async (signal: CallSignal) => {
            const myId = currentUserId;
            const normalizedMyId = normalizeId(myId || '');
            // sender_id reflects the real emitting device/user for relayed signals
            // (e.g. call-ringing / call-reject can carry callerId of the original caller).
            const normalizedSenderId = normalizeId((signal as any).sender_id || signal.callerId || '');

            // [AUTO-CUT FIX] Redundant guard in Context to ignore self-signals
            if (myId && normalizedMyId === normalizedSenderId) {
                return;
            }

            console.log(`[CallContext] 📩 RX [${signal.type}] | Room: ${signal.roomId} | From: ${signal.callerId} (ID: ${signal.signalId?.substring(0, 8)})`);
            
            switch (signal.type) {
                case 'call-request': {
                    const currentActive = activeCallRef.current;
                    const isSelf = normalizeId(signal.callerId) === normalizeId(currentUserId);
                    if (isSelf) return;

                    // If we have an active call, check if it's stale (over 30s and not accepted)
                    if (currentActive) {
                        const isSameRoom = currentActive.roomId === signal.roomId;
                        const isAccepted = currentActive.isAccepted;
                        
                        if (!isSameRoom && !isAccepted) {
                            console.warn(`[CallContext] ♻️ Pre-empting unaccepted active call ${currentActive.roomId} for new request ${signal.roomId}`);
                        } else if (isSameRoom) {
                            console.log(`[CallContext] 🔄 Refreshing state for existing room ${signal.roomId}`);
                        } else {
                            console.log(`[CallContext] 🚫 Ignoring request: busy with accepted call ${currentActive.roomId}`);
                            return;
                        }
                    }
                    
                    incomingSignalRef.current = signal;
                    const contactName = getSuperuserName(signal.callerId) || 'User';
                    setActiveCall({
                        callId: signal.callId,
                        contactId: signal.callerId,
                        contactName: contactName,
                        type: signal.callType,
                        isIncoming: true,
                        isAccepted: false,
                        isMuted: false,
                        isVideoOff: false,
                        isMinimized: false,
                        remoteVideoOff: false,
                        roomId: signal.roomId,
                        groupId: signal.groupId,
                        participantIds: (signal as any).participantIds || []
                    });
                    
                    callService.notifyRinging(signal.roomId!, signal.callerId, signal.callType)
                        .catch(err => console.warn('[CallContext] Ringing signal failed:', err));
                    break;
                }
                case 'call-accept': {
                    const active = activeCallRef.current;
                    const signalRoomId = signal.roomId || signal.callId || null;
                    pendingAcceptedRoomRef.current = signalRoomId;
                    // [AUTO-CUT FIX] PREVENT CALLEE FROM AUTO-ACCEPTING GHOST SIGNALS
                    // Only the CALLER (!isIncoming) should set isAccepted=true when receiving this signal.
                    // The CALLEE (isIncoming) sets it themselves when clicking the Accept button.
                    if (active && active.isIncoming) {
                        console.warn(`[CallContext] 🛡️ Ignoring call-accept signal as RECIPIENT. isAccepted stays false until manual click.`);
                        break;
                    }

                    // [AUTO-CUT FIX] Clear timeout on caller's side when target accepts
                    callService.clearCallTimeout();
                    clearCallTimeout(); // Clear local timeout too
                    setActiveCall(prev => {
                        if (!prev) return prev;
                        const activeRoomId = prev.roomId || prev.callId || null;
                        if (signalRoomId && activeRoomId && activeRoomId !== signalRoomId) {
                            return prev;
                        }
                        return { ...prev, isAccepted: true };
                    });
                    callStartTimeRef.current = Date.now();
                    
                    if (webRTCService && !active?.isIncoming) {
                        try { webRTCService.onCallAccepted(normalizedSenderId); } catch (e) {}
                    }
                    break;
                }
                case 'call-reject':
                case 'call-end': {
                    const wasAccepted = activeCallRef.current?.isAccepted;
                    const active = activeCallRef.current;
                    const signalRoom = signal.roomId || signal.callId;
                    const activeRoom = active?.roomId || active?.callId;
                    const serviceRoom = callService.getCurrentRoomId();

                    // Ignore stale termination events from previous rooms/calls.
                    if (active && signalRoom && activeRoom && signalRoom !== activeRoom) {
                        console.warn(`[CallContext] Ignoring stale ${signal.type} for room ${signalRoom} (active: ${activeRoom})`);
                        break;
                    }

                    // During call setup race, activeCall can still be null while CallService
                    // has already latched onto a new room. Ignore termination events that do
                    // not match the currently active service room to prevent instant self-cuts.
                    if (!active) {
                        if (!signalRoom || !serviceRoom || signalRoom !== serviceRoom) {
                            console.warn(`[CallContext] Ignoring stale ${signal.type} with no active call. signalRoom=${signalRoom || 'none'} serviceRoom=${serviceRoom || 'none'}`);
                            break;
                        }
                    }
                    
                    if (active) {
                        const duration = callStartTimeRef.current ? Math.floor((Date.now() - callStartTimeRef.current) / 1000) : 0;
                        await callDbService.saveCallLog({
                            id: active.callId || active.roomId || 'unknown',
                            contactId: active.contactId,
                            contactName: active.contactName || getSuperuserName(active.contactId) || 'User',
                            avatar: active.avatar || '',
                            time: callStartTimeRef.current ? new Date(callStartTimeRef.current).toISOString() : new Date().toISOString(),
                            type: active.isIncoming ? 'incoming' : 'outgoing',
                            status: wasAccepted ? 'completed' : (active.isIncoming ? 'missed' : 'rejected'),
                            callType: active.type,
                            duration
                        });
                        fetchCalls();
                    }

                    if (webRTCService) {
                        try { 
                            console.log(`[CallContext] Triggering WebRTC endCall for signal: ${signal.type}`);
                            webRTCService.endCall(`signal-${signal.type}`); 
                        } catch (_) {}
                    }
                    setActiveCall(null);
                    incomingSignalRef.current = null;
                    callStartTimeRef.current = null;
                    pendingAcceptedRoomRef.current = null;
                    callService.cleanup('remote-terminated');
                    break;
                }
                case 'call-ringing':
                    setActiveCall(prev => prev ? { ...prev, isRinging: true } : null);
                    break;
                case 'video-toggle':
                    setActiveCall(prev => {
                        if (!prev) return null;
                        const nextType = signal.payload?.callType === 'video' || signal.payload?.callType === 'audio'
                            ? signal.payload.callType
                            : prev.type;
                        return {
                            ...prev,
                            type: nextType,
                            remoteVideoOff: typeof signal.payload?.videoOff === 'boolean'
                                ? signal.payload.videoOff
                                : (nextType === 'audio'),
                        };
                    });
                    break;
                case 'audio-toggle':
                    setActiveCall(prev => prev ? { ...prev, remoteMuted: signal.payload?.muted } : null);
                    break;
                case 'offer':
                case 'answer':
                case 'ice-candidate':
                    console.log(`[CallContext] 📡 WebRTC signal received: ${signal.type} from ${signal.callerId?.substring(0,8)}...`);
                    if (signal.callType === 'audio' || signal.callType === 'video') {
                        setActiveCall(prev => {
                            if (!prev || prev.type === signal.callType) {
                                return prev;
                            }
                            return { ...prev, type: signal.callType };
                        });
                        callService.setCurrentCallType(signal.callType);
                    }
                    if (webRTCService) {
                        try {
                            console.log(`[CallContext] Forwarding ${signal.type} to WebRTCService`);
                            await webRTCService.handleSignal(signal);
                        } catch (e) {
                            console.error(`[CallContext] ❌ Error forwarding ${signal.type}:`, e);
                        }
                    }
                    break;
            }
        };

        callService.addListener(signalHandler);
        fetchCalls();
        
        const callSub = supabase.channel('public:call_logs')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'call_logs' }, () => fetchCalls())
            .subscribe();

        return () => {
            callService.removeListener(signalHandler);
            callService.cleanup('unmount');
            nativeCallBridge.cleanup();
            supabase.removeChannel(callSub);
            clearCallTimeout(); // Clear any pending timeouts
            setActiveCall(null); // Force clear on cleanup
        };
    }, [currentUserId, endCallLocalOnly, acceptCall]);

    const startCall = useCallback(async (contactId: string, type: 'audio' | 'video') => {
        if (!webRTCService?.isAvailable?.()) {
            Alert.alert('Calling Unavailable', 'WebRTC native module is missing.');
            return;
        }

        pendingAcceptedRoomRef.current = null;
        console.log(`[CallContext] 📞 Starting 1:1 call to ${contactId} (${type})`);
        const roomId = await callService.startCall(contactId, type);
        
        if (roomId) {
            setActiveCall({
                callId: roomId,
                contactId: contactId,
                contactName: getSuperuserName(contactId) || 'User',
                type,
                isIncoming: false,
                isAccepted: false,
                isMuted: false,
                isVideoOff: false,
                isMinimized: false,
                remoteVideoOff: false,
                roomId,
            });
            callStartTimeRef.current = Date.now();
            startCallTimeout(roomId);
        }
    }, [startCallTimeout]);

    const startGroupCall = useCallback(async (groupId: string, participantIds: string[], type: 'audio' | 'video') => {
        if (!webRTCService?.isAvailable?.()) {
            Alert.alert('Calling Unavailable', 'WebRTC native module is missing.');
            return;
        }

        pendingAcceptedRoomRef.current = null;
        console.log(`[CallContext] 📞 Starting group call for ${groupId} (${type})`);
        const roomId = await callService.startCall('', type, groupId);
        
        if (roomId) {
            const groupName = 'Group Call'; // Should fetch from chat state if possible
            setActiveCall({
                callId: roomId,
                contactId: groupId,
                contactName: groupName,
                type,
                isIncoming: false,
                isAccepted: true, // Group calls we are "connected" to the room immediately
                isMuted: false,
                isVideoOff: false,
                isMinimized: false,
                remoteVideoOff: false,
                roomId,
                groupId,
                participantIds
            });
            callStartTimeRef.current = Date.now();
        }
    }, []);

    const endCall = useCallback(async () => {
        console.log('[CallContext] ⚠️ endCall called!', new Error().stack?.split('\n').slice(1, 4).join(' | '));
        const active = activeCallRef.current;
        if (active) {
            const duration = callStartTimeRef.current ? Math.floor((Date.now() - callStartTimeRef.current) / 1000) : 0;
            await callDbService.saveCallLog({
                id: active.callId || active.roomId || 'unknown',
                contactId: active.contactId,
                contactName: active.contactName || getSuperuserName(active.contactId) || 'User',
                avatar: active.avatar || '',
                time: callStartTimeRef.current ? new Date(callStartTimeRef.current).toISOString() : new Date().toISOString(),
                type: active.isIncoming ? 'incoming' : 'outgoing',
                status: active.isAccepted ? 'completed' : 'rejected',
                callType: active.type,
                duration
            });
            fetchCalls();
        }

        if (webRTCService) try { webRTCService.cleanup(); } catch (_) {}
        await callService.endCall();
        setActiveCall(null);
        callStartTimeRef.current = null;
        pendingAcceptedRoomRef.current = null;
    }, [fetchCalls]);

    const toggleMute = useCallback(() => {
        setActiveCall(prev => {
            if (!prev) return null;
            const newMuted = !prev.isMuted;
            if (webRTCService) try { webRTCService.toggleMute(); } catch (_) {}
            
            callService.sendSignal({
                type: 'audio-toggle',
                callId: prev.callId || prev.roomId || '',
                callerId: currentUserId || '',
                calleeId: prev.contactId,
                callType: prev.type,
                payload: { muted: newMuted },
                timestamp: new Date().toISOString(),
                roomId: prev.roomId,
            }).catch(() => {});
            
            return { ...prev, isMuted: newMuted };
        });
    }, [currentUserId]);

    const toggleVideo = useCallback(() => {
        const current = activeCallRef.current;
        if (!current) return;

        const nextType: 'audio' | 'video' = current.type === 'video' ? 'audio' : 'video';
        const nextVideoOff = nextType === 'audio';

        (async () => {
            try {
                if (webRTCService?.switchCallType) {
                    await webRTCService.switchCallType(nextType);
                } else if (webRTCService && nextType === 'video') {
                    // Fallback for older builds where switchCallType is unavailable.
                    await webRTCService.prepareCall('video');
                    await webRTCService.startCall?.(nextType, current.groupId ? undefined : current.contactId, current.groupId);
                }
            } catch (error) {
                console.warn('[CallContext] Failed to switch call mode:', error);
                return;
            }

            // Keep CallService signaling metadata aligned with renegotiation signals.
            callService.setCurrentCallType(nextType);

            setActiveCall(prev => prev ? { ...prev, type: nextType, isVideoOff: nextVideoOff } : null);

            callService.sendSignal({
                type: 'video-toggle',
                callId: current.callId || current.roomId || '',
                callerId: currentUserId || '',
                calleeId: current.contactId,
                callType: nextType,
                payload: { videoOff: nextVideoOff, callType: nextType },
                timestamp: new Date().toISOString(),
                roomId: current.roomId,
            }).catch(() => {});
        })();
    }, [currentUserId]);

    const deleteCall = useCallback(async (id: string) => {
        setCalls(prev => prev.filter(c => c.id !== id));
        await callDbService.deleteCallLog(id);
        await supabase.from('call_logs').delete().eq('id', id);
    }, []);

    const clearCalls = useCallback(async () => {
        if (!currentUserId) return;
        setCalls([]);
        await callDbService.clearCallLogs();
        await supabase.from('call_logs').delete().or(`caller_id.eq.${currentUserId},callee_id.eq.${currentUserId}`);
    }, [currentUserId]);

    const value = {
        activeCall,
        calls,
        startCall,
        acceptCall,
        endCall,
        toggleMinimizeCall: (val: boolean) => setActiveCall(prev => prev ? { ...prev, isMinimized: val } : null),
        toggleMute,
        toggleVideo,
        deleteCall,
        clearCalls,
        startGroupCall,
    };

    return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
};

export const useCall = (): CallContextType => {
    const context = useContext(CallContext);
    if (context === undefined) {
        // SAFE FALLBACK: Prevent crashes during Android route transitions
        console.warn('[CallContext] useCall() called outside of CallProvider. Providing safe fallback.');
        return {
            activeCall: null,
            calls: [],
            startCall: async () => {},
            acceptCall: async () => {},
            endCall: async () => {},
            toggleMinimizeCall: () => {},
            toggleMute: () => {},
            toggleVideo: () => {},
            deleteCall: async () => {},
            clearCalls: async () => {},
            startGroupCall: async () => {},
        };
    }
    return context;
};
