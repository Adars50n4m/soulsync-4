import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Env from './env';



// Use DIRECT Supabase URL as base — Realtime WebSocket REQUIRES direct connection.
// Cloudflare Workers CANNOT proxy WebSocket upgrade requests.
// HTTP REST calls are routed through the proxy via custom fetch to bypass ISP blocks.
let useProxy = true;

// Pre-check proxy health once on load
(async () => {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(`${Env.SUPABASE_PROXY_URL}/__health`, { signal: controller.signal });
        clearTimeout(timeout);
        if (!res.ok && res.status >= 500) useProxy = false;
        console.log(`[Supabase] Proxy health check: ${useProxy ? 'OK' : 'FAILED - Using direct'}`);
    } catch {
        useProxy = false;
        console.log('[Supabase] Proxy unreachable - Falling back to direct connection');
    }
})();

export const supabase = createClient(Env.SUPABASE_URL, Env.SUPABASE_ANON_KEY, {
    auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
    },
    global: {
        fetch: async (url: RequestInfo | URL, options?: RequestInit) => {
            const urlString = typeof url === 'string' ? url : url.toString();
            
            // Bypass proxy for and other domains
            if (!urlString.includes(Env.SUPABASE_URL)) return fetch(url, options);

            if (useProxy) {
                try {
                    const proxied = urlString.replace(Env.SUPABASE_URL, Env.SUPABASE_PROXY_URL);
                    const response = await fetch(proxied, options);

                    // 1. Check for specific proxy/edge errors (530, 525, 521)
                    if (response.status === 530 || response.status === 525 || response.status === 521) {
                        console.warn('[Supabase] Proxy edge error. Disabling for session.');
                        useProxy = false;
                        return fetch(url, options);
                    }

                    // 2. Check for 404 - If the proxy returns 404 HTML, it's likely a misconfiguration or broken route
                    // Note: Supabase REST can return 401/403/404 for missing records, but those usually have a 'content-type: application/json'.
                    const contentType = response.headers.get('content-type') || '';
                    if (response.status === 404 && contentType.includes('text/html')) {
                        console.warn('[Supabase] Proxy returned 404 HTML. Falling back to direct connection.');
                        // We don't disable useProxy forever here as it might be a transient routing issue, 
                        // but we definitely want this request to succeed.
                        return fetch(url, options);
                    }

                    return response;
                } catch (e) {
                    console.warn('[Supabase] Proxy fetch error, falling back to direct:', e);
                    useProxy = false;
                    return fetch(url, options);
                }
            }
            
            return fetch(url, options);
        },
    },
    realtime: {
        params: {
            eventsPerSecond: 10,
        },
    },
});

/**
 * Get the Realtime WebSocket URL for connectivity testing.
 * Always uses the direct Supabase URL since the proxy can't handle WebSocket.
 */
export const getRealtimeUrl = (): string => {
    return Env.SUPABASE_URL.replace('https://', 'wss://') + '/realtime/v1';
};

/**
 * Check if Supabase Realtime is reachable
 */
export const checkRealtimeConnectivity = async (): Promise<{ ok: boolean; error?: string }> => {
    const realtimeUrl = getRealtimeUrl();
    console.log(`[Supabase] Testing realtime connectivity: ${realtimeUrl}`);
    
    return new Promise((resolve) => {
        try {
            const ws = new WebSocket(realtimeUrl);
            const timeout = setTimeout(() => {
                ws.close();
                console.warn('[Supabase] Realtime connectivity check timed out');
                resolve({ ok: false, error: 'Connection timed out' });
            }, 10000);

            ws.onopen = () => {
                clearTimeout(timeout);
                ws.close();
                console.log(`[Supabase] ✅ Realtime endpoint (${realtimeUrl}) is reachable`);
                resolve({ ok: true });
            };

            ws.onerror = (e: any) => {
                clearTimeout(timeout);
                try { ws.close(); } catch (err) {}
                console.warn(`[Supabase] ❌ Realtime endpoint (${realtimeUrl}) unreachable:`, {
                    message: e?.message,
                    type: e?.type,
                    url: realtimeUrl
                });
                resolve({ ok: false, error: `WebSocket connection failed: ${e?.message || 'unknown error'}` });
            };
        } catch (e) {
            console.warn('[Supabase] ❌ WebSocket initialization failed:', e);
            resolve({ ok: false, error: 'WebSocket initialization failed' });
        }
    });
};

// Database types
export interface User {
    id: string;
    name: string;
    avatar?: string;
    status: 'online' | 'offline';
    last_seen?: string;
    created_at: string;
}

export interface Message {
    id: string;
    sender_id: string;
    receiver_id: string;
    text: string;
    media?: {
        type: 'image' | 'video' | 'audio';
        url: string;
        name?: string;
        thumbnail?: string;
    };
    timestamp: string;
    status: 'sent' | 'delivered' | 'read';
    reactions?: string[];
    reply_to?: string;
}

export interface FavoriteSong {
    id: string;
    user_id: string;
    song_id: string;
    song_name: string;
    song_artist: string;
    song_image: string;
    song_url: string;
    created_at: string;
}

// Database helpers
export const DatabaseService = {
    // Users
    async getUsers() {
        const { data, error } = await supabase.from('users').select('*');
        if (error) throw error;
        return data as User[];
    },

    async updateUserStatus(userId: string, status: 'online' | 'offline') {
        const { error } = await supabase
            .from('users')
            .update({ status, last_seen: new Date().toISOString() })
            .eq('id', userId);
        if (error) throw error;
    },

    // Messages
    async getMessages(userId1: string, userId2: string) {
        const { data, error } = await supabase
            .from('messages')
            .select('*')
            .or(`and(sender.eq.${userId1},receiver.eq.${userId2}),and(sender.eq.${userId2},receiver.eq.${userId1})`)
            .order('timestamp', { ascending: true });
        if (error) throw error;
        return data as Message[];
    },

    async sendMessage(message: Omit<Message, 'id' | 'timestamp'>) {
        const { data, error } = await supabase
            .from('messages')
            .insert([{ ...message, timestamp: new Date().toISOString() }])
            .select()
            .single();
        if (error) throw error;
        return data as Message;
    },

    // Favorites
    async getFavorites(userId: string) {
        const { data, error } = await supabase
            .from('favorite_songs')
            .select('*')
            .eq('user_id', userId);
        if (error) throw error;
        return data as FavoriteSong[];
    },

    async addFavorite(favorite: Omit<FavoriteSong, 'id' | 'created_at'>) {
        const { data, error } = await supabase
            .from('favorite_songs')
            .insert([{ ...favorite, created_at: new Date().toISOString() }])
            .select()
            .single();
        if (error) throw error;
        return data as FavoriteSong;
    },

    async removeFavorite(userId: string, songId: string) {
        const { error } = await supabase
            .from('favorite_songs')
            .delete()
            .eq('user_id', userId)
            .eq('song_id', songId);
        if (error) throw error;
    },

    // Real-time subscriptions
    subscribeToMessages(userId: string, callback: (message: Message) => void) {
        return supabase
            .channel('messages')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'messages',
            }, (payload) => callback(payload.new as Message))
            .subscribe();
    }
};
