import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import { Message, Contact, StatusUpdate, CallLog, ActiveCall, Song, MusicState } from '../types';
import { musicSyncService, PlaybackState } from '../services/MusicSyncService';
import { chatService, ChatMessage } from '../services/ChatService';
import { callService, CallSignal } from '../services/CallService';
import { webRTCService } from '../services/WebRTCService';
import { supabase } from '../config/supabase';

import { socket } from '../src/webrtc/socket';

export type ThemeName = 'midnight' | 'liquid-blue' | 'sunset' | 'emerald' | 'cyber' | 'amethyst';

interface ThemeConfig {
    primary: string;
    accent: string;
    bg: string;
}

export const THEMES: Record<ThemeName, ThemeConfig> = {
    'midnight': { primary: '#f43f5e', accent: '#a855f7', bg: '#09090b' },
    'liquid-blue': { primary: '#135bec', accent: '#00f2ff', bg: '#020408' },
    'sunset': { primary: '#f43f5e', accent: '#fb923c', bg: '#120202' },
    'emerald': { primary: '#10b981', accent: '#2dd4bf', bg: '#02120e' },
    'cyber': { primary: '#d4ff00', accent: '#00e5ff', bg: '#050505' },
    'amethyst': { primary: '#d946ef', accent: '#6366f1', bg: '#0a050f' },
};

// User Types
interface User {
    id: string;
    name: string;
    avatar: string;
    bio: string;
}

// Fixed Users - Shri and Hari
const USERS: Record<string, User> = {
    'shri': {
        id: 'shri',
        name: 'SHRI',
        avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=400&h=400&fit=crop',
        bio: '✨ Connected through the stars',
    },
    'hari': {
        id: 'hari',
        name: 'HARI',
        avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=400&h=400&fit=crop',
        bio: '💫 Forever in sync',
    },
};

// Credentials
const CREDENTIALS: Record<string, string> = {
    'shri': 'hari',  // Shri's password is Hari
    'hari': 'shri',  // Hari's password is Shri
};

interface AppContextType {
    // Auth
    currentUser: User | null;
    otherUser: User | null;
    isLoggedIn: boolean;
    isReady: boolean;
    login: (username: string, password: string) => Promise<boolean>;
    logout: () => Promise<void>;

    // Data
    contacts: Contact[];
    messages: Record<string, Message[]>;
    calls: CallLog[];
    statuses: StatusUpdate[];
    theme: ThemeName;
    activeTheme: ThemeConfig;
    activeCall: ActiveCall | null;
    musicState: MusicState;
    onlineUsers: string[];

    // Actions
    addMessage: (chatId: string, text: string, sender: 'me' | 'them', media?: Message['media']) => string;
    updateMessage: (chatId: string, messageId: string, text: string) => void;
    updateMessageStatus: (chatId: string, messageId: string, status: 'sent' | 'delivered' | 'read') => void;
    deleteMessage: (chatId: string, messageId: string) => void;
    addReaction: (chatId: string, messageId: string, emoji: string) => void;
    addCall: (call: Omit<CallLog, 'id'>) => void;
    addStatus: (status: Omit<StatusUpdate, 'id'>) => void;
    deleteStatus: (id: string) => void;
    setTheme: (theme: ThemeName) => void;
    startCall: (contactId: string, type: 'audio' | 'video') => void;
    acceptCall: () => Promise<void>;
    endCall: () => void;
    toggleMinimizeCall: (val: boolean) => void;
    toggleMute: () => void;
    playSong: (song: Song) => void;
    togglePlayMusic: () => void;
    toggleFavoriteSong: (song: Song) => void;
    seekTo: (position: number) => void;
    getPlaybackPosition: () => Promise<number>;
    sendChatMessage: (chatId: string, text: string, media?: Message['media']) => void;
    updateProfile: (updates: { name?: string; bio?: string; avatar?: string }) => void;
    addStatusView: (statusId: string) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    // Auth State
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [otherUser, setOtherUser] = useState<User | null>(null);

    // App State
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [messages, setMessages] = useState<Record<string, Message[]>>({});
    const [calls, setCalls] = useState<CallLog[]>([]);
    const [statuses, setStatuses] = useState<StatusUpdate[]>([]);
    const [theme, setThemeState] = useState<ThemeName>('midnight');
    const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
    const [isReady, setIsReady] = useState(false);
    const [onlineUsers, setOnlineUsers] = useState<string[]>([]);

    const [musicState, setMusicState] = useState<MusicState>({
        currentSong: null,
        isPlaying: false,
        favorites: []
    });

    const [sound, setSound] = useState<Audio.Sound | null>(null);
    const soundRef = useRef<Audio.Sound | null>(null);
    const musicStateRef = useRef(musicState);

    useEffect(() => { soundRef.current = sound; }, [sound]);
    useEffect(() => { musicStateRef.current = musicState; }, [musicState]);

    // Configure Audio mode for proper playback
    useEffect(() => {
        const configureAudio = async () => {
            try {
                await Audio.setAudioModeAsync({
                    allowsRecordingIOS: false,
                    playsInSilentModeIOS: true, // Enable audio in silent mode on iOS
                    staysActiveInBackground: true, // Keep audio playing in background
                    shouldDuckAndroid: true, // Lower volume of other apps
                    playThroughEarpieceAndroid: false, // Use speaker by default
                });
                console.log('Audio mode configured successfully');
            } catch (e) {
                console.error('Failed to configure audio mode:', e);
            }
        };
        configureAudio();
    }, []);

    // --- Real-Time Presence Logic ---
    useEffect(() => {
        if (!currentUser) return;

        // Tell server I am online
        socket?.emit('user-online', currentUser.id);

        // Listen for other users coming online
        socket?.on('user-connected', (userId: string) => {
            setOnlineUsers((prev) => [...prev, userId]);
            setContacts(prev => prev.map(c => 
                c.id === userId ? { ...c, status: 'online' } : c
            ));
        });

        // Listen for users going offline
        socket?.on('user-disconnected', (userId: string) => {
            setOnlineUsers((prev) => prev.filter(id => id !== userId));
            setContacts(prev => prev.map(c => 
                c.id === userId ? { ...c, status: 'offline' } : c
            ));
        });

        // Receive full list of currently online users
        socket?.on('online-users-list', (users: string[]) => {
            setOnlineUsers(users);
            // Update local contacts based on this list
            setContacts(prev => prev.map(c => ({
                ...c,
                status: users.includes(c.id) ? 'online' : 'offline'
            })));
        });

        return () => {
            socket?.off('user-connected');
            socket?.off('user-disconnected');
            socket?.off('online-users-list');
        };
    }, [currentUser]);

    // Initialize Music Sync
    useEffect(() => {
        if (currentUser) {
            musicSyncService.initialize(currentUser.id, async (remoteState) => {
                const currentSound = soundRef.current;
                const currentMusicState = musicStateRef.current;

                // Handle remote update
                if (remoteState.currentSong?.id !== currentMusicState.currentSong?.id) {
                    // Change song
                    if (remoteState.currentSong) {
                        await playSong(remoteState.currentSong, false); // false = don't broadcast
                    }
                }

                // Sync play/pause
                if (remoteState.isPlaying !== currentMusicState.isPlaying) {
                    if (remoteState.isPlaying) {
                        await soundRef.current?.playAsync();
                    } else {
                        await soundRef.current?.pauseAsync();
                    }
                    setMusicState(prev => ({ ...prev, isPlaying: remoteState.isPlaying }));
                }

                // Sync position if difference is significant (> 2 seconds)
                if (soundRef.current && remoteState.isPlaying) {
                    const status = await soundRef.current.getStatusAsync();
                    if (status.isLoaded) {
                        const currentPos = status.positionMillis;
                        // remoteState.position is usually in ms from our service, but check if your service sends seconds
                        // Assuming ms for consistency with seekTo
                        if (Math.abs(currentPos - remoteState.position) > 2000) {
                            await soundRef.current.setPositionAsync(remoteState.position);
                        }
                    }
                }
            });
        }
        return () => musicSyncService.cleanup();
    }, [currentUser]); // Removed sound dependency to prevent re-init loops

    // Load session on mount
    useEffect(() => {
        const loadSession = async () => {
            try {
                const userId = await AsyncStorage.getItem('ss_current_user');
                console.log('[AppContext] Loading session for user:', userId);
                
                if (userId) {
                    // 1. Load cached profile
                    const storedProfileStr = await AsyncStorage.getItem(`@profile_${userId}`);
                    let userObj = USERS[userId];
                    if (storedProfileStr) {
                        try {
                            userObj = JSON.parse(storedProfileStr);
                        } catch (e) {
                            console.warn('[AppContext] Failed to parse stored profile', e);
                        }
                    }
                    
                    const otherId = userId === 'shri' ? 'hari' : 'shri';
                    const other = USERS[otherId];
                    
                    // Set basic state immediately for UI responsiveness
                    setCurrentUser(userObj);
                    setOtherUser(other);
                    
                    setContacts([{
                        id: other.id,
                        name: other.name,
                        avatar: other.avatar,
                        status: 'online',
                        bio: other.bio,
                        lastMessage: '',
                        unreadCount: 0,
                    }]);

                    // Initial fetches
                    await Promise.all([
                        fetchProfileFromSupabase(userId),
                        fetchMessagesFromSupabase(userId, other.id),
                        fetchCallsFromSupabase(userId),
                        fetchOtherUserProfile(other.id),
                        fetchStatusesFromSupabase()
                    ]);
                }

                const [storedTheme, storedFavorites] = await Promise.all([
                    AsyncStorage.getItem('ss_theme'),
                    AsyncStorage.getItem(userId ? `ss_favorites_${userId}` : 'ss_favorites_none'),
                ]);

                if (storedTheme) setThemeState(storedTheme as ThemeName);
                if (storedFavorites) {
                    try {
                        setMusicState(prev => ({ ...prev, favorites: JSON.parse(storedFavorites) }));
                    } catch (e) {
                        console.warn('[AppContext] Failed to parse favorites', e);
                    }
                }
                
                console.log('[AppContext] Session load complete');
            } catch (e) {
                console.warn('[AppContext] Failed to load session', e);
            } finally {
                // Important: Ensure isReady is true even if user is not logged in
                setIsReady(true);
            }
        };
        loadSession();
    }, []);

    // Save data
    useEffect(() => { AsyncStorage.setItem('ss_messages', JSON.stringify(messages)); }, [messages]);
    // useEffect(() => { AsyncStorage.setItem('ss_calls', JSON.stringify(calls)); }, [calls]); // Deprecated in favor of DB
    useEffect(() => { AsyncStorage.setItem('ss_theme', theme); }, [theme]);
    useEffect(() => {
        if (currentUser) {
            AsyncStorage.setItem(`ss_favorites_${currentUser.id}`, JSON.stringify(musicState.favorites));
        }
    }, [musicState.favorites, currentUser]);

    // Audio cleanup
    useEffect(() => {
        return sound ? () => { sound.unloadAsync(); } : undefined;
    }, [sound]);

    // Initialize Chat Service for real-time messaging
    useEffect(() => {
        if (currentUser && otherUser) {
            chatService.initialize(
                currentUser.id,
                otherUser.id,
                // On new message from partner
                (incomingMessage: ChatMessage) => {
                    const newMsg: Message = {
                        id: incomingMessage.id,
                        sender: 'them',
                        text: incomingMessage.text,
                        timestamp: new Date(incomingMessage.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        status: 'delivered',
                        media: incomingMessage.media,
                    };
                    setMessages(prev => ({
                        ...prev,
                        [otherUser.id]: [...(prev[otherUser.id] || []), newMsg]
                    }));
                    // Update contact with new message
                    setContacts(prevContacts => prevContacts.map(c =>
                        c.id === otherUser.id ? {
                            ...c,
                            lastMessage: incomingMessage.media ? '📎 Attachment' : incomingMessage.text,
                            unreadCount: (c.unreadCount || 0) + 1
                        } : c
                    ));
                },
                // On message status update
                (messageId: string, status: 'delivered' | 'read') => {
                    if (otherUser) {
                        setMessages(prev => {
                            const chatMessages = prev[otherUser.id] || [];
                            return {
                                ...prev,
                                [otherUser.id]: chatMessages.map(msg =>
                                    msg.id === messageId ? { ...msg, status } : msg
                                )
                            };
                        });
                    }
                }
            );
        }
        return () => chatService.cleanup();
    }, [currentUser, otherUser]);

    // Fetch Statuses from Supabase
    const fetchStatusesFromSupabase = async () => {
        try {
            const { data, error } = await supabase
                .from('statuses')
                .select('*')
                .gt('expires_at', new Date().toISOString()) // Only active statuses
                .order('created_at', { ascending: false });

            if (data && !error) {
                // Map DB columns to App types
                setStatuses(data.map(mapStatusFromDB));
            }
        } catch (e) { console.error('Fetch statuses error:', e); }
    };

    // Real-time Subscriptions (Profiles & Calls)
    useEffect(() => {
        if (!currentUser) return;

        // Subscribe to Profile Changes
        const profileSub = supabase
            .channel('public:profiles')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, (payload) => {
                const newData = payload.new as any;
                // Update self
                if (newData.id === currentUser.id) {
                    const updated = { ...currentUser, name: newData.name, bio: newData.bio, avatar: newData.avatar_url };
                    setCurrentUser(updated);
                    AsyncStorage.setItem(`@profile_${currentUser.id}`, JSON.stringify(updated));
                }
                // Update partner
                if (otherUser && newData.id === otherUser.id) {
                    const updatedOther = { ...otherUser, name: newData.name, bio: newData.bio, avatar: newData.avatar_url };
                    setOtherUser(updatedOther);
                    setContacts(prev => prev.map(c => c.id === newData.id ? { ...c, name: newData.name, bio: newData.bio, avatar: newData.avatar_url } : c));
                }
            })
            .subscribe();

        // Subscribe to Call Logs
        const callSub = supabase
            .channel('public:call_logs')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'call_logs' }, (payload) => {
                const newLog = payload.new as any;
                if (newLog.caller_id === currentUser.id || newLog.callee_id === currentUser.id) {
                    const isOutgoing = newLog.caller_id === currentUser.id;
                    const partnerId = isOutgoing ? newLog.callee_id : newLog.caller_id;
                    // Resolve partner info
                    const partner = partnerId === otherUser?.id ? otherUser : null;
                    
	                    const callItem: CallLog = {
	                        id: newLog.id.toString(),
	                        contactId: partnerId,
	                        contactName: partner?.name || 'Unknown',
	                        avatar: partner?.avatar || '',
	                        type: isOutgoing ? 'outgoing' : 'incoming',
                            status: newLog.status || 'completed',
                            duration: newLog.duration,
	                        callType: newLog.call_type,
	                        time: new Date(newLog.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
	                    };
                    
                    setCalls(prev => [callItem, ...prev]);
                }
            })
            .subscribe();

        // Subscribe to Status Changes
        const statusSub = supabase
            .channel('public:statuses')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'statuses' }, (payload) => {
                if (payload.eventType === 'INSERT') {
                    const newStatus = payload.new;
                    // Only add if not expired
                    if (new Date(newStatus.expires_at) > new Date()) {
                        setStatuses(prev => [mapStatusFromDB(newStatus), ...prev]);
                    }
                } else if (payload.eventType === 'DELETE') {
                    setStatuses(prev => prev.filter(s => s.id !== payload.old.id.toString()));
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(profileSub);
            supabase.removeChannel(callSub);
            supabase.removeChannel(statusSub);
        };
    }, [currentUser?.id, otherUser]);

    // Send message via ChatService (real-time)
    const sendChatMessage = useCallback(async (chatId: string, text: string, media?: Message['media']) => {
        const sentMessage = await chatService.sendMessage(text, media);
        if (sentMessage) {
            // Add to local messages immediately
            const newMsg: Message = {
                id: sentMessage.id,
                sender: 'me',
                text: sentMessage.text,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                status: 'sent',
                media: sentMessage.media ? { type: sentMessage.media.type, url: sentMessage.media.url } : undefined,
            };
            setMessages(prev => ({
                ...prev,
                [chatId]: [...(prev[chatId] || []), newMsg]
            }));
            // Update contact
            setContacts(prevContacts => prevContacts.map(c =>
                c.id === chatId ? {
                    ...c,
                    lastMessage: media ? '📎 Attachment' : text,
                    unreadCount: 0
                } : c
            ));
        }
    }, [messages]);

    // Auth Functions
    const login = async (username: string, password: string): Promise<boolean> => {
        const normalizedUser = username.toLowerCase();
        const normalizedPass = password.toLowerCase();

        if (CREDENTIALS[normalizedUser] === normalizedPass) {
            const user = USERS[normalizedUser];
            const other = normalizedUser === 'shri' ? USERS['hari'] : USERS['shri'];

            setCurrentUser(user);
            setOtherUser(other);
            await AsyncStorage.setItem('ss_current_user', normalizedUser);

            // Set contact (the other user)
            console.log('Login success. Setting contacts for:', other.id);
            setContacts([{
                id: other.id,
                name: other.name,
                avatar: other.avatar,
                status: 'online',
                bio: other.bio,
                lastMessage: '',
                unreadCount: 0,
            }]);

            // Fetch profile and messages from Supabase
            fetchProfileFromSupabase(normalizedUser);
            fetchMessagesFromSupabase(normalizedUser, other.id);
            fetchCallsFromSupabase(normalizedUser);
            fetchOtherUserProfile(other.id);
            fetchStatusesFromSupabase();

            // Load user-specific favorites from Supabase
            try {
                const { data, error } = await supabase
                    .from('favorites')
                    .select('*')
                    .eq('user_id', normalizedUser);

                if (data && !error) {
                    const dbFavorites: Song[] = data.map((item: any) => item.song_data);
                    setMusicState(prev => ({ ...prev, favorites: dbFavorites }));
                    AsyncStorage.setItem(`ss_favorites_${normalizedUser}`, JSON.stringify(dbFavorites));
                }
            } catch (e) {
                console.warn('Failed to load favorites from DB', e);
            }

            return true;
        }
        return false;
    };

    const fetchProfileFromSupabase = async (userId: string) => {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single();

            if (data && !error) {
                setCurrentUser(prev => prev ? {
                    ...prev,
                    name: data.name || prev.name,
                    avatar: data.avatar_url || prev.avatar,
                    bio: data.bio || prev.bio
                } : null);
            }
        } catch (e) { /* profile might not exist yet */ }
    };

    const fetchOtherUserProfile = async (userId: string) => {
        try {
            const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
            if (data) {
                setOtherUser(prev => prev ? { ...prev, name: data.name, avatar: data.avatar_url, bio: data.bio } : null);
                setContacts(prev => prev.map(c => c.id === userId ? {
                    ...c,
                    name: data.name,
                    avatar: data.avatar_url,
                    bio: data.bio
                } : c));
            }
        } catch (e) {}
    };

    const fetchMessagesFromSupabase = async (userId: string, partnerId: string) => {
        try {
            const { data, error } = await supabase
                .from('messages')
                .select('*')
                .or(`and(sender.eq.${userId},receiver.eq.${partnerId}),and(sender.eq.${partnerId},receiver.eq.${userId})`)
                .order('created_at', { ascending: true });

            if (data && !error) {
                const mappedMessages: Message[] = data.map(dbRow => ({
                    id: dbRow.id.toString(),
                    sender: dbRow.sender === userId ? 'me' : 'them',
                    text: dbRow.text,
                    timestamp: new Date(dbRow.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    status: dbRow.status,
                    media: dbRow.media_url ? { type: 'image', url: dbRow.media_url } : undefined,
                }));
                setMessages(prev => ({ ...prev, [partnerId]: mappedMessages }));
            }
        } catch (e) {
            console.error('Failed to fetch history:', e);
        }
    };

    const fetchCallsFromSupabase = async (userId: string) => {
        try {
            const { data, error } = await supabase
                .from('call_logs')
                .select('*')
                .or(`caller_id.eq.${userId},callee_id.eq.${userId}`)
                .order('created_at', { ascending: false })
                .limit(50);

	            if (data && !error) {
	                const mappedCalls: CallLog[] = data.map((log: any) => {
	                    const isOutgoing = log.caller_id === userId;
	                    const partnerId = isOutgoing ? log.callee_id : log.caller_id;
	                    return {
	                        id: log.id.toString(),
	                        contactId: partnerId,
	                        contactName: 'Loading...',
	                        avatar: '',
	                        type: isOutgoing ? 'outgoing' : 'incoming',
                            status: log.status || 'completed',
                            duration: log.duration,
	                        callType: log.call_type,
	                        time: new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
	                    };
	                });
                
	                // Resolve names if possible immediately, otherwise the effect/render will handle it if we map correctly
	                setCalls(mappedCalls.map(c => {
	                    const pid = c.contactId;
	                    const partner = pid === otherUser?.id ? otherUser : null;
	                    return {
	                        ...c,
	                        contactName: partner?.name || c.contactName,
	                        avatar: partner?.avatar || c.avatar
	                    };
	                }));
	            }
        } catch (e) { console.error('Fetch calls error:', e); }
    };

    const mapStatusFromDB = (dbStatus: any): StatusUpdate => ({
        id: dbStatus.id.toString(),
        userId: dbStatus.user_id,
        // Ideally we join with profiles table, but for now use stored or fallback
        contactName: dbStatus.user_name || 'Unknown', 
        avatar: dbStatus.user_avatar || '',
        mediaUrl: dbStatus.media_url,
        mediaType: dbStatus.media_type,
        caption: dbStatus.caption,
        timestamp: new Date(dbStatus.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        expiresAt: dbStatus.expires_at,
        views: dbStatus.views || []
    });

    const logout = async () => {
        setCurrentUser(null);
        setOtherUser(null);
        setContacts([]);
        await AsyncStorage.removeItem('ss_current_user');
    };

    // Music Functions
    const playSong = async (song: Song, broadcast = true) => {
        try {
            // Validate song URL
            if (!song.url || song.url.trim() === '') {
                console.error('Invalid song URL:', song);
                return;
            }

            // Unload previous sound
            if (soundRef.current) {
                try {
                    await soundRef.current.unloadAsync();
                } catch (unloadError) {
                    console.warn('Error unloading previous sound:', unloadError);
                }
            }

            console.log('Loading song:', song.name, song.url);

            // Create and load the sound with proper options
            const { sound: newSound, status } = await Audio.Sound.createAsync(
                { uri: song.url },
                { shouldPlay: true, volume: 1.0 },
                (playbackStatus) => {
                    // Handle playback status updates
                    if (playbackStatus.isLoaded) {
                        if (playbackStatus.didJustFinish) {
                            setMusicState(prev => ({ ...prev, isPlaying: false }));
                            if (broadcast) {
                                musicSyncService.broadcastUpdate({
                                    currentSong: song,
                                    isPlaying: false,
                                    updatedBy: currentUser?.id || ''
                                });
                            }
                        }
                    } else if (playbackStatus.error) {
                        console.error('Playback error:', playbackStatus.error);
                    }
                }
            );

            if (!status.isLoaded) {
                console.error('Failed to load audio:', song.name);
                return;
            }

            setSound(newSound);
            setMusicState(prev => ({ ...prev, currentSong: song, isPlaying: true }));
            console.log('Now playing:', song.name);

            if (broadcast) {
                musicSyncService.broadcastUpdate({
                    currentSong: song,
                    isPlaying: true,
                    position: 0,
                    updatedBy: currentUser?.id || ''
                });
            }
        } catch (e) {
            console.error('Audio play failed:', e);
            // Reset state on error
            setMusicState(prev => ({ ...prev, isPlaying: false }));
        }
    };

    const togglePlayMusic = async () => {
        if (!soundRef.current) return;
        const newIsPlaying = !musicState.isPlaying;
        let currentPos = 0;

        try {
            const status = await soundRef.current.getStatusAsync();
            if (status.isLoaded) currentPos = status.positionMillis;
        } catch (e) {}

        if (newIsPlaying) {
            await soundRef.current.playAsync();
        } else {
            await soundRef.current.pauseAsync();
        }

        setMusicState(prev => ({ ...prev, isPlaying: newIsPlaying }));

        if (musicState.currentSong) {
            musicSyncService.broadcastUpdate({
                currentSong: musicState.currentSong,
                isPlaying: newIsPlaying,
                position: currentPos, // Broadcast position to sync up
                updatedBy: currentUser?.id || ''
            });
        }
    };

    const toggleFavoriteSong = async (song: Song) => {
        if (!currentUser) return;

        setMusicState(prev => {
            const isFav = prev.favorites.some(s => s.id === song.id);
            const newFavs = isFav
                ? prev.favorites.filter(s => s.id !== song.id)
                : [...prev.favorites, song];

            // Sync with Supabase asynchronously
            const syncDb = async () => {
                try {
                    if (isFav) {
                        // Remove
                        await supabase
                            .from('favorites')
                            .delete()
                            .eq('user_id', currentUser.id)
                            .eq('song_id', song.id);
                    } else {
                        // Add
                        await supabase
                            .from('favorites')
                            .insert({
                                user_id: currentUser.id,
                                song_id: song.id,
                                song_data: song
                            });
                    }
                } catch (e) {
                    console.error('Failed to sync favorite:', e);
                }
            };
            syncDb();

            return { ...prev, favorites: newFavs };
        });
    };

    const seekTo = async (position: number) => {
        if (soundRef.current) {
            await soundRef.current.setPositionAsync(position);
            // Broadcast new position
            if (musicState.currentSong) {
                musicSyncService.broadcastUpdate({
                    currentSong: musicState.currentSong,
                    isPlaying: musicState.isPlaying,
                    position: position,
                    updatedBy: currentUser?.id || ''
                });
            }
        }
    };

    const getPlaybackPosition = async (): Promise<number> => {
        if (soundRef.current) {
            const status = await soundRef.current.getStatusAsync();
            if (status.isLoaded) {
                return status.positionMillis;
            }
        }
        return 0;
    };

    // Message Functions
    const addMessage = (chatId: string, text: string, sender: 'me' | 'them', media?: Message['media']) => {
        const messageId = Date.now().toString();
        const newMessage: Message = {
            id: messageId,
            sender,
            text,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            status: sender === 'me' ? 'sent' : undefined,
            media,
        };

        setMessages((prev) => {
            const newChatMessages = [...(prev[chatId] || []), newMessage];
            const updatedMessages = { ...prev, [chatId]: newChatMessages };

            setContacts(prevContacts => prevContacts.map(c =>
                c.id === chatId ? {
                    ...c,
                    lastMessage: media ? (media.type === 'image' ? '📷 Photo' : `📎 ${media.name}`) : text,
                    unreadCount: sender === 'them' ? (c.unreadCount || 0) + 1 : 0
                } : c
            ));

            return updatedMessages;
        });
        return messageId;
    };

    const updateMessage = (chatId: string, messageId: string, text: string) => {
        setMessages((prev) => {
            const chatMessages = prev[chatId] || [];
            const updatedMessages = chatMessages.map((msg) =>
                msg.id === messageId ? { ...msg, text } : msg
            );
            return { ...prev, [chatId]: updatedMessages };
        });
    };

    const updateMessageStatus = (chatId: string, messageId: string, status: 'sent' | 'delivered' | 'read') => {
        setMessages((prev) => {
            const chatMessages = prev[chatId] || [];
            const updatedMessages = chatMessages.map((msg) =>
                msg.id === messageId ? { ...msg, status } : msg
            );
            return { ...prev, [chatId]: updatedMessages };
        });
    };

    const deleteMessage = (chatId: string, messageId: string) => {
        setMessages((prev) => {
            const chatMessages = prev[chatId] || [];
            const filteredMessages = chatMessages.filter(m => m.id !== messageId);
            const lastMsg = filteredMessages[filteredMessages.length - 1];

            setContacts(prevContacts => prevContacts.map(c =>
                c.id === chatId ? {
                    ...c,
                    lastMessage: lastMsg ? (lastMsg.media ? '📎 Attachment' : lastMsg.text) : ''
                } : c
            ));

            return { ...prev, [chatId]: filteredMessages };
        });
    };

    const addReaction = (chatId: string, messageId: string, emoji: string) => {
        setMessages((prev) => {
            const chatMessages = prev[chatId] || [];
            const updatedMessages = chatMessages.map((msg) => {
                if (msg.id === messageId) {
                    const reactions = msg.reactions || [];
                    const newReactions = reactions.includes(emoji)
                        ? reactions.filter((r) => r !== emoji)
                        : [...reactions, emoji];
                    return { ...msg, reactions: newReactions };
                }
                return msg;
            });
            return { ...prev, [chatId]: updatedMessages };
        });
    };

	    // Call Functions
	    const addCall = async (call: Omit<CallLog, 'id'>) => {
	        if (currentUser) {
	            try {
	                const isOutgoing = call.type === 'outgoing';
	                const callerId = isOutgoing ? currentUser.id : call.contactId;
	                const calleeId = isOutgoing ? call.contactId : currentUser.id;
	                await supabase.from('call_logs').insert({
	                    caller_id: callerId,
	                    callee_id: calleeId,
	                    call_type: call.callType,
                        status: call.status || 'completed',
                        duration: call.duration || 0,
	                    created_at: new Date().toISOString()
	                });
	            } catch (e) { console.error('Failed to save call to DB:', e); }
	        }
	    };

    const activeCallRef = useRef<ActiveCall | null>(null);
    const contactsRef = useRef<Contact[]>([]);
    const currentUserRef = useRef<User | null>(null);
    const otherUserRef = useRef<User | null>(null);

    useEffect(() => { activeCallRef.current = activeCall; }, [activeCall]);
    useEffect(() => { contactsRef.current = contacts; }, [contacts]);
    useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);
    useEffect(() => { otherUserRef.current = otherUser; }, [otherUser]);

    // Initialize CallService and handle signals
    useEffect(() => {
        if (currentUser) {
            callService.initialize(currentUser.id);

            const handleSignal = async (signal: CallSignal) => {
                const currentActiveCall = activeCallRef.current;
                const currentContacts = contactsRef.current;
                const currentAuthUser = currentUserRef.current;

                console.log('AppContext stable listener received signal:', signal.type);

                switch (signal.type) {
                    case 'call-request':
                        if (currentActiveCall) {
                            console.log('[AppContext] Ignored call request: already in a call with', currentActiveCall.contactId);
                        } else {
                            if (signal.callerId !== currentAuthUser?.id) {
                                console.log('[AppContext] Setting incoming call state from:', signal.callerId);
                                const caller = currentContacts.find((c: Contact) => c.id === signal.callerId);
                                setActiveCall({
                                    callId: signal.callId,
                                    contactId: signal.callerId,
                                    type: signal.callType,
                                    isMinimized: false,
                                    isMuted: false,
                                    isVideoOff: false,
                                    isIncoming: true,
                                    isAccepted: false,
                                    isRinging: false,
                                    callerName: caller?.name || "Unknown User",
                                    callerAvatar: caller?.avatar
                                });
                                // Recipient joins room to send ringing signal
	                                callService.notifyRinging(signal.callId, signal.callerId, signal.callType);
	                            } else {
	                                console.log('[AppContext] Ignored self-initiated call request');
	                            }
	                        }
	                        break;

                    case 'call-ringing' as any:
                        console.log('Partner phone is ringing');
                        if (currentActiveCall && !currentActiveCall.isIncoming) {
                            setActiveCall(prev => prev ? { ...prev, isRinging: true } : null);
                        }
                        break;

                    case 'call-accept':
                        console.log('Call accepted by partner');
                        if (currentActiveCall && !currentActiveCall.isIncoming) {
                            setActiveCall(prev => prev ? { ...prev, isAccepted: true, isRinging: false, startTime: Date.now() } : null);
                            const { webRTCService } = require('../services/WebRTCService');
                            await webRTCService.onCallAccepted();
                        }
                        break;

                    case 'call-reject':
                        console.log('Call rejected by partner');
                        if (currentActiveCall) {
                            const { webRTCService } = require('../services/WebRTCService');
                            webRTCService.endCall();
                            setActiveCall(null);
                        }
                        break;

                    case 'ice-candidate':
                    case 'offer':
                    case 'answer':
                        const { webRTCService } = require('../services/WebRTCService');
                        await webRTCService.handleSignal(signal);
                        break;

                    case 'call-end':
                        console.log('Call ended by partner');
                        const { webRTCService: wrtc } = require('../services/WebRTCService');
                        wrtc.endCall();
                        setActiveCall(null);
                        break;
                }
            };

            callService.addListener(handleSignal);
            return () => {
                callService.removeListener(handleSignal);
            };
        }
    }, [currentUser]); // Only re-run if user changes

    const startCall = async (contactId: string, type: 'audio' | 'video') => {
        const contact = contacts.find(c => c.id === contactId);
        // We don't have callId yet, initiateCall returns it
        const callId = await callService.initiateCall(contactId, type);

        setActiveCall({
            callId: callId || undefined,
            contactId,
            type,
            isMinimized: false,
            isMuted: false,
            isVideoOff: false,
            isIncoming: false,
            isAccepted: false,
            callerName: contact?.name,
            callerAvatar: contact?.avatar
        });
    };

    const acceptCall = async () => {
        if (activeCall && activeCall.isIncoming && activeCall.callId) {
            console.log('Accepting call...');
            setActiveCall(prev => prev ? { ...prev, isAccepted: true, isRinging: false, startTime: Date.now() } : null);

            // Join the room and notify caller (Handled inside CallService.acceptCall)
            const signal: CallSignal = {
                type: 'call-accept',
                callId: activeCall.callId || '',
                callerId: activeCall.contactId,
                calleeId: currentUser!.id,
                callType: activeCall.type,
                timestamp: new Date().toISOString(),
                roomId: activeCall.callId
            };
            await callService.acceptCall(signal);
        }
    };

    const rejectCall = async () => {
        if (activeCall && activeCall.isIncoming && activeCall.callId) {
            console.log('Rejecting call...');
            const signal: CallSignal = {
                type: 'call-reject',
                callId: activeCall.callId || '',
                callerId: activeCall.contactId,
                calleeId: currentUser!.id,
                callType: activeCall.type,
                timestamp: new Date().toISOString(),
                roomId: activeCall.callId
            };
            await callService.rejectCall(signal);

            // Log rejected call
            const contact = contacts.find(c => c.id === activeCall.contactId);
            addCall({
                contactId: activeCall.contactId,
                contactName: contact?.name || 'Unknown',
                avatar: contact?.avatar || '',
                type: 'incoming',
                status: 'rejected',
                callType: activeCall.type,
                time: 'Just now'
            });
            // Ensure WebRTC cleanup
            try {
                const { webRTCService } = require('../services/WebRTCService');
                webRTCService.endCall();
            } catch (e) {
                console.log('Error cleaning up WebRTC on rejection:', e);
            }

            setActiveCall(null);
        }
    };

    const endCall = async () => {
        if (activeCall) {
            // If it's an incoming call not yet accepted, it's a rejection
            if (activeCall.isIncoming && !activeCall.isAccepted) {
                await rejectCall();
                return;
            }

            // Signal partner that call is ended
            if (currentUser && activeCall.contactId) {
                await callService.endCall();
            }

	            // Log call before ending
	            const contact = contacts.find(c => c.id === activeCall.contactId);
	            addCall({
	                contactId: activeCall.contactId,
	                contactName: contact?.name || 'Unknown',
	                avatar: contact?.avatar || '',
	                type: activeCall.isIncoming ? 'incoming' : 'outgoing',
                    status: 'completed',
	                callType: activeCall.type,
	                time: 'Just now',
	            });

                const { webRTCService } = require('../services/WebRTCService');
                webRTCService.endCall();
                setActiveCall(null);
        }
    };

    const toggleMinimizeCall = (val: boolean) => {
        setActiveCall(prev => prev ? { ...prev, isMinimized: val } : null);

    };

    const toggleMute = () => {
        const isMuted = webRTCService.toggleMute();
        setActiveCall(prev => prev ? { ...prev, isMuted } : null);
    };

    const addStatus = async (status: Omit<StatusUpdate, 'id'>) => {
        // Optimistic update
        const tempId = Date.now().toString();
        const newStatus = { ...status, id: tempId };
        setStatuses((prev) => [newStatus, ...prev]);

        if (currentUser) {
            try {
                await supabase.from('statuses').insert({
                    user_id: currentUser.id,
                    user_name: currentUser.name,
                    user_avatar: currentUser.avatar,
                    media_url: status.mediaUrl,
                    media_type: status.mediaType,
                    caption: status.caption,
                    expires_at: status.expiresAt,
                    created_at: new Date().toISOString()
                });
            } catch (e) { console.error('Failed to save status to DB:', e); }
        }
    };

    const deleteStatus = async (statusId: string) => {
        setStatuses((prev) => prev.filter((s) => s.id !== statusId));

        if (currentUser) {
            try {
                await supabase.from('statuses').delete().eq('id', statusId).eq('user_id', currentUser.id);
            } catch (e) { console.error('Failed to delete status from DB:', e); }
        }
    };

    const setTheme = (newTheme: ThemeName) => setThemeState(newTheme);

    // Update profile (avatar, name, bio)
    const addStatusView = async (statusId: string) => {
        if (!currentUser) return;

        const status = statuses.find(s => s.id === statusId);
        if (!status || status.views?.includes(currentUser.id)) {
            return; // Already viewed or status not found
        }

        // Optimistic update
        const updatedStatuses = statuses.map(s =>
            s.id === statusId
                ? { ...s, views: [...(s.views || []), currentUser.id] }
                : s
        );
        setStatuses(updatedStatuses);

        try {
            // Get current views from DB
            const { data, error } = await supabase
                .from('statuses')
                .select('views')
                .eq('id', statusId)
                .single();

            if (error) throw error;

            const existingViews = data?.views || [];
            if (!existingViews.includes(currentUser.id)) {
                const newViews = [...existingViews, currentUser.id];
                await supabase
                    .from('statuses')
                    .update({ views: newViews })
                    .eq('id', statusId);
            }
        } catch (e) {
            console.error('Failed to update status view:', e);
            // Revert optimistic update on error
            setStatuses(statuses);
        }
    };

    // --- Real-time Profile Updates ---
    useEffect(() => {
        const profileSubscription = supabase
            .channel('public:profiles')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (payload) => {
                const updatedProfile = payload.new;
                console.log('Real-time profile update received:', updatedProfile);
                
                // Update contacts list if the updated user is a contact
                setContacts(prevContacts => prevContacts.map(contact => {
                    if (contact.id === updatedProfile.id) {
                        return { 
                            ...contact, 
                            name: updatedProfile.name || contact.name, 
                            avatar: updatedProfile.avatar_url || contact.avatar,
                            bio: updatedProfile.bio || contact.bio
                         };
                    }
                    return contact;
                }));
            })
            .subscribe();

        return () => {
            supabase.removeChannel(profileSubscription);
        };
    }, []);

    // Update profile (avatar, name, bio)
    const updateProfile = async (updates: { name?: string; bio?: string; avatar?: string }) => {
        if (!currentUser) return;

        const updatedUser = {
            ...currentUser,
            name: updates.name ?? currentUser.name,
            bio: updates.bio ?? currentUser.bio,
            avatar: updates.avatar ?? currentUser.avatar,
        };


        setCurrentUser(updatedUser);

        try {
            console.log('Syncing profile to DB:', updatedUser);
            // Update Supabase Profiles
            const { error } = await supabase
                .from('profiles')
                .upsert({
                    id: currentUser.id,
                    name: updatedUser.name,
                    avatar_url: updatedUser.avatar,
                    bio: updatedUser.bio,
                    updated_at: new Date().toISOString(),
                });

            if (error) {
                console.error('Supabase profile update error:', error);
                throw error;
            } else {
                console.log('Profile synced successfully!');
            }
            
            // Update AsyncStorage for quick load
            await AsyncStorage.setItem(`@profile_${currentUser.id}`, JSON.stringify(updatedUser));
        } catch (e) {
            console.error('Failed to sync profile to DB:', e);
        }
    };

    return (
        <AppContext.Provider value={{
            // Auth
            currentUser,
            otherUser,
            isLoggedIn: !!currentUser,
            login,
            logout,

            // Data
            contacts,
            messages,
            calls,
            statuses,
            theme,
            activeTheme: THEMES[theme],
            activeCall,
            musicState,
            isReady,
            onlineUsers, // Added onlineUsers to context value

            // Actions
            addMessage,
            updateMessage,
            updateMessageStatus,
            deleteMessage,
            addReaction,
            addCall,
            addStatus,
            deleteStatus,
            setTheme,
            startCall,
            acceptCall,
            endCall,
            toggleMinimizeCall,
            toggleMute,
            playSong,
            togglePlayMusic,
            toggleFavoriteSong,
            seekTo,
            getPlaybackPosition,
            sendChatMessage,
            updateProfile,
            addStatusView,
        }}>
            {children}
        </AppContext.Provider >
    );
};

export const useApp = () => {
    const context = useContext(AppContext);
    if (!context) throw new Error('useApp must be used within an AppProvider');
    return context;
};
