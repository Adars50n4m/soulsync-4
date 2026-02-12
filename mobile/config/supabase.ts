import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './api';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
                filter: `receiver=eq.${userId}`
            }, (payload) => callback(payload.new as Message))
            .subscribe();
    }
};
