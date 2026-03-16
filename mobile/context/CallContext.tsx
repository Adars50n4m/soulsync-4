import * as React from 'react';
import { useState, useEffect, createContext, useContext, useCallback, useRef } from 'react';
import { supabase } from '../config/supabase';
import { callService, CallSignal } from '../services/CallService';
// Safe import — WebRTC not available in Expo Go
let webRTCService: any = null;
try { webRTCService = require('../services/WebRTCService').webRTCService; } catch (_) {}
import { nativeCallBridge } from '../services/NativeCallBridge';
import { useAuth } from './AuthContext';
import { ActiveCall, CallLog } from '../types';

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
}

export const CallContext = createContext<CallContextType | undefined>(undefined);

export const CallProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { currentUser } = useAuth();
    const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
    const [calls, setCalls] = useState<CallLog[]>([]);
    const activeCallRef = useRef(activeCall);
    // Store the incoming signal for acceptCall to use
    const incomingSignalRef = useRef<CallSignal | null>(null);

    useEffect(() => { activeCallRef.current = activeCall; }, [activeCall]);

    const fetchCalls = useCallback(async () => {
        if (!currentUser) return;
        const { data, error } = await supabase
            .from('call_logs')
            .select('*')
            .or(`caller_id.eq.${currentUser.id},callee_id.eq.${currentUser.id}`)
            .order('created_at', { ascending: false });

        if (!error && data) {
            const mappedLogs: CallLog[] = data.map(log => ({
                id: log.id,
                contactId: log.caller_id === currentUser.id ? log.callee_id : log.caller_id,
                contactName: 'Unknown',
                avatar: '',
                time: log.created_at,
                type: log.caller_id === currentUser.id ? 'outgoing' : 'incoming',
                status: log.status || 'completed',
                callType: log.call_type || 'audio',
                duration: log.duration
            }));
            setCalls(mappedLogs);
        }
    }, [currentUser]);

    useEffect(() => {
        if (!currentUser) return;

        // Initialize CallService
        try {
            callService.initialize(currentUser.id);
        } catch (e) {
            console.warn('[CallContext] callService.initialize failed:', e);
        }

        // Initialize NativeCallBridge
        const initTimeout = setTimeout(() => {
            console.warn('[CallContext] NativeCallBridge init timed out');
        }, 5000);

        nativeCallBridge.initialize(currentUser.id, {
            onCallAnswered: (callId, payload) => {
                console.log('[CallContext] Native call answered:', callId);
            },
            onCallDeclined: (callId) => {
                console.log('[CallContext] Native call declined:', callId);
                setActiveCall(null);
                incomingSignalRef.current = null;
            },
            onCallConnected: (callId) => {
                console.log('[CallContext] Native call connected:', callId);
            },
            onCallEnded: (callId) => {
                console.log('[CallContext] Native call ended:', callId);
                setActiveCall(null);
                incomingSignalRef.current = null;
            },
            onMuteToggled: (muted) => {
                console.log('[CallContext] Mute toggled from native:', muted);
                setActiveCall(prev => prev ? { ...prev, isMuted: muted } : null);
            }
        }).then(() => {
            clearTimeout(initTimeout);
        }).catch(err => {
            clearTimeout(initTimeout);
            console.warn('[CallContext] Failed to initialize NativeCallBridge:', err);
        });

        // ──────────────────────────────────────────────────────────────────
        // INCOMING SIGNAL HANDLER — wire callService signals to activeCall
        // ──────────────────────────────────────────────────────────────────
        const signalHandler = (signal: CallSignal) => {
            console.log(`[CallContext] 📞 Received signal: ${signal.type} from ${signal.callerId} (My ID: ${currentUser?.id})`);
            
            switch (signal.type) {
                case 'call-request': {
                    console.log(`[CallContext] 🚀 Processing call-request. Caller: ${signal.callerId}, Callee: ${signal.calleeId}, Me: ${currentUser?.id}`);
                    
                    // Protection: Don't answer calls from yourself (pollution/loopback)
                    if (signal.callerId === currentUser?.id) {
                        console.log('[CallContext] ⚠️ Ignoring incoming call-request from self (ID match)');
                        return;
                    }

                    // Don't overwrite an existing active call
                    if (activeCallRef.current) {
                        console.log('[CallContext] ⚠️ Ignoring incoming call — already in a call with', activeCallRef.current.contactId);
                        return;
                    }
                    
                    console.log('[CallContext] ✅ Setting activeCall for incoming request');
                    // Store the raw signal for acceptCall
                    incomingSignalRef.current = signal;
                    
                    // Set activeCall → triggers IncomingCallModal
                    setActiveCall({
                        callId: signal.callId,
                        contactId: signal.callerId,
                        type: signal.callType,
                        isMinimized: false,
                        isMuted: false,
                        isIncoming: true,
                        isAccepted: false,
                        isRinging: true,
                        roomId: signal.roomId,
                    });
                    
                    // Notify caller we're ringing
                    callService.notifyRinging(
                        signal.roomId!,
                        signal.callerId,
                        signal.callType
                    ).catch(err => console.warn('[CallContext] Failed to send ringing:', err));
                    break;
                }
                case 'call-accept': {
                    // The callee accepted — update state
                    setActiveCall(prev => prev ? { ...prev, isAccepted: true, isRinging: false } : null);
                    // Notify WebRTCService to create offer (for caller side)
                    if (webRTCService && !activeCallRef.current?.isIncoming) {
                        try {
                            // Ensure WebRTC is initialized before calling onCallAccepted
                            if (!webRTCService.peerConnection) {
                                console.log('[CallContext] Initializing WebRTC before onCallAccepted...');
                                webRTCService.initialize({
                                    onStateChange: (state: any) => {
                                        console.log('[CallContext] WebRTC state changed:', state);
                                    },
                                    onLocalStream: (stream: any) => {
                                        console.log('[CallContext] Local stream ready');
                                    },
                                    onRemoteStream: (stream: any) => {
                                        console.log('[CallContext] Remote stream received');
                                    },
                                    onError: (error: string) => {
                                        console.error('[CallContext] WebRTC error:', error);
                                    },
                                }, true); // isInitiator = true for caller
                            }
                            webRTCService.onCallAccepted();
                        } catch (e) {
                            console.warn('[CallContext] WebRTC onCallAccepted error:', e);
                        }
                    }
                    break;
                }
                case 'call-reject': {
                    console.log('[CallContext] Call rejected by remote');
                    setActiveCall(null);
                    incomingSignalRef.current = null;
                    callService.cleanup('remote-reject');
                    break;
                }
                case 'call-end': {
                    console.log('[CallContext] Call ended by remote');
                    if (webRTCService) {
                        try { webRTCService.cleanup(); } catch (_) {}
                    }
                    setActiveCall(null);
                    incomingSignalRef.current = null;
                    callService.cleanup('remote-end');
                    break;
                }
                case 'call-ringing': {
                    setActiveCall(prev => prev ? { ...prev, isRinging: true } : null);
                    break;
                }
                case 'video-toggle': {
                    setActiveCall(prev => prev ? { ...prev, remoteVideoOff: signal.payload?.videoOff } : null);
                    break;
                }
                case 'audio-toggle': {
                    setActiveCall(prev => prev ? { ...prev, remoteMuted: signal.payload?.muted } : null);
                    break;
                }
                // WebRTC signaling — forward to WebRTCService for connection establishment
                case 'offer':
                case 'answer':
                case 'ice-candidate': {
                    if (webRTCService) {
                        try {
                            // For offer, ensure WebRTC is initialized before handling
                            if (signal.type === 'offer' && !webRTCService.peerConnection) {
                                console.log('[CallContext] Initializing WebRTC before handling offer...');
                                const isInitiator = signal.callerId === currentUser?.id;
                                webRTCService.initialize({
                                    onStateChange: (state: any) => {
                                        console.log('[CallContext] WebRTC state changed:', state);
                                    },
                                    onLocalStream: (stream: any) => {
                                        console.log('[CallContext] Local stream ready');
                                    },
                                    onRemoteStream: (stream: any) => {
                                        console.log('[CallContext] Remote stream received');
                                    },
                                    onError: (error: string) => {
                                        console.error('[CallContext] WebRTC error:', error);
                                    },
                                }, isInitiator);
                            }
                            webRTCService.handleSignal(signal);
                        } catch (e) {
                            console.warn('[CallContext] WebRTC signal handling error:', e);
                        }
                    }
                    break;
                }
                default:
                    break;
            }
        };

        callService.addListener(signalHandler);
        fetchCalls();
        
        const callSub = supabase
            .channel('public:call_logs')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'call_logs' }, (payload: any) => {
                const newLog = payload.new;
                if (newLog.caller_id === currentUser.id || newLog.callee_id === currentUser.id) {
                    fetchCalls();
                }
            })
            .subscribe();

        return () => {
            callService.removeListener(signalHandler);
            callService.cleanup('context-unmount');
            nativeCallBridge.cleanup();
            supabase.removeChannel(callSub);
        };
    }, [currentUser, fetchCalls]);


    // ── startCall: Outgoing call ─────────────────────────────────────────
    const startCall = useCallback(async (contactId: string, type: 'audio' | 'video') => {
        if (!currentUser) return;
        
        console.log(`[CallContext] 📱 Starting ${type} call to ${contactId}`);
        
        // 1. Call the service to send the signal
        const roomId = await callService.startCall(contactId, type);
        if (!roomId) {
            console.warn('[CallContext] Failed to start call — no roomId returned');
            return;
        }
        
        // 2. Set activeCall → triggers TrafficController in _layout.tsx → navigates to /call
        setActiveCall({
            callId: roomId,
            contactId,
            type,
            isMinimized: false,
            isMuted: false,
            isIncoming: false,
            isAccepted: false,
            isRinging: false,
            roomId,
        });
    }, [currentUser]);

    // ── acceptCall: Accept incoming call ──────────────────────────────────
    const acceptCall = useCallback(async () => {
        const signal = incomingSignalRef.current;
        if (!signal) {
            console.warn('[CallContext] acceptCall: no incoming signal stored');
            return;
        }
        
        console.log(`[CallContext] ✅ Accepting call from ${signal.callerId}`);
        
        // 1. IMMEDIATE STATE UPDATE for UI feel
        setActiveCall(prev => prev ? { 
            ...prev, 
            isAccepted: true, 
            isRinging: false 
        } : null);

        // 2. Accept via service (joins room + sends call-accept signal)
        // We catch here because the signal is already considered accepted logically
        callService.acceptCall(signal).catch(err => {
            console.error('[CallContext] callService.acceptCall error:', err);
        });
        
        incomingSignalRef.current = null;
    }, []);

    // ── endCall: End active call ─────────────────────────────────────────
    const endCall = useCallback(async () => {
        console.log('[CallContext] 📴 Ending call');
        
        // Clean up WebRTC
        if (webRTCService) {
            try { webRTCService.cleanup(); } catch (_) {}
        }
        
        // Send end signal + cleanup service state
        await callService.endCall();
        
        setActiveCall(null);
        incomingSignalRef.current = null;
    }, []);

    // ── toggleMute ───────────────────────────────────────────────────────
    const toggleMute = useCallback(() => {
        setActiveCall(prev => {
            if (!prev) return null;
            const newMuted = !prev.isMuted;
            
            // Toggle audio track in WebRTC
            if (webRTCService) {
                try { webRTCService.toggleMute(); } catch (_) {}
            }
            
            // Notify remote about mute state
            if (prev.roomId && prev.contactId) {
                callService.sendSignal({
                    type: 'audio-toggle',
                    callId: prev.callId || prev.roomId,
                    callerId: currentUser?.id || '',
                    calleeId: prev.contactId,
                    callType: prev.type,
                    payload: { muted: newMuted },
                    timestamp: new Date().toISOString(),
                    roomId: prev.roomId,
                }).catch(() => {});
            }
            
            return { ...prev, isMuted: newMuted };
        });
    }, [currentUser]);

    // ── toggleVideo ──────────────────────────────────────────────────────
    const toggleVideo = useCallback(() => {
        setActiveCall(prev => {
            if (!prev) return null;
            const newVideoOff = !prev.isVideoOff;
            
            // Toggle video track in WebRTC
            if (webRTCService) {
                try { webRTCService.toggleVideo(); } catch (_) {}
            }
            
            // Notify remote about video state
            if (prev.roomId && prev.contactId) {
                callService.sendSignal({
                    type: 'video-toggle',
                    callId: prev.callId || prev.roomId,
                    callerId: currentUser?.id || '',
                    calleeId: prev.contactId,
                    callType: prev.type,
                    payload: { videoOff: newVideoOff },
                    timestamp: new Date().toISOString(),
                    roomId: prev.roomId,
                }).catch(() => {});
            }
            
            return { ...prev, isVideoOff: newVideoOff };
        });
    }, [currentUser]);

    const deleteCall = useCallback(async (id: string) => {
        const { error } = await supabase.from('call_logs').delete().eq('id', id);
        if (!error) {
            setCalls(prev => prev.filter(c => c.id !== id));
        }
    }, []);

    const clearCalls = useCallback(async () => {
        if (!currentUser) return;
        const { error } = await supabase
            .from('call_logs')
            .delete()
            .or(`caller_id.eq.${currentUser.id},callee_id.eq.${currentUser.id}`);
        if (!error) {
            setCalls([]);
        }
    }, [currentUser]);

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
    };

    return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
};

export const useCall = () => {
    const context = useContext(CallContext);
    if (context === undefined) {
        throw new Error('useCall must be used within a CallProvider');
    }
    return context;
};
