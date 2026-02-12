import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, Image, TextInput, Pressable, StyleSheet, StatusBar,
    FlatList, Dimensions, ActivityIndicator, ImageBackground,
    KeyboardAvoidingView, Platform, Keyboard, ScrollView
} from 'react-native';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, { 
    useSharedValue, 
    useAnimatedStyle, 
    withSpring, 
    FadeInDown, 
    Layout 
} from 'react-native-reanimated';
import { useApp } from '../context/AppContext';
import { getSaavnApiUrl } from '../config/api';

const { width, height } = Dimensions.get('window');

// Constants from Mockup
const MAGENTA = '#ff0080';
const BG_DARK = '#050505';

// Song Interface
interface Song {
    id: string;
    name: string;
    artist: string;
    image: string;
    url: string;
    duration?: number;
}

export default function MusicScreen() {
    const router = useRouter();
    const { musicState, currentUser, playSong, togglePlayMusic, toggleFavoriteSong, startCall, getPlaybackPosition, seekTo } = useApp();

    const [activeTab, setActiveTab] = useState<'music' | 'favorites'>('music');
    const [searchQuery, setSearchQuery] = useState('');
    const [songs, setSongs] = useState<Song[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [progress, setProgress] = useState(0);
    const lastClickTime = useRef<{ [key: string]: number }>({});
    const [keyboardVisible, setKeyboardVisible] = useState(false);

    // Animations
    const slideY = useSharedValue(height);

    useEffect(() => {
        // Open the music overlay
        slideY.value = withSpring(0, {
            damping: 15,
            stiffness: 90,
            mass: 0.6,
            velocity: 2
        });

        // Initial Load Logic:
        // 1. If song is already playing or selected, do nothing.
        // 2. If no song, fetch trending but DO NOT auto-play.
        if (!musicState.currentSong) {
             searchSongs('Trending'); 
             // Note: searchSongs sets 'songs' state but doesn't auto-play.
             // We can optionally set the first result as currentSong (paused) if we want "ready to play".
             // For now, just populating the list is safer.
        } else {
            // If we have a song, maybe show related? or just Keep current list.
            if (songs.length === 0) searchSongs('Top Hits'); 
        }

        const showSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardVisible(true));
        const hideSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardVisible(false));
        return () => {
            showSub.remove();
            hideSub.remove();
        };
    }, []);

    const overlayStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: slideY.value }]
    }));

    // Real Progress Sync
    useEffect(() => {
        let interval: any;
        if (musicState.isPlaying) {
            interval = setInterval(async () => {
                const pos = await getPlaybackPosition();
                const duration = musicState.currentSong?.duration || 240; // Default 4 mins if unknown
                // Convert duration to ms for calculation
                const progressPercent = (pos / (duration * 1000)) * 100;
                setProgress(progressPercent);
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [musicState.isPlaying, musicState.currentSong]);

    const transformSong = (s: any): Song => {
        return {
            id: s.id,
            name: s.name || s.title || 'Unknown Title',
            artist: s.artists?.primary?.map((a: any) => a.name).join(', ') || s.primaryArtists || 'Unknown Artist',
            image: s.image?.[s.image.length - 1]?.url || s.image?.[1]?.url || s.image?.[0]?.url || '',
            url: s.downloadUrl?.[s.downloadUrl.length - 1]?.url || s.downloadUrl?.[0]?.url || '',
            duration: s.duration,
        };
    };

    const searchSongs = async (query: string) => {
        if (!query.trim()) { setSongs([]); return; }
        setIsLoading(true);
        const url = `${getSaavnApiUrl()}/search/songs?query=${encodeURIComponent(query)}&limit=20`;
        try {
            const response = await fetch(url);
            const data = await response.json();
            if (data?.success && data?.data?.results && Array.isArray(data.data.results)) {
                // Deduplicate and ensure unique IDs
                const rawResults = data.data.results.map(transformSong).filter((s: Song) => s.url);
                const uniqueResults = Array.from(new Map(rawResults.map((s: Song) => [s.id, s])).values()) as Song[];
                setSongs(uniqueResults);
            } else {
                setSongs([]);
            }
        } catch (error) { 
            console.error('[Music] Search Error:', error);
            setSongs([]); 
        }
        setIsLoading(false);
    };

    const handleSongInteraction = (song: Song) => {
        const now = Date.now();
        const lastTime = lastClickTime.current[song.id] || 0;
        if (now - lastTime < 300) {
            toggleFavoriteSong(song);
        } else {
            playSong(song);
        }
        lastClickTime.current[song.id] = now;
    };

    const isFavorite = (songId: string) => musicState.favorites.some(s => s.id === songId);
    const displaySongs = activeTab === 'favorites' ? musicState.favorites : songs;

    const handleSeek = (e: any) => {
        const { locationX } = e.nativeEvent;
        const barWidth = width - 48; // Screen width - padding (24 * 2)
        const percent = Math.max(0, Math.min(1, locationX / barWidth));
        const duration = musicState.currentSong?.duration || 240;
        seekTo(percent * duration * 1000);
        setProgress(percent * 100);
    };

    const renderOverlayHeader = () => (
        <View style={styles.overlayHeader}>
            {/* Player Info Row */}
            <View style={styles.playerInfoRow}>
                <View style={styles.artworkWrapper}>
                    <Image
                        source={{ uri: musicState.currentSong?.image || 'https://images.unsplash.com/photo-1614850523296-d8c1af93d400?w=400&h=400&fit=crop' }}
                        style={styles.artwork}
                    />
                    <LinearGradient colors={['transparent', 'rgba(255,0,128,0.2)']} style={StyleSheet.absoluteFill} />
                    <View style={styles.artworkBadge}>
                        <MaterialIcons name="equalizer" size={16} color="#fff" />
                    </View>
                </View>

                <View style={styles.playerTextContainer}>
                    <Text style={styles.overlayTrackTitle} numberOfLines={1}>
                        {musicState.currentSong?.name || "Midnight City"}
                    </Text>
                    <Text style={styles.overlayTrackArtist} numberOfLines={1}>
                        {musicState.currentSong?.artist || "M83"}
                    </Text>
                    
                    <View style={styles.progressBarWrapper}>
                        <Pressable onPress={handleSeek} hitSlop={{ top: 10, bottom: 10 }}>
                            <View style={styles.progressBarBg}>
                                <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
                            </View>
                        </Pressable>
                        <View style={styles.timeLabels}>
                            <Text style={styles.timeText}>1:24</Text>
                            <Text style={styles.timeText}>4:03</Text>
                        </View>
                    </View>
                </View>
            </View>

            {/* Controls Row */}
            <View style={styles.controlsRow}>
                <Pressable><MaterialIcons name="skip-previous" size={36} color="rgba(255,255,255,0.4)" /></Pressable>
                <Pressable onPress={togglePlayMusic} style={styles.playButton}>
                    <MaterialIcons name={musicState.isPlaying ? "pause" : "play-arrow"} size={44} color="#000" />
                </Pressable>
                <Pressable><MaterialIcons name="skip-next" size={36} color="rgba(255,255,255,0.4)" /></Pressable>
            </View>

            {/* Search Section */}
            <View style={styles.searchSection}>
                <BlurView intensity={20} tint="light" style={styles.searchBar}>
                    <MaterialIcons name="search" size={20} color="rgba(255,0,128,0.8)" />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search songs, artists..."
                        placeholderTextColor="rgba(255,255,255,0.3)"
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        onSubmitEditing={() => searchSongs(searchQuery)}
                        returnKeyType="search"
                    />
                </BlurView>
            </View>

            <View style={styles.listHeader}>
                <Text style={styles.listTitle}>{activeTab === 'music' ? 'ALL MUSIC' : 'FAVORITES'}</Text>
                <MaterialIcons name="filter-list" size={18} color="rgba(255,255,255,0.2)" />
            </View>
        </View>
    );

    const renderSongItem = ({ item, index }: { item: Song, index: number }) => {
        const isCurrent = musicState.currentSong?.id === item.id;
        return (
            <Animated.View 
                // entering={FadeInDown.delay(index * 60).springify().damping(14)} // Removed bounce per user request
                layout={Layout.springify()}
            >
                <Pressable 
                    onPress={() => handleSongInteraction(item)}
                    style={[styles.songItem, isCurrent && styles.songItemActive]}
                >
                    <Image source={{ uri: item.image }} style={styles.songThumb} />
                    <View style={styles.songInfo}>
                        <Text style={styles.songName} numberOfLines={1}>{item.name}</Text>
                        <Text style={styles.songArtistName} numberOfLines={1}>{item.artist}</Text>
                    </View>
                    <View style={styles.songAction}>
                        {isFavorite(item.id) ? (
                            <MaterialIcons name="favorite" size={18} color={MAGENTA} />
                        ) : (
                            <MaterialIcons name="favorite" size={18} color="rgba(255,255,255,0.1)" />
                        )}
                    </View>
                </Pressable>
            </Animated.View>
        );
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" />
            
            {/* Blurred Background */}
            <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />

            {/* Transparent Pressable to close the overlay */}
            <Pressable style={StyleSheet.absoluteFill} onPress={() => router.back()} />

            {/* Music Overlay (82% Height) */}
            <Animated.View style={[styles.musicOverlay, overlayStyle]}>
                <BlurView intensity={95} tint="dark" style={styles.overlayGlass}>
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
                        <View style={styles.dragHandle} />

                        <FlatList
                            data={displaySongs}
                            renderItem={renderSongItem}
                            keyExtractor={item => item.id}
                            ListHeaderComponent={renderOverlayHeader}
                            contentContainerStyle={styles.listContent}
                            showsVerticalScrollIndicator={false}
                            keyboardShouldPersistTaps="handled"
                            ListFooterComponent={<View style={{ height: 120 }} />}
                            ListEmptyComponent={isLoading ? (
                                <ActivityIndicator color={MAGENTA} style={{ marginTop: 20 }} />
                            ) : null}
                        />

                        {/* Liquid Tabs Navigation */}
                        {!keyboardVisible && (
                            <View style={styles.tabBarContainer}>
                                <BlurView intensity={40} tint="dark" style={styles.tabPill}>
                                    <Pressable 
                                        onPress={() => setActiveTab('favorites')}
                                        style={[styles.tabBtn, activeTab === 'favorites' && styles.tabBtnActive]}
                                    >
                                        <MaterialIcons name="favorite" size={20} color={activeTab === 'favorites' ? MAGENTA : 'rgba(255,255,255,0.4)'} />
                                        <Text style={[styles.tabText, activeTab === 'favorites' && styles.tabTextActive]}>Favorites</Text>
                                    </Pressable>
                                    <Pressable 
                                        onPress={() => setActiveTab('music')}
                                        style={[styles.tabBtn, activeTab === 'music' && styles.tabBtnActive]}
                                    >
                                        <MaterialIcons name="library-music" size={20} color={activeTab === 'music' ? MAGENTA : 'rgba(255,255,255,0.4)'} />
                                        <Text style={[styles.tabText, activeTab === 'music' && styles.tabTextActive]}>Music</Text>
                                    </Pressable>
                                </BlurView>
                            </View>
                        )}
                    </KeyboardAvoidingView>
                </BlurView>
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent' },
    
    // Music Overlay
    musicOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '82%', zIndex: 60, borderTopLeftRadius: 40, borderTopRightRadius: 40, overflow: 'hidden' },
    overlayGlass: { flex: 1, backgroundColor: 'rgba(15,15,15,0.3)', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' },
    dragHandle: { width: 48, height: 6, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 3, alignSelf: 'center', marginTop: 12, marginBottom: 24 },
    listContent: { paddingHorizontal: 24 },
    overlayHeader: { width: '100%', alignItems: 'center' },
    
    playerInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 20, width: '100%', marginBottom: 32 },
    artworkWrapper: { width: 112, height: 112, borderRadius: 20, position: 'relative', overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', shadowColor: MAGENTA, shadowOpacity: 0.3, shadowRadius: 20, shadowOffset: { width: 0, height: 10 } },
    artwork: { width: '100%', height: '100%' },
    artworkBadge: { position: 'absolute', bottom: -5, right: -5, width: 32, height: 32, borderRadius: 16, backgroundColor: MAGENTA, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#0f0f0f' },
    playerTextContainer: { flex: 1 },
    overlayTrackTitle: { color: '#fff', fontSize: 20, fontWeight: '700', letterSpacing: -0.5 },
    overlayTrackArtist: { color: MAGENTA, fontSize: 14, fontWeight: '600', marginTop: 2 },
    
    progressBarWrapper: { width: '100%', marginTop: 16 },
    progressBarBg: { width: '100%', height: 6, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' },
    progressBarFill: { height: '100%', backgroundColor: MAGENTA, borderRadius: 3, shadowColor: MAGENTA, shadowOpacity: 0.8, shadowRadius: 10 },
    timeLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
    timeText: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: '600' },

    controlsRow: { flexDirection: 'row', alignItems: 'center', gap: 40, marginBottom: 32 },
    playButton: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: '#fff', shadowOpacity: 0.2, shadowRadius: 15 },

    searchSection: { width: '100%', marginBottom: 24 },
    searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 25, paddingHorizontal: 16, height: 50, borderWidth: 1, borderColor: 'rgba(255,0,128,0.4)', shadowColor: MAGENTA, shadowOpacity: 0.1, shadowRadius: 10, overflow: 'hidden' },
    searchInput: { flex: 1, color: '#fff', marginLeft: 12, fontSize: 14, fontWeight: '500' },

    listHeader: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 16, paddingHorizontal: 8 },
    listTitle: { color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: '800', letterSpacing: 2 },

    songItem: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)' },
    songItemActive: { backgroundColor: 'rgba(255,0,128,0.1)', borderColor: 'rgba(255,0,128,0.2)' },
    songThumb: { width: 48, height: 48, borderRadius: 8 },
    songInfo: { flex: 1, marginLeft: 16 },
    songName: { color: '#fff', fontSize: 14, fontWeight: '600' },
    songArtistName: { color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 2 },
    songAction: { paddingLeft: 10 },

    tabBarContainer: { position: 'absolute', bottom: 40, left: 0, right: 0, alignItems: 'center' },
    tabPill: { flexDirection: 'row', width: '85%', borderRadius: 40, padding: 6, backgroundColor: 'rgba(20,20,20,0.6)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
    tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, gap: 8, borderRadius: 34 },
    tabBtnActive: { backgroundColor: 'rgba(255,0,128,0.2)', borderWidth: 1, borderColor: 'rgba(255,0,128,0.5)' },
    tabText: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.5 },
    tabTextActive: { color: MAGENTA },
});
