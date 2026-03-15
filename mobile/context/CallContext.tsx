import * as React from 'react';
import { useState, useEffect, createContext, useContext, useCallback, useRef } from 'react';
import { supabase } from '../config/supabase';
import { callService } from '../services/CallService';
import { webRTCService } from '../services/WebRTCService';
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
                contactName: 'Unknown', // Will be populated by UI from contacts
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

        // Wrap initialization in try-catch to prevent app crash
        try {
            callService.initialize(currentUser.id);
        } catch (e) {
            console.warn('[CallContext] callService.initialize failed:', e);
        }

        // Initialize NativeCallBridge with timeout to prevent hanging
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
            },
            onCallConnected: (callId) => {
                console.log('[CallContext] Native call connected:', callId);
            },
            onCallEnded: (callId) => {
                console.log('[CallContext] Native call ended:', callId);
                setActiveCall(null);
            },
            onMuteToggled: (muted) => {
                console.log('[CallContext] Mute toggled from native:', muted);
            }
        }).then(() => {
            clearTimeout(initTimeout);
        }).catch(err => {
            clearTimeout(initTimeout);
            console.warn('[CallContext] Failed to initialize NativeCallBridge:', err);
        });

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
            callService.cleanup();
            nativeCallBridge.cleanup();
            supabase.removeChannel(callSub);
        };
    }, [currentUser, fetchCalls]);


    const startCall = useCallback(async (contactId: string, type: 'audio' | 'video') => {
        await callService.startCall(contactId, type);
    }, []);

    const endCall = useCallback(async () => {
        await callService.endCall();
        setActiveCall(null);
    }, []);

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
        acceptCall: async () => {}, // TODO
        endCall,
        toggleMinimizeCall: (val: boolean) => setActiveCall(prev => prev ? { ...prev, isMinimized: val } : null),
        toggleMute: () => {}, // TODO
        toggleVideo: () => {}, // TODO
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
