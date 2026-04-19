/**
 * MiniPlayer — Spotify-style persistent bottom bar
 *
 * Shows across all screens when a song is playing/paused.
 * Tap to open full player, swipe up to expand.
 * Features: artwork, song info, play/pause, progress line.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Image } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter, useSegments } from 'expo-router';
import { useApp } from '../context/AppContext';
import GlassView from './ui/GlassView';

const MINI_HEIGHT = 56;

export default function MiniPlayer() {
    const router = useRouter();
    const segments = useSegments();
    const { musicState, togglePlayMusic, getPlaybackPosition, activeTheme } = useApp();
    const [progress, setProgress] = useState(0);

    const song = musicState?.currentSong;
    const isPlaying = musicState?.isPlaying ?? false;

    // Don't show on music screen or chat screen (chat has its own header indicator)
    const onMusicScreen = segments.includes('music' as never);
    const onChatScreen = segments.includes('chat' as never);

    // Update progress bar
    useEffect(() => {
        if (!isPlaying || !song) { setProgress(0); return; }
        const interval = setInterval(async () => {
            try {
                const pos = await getPlaybackPosition();
                const dur = (song.duration || 240) * 1000;
                setProgress(Math.min((pos / dur) * 100, 100));
            } catch {}
        }, 1000);
        return () => clearInterval(interval);
    }, [isPlaying, song?.id]);

    const handlePress = useCallback(() => {
        router.push('/music');
    }, [router]);

    if (!song || onMusicScreen || onChatScreen) return null;

    return (
        <Animated.View
            entering={FadeInDown.duration(250)}
            exiting={FadeOutDown.duration(200)}
            style={styles.wrapper}
        >
            {/* Progress line at top */}
            <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progress}%`, backgroundColor: activeTheme?.primary || '#fff' }]} />
            </View>

            <GlassView intensity={40} tint="dark" style={styles.container}>
                <Pressable style={styles.content} onPress={handlePress}>
                    {/* Album Art */}
                    <Image
                        source={{ uri: song.image }}
                        style={styles.artwork}
                    />

                    {/* Song Info */}
                    <View style={styles.info}>
                        <Text style={styles.title} numberOfLines={1}>{song.name}</Text>
                        <Text style={styles.artist} numberOfLines={1}>{song.artist}</Text>
                    </View>

                    {/* Play/Pause */}
                    <Pressable onPress={togglePlayMusic} hitSlop={12} style={styles.playBtn}>
                        <MaterialIcons
                            name={isPlaying ? 'pause' : 'play-arrow'}
                            size={30}
                            color="#fff"
                        />
                    </Pressable>
                </Pressable>
            </GlassView>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    wrapper: {
        position: 'absolute',
        bottom: 80, // Above tab bar
        left: 8,
        right: 8,
        zIndex: 5000,
    },
    progressTrack: {
        height: 2,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        overflow: 'hidden',
    },
    progressFill: {
        height: 2,
    },
    container: {
        borderRadius: 14,
        borderTopLeftRadius: 0,
        borderTopRightRadius: 0,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        borderTopWidth: 0,
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 8,
        height: MINI_HEIGHT,
    },
    artwork: {
        width: 40,
        height: 40,
        borderRadius: 8,
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    info: {
        flex: 1,
        marginLeft: 10,
        marginRight: 8,
    },
    title: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '600',
    },
    artist: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 11,
        marginTop: 1,
    },
    playBtn: {
        padding: 4,
    },
});
