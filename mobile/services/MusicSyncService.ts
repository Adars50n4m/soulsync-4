import { supabase } from '../config/supabase';
import { Song } from '../types';

export interface PlaybackState {
    currentSong: Song | null;
    isPlaying: boolean;
    position: number;
    updatedAt: number;
    updatedBy: string;
}

const CHANNEL_NAME = 'music_sync';

type PlaybackUpdateCallback = (state: PlaybackState) => void;

// Define proper Supabase Realtime channel type
type SupabaseChannel = ReturnType<typeof supabase.channel>;

class MusicSyncService {
    private channel: SupabaseChannel | null = null;
    private onUpdate: PlaybackUpdateCallback | null = null;
    private userId: string | null = null;
    private isInitialized: boolean = false;
    private connectionStatus: 'disconnected' | 'connecting' | 'connected' = 'disconnected';
    private reconnectTimeout: any = null;
    private reconnectAttempts: number = 0;

    initialize(userId: string, callback: PlaybackUpdateCallback): void {
        // Prevent multiple initializations
        if (this.isInitialized) {
            console.warn('MusicSyncService already initialized. Call cleanup() first.');
            return;
        }

        this.userId = userId;
        this.onUpdate = callback;
        this.connectionStatus = 'connecting';

        this.channel = supabase.channel(CHANNEL_NAME);

        this.channel
            .on('broadcast', { event: 'playback_update' }, (payload: { payload: PlaybackState }) => {
                // Only process updates from other users
                if (this.userId && payload.payload.updatedBy !== this.userId) {
                    console.log('Received remote update:', payload.payload);
                    this.onUpdate?.(payload.payload);
                }
            })
            .subscribe((status: string, err?: Error) => {
                if (err) {
                    console.error('Music Sync subscription error:', err);
                    this.connectionStatus = 'disconnected';
                    return;
                }

                console.log('Music Sync Status:', status);

                if (status === 'SUBSCRIBED') {
                    console.log('[MusicSync] Connected successfully');
                    this.connectionStatus = 'connected';
                    this.isInitialized = true;
                    this.reconnectAttempts = 0;
                } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                    console.warn(`[MusicSync] Connection problem (status: ${status}), attempting reconnect...`);
                    this.connectionStatus = 'disconnected';
                    this.handleReconnect();
                }
            });
    }

    private handleReconnect(): void {
        if (!this.userId) return;

        // Prevent multiple simultaneous reconnection attempts
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
        }

        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000); // Max 30s backoff
        this.reconnectAttempts++;

        console.log(`[MusicSync] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})...`);

        this.reconnectTimeout = setTimeout(() => {
            if (this.channel) {
                supabase.removeChannel(this.channel);
            }

            // Create new channel and reconnect
            this.channel = supabase.channel(CHANNEL_NAME);
            this.connectionStatus = 'connecting';

            this.channel
                .on('broadcast', { event: 'playback_update' }, (payload: { payload: PlaybackState }) => {
                    if (this.userId && payload.payload.updatedBy !== this.userId) {
                        console.log('[MusicSync] Received remote update:', payload.payload);
                        this.onUpdate?.(payload.payload);
                    }
                })
                .subscribe((status: string, err?: Error) => {
                    if (err) {
                        console.error('[MusicSync] Reconnection error:', err);
                        this.connectionStatus = 'disconnected';
                        this.handleReconnect();
                        return;
                    }

                    console.log('[MusicSync] Status:', status);

                    if (status === 'SUBSCRIBED') {
                        console.log('[MusicSync] Reconnected successfully');
                        this.connectionStatus = 'connected';
                        this.reconnectAttempts = 0;
                    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                        this.connectionStatus = 'disconnected';
                        this.handleReconnect();
                    }
                });
        }, delay);
    }

    broadcastUpdate(state: Partial<PlaybackState>): void {
        if (!this.userId || !this.channel || this.connectionStatus !== 'connected') {
            console.warn('Cannot broadcast: service not initialized or not connected');
            return;
        }

        const fullState: PlaybackState = {
            currentSong: null,
            isPlaying: false,
            position: 0,
            updatedAt: Date.now(),
            updatedBy: this.userId,
            ...state
        };

        this.channel.send({
            type: 'broadcast',
            event: 'playback_update',
            payload: fullState,
        }).catch((err: Error) => {
            console.error('Broadcast failed:', err);
            // Attempt reconnection if send fails
            if (this.connectionStatus !== 'connected') {
                this.handleReconnect();
            }
        });
    }

    getConnectionStatus(): 'disconnected' | 'connecting' | 'connected' {
        return this.connectionStatus;
    }

    cleanup(): void {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }

        if (this.channel) {
            supabase.removeChannel(this.channel);
            this.channel = null;
        }

        // Reset all state
        this.onUpdate = null;
        this.userId = null;
        this.isInitialized = false;
        this.reconnectAttempts = 0;
        this.connectionStatus = 'disconnected';

        console.log('[MusicSync] Service cleaned up');
    }
}

export const musicSyncService = new MusicSyncService();
