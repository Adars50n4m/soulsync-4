import { supabase } from '../config/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';

export interface CallSignal {
    type: 'offer' | 'answer' | 'ice-candidate' | 'call-request' | 'call-accept' | 'call-reject' | 'call-end' | 'call-ringing';
    callId: string;
    callerId: string;
    calleeId: string;
    callType: 'audio' | 'video';
    payload?: any;
    timestamp: string;
    roomId?: string;
}

type CallSignalHandler = (signal: CallSignal) => void;

class CallService {
    private signalsChannel: RealtimeChannel | null = null;
    private roomChannel: RealtimeChannel | null = null;
    private userId: string | null = null;
    private listeners: Set<CallSignalHandler> = new Set();
    private statusListeners: Set<(connected: boolean) => void> = new Set();
    private currentRoomId: string | null = null;
    private currentPartnerId: string | null = null;
    private currentCallType: 'audio' | 'video' = 'audio';

    addStatusListener(handler: (connected: boolean) => void): void {
        this.statusListeners.add(handler);
        handler(this.signalsChannel ? true : false);
    }

    removeStatusListener(handler: (connected: boolean) => void): void {
        this.statusListeners.delete(handler);
    }

    private notifyStatus(connected: boolean) {
        this.statusListeners.forEach(listener => listener(connected));
    }

    initialize(userId: string): void {
        if (this.userId === userId && this.signalsChannel) return;

        this.userId = userId;
        console.log(`[CallService] Initializing Supabase Signals for ${userId}`);

        if (this.signalsChannel) {
            this.signalsChannel.unsubscribe();
        }

        // Subscribing to personal signals channel
        this.signalsChannel = supabase.channel(`signals:${userId}`, {
            config: {
                broadcast: { self: false },
            },
        });

        this.signalsChannel
            .on('broadcast', { event: 'signal' }, ({ payload }) => {
                console.log('[CallService] Received personal signal:', payload);
                this.handleIncomingSignal(payload as CallSignal);
            })
            .subscribe((status) => {
                console.log(`[CallService] Signals channel status: ${status}`);
                this.notifyStatus(status === 'SUBSCRIBED');
            });
    }

    private handleIncomingSignal(signal: CallSignal) {
        // If it's a call request and we are already in a call, check if it's the SAME call
        if (signal.type === 'call-request' && this.currentRoomId) {
            if (this.currentRoomId === signal.roomId) {
                console.log('[CallService] Received duplicate call request for current room, ignoring');
                return;
            }
            console.log('[CallService] Busy with', this.currentRoomId, '- auto-rejecting call request for', signal.roomId);
            this.rejectCall(signal);
            return;
        }

        this.notifyListeners(signal);
    }

    private setupRoomListeners(channel: RealtimeChannel, roomId: string): void {
        channel
            .on('broadcast', { event: 'signal' }, ({ payload }) => {
                const signal = payload as CallSignal;
                console.log(`[CallService] Received room signal [${signal.type}]`);
                this.notifyListeners(signal);

                if (signal.type === 'call-end' || signal.type === 'call-reject') {
                    this.cleanup();
                }
            })
            .subscribe();
    }

    async initiateCall(partnerId: string, callType: 'audio' | 'video'): Promise<string | null> {
        if (!this.userId) return null;

        const participants = [this.userId, partnerId].sort();
        const roomId = `call:${participants.join('-')}`;

        this.currentRoomId = roomId;
        this.currentPartnerId = partnerId;
        this.currentCallType = callType;

        console.log(`[CallService] Initiating call to ${partnerId} in room ${roomId}`);

        // 1. Join the room channel for WebRTC signaling
        this.joinRoom(roomId);

        // 2. Send call request to partner's personal channel
        const signal: CallSignal = {
            type: 'call-request',
            callId: roomId,
            callerId: this.userId,
            calleeId: partnerId,
            callType,
            roomId,
            timestamp: new Date().toISOString()
        };

        const targetChannel = supabase.channel(`signals:${partnerId}`);
        await targetChannel.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                console.log('[CallService] Broadcasting request to partner');
                await targetChannel.send({
                    type: 'broadcast',
                    event: 'signal',
                    payload: signal
                });
                targetChannel.unsubscribe();
            }
        });

        return roomId;
    }

    private joinRoom(roomId: string) {
        if (this.roomChannel) {
            this.roomChannel.unsubscribe();
        }

        this.roomChannel = supabase.channel(roomId, {
            config: {
                broadcast: { self: false },
            },
        });

        this.setupRoomListeners(this.roomChannel, roomId);
    }

    async acceptCall(signal: CallSignal): Promise<void> {
        if (!this.userId || !signal.roomId) return;

        console.log(`[CallService] Accepting call from ${signal.callerId}`);
        this.currentRoomId = signal.roomId;
        this.currentPartnerId = signal.callerId;
        this.currentCallType = signal.callType;

        this.joinRoom(signal.roomId);

        // Notify caller that we accepted
        await this.sendSignal({
            type: 'call-accept',
            callId: signal.roomId,
            callerId: signal.callerId,
            calleeId: this.userId,
            callType: signal.callType,
            roomId: signal.roomId,
            timestamp: new Date().toISOString()
        });
    }

    async rejectCall(signal: CallSignal): Promise<void> {
        if (!this.userId || !signal.roomId) return;

        console.log(`[CallService] Rejecting call from ${signal.callerId}`);

        // Send rejection to partner's channel directly if we haven't joined the room yet
        const targetChannel = supabase.channel(`signals:${signal.callerId}`);
        await targetChannel.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await targetChannel.send({
                    type: 'broadcast',
                    event: 'signal',
                    payload: { ...signal, type: 'call-reject' }
                });
                targetChannel.unsubscribe();
            }
        });

        this.cleanup();
    }

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
        this.cleanup();
    }

    public async notifyRinging(roomId: string, callerId: string, callType: 'audio' | 'video'): Promise<void> {
        if (!this.userId) return;
        console.log(`[CallService] Notifying ringing for room ${roomId} to caller ${callerId}`);
        
        // Ensure we are in the room to send signals
        if (!this.roomChannel || this.currentRoomId !== roomId) {
            this.joinRoom(roomId);
        }

        await this.sendSignal({
            type: 'call-ringing',
            callId: roomId,
            callerId,
            calleeId: this.userId,
            callType,
            timestamp: new Date().toISOString(),
            roomId
        });
    }

    private async sendSignal(signal: CallSignal) {
        if (this.roomChannel) {
            await this.roomChannel.send({
                type: 'broadcast',
                event: 'signal',
                payload: signal
            });
        }
    }

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
                callType: 'audio',
                payload: candidate.toJSON ? candidate.toJSON() : candidate,
                timestamp: new Date().toISOString(),
                roomId: this.currentRoomId
            });
        }
    }

    private notifyListeners(signal: CallSignal) {
        this.listeners.forEach(listener => listener(signal));
    }

    addListener(handler: CallSignalHandler): void {
        this.listeners.add(handler);
    }

    removeListener(handler: CallSignalHandler): void {
        this.listeners.delete(handler);
    }

    cleanup(): void {
        console.log('[CallService] Cleaning up call state');
        if (this.roomChannel) {
            this.roomChannel.unsubscribe();
            this.roomChannel = null;
        }
        this.currentRoomId = null;
        this.currentPartnerId = null;
        this.currentCallType = 'audio';
    }
}

export const callService = new CallService();
