import * as React from 'react';
import { useState, useEffect, createContext, useContext, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth, AuthProvider } from './AuthContext';
import { useChat, ChatProvider } from './ChatContext';
import { useCall, CallProvider } from './CallContext';
import { useMusic, MusicProvider } from './MusicContext';
import { useStatus, StatusProvider } from './StatusContext';

// We'll define basic types here if they aren't easily importable, 
// but try to keep it lean.
export type ThemeName = 'midnight' | 'ocean' | 'forest' | 'sunset' | 'lavender' | 'crimson' | 'cyberpunk';
export type PrivacyValue = 'everyone' | 'contacts' | 'nobody';

export interface AppTheme {
    primary: string;
    accent: string;
    background: string;
    surface: string;
    bg: string;
}

const THEME_MAP = {
    midnight: { primary: '#BC002A', accent: '#FF6A88', background: '#000', surface: '#12101A', bg: '#000' },
    ocean: { primary: '#0EA5E9', accent: '#67E8F9', background: '#03131D', surface: '#0A2230', bg: '#03131D' },
    forest: { primary: '#22C55E', accent: '#86EFAC', background: '#04120A', surface: '#102216', bg: '#04120A' },
    sunset: { primary: '#F97316', accent: '#FDBA74', background: '#160904', surface: '#2A140C', bg: '#160904' },
    lavender: { primary: '#A855F7', accent: '#E9D5FF', background: '#100517', surface: '#1D0F29', bg: '#100517' },
    crimson: { primary: '#DC2626', accent: '#FCA5A5', background: '#140607', surface: '#2A1114', bg: '#140607' },
    cyberpunk: { primary: '#FACC15', accent: '#67E8F9', background: '#08080A', surface: '#18181B', bg: '#08080A' },
} satisfies Record<ThemeName, AppTheme>;

export const USERS: Record<string, { id: string }> = {};

interface AppContextType {
    // Auth
    currentUser: any;
    isLoggedIn: boolean;
    isReady: boolean;
    login: any;
    setSession: any;
    logout: () => Promise<void>;
    updateProfile: any;
    changeUsername: any;

    // Chat
    contacts: any[];
    setContacts: any;
    refreshContactsFromServer: any;
    messages: any;
    sendChatMessage: any;
    updateMessage: any;
    addReaction: any;
    deleteMessage: any;
    clearChatMessages: any;
    sendTyping: any;
    initializeChatSession: any;
    cleanupChatSession: any;
    onlineUsers: string[];
    typingUsers: string[];
    uploadProgressTracker: Record<string, number>;
    otherUser: any | null;
    fetchOtherUserProfile: any;
    pendingRequestsCount: number;
    broadcastProfileUpdate: (updates: Partial<any>) => void;
    archiveContact: (partnerId: string, archive?: boolean) => Promise<void>;
    unfriendContact: (partnerId: string) => Promise<void>;
    
    // Status
    statuses: any[];
    addStatus: (params: any) => Promise<boolean | void>;
    deleteStatus: (id: string) => Promise<void>;
    toggleStatusLike: (id: string) => Promise<void>;
    addStatusView: (id: string) => Promise<void>;
    notes: any[];
    updateNote: (text: string | null) => Promise<boolean>;

    // Call
    activeCall: any;
    calls: any[];
    startCall: any;
    acceptCall: () => Promise<void>;
    endCall: any;
    toggleMinimizeCall: (val: boolean) => void;
    toggleMute: () => void;
    toggleVideo: () => void;
    deleteCall: (id: string) => Promise<void>;
    clearCalls: () => Promise<void>;

    // Music
    musicState: any;
    playSong: any;
    togglePlayMusic: any;
    toggleFavoriteSong: any;
    getPlaybackPosition: any;
    seekTo: any;

    // Core Settings
    theme: ThemeName;
    activeTheme: { primary: string; accent: string; background: string; surface: string };
    setTheme: (theme: ThemeName) => void;
    connectivity: {
        isDeviceOnline: boolean;
        isServerReachable: boolean;
        isRealtimeConnected: boolean;
    };
    
    // Security
    isLocked: boolean;
    unlockApp: () => void;
    biometricEnabled: boolean;
    pinEnabled: boolean;
    pin: string | null;
    setBiometricEnabled: (val: boolean) => void;
    setPinEnabled: (val: boolean) => void;
    setPin: (val: string | null) => void;
    
    // Status helpers
    saveNote: (text: string) => Promise<boolean>;
    deleteNote: () => Promise<boolean>;
    refreshLocalCache: () => Promise<void>;
    toggleHeart: (chatId: string, messageId: string) => Promise<void>;
    
    // Privacy
    privacySettings: {
        lastSeen: PrivacyValue;
        profilePhoto: PrivacyValue;
        status: PrivacyValue;
        readReceipts: boolean;
    };
    updatePrivacy: (settings: Partial<AppContextType['privacySettings']>) => void;
}

export const AppContext = createContext<AppContextType | undefined>(undefined);

const AppProviderInternal: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const auth = useAuth();
    const chat = useChat();
    const call = useCall();
    const music = useMusic();
    const status = useStatus();

    const [theme, setThemeState] = useState<ThemeName>('midnight');
    const [connectivity, setConnectivity] = useState({
        isDeviceOnline: true,
        isServerReachable: true,
        isRealtimeConnected: true
    });
    const [isLocked, setIsLocked] = useState(false);
    const [biometricEnabled, setBiometricEnabledState] = useState(false);
    const [pinEnabled, setPinEnabledState] = useState(false);
    const [pin, setPinState] = useState<string | null>(null);

    const [privacySettings, setPrivacySettingsState] = useState({
        lastSeen: 'everyone' as PrivacyValue,
        profilePhoto: 'everyone' as PrivacyValue,
        status: 'everyone' as PrivacyValue,
        readReceipts: true
    });

    useEffect(() => {
        const loadSettings = async () => {
            const [b, pe, p, priv] = await Promise.all([
                AsyncStorage.getItem('ss_biometric_enabled'),
                AsyncStorage.getItem('ss_pin_enabled'),
                AsyncStorage.getItem('ss_pin'),
                AsyncStorage.getItem('ss_privacy')
            ]);
            if (b) setBiometricEnabledState(b === 'true');
            if (pe) setPinEnabledState(pe === 'true');
            if (p) setPinState(p);
            if (priv) setPrivacySettingsState(JSON.parse(priv));
        };
        loadSettings();
    }, []);

    const updatePrivacy = (newSettings: Partial<AppContextType['privacySettings']>) => {
        const updated = { ...privacySettings, ...newSettings };
        setPrivacySettingsState(updated);
        AsyncStorage.setItem('ss_privacy', JSON.stringify(updated));
    };

    const setBiometricEnabled = (val: boolean) => {
        setBiometricEnabledState(val);
        AsyncStorage.setItem('ss_biometric_enabled', val ? 'true' : 'false');
    };

    const setPinEnabled = (val: boolean) => {
        setPinEnabledState(val);
        AsyncStorage.setItem('ss_pin_enabled', val ? 'true' : 'false');
    };

    const setPin = (val: string | null) => {
        setPinState(val);
        if (val) AsyncStorage.setItem('ss_pin', val);
        else AsyncStorage.removeItem('ss_pin');
    };

    useEffect(() => {
        AsyncStorage.getItem('ss_theme').then(t => {
            if (t) setThemeState(t as ThemeName);
        });
    }, []);

    const setTheme = useCallback((t: ThemeName) => {
        setThemeState(t);
        AsyncStorage.setItem('ss_theme', t);
    }, []);

    useEffect(() => {
        setConnectivity(chat.connectivity);
    }, [chat.connectivity]);

    const value: AppContextType = {
        // Auth
        currentUser: auth.currentUser,
        isLoggedIn: auth.isLoggedIn,
        isReady: auth.isReady,
        login: auth.login,
        setSession: auth.setSession,
        logout: auth.logout,
        updateProfile: auth.updateProfile,
        changeUsername: auth.changeUsername,

        // Chat
        contacts: chat.contacts,
        setContacts: chat.setContacts,
        refreshContactsFromServer: chat.refreshContactsFromServer,
        messages: chat.messages,
        sendChatMessage: chat.sendChatMessage,
        updateMessage: chat.updateMessage,
        addReaction: chat.addReaction,
        deleteMessage: chat.deleteMessage,
        clearChatMessages: chat.clearChatMessages,
        sendTyping: chat.sendTyping,
        initializeChatSession: chat.initializeChatSession,
        cleanupChatSession: chat.cleanupChatSession,
        onlineUsers: chat.onlineUsers,
        typingUsers: chat.typingUsers,
        uploadProgressTracker: chat.uploadProgressTracker,
        otherUser: chat.otherUser,
        fetchOtherUserProfile: chat.fetchOtherUserProfile,
        pendingRequestsCount: chat.pendingRequestsCount,
        broadcastProfileUpdate: chat.broadcastProfileUpdate,
        archiveContact: chat.archiveContact,
        unfriendContact: chat.unfriendContact,

        // Status
        statuses: status.stories,
        addStatus: status.addStory,
        deleteStatus: status.deleteStory,
        toggleStatusLike: status.toggleStoryLike,
        addStatusView: status.viewStory,
        notes: status.notes,
        updateNote: status.updateNote,

        // Call
        activeCall: call.activeCall,
        calls: call.calls,
        startCall: call.startCall,
        acceptCall: call.acceptCall,
        endCall: call.endCall,
        toggleMinimizeCall: call.toggleMinimizeCall,
        toggleMute: call.toggleMute,
        toggleVideo: call.toggleVideo,
        deleteCall: call.deleteCall,
        clearCalls: call.clearCalls,

        // Music
        musicState: music.musicState,
        playSong: music.playSong,
        togglePlayMusic: music.togglePlayMusic,
        toggleFavoriteSong: music.toggleFavoriteSong,
        getPlaybackPosition: music.getPlaybackPosition,
        seekTo: music.seekTo,

        // Settings
        theme,
        activeTheme: THEME_MAP[theme],
        // Setting helper methods
        setTheme,
        connectivity,
        isLocked,
        unlockApp: () => setIsLocked(false),
        biometricEnabled,
        pinEnabled,
        pin,
        setBiometricEnabled,
        setPinEnabled,
        setPin,
        
        // Status Helpers
        saveNote: status.updateNote,
        deleteNote: () => status.updateNote(null),
        refreshLocalCache: chat.refreshLocalCache,
        toggleHeart: async (chatId: string, messageId: string) => {
            const chatMessages = chat.messages[chatId] || [];
            const msg = chatMessages.find((m: any) => m.id === messageId);
            const hasHeart = msg?.reactions?.some((r: string) => 
                ['❤️', '❤', '\u2764\uFE0F', '\u2764'].includes(r)
            );
            await chat.addReaction(chatId, messageId, hasHeart ? null : '❤️');
        },
        
        // Privacy
        privacySettings,
        updatePrivacy
    };

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const THEMES: Record<ThemeName, AppTheme> = THEME_MAP;

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    return (
        <AuthProvider>
            <ChatProvider>
                <CallProvider>
                    <MusicProvider>
                        <StatusProvider>
                            <AppProviderInternal>
                                {children}
                            </AppProviderInternal>
                        </StatusProvider>
                    </MusicProvider>
                </CallProvider>
            </ChatProvider>
        </AuthProvider>
    );
};

export const useAppContext = () => {
    const context = useContext(AppContext);
    if (context === undefined) {
        throw new Error('useAppContext must be used within an AppProvider');
    }
    return context;
};

export const useApp = useAppContext;
