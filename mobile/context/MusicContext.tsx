import * as React from 'react';
import { useState, useEffect, createContext, useContext, useCallback, useRef } from 'react';
import { Audio } from 'expo-av';
import { musicSyncService } from '../services/MusicSyncService';
import { useAuth } from './AuthContext';
import { Song, MusicState } from '../types';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface MusicContextType {
    musicState: MusicState;
    playSong: (song: Song, broadcast?: boolean) => Promise<void>;
    togglePlayMusic: () => Promise<void>;
    toggleFavoriteSong: (song: Song) => Promise<void>;
    seekTo: (position: number) => Promise<void>;
}

export const MusicContext = createContext<MusicContextType | undefined>(undefined);

export const MusicProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { currentUser } = useAuth();
    const [musicState, setMusicState] = useState<MusicState>({
        currentSong: null,
        isPlaying: false,
        favorites: []
    });
    const [sound, setSound] = useState<Audio.Sound | null>(null);
    const soundRef = useRef<Audio.Sound | null>(null);
    const musicStateRef = useRef(musicState);

    useEffect(() => {
        soundRef.current = sound;
    }, [sound]);

    useEffect(() => {
        musicStateRef.current = musicState;
    }, [musicState]);

    useEffect(() => {
        if (!currentUser) return;
        
        // Load favorites
        AsyncStorage.getItem(`ss_favorites_${currentUser.id}`).then(favs => {
            if (favs) setMusicState(prev => ({ ...prev, favorites: JSON.parse(favs) }));
        });

        musicSyncService.initialize(currentUser.id, async (remoteState) => {
            // Sync logic from AppContext...
        });

        return () => musicSyncService.cleanup();
    }, [currentUser]);

    const playSong = useCallback(async (song: Song, broadcast = true) => {
        // Implementation from AppContext...
        if (sound) await sound.unloadAsync();
        const { sound: newSound } = await Audio.Sound.createAsync({ uri: song.url }, { shouldPlay: true });
        setSound(newSound);
        setMusicState(prev => ({ ...prev, currentSong: song, isPlaying: true }));
        if (broadcast) musicSyncService.broadcastUpdate({ currentSong: song, isPlaying: true, position: 0 });
    }, [sound]);

    const togglePlayMusic = useCallback(async () => {
        if (!sound) return;
        if (musicState.isPlaying) await sound.pauseAsync();
        else await sound.playAsync();
        setMusicState(prev => ({ ...prev, isPlaying: !prev.isPlaying }));
    }, [sound, musicState.isPlaying]);

    const toggleFavoriteSong = useCallback(async (song: Song) => {
        // Implementation from AppContext...
        setMusicState(prev => {
            const isFav = prev.favorites.some(s => s.id === song.id);
            const nextFavs = isFav ? prev.favorites.filter(s => s.id !== song.id) : [...prev.favorites, song];
            if (currentUser) {
                AsyncStorage.setItem(`ss_favorites_${currentUser.id}`, JSON.stringify(nextFavs));
            }
            return { ...prev, favorites: nextFavs };
        });
    }, [currentUser]);

    const value = {
        musicState,
        playSong,
        togglePlayMusic,
        toggleFavoriteSong,
        seekTo: async () => {}, // TODO
    };

    return <MusicContext.Provider value={value}>{children}</MusicContext.Provider>;
};

export const useMusic = () => {
    const context = useContext(MusicContext);
    if (context === undefined) {
        throw new Error('useMusic must be used within a MusicProvider');
    }
    return context;
};
