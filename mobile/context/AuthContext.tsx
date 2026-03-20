import * as React from 'react';
import { useState, useEffect, createContext, useContext, useCallback, useRef } from 'react';
import { supabase } from '../config/supabase';
import { authService } from '../services/AuthService';
import { offlineService } from '../services/LocalDBService';
import { storageService } from '../services/StorageService';
import { proxySupabaseUrl } from '../config/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';

export type PrivacyValue = 'everyone' | 'contacts' | 'nobody';

export interface PrivacySettings {
    lastSeen: PrivacyValue;
    profilePhoto: PrivacyValue;
    status: PrivacyValue;
    readReceipts: boolean;
}

export const DEFAULT_PRIVACY: PrivacySettings = {
    lastSeen: 'everyone',
    profilePhoto: 'everyone',
    status: 'everyone',
    readReceipts: true,
};

export type AvatarType = 'default' | 'teddy' | 'custom' | 'uploaded' | 'google';
export type TeddyVariant = 'boy' | 'girl';

export interface User {
    id: string;
    name: string;
    avatar: string;
    avatarType: AvatarType;
    teddyVariant?: TeddyVariant;
    bio: string;
    username?: string;
    birthdate?: string;
    lastUsernameChange?: string;
    note?: string;
    noteTimestamp?: string;
}

interface AuthContextType {
    currentUser: User | null;
    isLoggedIn: boolean;
    isReady: boolean;
    login: (username: string, password: string) => Promise<boolean>;
    setSession: (userId: string) => Promise<void>;
    logout: () => Promise<void>;
    updateProfile: (updates: Partial<User>) => Promise<void>;
    changeUsername: (newUsername: string) => Promise<{ success: boolean; error?: string }>;
    refreshProfile: (userId: string) => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [isReady, setIsReady] = useState(false);
    const currentUserRef = useRef<User | null>(null);

    useEffect(() => {
        currentUserRef.current = currentUser;
    }, [currentUser]);

    const synchronizeSession = useCallback(async (userId: string) => {
        try {
            console.log('[AuthContext] synchronizeSession start:', userId);
            // Add timeout to prevent hanging
            const profile = await Promise.race([
                authService.getProfile(userId),
                new Promise<null>((resolve) => setTimeout(() => {
                    console.warn('[AuthContext] synchronizeSession: getProfile timed out (5s)');
                    resolve(null);
                }, 5000))
            ]);

            if (profile) {
                console.log('[AuthContext] synchronizeSession: Profile fetched successfully');
                // Use server avatar URL immediately (fast), cache in background
                const avatarUrl = profile.avatarUrl || '';

                // Background cache avatar after startup
                setTimeout(() => {
                    if (avatarUrl) {
                        storageService.getAvatarUrl(profile.id, avatarUrl).catch(() => {});
                    }
                }, 2000);

                const userObj: User = {
                    id: profile.id,
                    name: profile.displayName || profile.username || 'User',
                    username: profile.username,
                    avatar: proxySupabaseUrl(avatarUrl) || '',
                    avatarType: profile.avatarType || 'default',
                    bio: profile.bio || '',
                    birthdate: profile.birthdate || undefined,
                    lastUsernameChange: profile.lastUsernameChange || undefined,
                    note: profile.note,
                    noteTimestamp: profile.note_timestamp
                };
                setCurrentUser(userObj);
                await AsyncStorage.setItem('ss_current_user', userId);
                console.log('[AuthContext] synchronizeSession: Session linked and persisted');
            } else {
                console.warn('[AuthContext] synchronizeSession: No profile data found for user:', userId);
            }
        } catch (e) {
            console.error('[AuthContext] synchronizeSession: Failed:', e);
        }
    }, []);

    const refreshProfile = useCallback(async (userId: string) => {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single();

            if (data && !error) {
                // Use server URL immediately, cache in background
                const avatarUrl = data.avatar_url || '';

                // Background cache avatar
                if (avatarUrl) {
                    storageService.getAvatarUrl(userId, avatarUrl).catch(() => {});
                }

                setCurrentUser(prev => prev ? {
                    ...prev,
                    name: data.display_name || data.name || prev.name,
                    avatar: proxySupabaseUrl(avatarUrl) || prev.avatar,
                    avatarType: data.avatar_type || prev.avatarType,
                    teddyVariant: data.teddy_variant || prev.teddyVariant,
                    bio: data.bio || prev.bio,
                    note: data.note || prev.note,
                    noteTimestamp: data.note_timestamp || prev.noteTimestamp
                } : null);
            }
        } catch (e) {
            console.warn('[AuthContext] refreshProfile exception:', e);
        }
    }, []);

    useEffect(() => {
        const handleAuthChange = async (event: string, session: any) => {
            console.log(`[AuthContext] Auth event: ${event}`);
            if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') {
                const user = session?.user;
                if (user) {
                    await synchronizeSession(user.id);
                }
            } else if (event === 'SIGNED_OUT') {
                setCurrentUser(null);
                await AsyncStorage.removeItem('ss_current_user');
            } else if (event === 'PASSWORD_RECOVERY') {
                router.push('/forgot-password?mode=reset' as any);
            }
        };

        const { data: { subscription } } = authService.onAuthStateChange(handleAuthChange);

        return () => subscription.unsubscribe();
    }, [synchronizeSession]);

    useEffect(() => {
        let isMounted = true;
        let timeoutId: ReturnType<typeof setTimeout>;
        let safetyTimeoutId: ReturnType<typeof setTimeout>;

        console.log('[AuthContext] useEffect[auth-init]: Initializing auth state...');

        // Overall safety timeout for the entire readying process (8s)
        safetyTimeoutId = setTimeout(() => {
            if (isMounted && !isReady) {
                console.warn('[AuthContext] SAFETY TIMEOUT: Forcing app state to READY');
                setIsReady(true);
            }
        }, 8000);

        // Set a short timeout for the session check specifically
        const sessionPromise = supabase.auth.getSession();
        const timeoutPromise = new Promise<null>((resolve) => {
            timeoutId = setTimeout(() => {
                console.log('[AuthContext] session check: Timed out (3s), continuing anyway');
                resolve(null);
            }, 3000); // Reduced to 3 seconds to avoid iOS Watchdog timeout (10s limit)
        });

        Promise.race([sessionPromise, timeoutPromise]).then((sessionResult: any) => {
            if (!isMounted) return;
            clearTimeout(timeoutId);

            // If timeout fired (null), skip session check
            if (!sessionResult) {
                console.log('[AuthContext] session check: Using fallback (timeout)');
                setIsReady(true);
                return;
            }

            const session = sessionResult?.data?.session;
            const error = sessionResult?.error;

            if (error) {
                console.error('[AuthContext] session check: Supabase error:', error);
                setIsReady(true); // Signal ready even on error to unblock UI
                return;
            }

            if (session) {
                console.log('[AuthContext] session check: Session found, syncing profile for:', session.user.id);
                synchronizeSession(session.user.id).finally(() => {
                    if (isMounted) {
                        if (safetyTimeoutId) clearTimeout(safetyTimeoutId);
                        console.log('[AuthContext] session check: Profile sync complete, readying app');
                        setIsReady(true);
                    }
                });
            } else {
                console.log('[AuthContext] session check: No session found, checking cache...');
                AsyncStorage.getItem('ss_current_user').then(cachedUserId => {
                    if (isMounted) {
                        if (cachedUserId) {
                            console.log('[AuthContext] session check: Found cached user, syncing:', cachedUserId);
                            synchronizeSession(cachedUserId).finally(() => {
                                if (isMounted) {
                                    if (safetyTimeoutId) clearTimeout(safetyTimeoutId);
                                    setIsReady(true);
                                }
                            });
                        } else {
                            console.log('[AuthContext] session check: No session or cached user found');
                            if (safetyTimeoutId) clearTimeout(safetyTimeoutId);
                            setIsReady(true);
                        }
                    }
                }).catch((e) => {
                    console.error('[AuthContext] cache check: Failed:', e);
                    if (isMounted) {
                        if (safetyTimeoutId) clearTimeout(safetyTimeoutId);
                        setIsReady(true);
                    }
                });
            }
        }).catch((err) => {
            if (!isMounted) return;
            clearTimeout(timeoutId);
            if (safetyTimeoutId) clearTimeout(safetyTimeoutId);
            console.error('[AuthContext] session check chain: Fatal exception:', err);
            setIsReady(true); // Unblock UI on error
        });

        return () => {
            isMounted = false;
            if (timeoutId) clearTimeout(timeoutId);
            if (safetyTimeoutId) clearTimeout(safetyTimeoutId);
        };
    }, [synchronizeSession]);

    const login = useCallback(async (emailOrUsername: string, password: string): Promise<boolean> => {
        const result = await authService.signInWithPassword(emailOrUsername, password);
        
        return result.success;
    }, [synchronizeSession]);

    const setSession = useCallback(async (userId: string) => {
        await synchronizeSession(userId);
    }, [synchronizeSession]);

    const logout = useCallback(async () => {
        console.log('[AuthContext] Logging out, clearing local data...');
        try {
            // First clear the local SQLite database to prevent pollution
            await offlineService.clearDatabase();
        } catch (e) {
            console.error('[AuthContext] Failed to clear local DB during logout:', e);
        }

        await authService.signOut();
        setCurrentUser(null);
        await AsyncStorage.removeItem('ss_current_user');
        router.replace('/login');
    }, []);

    const updateProfile = useCallback(async (updates: Partial<User>) => {
        if (!currentUser) return;
        
        // Optimistic local UI update immediately changes the DP/Name across the app
        setCurrentUser(prev => prev ? { ...prev, ...updates } as User : null);

        try {
            const { error } = await supabase
                .from('profiles')
                .update({
                    name: updates.name,
                    display_name: updates.name,
                    bio: updates.bio,
                    avatar_url: updates.avatar,
                    avatar_type: updates.avatarType,
                    teddy_variant: updates.teddyVariant,
                    note: updates.note,
                    note_timestamp: updates.noteTimestamp
                })
                .eq('id', currentUser.id);

            if (!error) {
                await refreshProfile(currentUser.id);
            }
        } catch (e) {
            console.error('[AuthContext] Update profile failed:', e);
        }
    }, [currentUser, refreshProfile]);

    const changeUsername = useCallback(async (newUsername: string) => {
        if (!currentUser) return { success: false, error: 'Not logged in' };
        const result = await authService.updateUsername(currentUser.id, newUsername);
        if (result.success) {
            await refreshProfile(currentUser.id);
        }
        return result;
    }, [currentUser, refreshProfile]);

    const value = {
        currentUser,
        isLoggedIn: !!currentUser,
        isReady,
        login,
        setSession,
        logout,
        updateProfile,
        changeUsername,
        refreshProfile
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
