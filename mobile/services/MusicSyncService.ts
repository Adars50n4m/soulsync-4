import { chatService } from './ChatService';
import { Song } from '../types';

export interface PlaybackState {
    currentSong: Song | null;
    isPlaying: boolean;
    position: number;
    updatedAt: number;
    updatedBy: string;
}

type PlaybackUpdateCallback = (state: PlaybackState) => void;

class MusicSyncService {
    private onUpdate: PlaybackUpdateCallback | null = null;
    private userId: string | null = null;
    private partnerId: string | null = null;
    private isInitialized: boolean = false;
    private socketCheckInterval: any = null;

    initialize(userId: string, callback: PlaybackUpdateCallback, partnerId?: string): void {
        this.userId = userId;
        this.onUpdate = callback;
        this.partnerId = partnerId || null;
        this.isInitialized = true;

        this.attachSocketListener();
    }

    private attachSocketListener(): void {
        const socket = chatService.getSocket();
        
        if (!socket) {
            console.log('[MusicSync] Chat socket not ready, waiting...');
            if (this.socketCheckInterval) clearInterval(this.socketCheckInterval);
            this.socketCheckInterval = setInterval(() => {
                if (chatService.getSocket()) {
                    clearInterval(this.socketCheckInterval);
                    this.socketCheckInterval = null;
                    this.attachSocketListener();
                }
            }, 2000);
            return;
        }

        console.log('[MusicSync] Socket found, attaching listener');
        socket.off('music:playback_update'); // Clear old
        socket.on('music:playback_update', (payload: any) => {
            // Only sync if the update is from our partner and meant for us
            // Or if in "Global Playback" mode (where everyone syncs)
            // For SoulSync, we usually sync with the partner we're chatting with
            if (this.userId && payload.updatedBy !== this.userId) {
                // If partnerId is set, only accept from them
                if (this.partnerId && payload.updatedBy !== this.partnerId) {
                    return;
                }
                
                console.log('[MusicSync] Received remote update:', payload.currentSong?.title);
                this.onUpdate?.(payload);
            }
        });
    }

    broadcastUpdate(state: Partial<PlaybackState>): void {
        if (!this.userId) return;

        const fullState = {
            currentSong: null,
            isPlaying: false,
            position: 0,
            updatedAt: Date.now(),
            updatedBy: this.userId,
            recipientId: this.partnerId, // Send intent
            ...state
        };

        const socket = chatService.getSocket();
        if (socket && socket.connected) {
            socket.emit('music:playback_update', fullState);
        }
    }

    getConnectionStatus(): 'disconnected' | 'connecting' | 'connected' {
        return chatService.isSocketConnected() ? 'connected' : 'disconnected';
    }

    cleanup(): void {
        if (this.socketCheckInterval) clearInterval(this.socketCheckInterval);
        const socket = chatService.getSocket();
        if (socket) {
            socket.off('music:playback_update');
        }
        this.onUpdate = null;
        this.userId = null;
        this.partnerId = null;
        this.isInitialized = false;
    }
}

export const musicSyncService = new MusicSyncService();
