import React, { useState, useRef, useEffect, useCallback, useLayoutEffect, useMemo } from 'react';
// Force re-bundle: 2026-03-10T21:48:59+05:30
import * as ImageManipulator from 'expo-image-manipulator';
import {
    View, Text, TextInput, Pressable, AppState,
    StyleSheet, StatusBar, Platform,
    Modal, Animated as RNAnimated, Dimensions, Keyboard, KeyboardEvent, Alert, InteractionManager, ScrollView, FlatList,
    Image as RNImage, KeyboardAvoidingView, PanResponder
} from 'react-native';
import { SoulLoader } from '../../components/ui/SoulLoader';
import { Image } from 'expo-image';
import { FlashList } from '@shopify/flash-list';

import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaskedView from '@react-native-masked-view/masked-view';
import GlassView from '../../components/ui/GlassView';
import { PressableFlash } from '../../components/ui/IOS26Primitives';
import ConnectionBanner from '../../components/ConnectionBanner';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import LottieView from 'lottie-react-native';
import * as MediaLibrary from 'expo-media-library';
import {
    documentDirectory,
    getInfoAsync,
    makeDirectoryAsync,
    deleteAsync,
    readDirectoryAsync,
    copyAsync,
    cacheDirectory,
    downloadAsync
} from 'expo-file-system';
import { hapticService } from '../../services/HapticService';
import * as Haptics from 'expo-haptics';
import * as DocumentPicker from 'expo-document-picker';
import * as Crypto from 'expo-crypto';
import { soulFolderService } from '../../services/SoulFolderService';
import VoiceNotePlayer from '../../components/chat/VoiceNotePlayer';
import ProgressiveBlur from '../../components/chat/ProgressiveBlur';
import MessageBubble from '../../components/chat/MessageBubble';
import MessageContextMenu from '../../components/chat/MessageContextMenu';
import { ChatStyles, SCREEN_WIDTH, SCREEN_HEIGHT } from '../../components/chat/ChatStyles';
import { formatDuration } from '../../utils/formatters';
import { applyGroupedMediaLocalUri, getMessageMediaItems, sanitizeSongTitle, isMessageEmpty } from '../../utils/chatUtils';
import { proxySupabaseUrl } from '../../config/api';

import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    withDelay,
    withRepeat,
    withSequence,
    withSpring,
    interpolate,
    interpolateColor,
    Extrapolation,
    Easing,
    FadeInDown,
    FadeOutDown,
    FadeInUp,
    FadeOutUp,
    LinearTransition,
    runOnJS,
    useAnimatedProps,
    useDerivedValue,
    Extrapolate,
} from 'react-native-reanimated';

const AnimatedPath = Animated.createAnimatedComponent(Path);
import 'react-native-gesture-handler';

import { useApp, USERS } from '../../context/AppContext';
import { usePresence } from '../../context/PresenceContext';
import { supabase, LEGACY_TO_UUID } from '../../config/supabase';
import { normalizeId } from '../../utils/idNormalization';
import { SoulAvatar } from '../../components/SoulAvatar';
import { resolveAvatarImageUri, warmAvatarSource } from '../../utils/avatarSource';
import { chatService } from '../../services/ChatService';
import { chatTransitionState } from '../../services/chatTransitionState';
import { profileAvatarTransitionState } from '../../services/profileAvatarTransitionState';
import { MusicPlayerOverlay } from '../../components/MusicPlayerOverlay';
import { MediaPickerSheet } from '../../components/MediaPickerSheet';
import { MediaPreviewModal } from '../../components/MediaPreviewModal';
import { downloadQueue } from '../../services/DownloadQueueService';
import { EnhancedMediaViewer } from '../../components/EnhancedMediaViewer';
import {
    getProfileAvatarTransitionTag,
    SUPPORT_PROFILE_AVATAR_SHARED_TRANSITION,
    SUPPORT_SHARED_TRANSITIONS,
    PROFILE_AVATAR_SHARED_TRANSITION,
} from '../../constants/sharedTransitions';
import { Contact, Message } from '../../types';
import { ResizeMode, Video, Audio } from 'expo-av';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Path, Stop } from 'react-native-svg';
import GlassAlert, { AlertButton } from '../../components/ui/GlassAlert';

const IS_IOS = Platform.OS === 'ios';
const ENABLE_SHARED_TRANSITIONS = SUPPORT_SHARED_TRANSITIONS;
const ENABLE_INNER_SHARED_TRANSITIONS = SUPPORT_SHARED_TRANSITIONS;
const ENABLE_PROFILE_AVATAR_SHARED_TRANSITION = SUPPORT_PROFILE_AVATAR_SHARED_TRANSITION;
const MEDIA_GROUP_MARKER = '__MEDIA_GROUP_V1__:';
const IOS_KEYBOARD_SAFE_ADJUST = 0;
const HEADER_PILL_RADIUS = 28;
const HEADER_PILL_TOP = 52;
const HEADER_PILL_HEIGHT = 60;
const LIST_PILL_HEIGHT = 72;
const LIST_PILL_RADIUS = 36;
const MORPH_IN_OUT_DURATION = 500;
const MORPH_OUT_HANDOFF = Math.round(MORPH_IN_OUT_DURATION * 0.94);
const BACK_BTN_SIZE = 46;
const BACK_BTN_GAP = 10;
const MAIN_PILL_LEFT = 16 + BACK_BTN_SIZE + BACK_BTN_GAP;

type ChatMediaItem = {
    url: string;
    type: 'image' | 'video' | 'audio' | 'file';
    caption?: string;
    name?: string;
};

// Extracted to avoid calling useAnimatedStyle inside .map() (Rules of Hooks violation)
const OptionMenuItem = React.memo(({ opt, index, isExpanded }: { opt: { name: string; label: string; color: string; bg: string; action: () => void }; index: number; isExpanded: boolean }) => {
    const itemAnimatedStyle = useAnimatedStyle(() => {
        const delay = index * 45;
        const expanded = isExpanded;
        const itemSpring = { damping: 12, stiffness: 180, mass: 0.5 };

        return {
            transform: [
                { scale: withDelay(delay, withSpring(expanded ? 1 : 0, itemSpring)) },
                { translateY: withDelay(delay, withSpring(expanded ? 0 : 15, itemSpring)) }
            ] as any,
            opacity: withDelay(delay, withSpring(expanded ? 1 : 0, { damping: 20 }))
        };
    }, [isExpanded]);

    return (
        <Pressable style={styles.optionItem} onPress={opt.action}>
            <Animated.View style={[styles.optionIcon, { backgroundColor: opt.bg }, itemAnimatedStyle as any]}>
                <MaterialIcons name={opt.name as any} size={20} color={opt.color} />
            </Animated.View>
            <Text style={styles.optionText}>{opt.label}</Text>
        </Pressable>
    );
});


interface SingleChatScreenProps {
    id?: string;
    isOverlay?: boolean;
    user?: Contact;
    onBack?: () => void;
    onBackStart?: () => void;
    sourceY?: number;
}


const AnyFlashList = FlashList as any;

// Format "last seen" relative time (e.g. "today at 2:30 PM", "yesterday at 11:00 AM")
const formatLastSeen = (isoString: string): string => {
    try {
        const date = new Date(isoString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 1) return 'just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const isToday = date.toDateString() === now.toDateString();
        if (isToday) return `today at ${timeStr}`;
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        if (date.toDateString() === yesterday.toDateString()) return `yesterday at ${timeStr}`;
        return `${date.toLocaleDateString([], { day: 'numeric', month: 'short' })} at ${timeStr}`;
    } catch {
        return 'offline';
    }
};

const TYPING_LOTTIE = require('../../assets/animations/typing-dots.json');

const TypingDots = () => {
    return (
        <LottieView
            source={TYPING_LOTTIE}
            autoPlay
            loop
            speed={0.9}
            style={styles.typingLottie}
        />
    );
};

const SiriWaveform = ({ level, active, themeColor }: { level: number; active: boolean; themeColor: string }) => {
    const phase = useSharedValue(0);
    const width = 200;
    const height = 40;
    const centerY = height / 2;

    useEffect(() => {
        if (!active) {
            phase.value = 0;
            return;
        }
        phase.value = withRepeat(
            withTiming(20, { duration: 2500, easing: Easing.linear }),
            -1,
            false
        );
    }, [active]);

    const amplitude = useDerivedValue(() => {
        const clampedLevel = Math.max(0, Math.min(1, level));
        return 4 + clampedLevel * 14;
    }, [level]);

    const buildWavePath = (phaseOffset: number, ampFactor: number, freq: number) => {
        'worklet';
        const p = phase.value;
        const amp = amplitude.value;
        const step = 6;
        let path = `M 0 ${centerY}`;
        for (let x = 0; x <= width; x += step) {
            const theta = (x / width) * Math.PI * 2 * freq + p + phaseOffset;
            const theta2 = (x / width) * Math.PI * 2 * (freq * 1.7) + p * 0.7 + phaseOffset;
            const y = centerY + Math.sin(theta) * amp * ampFactor + Math.sin(theta2) * amp * 0.2;
            path += ` L ${x} ${y}`;
        }
        return path;
    };

    const animatedProps1 = useAnimatedProps(() => ({
        d: buildWavePath(2.1, 0.48, 0.85)
    }));
    const animatedProps2 = useAnimatedProps(() => ({
        d: buildWavePath(1.2, 0.72, 1.1)
    }));
    const animatedProps3 = useAnimatedProps(() => ({
        d: buildWavePath(0, 1, 1.4)
    }));

    return (
        <View style={styles.siriWaveWrap}>
            <Svg width={width} height={height}>
                <Defs>
                    <SvgLinearGradient id="siriGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <Stop offset="0%" stopColor={themeColor} stopOpacity="0" />
                        <Stop offset="10%" stopColor={themeColor} stopOpacity="0.58" />
                        <Stop offset="50%" stopColor={themeColor} stopOpacity="1" />
                        <Stop offset="90%" stopColor={themeColor} stopOpacity="0.58" />
                        <Stop offset="100%" stopColor={themeColor} stopOpacity="0" />
                    </SvgLinearGradient>
                </Defs>
                <AnimatedPath animatedProps={animatedProps1} fill="none" stroke="url(#siriGradient)" strokeWidth={3} opacity={0.28} />
                <AnimatedPath animatedProps={animatedProps2} fill="none" stroke="url(#siriGradient)" strokeWidth={4} opacity={0.5} />
                <AnimatedPath animatedProps={animatedProps3} fill="none" stroke="url(#siriGradient)" strokeWidth={5} opacity={0.95} />
            </Svg>
        </View>
    );
};

// One word in a karaoke line. Top-level Animated.Text (not nested inside a Text)
// so Reanimated's UI-thread color updates actually paint on iOS.
const KaraokeWord = React.memo(({ word, index, total, progress, color, baseColor, fontSize }: any) => {
    const animatedStyle = useAnimatedStyle(() => {
        const slot = total > 0 ? (index + 0.5) / total : 0;
        // Word lights up just before its slot is reached, then stays lit.
        const fade = interpolate(progress.value, [slot - 0.12, slot], [0, 1], Extrapolation.CLAMP);
        return {
            color: interpolateColor(fade, [0, 1], [baseColor, color]),
        };
    });
    return (
        <Animated.Text style={[{ fontSize, fontWeight: '700', letterSpacing: 0.3 }, animatedStyle]}>
            {word}
        </Animated.Text>
    );
});

// Karaoke header line. Each word is its own sibling Animated.Text in a row
// (not nested in a Text), so per-word color animations apply on iOS. Font size
// is computed from the measured container width so long Devanagari lines still
// fit without wrapping.
const KaraokeLine = React.memo(({ text, lineStart, lineEnd, color, baseColor, getPlaybackPosition, isPlaying }: any) => {
    const progress = useSharedValue(0);
    const [containerWidth, setContainerWidth] = useState(180);

    useEffect(() => {
        progress.value = 0;
        const span = Math.max(0.5, lineEnd - lineStart);
        const sync = async () => {
            try {
                const posMs = await getPlaybackPosition();
                const p = ((posMs / 1000) - lineStart) / span;
                progress.value = withTiming(Math.max(0, Math.min(1, p)), { duration: 100 });
            } catch { }
        };
        sync();
        if (!isPlaying) return;
        const tick = setInterval(sync, 100);
        return () => clearInterval(tick);
    }, [text, lineStart, lineEnd, isPlaying]);

    const wordTokens = useMemo(() => text.trim().split(/\s+/).filter(Boolean), [text]);

    // Estimate font size to fit the line on one row. Devanagari glyphs are wider
    // than Latin per character, so use a larger char-width factor when present.
    const fontSize = useMemo(() => {
        const isDevanagari = /[ऀ-ॿ]/.test(text);
        const charFactor = isDevanagari ? 0.78 : 0.55;
        const usable = Math.max(40, containerWidth - 4);
        const ideal = usable / Math.max(1, text.length * charFactor);
        return Math.max(9, Math.min(14, Math.floor(ideal)));
    }, [text, containerWidth]);

    return (
        <View
            style={{ height: 20, justifyContent: 'center', overflow: 'hidden' }}
            onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
        >
            <Animated.View
                key={text + lineStart}
                entering={FadeInUp.duration(280).springify().damping(16)}
                exiting={FadeOutUp.duration(180)}
                style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'nowrap' }}
            >
                {wordTokens.map((word: string, i: number) => (
                    <KaraokeWord
                        key={i}
                        word={i < wordTokens.length - 1 ? word + ' ' : word}
                        index={i}
                        total={wordTokens.length}
                        progress={progress}
                        color={color}
                        baseColor={baseColor}
                        fontSize={fontSize}
                    />
                ))}
            </Animated.View>
        </View>
    );
});

export default function SingleChatScreen({ id: propsId, isOverlay, user: propsUser, onBack, onBackStart, sourceY: propsSourceY }: SingleChatScreenProps) {
    const { id: paramsId, sourceY: paramsSourceY } = useLocalSearchParams();
    const insets = useSafeAreaInsets();

    // Support both direct routing (params) and inline rendering (props)
    const rawId = propsId || propsUser?.id || (Array.isArray(paramsId) ? paramsId[0] : paramsId);
    // Robust parameter parsing to prevent NaN-induced black screens or native crashes
    const parsedSourceY = paramsSourceY ? Number(Array.isArray(paramsSourceY) ? paramsSourceY[0] : paramsSourceY) : undefined;
    const sourceYValue = propsSourceY ?? (typeof parsedSourceY === 'number' && !isNaN(parsedSourceY) ? parsedSourceY : undefined);
    const sourceY = (typeof sourceYValue === 'number' && !isNaN(sourceYValue)) ? sourceYValue : undefined;
    const id = (rawId && LEGACY_TO_UUID[rawId as string]) || rawId;
    const stringId = id as string;
    const isMorphEntry = typeof sourceY === 'number' && !isNaN(sourceY);

    const router = useRouter();
    const isFocused = useIsFocused();
    const { contacts, messages, sendChatMessage, startCall, activeCall, updateMessage, addReaction, toggleHeart, deleteMessage, musicState, getPlaybackPosition, seekTo, isSeeking, setIsSeeking, currentUser, activeTheme, sendTyping, typingUsers, uploadProgressTracker, connectivity, initializeChatSession, cleanupChatSession, fetchOtherUserProfile, setMusicPartner, joinGroupMusicRoom, leaveGroupMusicRoom, requestMusicSync, startGroupCall, sendMediaLikePulse, remoteLikePulse, offlineService, refreshLocalCache, playbackOwnerChatId, lyrics, currentLyricIndex, showLyrics } = useApp() as any;
    // Only show music UI in this chat if this chat owns the current playback.
    const musicVisibleHere = !!musicState?.currentSong && playbackOwnerChatId === rawId;
    // Karaoke mode in the header: lyrics toggle is on, song has lyrics, this chat owns playback.
    const currentLine = lyrics?.[currentLyricIndex];
    const nextLine = lyrics?.[currentLyricIndex + 1];
    const karaokeText: string = (
        musicVisibleHere && showLyrics && lyrics?.length > 0 && currentLine?.text
    ) || '';
    const karaokeLineStart: number = currentLine?.time ?? 0;
    const karaokeLineEnd: number = nextLine?.time ?? (karaokeLineStart + (Number(musicState?.currentSong?.duration) || 5));
    const themeAccent = activeTheme?.primary || '#BC002A';
    const themeAccentSoft = activeTheme?.accent || '#FF6A88';
    const { getPresence } = usePresence();
    const [alertConfig, setAlertConfig] = useState<{
        visible: boolean;
        title: string;
        message?: string;
        buttons?: AlertButton[];
    }>({ visible: false, title: '' });

    const showSoulAlert = useCallback((title: string, message?: string, buttons?: AlertButton[]) => {
        setAlertConfig({ visible: true, title, message, buttons });
    }, []);

    const closeSoulAlert = useCallback(() => {
        setAlertConfig(prev => ({ ...prev, visible: false }));
    }, []);
    const [inputText, setInputText] = useState('');
    const [showCallModal, setShowCallModal] = useState(false);
    const [isReady, setIsReady] = useState(false);
    const [isAdmin, setIsAdmin] = useState(false);
    const [memberRoles, setMemberRoles] = useState<Record<string, string>>({});
    const [isLoadingProfile, setIsLoadingProfile] = useState(false);
    const [remoteContact, setRemoteContact] = useState<Contact | null>(null);



    // Defer heavy rendering (FlatList) until transition completes, but show basic UI immediately
    useEffect(() => {
        // Fast-path: Set ready status after a short delay on Android to avoid total black screens
        // during heavy initialization.
        const timeout = setTimeout(() => {
            setIsReady(true);
        }, Platform.OS === 'android' ? 250 : 400);

        const task = InteractionManager.runAfterInteractions(() => {
            setIsReady(true);
        });

        return () => {
            task.cancel();
            clearTimeout(timeout);
        };
    }, []);

    // Safety Fallback: Ensure screen becomes visible even if animations fail on Android
    useEffect(() => {
        if (isMorphEntry) {
            const fallback = setTimeout(() => {
                if (backgroundMorphProgress.value === 0) {
                    console.log('[Chat] ⚠️ Animation fallback triggered to fix black screen');
                    backgroundMorphProgress.value = withTiming(1, { duration: 300 });
                    headerAccessoryOpacity.value = withTiming(1, { duration: 300 });
                    headerPillProgress.value = withTiming(1, { duration: 300 });
                    headerPillOffsetY.value = withTiming(0, { duration: 300 });
                }
            }, 800);
            return () => clearTimeout(fallback);
        }
    }, [isMorphEntry]);

    const [callOptionsPosition, setCallOptionsPosition] = useState({ x: 0, y: 0 });
    const [isExpanded, setIsExpanded] = useState(false);
    const [isOverlayKeyboardVisible, setIsOverlayKeyboardVisible] = useState(false);

    // Morph Animation — iOS-style smooth bezier, no spring jitter
    const HEADER_TOP = 50;
    const ITEM_HEIGHT = 72;
    const ITEM_MARGIN = 16;
    const ITEM_RADIUS = 36;

    const keyboardOffset = useSharedValue(0);
    const headerAccessoryOpacity = useSharedValue(isMorphEntry ? 0 : 1);
    const backgroundMorphProgress = useSharedValue(isMorphEntry ? 0 : 1);
    const headerPillOffsetY = useSharedValue(
        isMorphEntry ? Math.max(0, sourceY - HEADER_PILL_TOP) : 0
    );
    const headerPillProgress = useSharedValue(isMorphEntry ? 0 : 1);
    const selectionModeProgress = useSharedValue(0);

    const inputAreaAnimatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: -keyboardOffset.value }],
    }));

    const messagesContainerAnimatedStyle = useAnimatedStyle(() => ({
        paddingBottom: keyboardOffset.value,
    }));

    const headerAccessoryAnimatedStyle = useAnimatedStyle(() => {
        const progress = headerAccessoryOpacity.value;
        return {
            opacity: interpolate(progress, [0, 0.4, 1], [0, 0, 1], Extrapolation.CLAMP),
            transform: [
                {
                    translateX: interpolate(
                        progress,
                        [0, 1],
                        [-24, 0],
                        Extrapolation.CLAMP
                    )
                },
                {
                    scale: interpolate(
                        progress,
                        [0, 1],
                        [0.85, 1],
                        Extrapolation.CLAMP
                    )
                }
            ] as any,
        };
    });

    const backgroundMorphAnimatedStyle = useAnimatedStyle(() => ({
        opacity: backgroundMorphProgress.value,
        transform: [
            {
                translateY: interpolate(
                    backgroundMorphProgress.value,
                    [0, 1],
                    [20, 0],
                    Extrapolation.CLAMP
                ),
            },
            {
                scale: interpolate(
                    backgroundMorphProgress.value,
                    [0, 1],
                    [0.986, 1],
                    Extrapolation.CLAMP
                ),
            },
        ] as any,
    }));

    const [isCallExpanded, setIsCallExpanded] = useState(false);
    const callMorphProgress = useSharedValue(0);


    const toggleCallMenu = useCallback(() => {
        const next = !isCallExpanded;
        setIsCallExpanded(next);
        callMorphProgress.value = withSpring(next ? 1 : 0, { 
            damping: 18, 
            stiffness: 120,
            mass: 0.8
        });
    }, [isCallExpanded]);

    const animatedCallMorphStyle = useAnimatedStyle(() => {
        const p = callMorphProgress.value;
        const entryProgress = backgroundMorphProgress.value;
        const offsetY = headerPillOffsetY.value;

        return {
            width: interpolate(p, [0, 1], [44, 180], Extrapolation.CLAMP),
            height: interpolate(p, [0, 1], [44, 170], Extrapolation.CLAMP),
            borderRadius: interpolate(p, [0, 1], [22, 24], Extrapolation.CLAMP),
            backgroundColor: interpolateColor(p, [0, 1], ['rgba(255, 255, 255, 0.08)', 'transparent']),
            position: 'absolute',
            top: HEADER_PILL_TOP + (HEADER_PILL_HEIGHT - 44) / 2 + offsetY,
            right: 24 + 10,
            opacity: interpolate(entryProgress, [0, 0.6, 1], [0, 0, 1], Extrapolation.CLAMP),
            overflow: 'hidden',
            zIndex: 9999,
            borderWidth: 1.2,
            borderColor: 'rgba(255, 255, 255, 0.22)',
            transform: [
                { scale: interpolate(entryProgress, [0, 1], [0.8, 1], Extrapolation.CLAMP) }
            ] as any,
        };
    });

    const animatedCallContentOpacity = useAnimatedStyle(() => ({
        opacity: interpolate(callMorphProgress.value, [0.4, 1], [0, 1], Extrapolation.CLAMP),
        transform: [{ scale: interpolate(callMorphProgress.value, [0, 1], [0.8, 1], Extrapolation.CLAMP) }]
    }));

    const headerMorphAnimatedStyle = useAnimatedStyle(() => {
        const progress = headerPillProgress.value;
        const selProgress = selectionModeProgress.value;

        return {
            transform: [
                { translateY: headerPillOffsetY.value },
                { translateX: interpolate(selProgress, [0, 1], [0, -(MAIN_PILL_LEFT - 16)], Extrapolation.CLAMP) }
            ] as any,
            height: interpolate(
                progress,
                [0, 1],
                [LIST_PILL_HEIGHT, HEADER_PILL_HEIGHT],
                Extrapolation.CLAMP
            ),
            borderRadius: interpolate(
                progress,
                [0, 1],
                [LIST_PILL_RADIUS, HEADER_PILL_RADIUS],
                Extrapolation.CLAMP
            ),
        };
    });

    useEffect(() => {
        if (isMorphEntry) {
            headerPillOffsetY.value = withTiming(0, {
                duration: MORPH_IN_OUT_DURATION,
                easing: Easing.bezier(0.5, 0, 0.1, 1),
            });
            headerPillProgress.value = withTiming(1, {
                duration: MORPH_IN_OUT_DURATION,
                easing: Easing.bezier(0.5, 0, 0.1, 1),
            }, (finished) => {
                if (finished) {
                    runOnJS(setAnimationFinished)(true);
                }
            });
            backgroundMorphProgress.value = withTiming(1, {
                duration: MORPH_IN_OUT_DURATION,
                easing: Easing.bezier(0.5, 0, 0.1, 1),
            });
            // Symmetrical entry for back button to match exit feel
            headerAccessoryOpacity.value = withTiming(1, { duration: 180 });
            return;
        }
        headerPillOffsetY.value = 0;
        headerPillProgress.value = 1;
        backgroundMorphProgress.value = 1;
        headerAccessoryOpacity.value = 1;
    }, [backgroundMorphProgress, headerAccessoryOpacity, headerPillOffsetY, headerPillProgress, isMorphEntry]);

    useEffect(() => {
        const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

        const onShow = (event: KeyboardEvent) => {
            // Android uses "resize" mode (set in app.json), so the OS handles keyboard avoidance.
            // We only need the manual offset for iOS.
            if (Platform.OS !== 'ios') return;

            const rawHeight = event.endCoordinates?.height || 0;
            // iOS can emit multiple keyboard frame updates while the user types
            // (predictive bar / input accessory changes). Re-subtracting the current
            // offset makes the composer fall back down even though the keyboard stays open.
            const height = Math.max(0, rawHeight);
            const duration = event.duration || 250;
            if (isOverlay) {
                setIsOverlayKeyboardVisible(true);
                requestAnimationFrame(() => {
                    flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
                });
            }
            keyboardOffset.value = withTiming(height, { duration });
        };

        const onHide = () => {
            if (isOverlay) {
                setIsOverlayKeyboardVisible(false);
            }
            keyboardOffset.value = withTiming(0, { duration: 200 });
        };

        const showSub = Keyboard.addListener(showEvent, onShow);
        const hideSub = Keyboard.addListener(hideEvent, onHide);

        return () => {
            showSub.remove();
            hideSub.remove();
        };
    }, [isOverlay, keyboardOffset]);

    const navigation = useNavigation();

    // Cleanup when back morph
    const finishBack = useCallback(() => {
        console.log('[ChatScreen] finishBack triggered - isOverlay:', isOverlay);
        if (onBack) {
            onBack();
        } else if (navigation.canGoBack()) {
            navigation.goBack();
        } else {
            console.warn('Navigation: Cannot go back, history stack is empty.');
        }
    }, [onBack, navigation]);

    const [replyingTo, setReplyingTo] = useState<any>(null);
    const [editingMessage, setEditingMessage] = useState<Message | null>(null);
    const [selectedContextMessage, setSelectedContextMessage] = useState<{ msg: any, layout: any } | null>(null);
    const [showMusicPlayer, setShowMusicPlayer] = useState(false);
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
    const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
    const isNavigatingRef = useRef(false);
    const [topDateLabel, setTopDateLabel] = useState('');
    const [animationFinished, setAnimationFinished] = useState(!isMorphEntry);

    useEffect(() => {
        selectionModeProgress.value = withTiming(selectionMode ? 1 : 0, {
            duration: 350,
            easing: Easing.bezier(0.22, 1, 0.36, 1),
        });
    }, [selectionMode]);

    const formatDateLabel = useCallback((d: Date) => {
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        if (d.toDateString() === today.toDateString()) return 'Today';
        if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
        return d.toLocaleDateString(undefined, {
            weekday: 'long',
            month: 'short',
            day: 'numeric',
            year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
        });
    }, []);

    const onViewableItemsChanged = useCallback(({ viewableItems }: any) => {
        // Guard: Only update if transition is ready and there's a message
        if (isReady && viewableItems && viewableItems.length > 0) {
            const topViewable = viewableItems[viewableItems.length - 1];
            if (topViewable && topViewable.item && topViewable.item.timestamp) {
                const dateLabel = formatDateLabel(new Date(topViewable.item.timestamp));
                setTopDateLabel(prev => prev !== dateLabel ? dateLabel : prev);
            }
        }
    }, [isReady, formatDateLabel]);

    const onViewableItemsChangedRef = useRef(onViewableItemsChanged);
    useEffect(() => { onViewableItemsChangedRef.current = onViewableItemsChanged; }, [onViewableItemsChanged]);

    const viewabilityConfigCallbackPairs = useRef([
        {
            viewabilityConfig: { itemVisiblePercentThreshold: 10, minimumViewTime: 0 },
            onViewableItemsChanged: (info: any) => onViewableItemsChangedRef.current(info)
        }
    ]);

    // Animate OUT — butter smooth unified morph back to pill
    const handleBack = useCallback(() => {
        if (isNavigatingRef.current) return;

        if (selectionMode) {
            setSelectionMode(false);
            setSelectedMessageIds([]);
            return;
        }

        isNavigatingRef.current = true;
        if (onBackStart) onBackStart();

        // Close transient overlays before navigating back to avoid stale touch blockers.
        setShowCallModal(false);
        setSelectedContextMessage(null);
        setShowMediaPicker(false);
        setMediaPreview(null);
        setMediaCollection(null);
        setMediaViewer(null);

        // OUT = reverse of IN (same easing + same duration + same path).
        if (isMorphEntry && sourceY !== undefined) {
            chatTransitionState.setPhase('returning');
            // Fade out accessory slightly slower for smoother merge
            headerAccessoryOpacity.value = withTiming(0, { duration: 180 });
            backgroundMorphProgress.value = withTiming(0, {
                duration: MORPH_IN_OUT_DURATION,
                easing: Easing.bezier(0.5, 0, 0.1, 1),
            });
            headerPillOffsetY.value = withTiming(Math.max(0, sourceY - HEADER_PILL_TOP), {
                duration: MORPH_IN_OUT_DURATION,
                easing: Easing.bezier(0.5, 0, 0.1, 1),
            });
            headerPillProgress.value = withTiming(0, {
                duration: MORPH_IN_OUT_DURATION,
                easing: Easing.bezier(0.5, 0, 0.1, 1),
            });
            // Small handoff delay keeps the return motion closer to the
            // entry feel without changing the pill animation itself.
            // Overlays (like Status View) need the component to stay mounted
            // for the FULL duration to see the animation finish.
            const handoffDelay = isOverlay ? MORPH_IN_OUT_DURATION : MORPH_OUT_HANDOFF;
            setTimeout(() => finishBack(), handoffDelay);
            return;
        }
        chatTransitionState.setPhase('returning');
        headerAccessoryOpacity.value = withTiming(0, { duration: 180 });
        backgroundMorphProgress.value = withTiming(0, {
            duration: 250,
            easing: Easing.bezier(0.5, 0, 0.1, 1),
        });
        setTimeout(() => finishBack(), 220);
    }, [
        backgroundMorphProgress,
        finishBack,
        headerAccessoryOpacity,
        headerPillOffsetY,
        headerPillProgress,
        isMorphEntry,
        onBackStart,
        selectionMode,
        sourceY,
    ]);

    // Defensive cleanup: if the screen blurs/unmounts while an overlay is open,
    // ensure it cannot keep intercepting touches above the list screen.
    useFocusEffect(
        useCallback(() => {
            return () => {
                setShowCallModal(false);
                setSelectedContextMessage(null);
                setShowMediaPicker(false);
                setMediaPreview(null);
                setMediaCollection(null);
                setMediaViewer(null);
                setSelectionMode(false);
                setSelectedMessageIds([]);
            };
        }, [])
    );

    // Animation Values
    const plusRotation = useSharedValue(0);
    const optionsOpacity = useSharedValue(0);
    const optionsTranslateY = useSharedValue(50); // Starts fully down
    const optionsScale = useSharedValue(0.01);    // Starts fully collapsed
    const modalAnim = useRef(new RNAnimated.Value(0)).current;

    // Refs
    const flatListRef = useRef<any>(null);
    const profileAvatarRef = useRef<View>(null);
    const inputContainerRef = useRef<View>(null);
    const hasScrolledInitial = useRef(false);
    const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Music progress for header glow. Stays visible while paused — we just stop
    // polling. Only resets when there's no song at all or this chat doesn't own
    // the active playback.
    const [musicProgress, setMusicProgress] = useState(0);
    useEffect(() => {
        if (!musicVisibleHere) { setMusicProgress(0); return; }
        if (isSeeking) return;

        const sync = async () => {
            try {
                const pos = await getPlaybackPosition();
                const dur = (musicState.currentSong?.duration || 240) * 1000;
                setMusicProgress(Math.min(pos / dur, 1));
            } catch { }
        };

        // Always sync once so the bar reflects the real position after pause/resume.
        sync();
        if (!musicState.isPlaying) return;

        const interval = setInterval(sync, 200);
        return () => clearInterval(interval);
    }, [musicVisibleHere, musicState?.isPlaying, musicState?.currentSong?.id, isSeeking]);

    const headerPillRef = useRef<View>(null);
    const [headerPillWidth, setHeaderPillWidth] = useState(SCREEN_WIDTH - MAIN_PILL_LEFT - 24);
    const headerBarPageX = useRef(0);
    const handleHeaderSeek = useCallback((locationX: number, commit = false) => {
        if (!musicState?.currentSong?.duration) return;
        const percent = Math.max(0, Math.min(1, locationX / headerPillWidth));
        const targetMs = percent * musicState.currentSong.duration * 1000;
        if (commit) {
            seekTo(targetMs);
            setIsSeeking(false);
        }
        setMusicProgress(percent);
    }, [musicState?.currentSong?.duration, seekTo, headerPillWidth, setIsSeeking]);

    const headerSeekPanResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderGrant: (e) => {
                setIsSeeking(true);
                const { locationX, pageX } = e.nativeEvent;
                headerBarPageX.current = pageX - locationX;
                handleHeaderSeek(locationX);
            },
            onPanResponderMove: (e) => {
                const relativeX = e.nativeEvent.pageX - headerBarPageX.current;
                handleHeaderSeek(relativeX);
            },
            onPanResponderRelease: (e) => {
                const relativeX = e.nativeEvent.pageX - headerBarPageX.current;
                handleHeaderSeek(relativeX, true);
            },
            onPanResponderTerminate: () => {
                setIsSeeking(false);
            },
            onPanResponderTerminationRequest: () => false,
        })
    ).current;

    // Animation Layout State
    const [inputLayout, setInputLayout] = useState<{ x: number, y: number, width: number, height: number } | null>(null);
    // Derived State
    const contact = useMemo(() => {
        const found = contacts.find(c => c.id === id) || remoteContact;
        if (found) return found;

        // Fallback for legacy ID navigation
        const legacyMappedUuid = id ? (USERS[id]?.id) : null;
        if (legacyMappedUuid) {
            return contacts.find(c => c.id === legacyMappedUuid);
        }
        return undefined;
    }, [contacts, id, remoteContact]);

    // For groups, if the local contact row is missing the avatar (e.g. an
    // earlier saveContact got dropped due to SQLite BUSY), prefer the merged
    // groups+contacts lookup from `remoteContact` whenever it has a richer
    // avatar. This makes the chat header self-heal even when the contacts
    // row is partially populated.
    const isGroupContact = !!(contact?.isGroup);
    const remoteHasBetterAvatar =
        isGroupContact && !!remoteContact && (!contact?.avatar || contact.avatar === '') && !!remoteContact.avatar;

    // Fetch profile if contact not found locally (e.g. after account switch or from discovery)
    const remoteFetchAttemptedRef = React.useRef<string | null>(null);
    useEffect(() => {
        // Trigger the same remote/local-merge fetch we use for missing contacts
        // when the contact exists but is a group with an empty avatar.
        const needsAvatarHeal = isGroupContact && (!contact?.avatar || contact.avatar === '');
        if ((!contact || needsAvatarHeal) && stringId && !isLoadingProfile && remoteFetchAttemptedRef.current !== stringId) {
            remoteFetchAttemptedRef.current = stringId;
            console.log('[Chat] Contact not found locally, fetching remote profile for:', stringId);
            setIsLoadingProfile(true);
            
            // Re-use fetchOtherUserProfile from context but also handle the result locally for this screen
            const fetchRemote = async () => {
                try {
                    const sid = (stringId && LEGACY_TO_UUID[stringId]) || stringId;

                    // Group fallback: if a local group row exists for this id, use it
                    // as the contact. We probe the contacts table too — handleUpdateGroupAvatar
                    // writes the locally-cached file path there (groups table only stores
                    // the remote storage key). And if BOTH local sources are missing the
                    // avatar we hit Supabase's chat_groups table as a last resort to heal
                    // legacy state where an avatar was uploaded before the local-tables
                    // sync was wired up.
                    try {
                        // allSettled so one read failing (e.g. transient SQLite BUSY)
                        // doesn't take down the other.
                        const [groupResult, contactResult] = await Promise.allSettled([
                            offlineService?.getGroup?.(sid),
                            offlineService?.getContact?.(sid),
                        ]);
                        const localGroup = groupResult.status === 'fulfilled' ? groupResult.value : null;
                        const localContact = contactResult.status === 'fulfilled' ? contactResult.value : null;
                        console.log('[Chat] Group fallback probe:', {
                            sid,
                            localGroupAvatar: localGroup?.avatarUrl ?? null,
                            localContactAvatar: localContact?.avatar ?? null,
                            localContactIsGroup: localContact?.isGroup ?? null,
                        });
                        if (localGroup || localContact?.isGroup) {
                            // Prefer the storage key from whichever source has it (contacts is
                            // updated last when the avatar changes, so it's freshest).
                            let avatarKey = localContact?.avatar || localGroup?.avatarUrl;

                            // If local SQLite has the avatar but the chat-list contacts
                            // state was hydrated before the heal landed, copy it onto
                            // contacts.avatar (in case it lives only in groups.avatar_url)
                            // and re-hydrate. Cheap: only fires when the group is missing
                            // its avatar in the contacts row but groups has it.
                            if (avatarKey && (!localContact?.avatar || localContact.avatar === '')) {
                                try {
                                    await offlineService?.upsertContactAvatar?.({
                                        id: sid,
                                        name: localGroup?.name || localContact?.name || 'Group',
                                        avatar: avatarKey,
                                        isGroup: true,
                                    });
                                } catch {}
                                try { await refreshLocalCache?.(true); } catch {}
                            }

                            // Both local sources empty → ask Supabase. Self-heal local
                            // tables for next time so we don't have to round-trip again.
                            if (!avatarKey) {
                                try {
                                    const { data: groupRow } = await supabase
                                        .from('chat_groups')
                                        .select('avatar_url, name, description')
                                        .eq('id', sid)
                                        .maybeSingle();
                                    if (groupRow?.avatar_url) {
                                        avatarKey = groupRow.avatar_url;
                                        // Heal local SQLite, then re-hydrate ChatContext so the
                                        // chat list picks up the avatar without an app restart.
                                        // Without the refresh, the heal writes succeed but the
                                        // contacts state in memory stays stale until next launch.
                                        try {
                                            await offlineService?.saveGroup?.({
                                                id: sid,
                                                name: groupRow.name || localGroup?.name || 'Group',
                                                description: groupRow.description ?? null,
                                                avatarUrl: groupRow.avatar_url,
                                                creatorId: null,
                                                createdAt: null,
                                                updatedAt: new Date().toISOString(),
                                            } as any);
                                        } catch {}
                                        try {
                                            await offlineService?.upsertContactAvatar?.({
                                                id: sid,
                                                name: groupRow.name || localGroup?.name || localContact?.name || 'Group',
                                                avatar: groupRow.avatar_url,
                                                isGroup: true,
                                            });
                                        } catch {}
                                        try { await refreshLocalCache?.(true); } catch {}
                                    }
                                } catch (cloudErr) {
                                    console.warn('[Chat] Cloud group avatar lookup failed:', cloudErr);
                                }
                            }

                            setRemoteContact({
                                id: (localGroup?.id || localContact?.id || sid) as string,
                                name: localGroup?.name || localContact?.name || 'Group',
                                avatar: proxySupabaseUrl(avatarKey),
                                // CRITICAL: never use 'teddy' here — that makes SoulAvatar fetch
                                // a generated avatar URL and ignore the actual group photo.
                                avatarType: 'default',
                                localAvatarUri: localContact?.localAvatarUri,
                                status: 'offline',
                                about: localGroup?.description || '',
                                lastMessage: '',
                                unreadCount: 0,
                                isGroup: true,
                            } as Contact);
                            return;
                        }
                    } catch { /* ignore and fall through to profiles fetch */ }

                    const { data, error } = await supabase.from('profiles').select('*').eq('id', sid).maybeSingle();

                    if (data) {
                        const normalized: Contact = {
                            id: data.id,
                            name: data.display_name || data.name || data.username || 'User',
                            avatar: proxySupabaseUrl(data.avatar_url),
                            avatarType: data.avatar_type || 'teddy',
                            teddyVariant: data.teddy_variant || 'boy',
                            status: 'offline', // Default status for remote fetch
                            about: data.bio || 'Forever in sync',
                            lastMessage: '',
                            unreadCount: 0,
                        };
                        setRemoteContact(normalized);
                    } else {
                        console.warn('[Chat] Remote profile fetch returned no data');
                    }
                } catch (err) {
                    console.error('[Chat] Remote profile fetch failed:', err);
                } finally {
                    setIsLoadingProfile(false);
                }
            };
            
            fetchRemote();
        }
    }, [contact, stringId, isLoadingProfile]);

    const profileAvatarTransitionTag = useMemo(() => {
        const transitionId = normalizeId(contact?.id || String(id || ''));
        return transitionId ? getProfileAvatarTransitionTag(transitionId) : undefined;
    }, [contact?.id, id]);
    const profilePreviewAvatarSource = useMemo(() => resolveAvatarImageUri({
        uri: (remoteHasBetterAvatar ? remoteContact?.avatar : contact?.avatar) || contact?.avatar,
        localUri: contact?.localAvatarUri || remoteContact?.localAvatarUri,
        avatarType: ((contact?.avatarType || remoteContact?.avatarType) as any) || 'default',
        teddyVariant: ((contact as any)?.teddyVariant || (remoteContact as any)?.teddyVariant) as any,
        fallbackId: contact?.id || String(id || 'default'),
    }), [
        contact?.avatar,
        contact?.avatarType,
        contact?.id,
        contact?.localAvatarUri,
        id,
        remoteContact?.avatar,
        remoteContact?.avatarType,
        remoteContact?.localAvatarUri,
        remoteHasBetterAvatar,
    ]);
    const isGroup = contact?.isGroup || false;
    const targetProfileId = String(contact?.id || id || '');
    const normalizedTargetProfileId = useMemo(() => normalizeId(targetProfileId), [targetProfileId]);
    const [profileAvatarTransition, setProfileAvatarTransition] = useState(() =>
        profileAvatarTransitionState.getState()
    );
    const shouldHideHeaderAvatar = !isFocused
        && !!normalizedTargetProfileId
        && profileAvatarTransition.phase !== 'idle'
        && normalizeId(profileAvatarTransition.profileId || '') === normalizedTargetProfileId;

    useEffect(() => {
        const unsubscribe = profileAvatarTransitionState.subscribe(setProfileAvatarTransition);
        return unsubscribe;
    }, []);

    useEffect(() => {
        if (isGroup || !profilePreviewAvatarSource) {
            return;
        }
        void warmAvatarSource(profilePreviewAvatarSource);
    }, [isGroup, profilePreviewAvatarSource]);

    const openProfileWithMorph = useCallback(() => {
        if (isNavigatingRef.current) return;
        try {
            console.log('[ChatScreen] Opening profile for:', targetProfileId);
            const pushProfile = async (origin?: { x: number; y: number; width: number; height: number }) => {
                try {
                    if (!isGroup && profilePreviewAvatarSource) {
                        await Promise.race([
                            warmAvatarSource(profilePreviewAvatarSource),
                            new Promise((resolve) => setTimeout(resolve, 120)),
                        ]);
                    }
                    if (normalizedTargetProfileId) {
                        profileAvatarTransitionState.show(normalizedTargetProfileId);
                    }
                    router.push({
                        pathname: (isGroup ? '/group-info/[id]' : '/profile/[id]') as any,
                        params: !isGroup && ENABLE_PROFILE_AVATAR_SHARED_TRANSITION && profileAvatarTransitionTag
                            ? {
                                id: String(targetProfileId),
                                avatarTransition: '1',
                                avatarSource: profilePreviewAvatarSource || undefined,
                            }
                            : origin
                                ? {
                                    id: String(targetProfileId),
                                    avatarX: Math.round(origin.x).toString(),
                                    avatarY: Math.round(origin.y).toString(),
                                    avatarW: Math.round(origin.width).toString(),
                                    avatarH: Math.round(origin.height).toString(),
                                    avatarSource: !isGroup ? (profilePreviewAvatarSource || undefined) : undefined,
                                }
                                : {
                                    id: String(targetProfileId),
                                    avatarSource: !isGroup ? (profilePreviewAvatarSource || undefined) : undefined,
                                },
                    });
                } catch (pushErr) {
                    console.error('[ChatScreen] Navigation push failed:', pushErr);
                    router.push((isGroup ? `/group-info/${targetProfileId}` : `/profile/${targetProfileId}`) as any);
                }
            };

            if (!isGroup && ENABLE_PROFILE_AVATAR_SHARED_TRANSITION && profileAvatarTransitionTag) {
                void pushProfile();
                return;
            }

            // Measure the avatar's real on-screen position so the dismiss
            // morph lands exactly back on the chat header avatar — no ghost,
            // no offset from safe-area or status-bar insets.
            const node = profileAvatarRef.current;
            if (node && typeof (node as any).measureInWindow === 'function') {
                (node as any).measureInWindow((pageX: number, pageY: number, w: number, h: number) => {
                    if (!Number.isFinite(pageX) || !Number.isFinite(pageY) || !w || !h) {
                        void pushProfile({ x: MAIN_PILL_LEFT + 8, y: HEADER_PILL_TOP + (HEADER_PILL_HEIGHT - 46) / 2, width: 46, height: 46 });
                        return;
                    }
                    void pushProfile({ x: pageX, y: pageY, width: w, height: h });
                });
                return;
            }
            if (node && typeof (node as any).measure === 'function') {
                (node as any).measure((_x: number, _y: number, w: number, h: number, pageX: number, pageY: number) => {
                    if (!Number.isFinite(pageX) || !Number.isFinite(pageY) || !w || !h) {
                        void pushProfile({ x: MAIN_PILL_LEFT + 8, y: HEADER_PILL_TOP + (HEADER_PILL_HEIGHT - 46) / 2, width: 46, height: 46 });
                        return;
                    }
                    void pushProfile({ x: pageX, y: pageY, width: w, height: h });
                });
                return;
            }

            void pushProfile({
                x: MAIN_PILL_LEFT + 8,
                y: HEADER_PILL_TOP + (HEADER_PILL_HEIGHT - 46) / 2,
                width: 46,
                height: 46,
            });
        } catch (err) {
            console.error('[ChatScreen] openProfileWithMorph failed:', err);
            if (normalizedTargetProfileId) {
                profileAvatarTransitionState.clear(normalizedTargetProfileId);
            }
            router.push((isGroup ? `/group-info/${targetProfileId}` : `/profile/${targetProfileId}`) as any);
        }
    }, [isGroup, normalizedTargetProfileId, profileAvatarTransitionTag, profilePreviewAvatarSource, router, targetProfileId]);

    // FIX: Use contact.id (UUID) for message lookup, not the raw id param
    const messageKey = contact?.id || id || '';
    const chatMessages = messages[messageKey] || [];
    // Memoize reversed messages to avoid expensive array operations in render
    const reversedMessages = useMemo(() => [...chatMessages].filter(m => !isMessageEmpty(m)).reverse(), [chatMessages]);
    const isTyping = contact ? typingUsers.includes(contact.id) : false;

    useEffect(() => {
        if (!isFocused || !currentUser?.id || !id) {
            return;
        }

        const task = InteractionManager.runAfterInteractions(async () => {
            initializeChatSession?.(id, isGroup);
            if (!isGroup) {
                fetchOtherUserProfile?.(id);
                if (id) {
                    setMusicPartner?.(id);
                    setTimeout(() => requestMusicSync?.(), 1000);
                }
            } else {
                if (id) {
                    joinGroupMusicRoom?.(id);
                    setTimeout(() => requestMusicSync?.(), 700);
                }
                // Fetch roles for all group members
                const { data: members } = await supabase
                    .from('group_members')
                    .select('user_id, role')
                    .eq('group_id', id);

                if (members) {
                    const roles: Record<string, string> = {};
                    members.forEach(m => {
                        roles[m.user_id] = m.role;
                    });
                    setMemberRoles(roles);
                    if (roles[currentUser?.id] === 'admin') {
                        setIsAdmin(true);
                    }
                }
            }
        });

        return () => {
            task.cancel();
            if (isGroup && id) {
                void leaveGroupMusicRoom?.(id);
            }
            cleanupChatSession?.(id);
        };
    }, [cleanupChatSession, id, currentUser?.id, initializeChatSession, fetchOtherUserProfile, isFocused, isGroup, joinGroupMusicRoom, leaveGroupMusicRoom, requestMusicSync, setMusicPartner]);

    // Mark incoming messages as read when chat is open or app returns to foreground
    useEffect(() => {
        const markUnread = () => {
            const unreadIds = chatMessages
                .filter(m => m.sender === 'them' && m.status !== 'read')
                .map(m => m.id);
            if (unreadIds.length > 0) {
                chatService.markMessagesAsRead(unreadIds);
            }
        };

        markUnread();

        // Also mark read when app comes back to foreground
        const subscription = AppState.addEventListener('change', (state) => {
            if (state === 'active') markUnread();
        });
        return () => subscription.remove();
    }, [chatMessages]);

    const toggleOptions = () => {
        const nextExpanded = !isExpanded;
        setIsExpanded(nextExpanded);

        const springConfig = {
            damping: 15,
            stiffness: 150,
            mass: 0.5,
        };

        plusRotation.value = withSpring(nextExpanded ? 45 : 0, { damping: 15, stiffness: 200 });
        optionsOpacity.value = withTiming(nextExpanded ? 1 : 0, { duration: 100 });
        optionsTranslateY.value = withSpring(nextExpanded ? 0 : 50, springConfig);
        optionsScale.value = withSpring(nextExpanded ? 1 : 0.01, springConfig);

        if (nextExpanded) {
            hapticService.impact(Haptics.ImpactFeedbackStyle.Medium);
        }
    };

    // Close options when typing
    const handleFocus = () => {
        if (isExpanded) {
            toggleOptions();
        }
    };

    // Animation Shared Values
    const recordingPulsate = useSharedValue(1);
    const plusScale = useSharedValue(1);
    const micScale = useSharedValue(1);

    const animatedPlusStyle = useAnimatedStyle(() => ({
        transform: [
            { rotate: `${plusRotation.value}deg` },
            { scale: plusScale.value }
        ] as any
    }));

    const animatedMorphStyle = useAnimatedStyle(() => {
        const progress = optionsScale.value; // 0 to 1
        return {
            width: interpolate(progress, [0, 1], [44, 200], Extrapolation.CLAMP),
            height: interpolate(progress, [0, 1], [44, 280], Extrapolation.CLAMP),
            borderRadius: interpolate(progress, [0, 1], [22, 28], Extrapolation.CLAMP),
        };
    });

    const animatedContentOpacity = useAnimatedStyle(() => ({
        opacity: interpolate(optionsScale.value, [0.3, 1], [0, 1], Extrapolation.CLAMP),
        transform: [{ translateY: interpolate(optionsScale.value, [0, 1], [40, 0], Extrapolation.CLAMP) }]
    }));

    const animatedIconRotation = useAnimatedStyle(() => ({
        transform: [
            { rotate: `${plusRotation.value}deg` },
            { scale: interpolate(optionsScale.value, [0, 1], [1, 1.1], Extrapolation.CLAMP) }
        ] as any
    }));

    // Force closed state on mount in case of stale shared values from fast refresh
    useEffect(() => {
        if (!isExpanded) {
            plusRotation.value = 0;
            optionsOpacity.value = 0;
            optionsTranslateY.value = 50;
            optionsScale.value = 0;
        }
    }, []);

    const callButtonRef = useRef<View>(null);

    // Media picker state
    const [showMediaPicker, setShowMediaPicker] = useState(false);
    const [mediaPreview, setMediaPreview] = useState<{ uri: string; type: 'image' | 'video' | 'audio' | 'file'; name?: string }[] | null>(null);
    const [mediaCollection, setMediaCollection] = useState<{ messageId: string; items: ChatMediaItem[]; startIndex: number } | null>(null);
    const [mediaViewer, setMediaViewer] = useState<{ messageId: string; items: ChatMediaItem[]; index: number } | null>(null);
    const [selectedMediaLayout, setSelectedMediaLayout] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
    const [mediaItemReactions, setMediaItemReactions] = useState<Record<string, string[]>>({});
    const [isUploading, setIsUploading] = useState(false);

    // Recording State
    const recordingRef = useRef<Audio.Recording | null>(null);
    const isPreparingRecordingRef = useRef(false);
    const isStoppingRecordingRef = useRef(false);
    const pendingStopAfterPrepareRef = useRef<null | { shouldSend: boolean }>(null);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingDuration, setRecordingDuration] = useState(0);
    const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
    const [recordingLevel, setRecordingLevel] = useState(0.08);
    const [isRecordingCancelled, setIsRecordingCancelled] = useState(false);
    const recordingTranslateX = useSharedValue(0);
    const touchStartXRef = useRef(0);
    const cancelHapticJSRef = useRef(false);

    const startRecording = async () => {
        if (isPreparingRecordingRef.current || isStoppingRecordingRef.current) {
            return;
        }
        isPreparingRecordingRef.current = true;
        pendingStopAfterPrepareRef.current = null;
        try {
            // Force-cleanup any lingering recording to avoid "Only one Recording" error
            if (recordingRef.current) {
                try { await recordingRef.current.stopAndUnloadAsync(); } catch { }
                recordingRef.current = null;
            }
            if (recordingTimerRef.current) {
                clearInterval(recordingTimerRef.current);
                recordingTimerRef.current = null;
            }
            setIsRecording(false);

            const permission = await Audio.requestPermissionsAsync();
            if (permission.status !== 'granted') {
                Alert.alert('Permission required', 'Please enable microphone access to record voice notes.');
                isPreparingRecordingRef.current = false;
                return;
            }

            // Reset audio mode first to release any previous recording resources
            try {
                await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
            } catch { }

            await Audio.setAudioModeAsync({
                allowsRecordingIOS: true,
                playsInSilentModeIOS: true,
            });

            const { recording } = await Audio.Recording.createAsync({
                ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
                isMeteringEnabled: true,
            } as any);
            recordingRef.current = recording;
            setIsRecording(true);
            setIsRecordingCancelled(false);
            setRecordingDuration(0);
            setRecordingLevel(0.08);
            recordingTranslateX.value = 0;

            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

            recordingTimerRef.current = setInterval(() => {
                setRecordingDuration(prev => prev + 1);
            }, 1000) as unknown as NodeJS.Timeout;
            recording.setProgressUpdateInterval(90);
            recording.setOnRecordingStatusUpdate((status: any) => {
                if (!status?.isRecording) return;
                if (typeof status?.metering === 'number') {
                    const normalized = Math.max(0, Math.min(1, (status.metering + 60) / 60));
                    setRecordingLevel(prev => prev * 0.62 + normalized * 0.38);
                } else {
                    // fallback pulse when metering is unavailable on some devices
                    setRecordingLevel(prev => Math.max(0.08, prev * 0.92));
                }
            });

            isPreparingRecordingRef.current = false;

            // If finger was released while recorder was still preparing, resolve immediately.
            if (pendingStopAfterPrepareRef.current) {
                const { shouldSend } = pendingStopAfterPrepareRef.current;
                pendingStopAfterPrepareRef.current = null;
                await stopRecording(shouldSend);
            }
        } catch (err) {
            console.error('Failed to start recording', err);
            pendingStopAfterPrepareRef.current = null;
            setIsRecording(false);
            if (recordingTimerRef.current) {
                clearInterval(recordingTimerRef.current);
                recordingTimerRef.current = null;
            }
            try {
                if (recordingRef.current) {
                    await recordingRef.current.stopAndUnloadAsync();
                    recordingRef.current = null;
                }
            } catch { }
            try {
                await Audio.setAudioModeAsync({
                    allowsRecordingIOS: false,
                    playsInSilentModeIOS: true,
                });
            } catch { }
            isPreparingRecordingRef.current = false;
        }
    };

    const stopRecording = async (shouldSend: boolean = true) => {
        if (isStoppingRecordingRef.current) return;
        if (!recordingRef.current) {
            if (isPreparingRecordingRef.current) {
                pendingStopAfterPrepareRef.current = { shouldSend };
            }
            return;
        }
        isStoppingRecordingRef.current = true;

        setIsRecording(false);
        if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);

        const recording = recordingRef.current;
        recordingRef.current = null;

        try {
            await recording.stopAndUnloadAsync();
            const uri = recording.getURI();

            if (shouldSend && uri) {
                const status = await recording.getStatusAsync();
                const durationMillis = status.durationMillis || (recordingDuration * 1000);
                handleSendAudio(uri, durationMillis);
            }
            await Audio.setAudioModeAsync({
                allowsRecordingIOS: false,
                playsInSilentModeIOS: true,
            });
            setIsRecordingCancelled(false);
            recordingTranslateX.value = 0;
            pendingStopAfterPrepareRef.current = null;
            isStoppingRecordingRef.current = false;
        } catch (err: any) {
            // "no valid audio data" happens if the recording was too short (quick tap).
            // We suppress the noisy console.error for this specific case.
            if (err.message?.includes('no valid audio data')) {
                console.log('[Chat] Audio recording was too short, skipping send.');
            } else {
                console.error('Failed to stop recording', err);
            }

            await Audio.setAudioModeAsync({
                allowsRecordingIOS: false,
                playsInSilentModeIOS: true,
            });
            setIsRecordingCancelled(false);
            recordingTranslateX.value = 0;
            pendingStopAfterPrepareRef.current = null;
            isStoppingRecordingRef.current = false;
        }
    };

    const handleSendAudio = async (uri: string, duration?: number) => {
        if (!id) return;
        try {
            const media: Message['media'] = {
                type: 'audio',
                url: '', // will be set by ChatService after background upload
                duration,
            };

            // Instantly send message to local DB, passing the local uri for background upload
            sendChatMessage(messageKey, '', media, undefined, uri);
        } catch (error: any) {
            showSoulAlert('Send Failed', error.message || 'Please try again.');
        }
    };




    useEffect(() => {
        if (isRecording) {
            recordingPulsate.value = withTiming(1.2, { duration: 500, easing: Easing.inOut(Easing.ease) }, (finished) => {
                if (finished) {
                    recordingPulsate.value = withTiming(1, { duration: 500, easing: Easing.inOut(Easing.ease) });
                }
            });
            const interval = setInterval(() => {
                recordingPulsate.value = withTiming(1.2, { duration: 500, easing: Easing.inOut(Easing.ease) }, (finished) => {
                    if (finished) {
                        recordingPulsate.value = withTiming(1, { duration: 500, easing: Easing.inOut(Easing.ease) });
                    }
                });
            }, 1000);
            return () => clearInterval(interval);
        } else {
            recordingPulsate.value = 1;
        }
    }, [isRecording]);

    const recordingPulseStyle = useAnimatedStyle(() => ({
        transform: [
            { scale: isRecording ? recordingPulsate.value : micScale.value }
        ],
        backgroundColor: isRecording
            ? interpolateColor(recordingPulsate.value, [1, 1.2], ['rgba(188, 0, 42, 0.5)', 'rgba(188, 0, 42, 0.8)'])
            : 'transparent',
    }), [isRecording]);

    const slideToCancelStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: recordingTranslateX.value / 4 }], // Move slightly with drag
        opacity: interpolate(recordingTranslateX.value, [-60, 0], [0, 1], Extrapolation.CLAMP),
    }));

    const cancelTextAnimatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: recordingTranslateX.value / 3 }],
        opacity: interpolate(recordingTranslateX.value, [-120, -10], [0, 0.8], Extrapolation.CLAMP),
    }));

    const MIC_TRAVEL_FULL = SCREEN_WIDTH - 110; // drag distance fromStandalone right mic button to left delete zone

    const deleteIconAnimatedStyle = useAnimatedStyle(() => {
        const absX = Math.abs(recordingTranslateX.value);
        const progress = Math.min(1, absX / MIC_TRAVEL_FULL);
        // Pop in after a 20px drag threshold
        const popProgress = interpolate(absX, [0, 40, 100], [0, 0.3, 1], Extrapolation.CLAMP);
        
        return {
            transform: [
                { scale: interpolate(popProgress, [0, 0.8, 1], [0, 1.2, 1], Extrapolation.CLAMP) },
                { rotate: `${interpolate(popProgress, [0, 1], [45, 0], Extrapolation.CLAMP)}deg` }
            ],
            opacity: interpolate(popProgress, [0, 1], [0, 1], Extrapolation.CLAMP),
            backgroundColor: interpolateColor(
                absX,
                [CANCEL_SWIPE_THRESHOLD - 20, CANCEL_SWIPE_THRESHOLD],
                ['rgba(255,255,255,0.08)', 'rgba(239, 68, 68, 0.2)']
            )
        } as any;
    });

    const recordingMicAnimatedStyle = useAnimatedStyle(() => {
        const progress = Math.min(1, Math.abs(recordingTranslateX.value) / MIC_TRAVEL_FULL);
        return {
            transform: [
                { translateX: recordingTranslateX.value },
                { scale: interpolate(progress, [0, 0.85, 0.95, 1], [1, 1, 0.85, 0.2], Extrapolation.CLAMP) },
            ] as any,
            opacity: interpolate(progress, [0, 0.96, 1], [1, 1, 0], Extrapolation.CLAMP),
            backgroundColor: interpolateColor(
                progress,
                [0, 0.8, 1],
                [themeAccent, themeAccentSoft, '#ef4444']
            ),
        } as any;
    });

    const recordingWaveAnimatedStyle = useAnimatedStyle(() => {
        const progress = Math.min(1, Math.abs(recordingTranslateX.value) / MIC_TRAVEL_FULL);
        return {
            opacity: interpolate(progress, [0, 0.75, 1], [1, 0.45, 0.08], Extrapolation.CLAMP),
            transform: [{ scaleX: interpolate(progress, [0, 1], [1, 0.92], Extrapolation.CLAMP) }],
        };
    });

    // Cancel only when mic is dragged close to delete target on the left.
    const CANCEL_SWIPE_THRESHOLD = -(MIC_TRAVEL_FULL - 32);

    // Raw touch handlers — guaranteed to fire on every platform (no gesture recognition)
    const handleMicTouchStart = (e: any) => {
        touchStartXRef.current = e.nativeEvent.pageX;
        cancelHapticJSRef.current = false;
        startRecording();
    };

    const handleMicTouchMove = (e: any) => {
        if (!recordingRef.current && !isPreparingRecordingRef.current) return;
        const dx = e.nativeEvent.pageX - touchStartXRef.current;
        recordingTranslateX.value = Math.max(-MIC_TRAVEL_FULL, Math.min(0, dx));
        const shouldCancel = dx < CANCEL_SWIPE_THRESHOLD;
        setIsRecordingCancelled(shouldCancel);
        if (shouldCancel && !cancelHapticJSRef.current) {
            cancelHapticJSRef.current = true;
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        } else if (!shouldCancel) {
            cancelHapticJSRef.current = false;
        }
    };

    const handleMicTouchEnd = (e: any) => {
        const dx = e.nativeEvent.pageX - touchStartXRef.current;
        const shouldCancel = dx < CANCEL_SWIPE_THRESHOLD;
        cancelHapticJSRef.current = false;

        if (shouldCancel) {
            // Animate mic all the way into the delete icon, then cancel
            recordingTranslateX.value = withTiming(-MIC_TRAVEL_FULL, {
                duration: 180,
                easing: Easing.in(Easing.quad),
            });
            setTimeout(() => {
                stopRecording(false);
                recordingTranslateX.value = 0;
            }, 200);
        } else {
            recordingTranslateX.value = withTiming(0, { duration: 200 });
            stopRecording(true);
        }
    };

    useEffect(() => {
        return () => {
            if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
            // Stop any active recording when unmounting
            if (recordingRef.current) {
                recordingRef.current.stopAndUnloadAsync().catch(() => { });
                recordingRef.current = null;
            }
            Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true }).catch(() => { });
        };
    }, []);



    // Smart scroll: only auto-scroll to latest message if user is already at bottom.
    // Prevents yanking the user away when they're reading older messages.
    const isNearBottomRef = useRef(true);
    const prevMsgCount = useRef(chatMessages?.length || 0);
    useEffect(() => {
        if ((chatMessages?.length || 0) > prevMsgCount.current && isNearBottomRef.current) {
            setTimeout(() => {
                flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
            }, 100);
        }
        prevMsgCount.current = chatMessages?.length || 0;
    }, [chatMessages?.length]);

    // Handle content size change if needed (but inverted handles most cases)
    const handleContentSizeChange = useCallback(() => {
        // Naturally starts at index 0 (bottom) when inverted
    }, []);

    const openCallModal = () => {
        console.log('[Chat] 📞 Opening call modal...');

        // Show immediately with a sensible fallback so the overlay appears
        setCallOptionsPosition({ x: 0, y: 115 });
        setShowCallModal(true);

        RNAnimated.spring(modalAnim, {
            toValue: 1,
            useNativeDriver: true,
            tension: 110,
            friction: 9,
        }).start();

        if (callButtonRef.current) {
            // Refine position if possible
            requestAnimationFrame(() => {
                callButtonRef.current?.measure((x, y, width, height, pageX, pageY) => {
                    console.log(`[Chat] 📍 Measure result: x=${x}, y=${y}, w=${width}, h=${height}, pageX=${pageX}, pageY=${pageY}`);

                    const safeY = (typeof pageY === 'number' && !isNaN(pageY) && pageY > 0) ? pageY : 60;
                    const safeHeight = (typeof height === 'number' && !isNaN(height) && height > 0) ? height : 44;

                    const finalPos = { x: 0, y: safeY + safeHeight + 14 };
                    console.log('[Chat] 🎯 Refining callOptionsPosition:', finalPos);
                    setCallOptionsPosition(finalPos);
                });
            });
        }
    };

    const closeCallModal = () => {
        RNAnimated.timing(modalAnim, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
        }).start(() => setShowCallModal(false));
    };

    const handleCall = async (type: 'audio' | 'video') => {
        closeCallModal();
        if (isGroup && id) {
            try {
                // Fetch group members from supabase
                const { data, error } = await supabase
                    .from('group_members')
                    .select('user_id')
                    .eq('group_id', id);

                if (error) throw error;

                const participantIds = data
                    .map(m => m.user_id)
                    .filter(uid => normalizeId(uid) !== normalizeId(currentUser?.id));

                if (participantIds.length === 0) {
                    Alert.alert('Group Call', 'No other members to call.');
                    return;
                }

                await startGroupCall(id as string, participantIds, type);
            } catch (err) {
                console.error('[Chat] Group call failed:', err);
                Alert.alert('Error', 'Could not start group call.');
            }
        } else if (id) {
            startCall(id as string, type);
        }
    };

    const handleSend = () => {
        if (!inputText.trim() || !id) return;

        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        sendTyping(false);

        const content = inputText.trim();
        setInputText('');

        if (editingMessage) {
            const nextMedia = editingMessage.media
                ? {
                    ...editingMessage.media,
                    caption: content || undefined,
                }
                : undefined;
            updateMessage(id as string, editingMessage.id, {
                text: content,
                media: nextMedia as any,
            });
            setEditingMessage(null);
            return;
        }

        // Simple send without flying bubble animation to reduce UI thread load
        const nextMessageId = Crypto.randomUUID();
        const replyToId = replyingTo ? replyingTo.id : undefined;
        sendChatMessage(messageKey, content, undefined, replyToId, undefined, nextMessageId);
        setReplyingTo(null);

        if (isOverlay) {
            requestAnimationFrame(() => {
                flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
            });
        }
    };

    const handleReaction = useCallback((emoji: string) => {
        if (selectedContextMessage && id) {
            addReaction(id, selectedContextMessage.msg.id, emoji);
        }
    }, [addReaction, id, selectedContextMessage]);

    const handleAction = (action: string) => {
        if (selectedContextMessage && id) {
            if (action === 'delete') {
                const mediaItems = getMessageMediaItems(selectedContextMessage.msg);
                const isGroupedMedia = mediaItems.length > 1;
                showSoulAlert(
                    isGroupedMedia ? 'Delete Media Group' : 'Delete Message',
                    isGroupedMedia
                        ? `Delete this media group (${mediaItems.length} items)?`
                        : 'Delete this message?',
                    [
                        { text: 'Cancel', style: 'cancel' },
                        {
                            text: 'Delete',
                            style: 'destructive',
                            onPress: () => deleteMessage(id, selectedContextMessage.msg.id, isAdmin),
                        },
                    ]
                );
            } else if (action === 'reply') {
                setEditingMessage(null);
                setReplyingTo(selectedContextMessage.msg);
            } else if (action === 'copy') {
                const sourceText =
                    selectedContextMessage.msg.text ||
                    selectedContextMessage.msg.media?.caption ||
                    '';
                if (!sourceText) {
                    Alert.alert('Copy', 'No text to copy in this message.');
                } else {
                    Clipboard.setStringAsync(sourceText).catch(() => { });
                }
            } else if (action === 'forward') {
                const forwardText =
                    selectedContextMessage.msg.text ||
                    selectedContextMessage.msg.media?.caption ||
                    '[Media]';
                setEditingMessage(null);
                setReplyingTo(null);
                setInputText(`↪ ${forwardText}`);
            } else if (action === 'star') {
                updateMessage(id as string, selectedContextMessage.msg.id, { isStarred: true } as any);
            } else if (action === 'unstar') {
                updateMessage(id as string, selectedContextMessage.msg.id, { isStarred: false } as any);
            } else if (action === 'edit') {
                if (selectedContextMessage.msg.sender !== 'me') return;
                const baseText = selectedContextMessage.msg.text || selectedContextMessage.msg.media?.caption || '';
                setReplyingTo(null);
                setEditingMessage(selectedContextMessage.msg as any);
                setInputText(baseText);
            } else if (action === 'pin') {
                updateMessage(id as string, selectedContextMessage.msg.id, { isPinned: true } as any);
            } else if (action === 'unpin') {
                updateMessage(id as string, selectedContextMessage.msg.id, { isPinned: false } as any);
            } else if (action === 'select') {
                setSelectionMode(true);
                setSelectedMessageIds([selectedContextMessage.msg.id]);
            }
        }
        setSelectedContextMessage(null);
    };

    const handleQuotePress = useCallback((quoteId: string) => {
        const index = reversedMessages.findIndex(m => m.id === quoteId);
        if (index !== -1) {
            flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
            setHighlightedMessageId(quoteId);
            setTimeout(() => setHighlightedMessageId(null), 1500);
        }
    }, [reversedMessages]);



    const unreadIncomingIds = useMemo(
        () => reversedMessages.filter((m: any) => m.sender === 'them' && m.status !== 'read').map((m: any) => m.id),
        [reversedMessages]
    );

    const handleSelectToggle = useCallback((msgId: string) => {
        setSelectedMessageIds(prev => {
            const next = prev.includes(msgId) ? prev.filter(i => i !== msgId) : [...prev, msgId];
            if (next.length === 0) setSelectionMode(false);
            return next;
        });
    }, []);

    const handleDeleteSelected = () => {
        showSoulAlert(
            `Delete ${selectedMessageIds.length} Message${selectedMessageIds.length > 1 ? 's' : ''}`,
            'Are you sure you want to delete these messages for everyone?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => {
                        selectedMessageIds.forEach(msgId => {
                            if (id) deleteMessage(id, msgId, isAdmin);
                        });
                        setSelectionMode(false);
                        setSelectedMessageIds([]);
                    }
                }
            ]
        );
    };

    const handleDoubleTap = useCallback((msgId: string, mediaIndex?: number) => {
        if (!id) return;
        if (typeof mediaIndex === 'number' && typeof sendMediaLikePulse === 'function') {
            sendMediaLikePulse(id, msgId, mediaIndex);
        }
        if (typeof toggleHeart === 'function') {
            toggleHeart(id, msgId);
        } else {
            addReaction(id, msgId, '❤️');
        }
    }, [addReaction, id, toggleHeart, sendMediaLikePulse]);

    const handleMediaTap = (payload: any) => {
        if (!payload?.mediaItems?.length) return;

        // 🛡️ Secondary Check: Prevent viewing expired statuses
        const msg = (chatMessages || []).find(m => m.id === payload.messageId);
        if (msg?.media?.type === 'status_reply') {
            const timestamp = msg.timestamp;
            const STATUS_EXPIRATION_MS = 24 * 60 * 60 * 1000;
            if (timestamp && (Date.now() - new Date(timestamp).getTime()) > STATUS_EXPIRATION_MS) {
                showSoulAlert('Status Expired', 'This status was posted more than 24 hours ago and is no longer available.');
                return;
            }
        }

        const nextViewer = {
            messageId: payload.messageId,
            items: payload.mediaItems,
            index: payload.index || 0,
        };
        if (payload.layout) {
            setSelectedMediaLayout(payload.layout);
        }
        if (payload.openGallery) {
            setMediaCollection({
                messageId: payload.messageId,
                items: payload.mediaItems,
                startIndex: payload.index || 0,
            });
            return;
        }
        setMediaViewer(nextViewer);
    };

    const addReactionToMedia = (messageId: string, mediaIndex: number, emoji: string) => {
        const key = `${messageId}:${mediaIndex}`;
        setMediaItemReactions(prev => ({
            ...prev,
            [key]: [...(prev[key] || []), emoji],
        }));
    };

    const handleReactAllMedia = (messageId: string, emoji: string) => {
        if (!id) return;
        addReaction(id, messageId, emoji);
    };

    const handleSaveCurrentMedia = async () => {
        if (!mediaViewer) return;
        const current = mediaViewer.items[mediaViewer.index];
        if (!current?.url) return;

        try {
            const permission = await MediaLibrary.requestPermissionsAsync();
            if (permission.status !== 'granted') {
                showSoulAlert('Permission Required', 'Allow media library access to save files.');
                return;
            }

            let localUri = current.url;
            if (!current.url.startsWith('file://')) {
                const extension = current.type === 'video' ? '.mp4' : '.jpg';
                const target = `${cacheDirectory}soul_${Date.now()}${extension}`;
                const downloaded = await downloadAsync(current.url, target);
                localUri = downloaded.uri;
            }

            // Save to Soul album in gallery (WhatsApp-style) + device library
            const mediaType = current.type === 'video' ? 'video' : 'image';
            await soulFolderService.saveToDeviceGallery(localUri, mediaType as any, false);
            Alert.alert('Saved', 'Media saved to your gallery.');
        } catch (error) {
            Alert.alert('Save Failed', 'Could not save this media.');
        }
    };

    const handleMediaDownload = useCallback(async (msgId: string, url: string, index: number, manual = false) => {
        try {
            const currentMsg = (chatMessages || []).find(m => m.id === msgId);
            const mediaItems = currentMsg ? getMessageMediaItems(currentMsg) : [];
            const isGroupedMedia = mediaItems.length > 1;
            const downloadKey = isGroupedMedia ? `${msgId}:${index}` : msgId;

            // Route through download queue for concurrency control + wifi-only policy
            const result = await downloadQueue.enqueue(downloadKey, url, undefined, false, 1, manual, downloadKey);

            if (!result.success || !result.localUri) {
                if (result.error !== 'Already downloading') {
                    console.warn(`[ChatScreen] Media download failed for ${msgId}:${index}:`, result.error);
                }
                // Force re-render so MessageBubble clears downloading state via localFileUri check
                if (updateMessage && id) {
                    if (currentMsg) {
                        updateMessage(id as string, msgId, {
                            downloadFailed: true,
                        } as any);
                    }
                }
                if (manual && result.error && result.error !== 'Already downloading') {
                    Alert.alert('Download Failed', result.error);
                }
                return;
            }

            // Update AppContext State to trigger re-render in UI
            if (updateMessage && id) {
                if (currentMsg) {
                    if (isGroupedMedia && currentMsg.media?.thumbnail) {
                        updateMessage(id as string, msgId, {
                            downloadFailed: false,
                            media: {
                                ...currentMsg.media,
                                thumbnail: applyGroupedMediaLocalUri(
                                    currentMsg.media.thumbnail,
                                    index,
                                    result.localUri
                                ) || currentMsg.media.thumbnail,
                            },
                        } as any);
                    } else {
                        updateMessage(id as string, msgId, {
                            downloadFailed: false,
                            localFileUri: result.localUri,
                            media: currentMsg.media ? { ...currentMsg.media } : {}
                        } as any);
                    }
                }
            }
        } catch (error) {
            console.error('[ChatScreen] Media download error:', error);
            // Clear downloading state on exception too
            if (updateMessage && id) {
                updateMessage(id as string, msgId, { downloadFailed: true } as any);
            }
            if (manual) {
                Alert.alert('Download Failed', error instanceof Error ? error.message : 'Could not download this media.');
            }
        }
    }, [id, chatMessages, updateMessage]);

    const handleRetryMessage = useCallback(async (msgId: string) => {
        if (!id) return;
        try {
            await chatService.retryMessage(msgId);
            updateMessage(id as string, msgId, { status: 'pending' } as any);
        } catch (e) {
            showSoulAlert('Retry Failed', 'Could not retry this message.');
        }
    }, [id, updateMessage]);

    const renderMessage = useCallback(({ item, index }: { item: any; index: number }) => {
        // Date separator logic (inverted list: index 0 = newest)
        const msgDate = new Date(item.timestamp);
        const nextItem = reversedMessages[index + 1]; // older message
        const showDateSeparator = nextItem && new Date(nextItem.timestamp).toDateString() !== msgDate.toDateString();

        return (
            <Animated.View
                entering={FadeInDown.springify().damping(24).stiffness(200)}
                exiting={FadeOutDown}
                layout={LinearTransition.springify().damping(24).stiffness(200)}
            >
                <MessageBubble
                    msg={item}
                    contactName={contact?.name || 'Them'}
                    isSelected={selectedContextMessage?.msg.id === item.id}
                    onLongPress={(mid: string, layout: any) => setSelectedContextMessage({ msg: item, layout })}
                    onReply={(m: any) => setReplyingTo(m)}
                    onReaction={handleReaction}
                    onDoubleTap={handleDoubleTap}
                    remoteLikePulse={remoteLikePulse?.messageId === item.id ? remoteLikePulse : null}
                    onMediaTap={handleMediaTap}
                    quotedMessage={item.replyTo ? chatMessages.find((m: any) => m.id === item.replyTo) : null}
                    selectionMode={selectionMode}
                    isChecked={selectedMessageIds.includes(item.id)}
                    onSelectToggle={handleSelectToggle}
                    isHighlighted={highlightedMessageId === item.id}
                    onQuotePress={handleQuotePress}
                    uploadProgress={uploadProgressTracker?.[item.id]}
                    onMediaDownload={handleMediaDownload}
                    onRetry={handleRetryMessage}
                    isAdmin={isAdmin}
                    senderRole={memberRoles[item.sender_id]}
                />

                {showDateSeparator && (
                    <View style={{ alignItems: 'center', paddingVertical: 12 }}>
                        <View style={{
                            backgroundColor: 'rgba(255,255,255,0.08)',
                            borderRadius: 16,
                            paddingHorizontal: 14,
                            paddingVertical: 5,
                        }}>
                            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '600' }}>
                                {formatDateLabel(msgDate)}
                            </Text>
                        </View>
                    </View>
                )}
            </Animated.View>
        );
    }, [selectedContextMessage, chatMessages, contact?.name, handleReaction, handleDoubleTap, handleMediaTap, selectionMode, selectedMessageIds, handleSelectToggle, uploadProgressTracker, handleMediaDownload, handleRetryMessage, handleQuotePress, highlightedMessageId, reversedMessages, unreadIncomingIds, formatDateLabel]);

    const renderCollectionItem = useCallback(({ item, index }: { item: any, index: number }) => (
        <Pressable
            style={styles.mediaCollectionTile}
            onPress={() => {
                if (!mediaCollection) return;
                setMediaCollection(null);
                setMediaViewer({
                    messageId: mediaCollection.messageId,
                    items: mediaCollection.items,
                    index,
                });
            }}
        >
            <Image source={{ uri: item.localFileUri || item.url }} style={styles.mediaCollectionImage} contentFit="cover" transition={200} />
            {item.type === 'video' && (
                <View style={styles.mediaCollectionVideoBadge}>
                    <MaterialIcons name="play-arrow" size={18} color="#fff" />
                </View>
            )}
        </Pressable>
    ), [mediaCollection]);

    // Stable keyExtractor for FlatList - prevents inline function recreation
    const keyExtractor = useCallback((item: any) => item.id, []);

    // Media picker handlers
    const handleSelectCamera = async () => {
        if (isExpanded) toggleOptions();
        setShowMediaPicker(false);
        const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
        if (!permissionResult.granted) {
            showSoulAlert('Permission Required', 'Camera access is needed to take photos.');
            return;
        }
        const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ['images', 'videos'] as ImagePicker.MediaType[],
            quality: 0.8,
            allowsEditing: false,
            videoMaxDuration: 600,
        });
        if (!result.canceled && result.assets[0]) {
            const asset = result.assets[0];
            const type = asset.type === 'video' ? 'video' : 'image';
            setMediaPreview([{ uri: asset.uri, type }]);
        }
    };

    const handleSelectGallery = async () => {
        if (isExpanded) toggleOptions();
        setShowMediaPicker(false);
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images', 'videos'] as ImagePicker.MediaType[],
            quality: 0.8,
            allowsEditing: false,
            allowsMultipleSelection: true,
            videoMaxDuration: 600,
            legacy: true,
            preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
        });
        if (!result.canceled && result.assets && result.assets.length > 0) {
            const items: { uri: string; type: 'image' | 'video' | 'audio' }[] = result.assets.map(asset => ({
                uri: asset.uri,
                type: asset.type === 'video' ? 'video' : 'image'
            }));
            setMediaPreview(items);
        }
    };

    const handleSelectDocument = async () => {
        if (isExpanded) toggleOptions();
        setShowMediaPicker(false);
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: '*/*',
                copyToCacheDirectory: true,
                multiple: true
            });

            if (!result.canceled && result.assets && result.assets.length > 0) {
                const items: { uri: string; type: 'image' | 'video' | 'audio' | 'file'; name?: string }[] = result.assets.map(asset => ({
                    uri: asset.uri,
                    type: 'file',
                    name: asset.name
                }));
                setMediaPreview(items);
            }
        } catch (error) {
            console.error('[ChatScreen] Document picking failed:', error);
            showSoulAlert('Error', 'Failed to pick document');
        }
    };

    const handleSelectLocation = () => {
        if (isExpanded) toggleOptions();
        setShowMediaPicker(false);
        showSoulAlert('Coming Soon', 'Location sharing will be available soon.');
    };

    const handleSelectContact = () => {
        if (isExpanded) toggleOptions();
        setShowMediaPicker(false);
        showSoulAlert('Coming Soon', 'Contact sharing will be available soon.');
    };


    const handleSendMedia = async (mediaList: { uri: string; type: 'image' | 'video' | 'audio' | 'file'; name?: string }[], caption?: string) => {
        if (!mediaList || mediaList.length === 0 || !id) return;
        try {
            const preparedItems: any[] = [];
            for (let i = 0; i < mediaList.length; i++) {
                const item = mediaList[i];
                let thumbnail: string | undefined = undefined;
                let finalUri = item.uri;

                try {
                    if (item.type === 'video') {
                        if (finalUri.startsWith('content://')) {
                            const extFromName = item.name?.split('.').pop()?.toLowerCase();
                            const extFromUri = finalUri.split('.').pop()?.split('?')[0]?.toLowerCase();
                            const extension = extFromName || extFromUri || 'mp4';
                            const localCopyPath = `${cacheDirectory}chat-video-${Date.now()}-${i}.${extension}`;
                            await copyAsync({ from: finalUri, to: localCopyPath });
                            finalUri = localCopyPath;
                            console.log(`[ChatScreen] Materialized content URI video to local file: ${localCopyPath}`);
                        }

                        const info = await getInfoAsync(item.uri);
                        const resolvedInfo = finalUri !== item.uri ? await getInfoAsync(finalUri) : info;
                        const sizeBytes = (resolvedInfo as any)?.size || 0;
                        const sizeMB = sizeBytes / (1024 * 1024);
                        if (sizeBytes > 500 * 1024 * 1024) {
                            throw new Error(`Video is too large (${sizeMB.toFixed(1)}MB). Please send a video under 500MB.`);
                        }
                    }

                    if (item.type === 'video') {
                        try {
                            // Safely require the module only when needed
                            const VideoThumbnails = require('expo-video-thumbnails');
                            
                            // Safety check: Ensure the native module is actually available
                            if (VideoThumbnails && typeof VideoThumbnails.getThumbnailAsync === 'function') {
                                // Generate thumbnail from video at 1s mark
                                const { uri: thumbUri } = await VideoThumbnails.getThumbnailAsync(finalUri, {
                                    time: 1000,
                                    quality: 0.6,
                                });
                                
                                // Shrink and convert to base64 for immediate placeholder
                                const thumbResult = await ImageManipulator.manipulateAsync(
                                    thumbUri,
                                    [{ resize: { width: 160 } }],
                                    { compress: 0.4, format: ImageManipulator.SaveFormat.JPEG, base64: true }
                                );
                                thumbnail = `data:image/jpeg;base64,${thumbResult.base64}`;
                            } else {
                                console.warn('[ChatScreen] ExpoVideoThumbnails native module not found. Skipping thumbnail.');
                            }
                        } catch (err) {
                            console.warn('[ChatScreen] Video thumbnail generation failed:', err);
                        }
                    }

                    if (item.type === 'image') {
                        // Generate a sharper lightweight preview for grouped media placeholders.
                        const thumbResult = await ImageManipulator.manipulateAsync(
                            item.uri,
                            [{ resize: { width: 160 } }],
                            { compress: 0.45, format: ImageManipulator.SaveFormat.JPEG, base64: true }
                        );
                        thumbnail = `data:image/jpeg;base64,${thumbResult.base64}`;

                        // Compress original image for upload (max 1280px wide, 70% quality)
                        const compressed = await ImageManipulator.manipulateAsync(
                            item.uri,
                            [{ resize: { width: 1280 } }],
                            { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
                        );
                        finalUri = compressed.uri;
                    }
                } catch (thumbErr) {
                    console.warn('[ChatScreen] Media processing failed:', thumbErr);
                }

                preparedItems.push({
                    type: item.type === 'file' ? 'file' : item.type,
                    url: '',
                    localFileUri: finalUri,
                    thumbnail,
                    name: item.name,
                });
            }

            const isGrouped = preparedItems.length > 1;
            console.log(`[ChatScreen] Sending ${preparedItems.length} media items (grouped: ${isGrouped})`);
            if (isGrouped) {
                const media: Message['media'] = {
                    type: 'image',
                    url: '',
                    caption: caption || undefined,
                    thumbnail: `${MEDIA_GROUP_MARKER}${JSON.stringify(preparedItems)}`,
                } as any;
                await sendChatMessage(messageKey, caption || '', media, undefined, preparedItems[0].localFileUri);
            } else {
                const single = preparedItems[0];
                const media: Message['media'] = {
                    type: single.type as any,
                    url: '',
                    caption: caption || undefined,
                    thumbnail: single.thumbnail,
                    name: single.name,
                } as any;
                await sendChatMessage(messageKey, caption || '', media, undefined, single.localFileUri);
            }
            setMediaPreview(null);
        } catch (error: any) {
            showSoulAlert('Send Failed', error.message || 'Please try again.');
        }
    };

    if (!contact) {
        return (
            <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
                {isLoadingProfile ? (
                    <SoulLoader size={120} />
                ) : (
                    <Text style={styles.errorText}>Contact not found</Text>
                )}
                <Pressable onPress={handleBack} style={{ marginTop: 20, padding: 12 }}>
                    <Text style={{ color: themeAccent, fontWeight: '600' }}>Go Back</Text>
                </Pressable>
            </View>
        );
    }

    return (
        <View style={[styles.container, isOverlay && { backgroundColor: 'transparent' }]} pointerEvents={(isOverlay || isFocused) ? 'auto' : 'none'}>
            <StatusBar barStyle="light-content" />

            {!isOverlay || selectionMode ? (
                <>
                    <ConnectionBanner connectivity={connectivity} mode="absolute" />
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000', zIndex: -1 }]} />

                    {/* Standard Navigation Header (Only in non-overlay mode) */}
                    <View style={[StyleSheet.absoluteFill, { zIndex: 10 }]} pointerEvents="box-none">
                        <Animated.View
                            ref={headerPillRef}
                            onLayout={(e) => {
                                // Block layout updates during exit to prevent "jumping" or "stuttering" in the morph
                                // Using JS-safe phase check here
                                if (chatTransitionState.getPhase() !== 'returning') {
                                    setHeaderPillWidth(e.nativeEvent.layout.width);
                                }
                            }}
                            style={[
                                styles.headerPill,
                                headerMorphAnimatedStyle,
                                {
                                    position: 'absolute',
                                    top: HEADER_PILL_TOP,
                                    left: MAIN_PILL_LEFT,
                                    right: 24,
                                    backgroundColor: 'transparent', // Remove solid background to allow GlassView blur to show through
                                    borderRadius: HEADER_PILL_RADIUS,
                                    zIndex: 10,
                                    borderWidth: 1,
                                    borderColor: 'rgba(255, 255, 255, 0.22)',
                                    overflow: 'hidden'
                                }
                            ]}
                            pointerEvents="box-none"
                        >
                            <View style={StyleSheet.absoluteFill} pointerEvents="none">
                                <GlassView intensity={45} tint="dark" style={StyleSheet.absoluteFill} />
                            </View>

                                                       {musicVisibleHere && (
                                    <View 
                                        {...headerSeekPanResponder.panHandlers}
                                        style={{ 
                                            position: 'absolute', 
                                            bottom: 0, 
                                            left: 0, 
                                            right: 0,
                                            height: 14, 
                                            backgroundColor: 'transparent',
                                            zIndex: 15,
                                            justifyContent: 'flex-end'
                                        }} 
                                    >
                                        <View 
                                            style={{ 
                                                width: '100%',
                                                height: 2, 
                                                backgroundColor: 'rgba(255,255,255,0.05)',
                                            }} 
                                            pointerEvents="none"
                                        >
                                            <View 
                                                style={{ 
                                                    width: `${musicProgress * 100}%`, 
                                                    height: '100%', 
                                                    backgroundColor: activeTheme.primary,
                                                    borderRadius: 2,
                                                    shadowColor: activeTheme.primary,
                                                    shadowOffset: { width: 0, height: 0 },
                                                    shadowOpacity: 0.8,
                                                    shadowRadius: 4,
                                                    elevation: 5
                                                }} 
                                                pointerEvents="none"
                                            />
                                        </View>
                                    </View>
                                )}

                            <View style={[styles.header, { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, height: '100%', paddingRight: 8 }]} pointerEvents="box-none">
                                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                                    <Pressable
                                        collapsable={false}
                                        style={[styles.avatarWrapper, shouldHideHeaderAvatar && styles.avatarWrapperHidden]}
                                        onPress={openProfileWithMorph}
                                    >
                                        <SoulAvatar
                                            ref={profileAvatarRef}
                                            uri={(remoteHasBetterAvatar ? remoteContact?.avatar : contact?.avatar) || contact?.avatar}
                                            localUri={contact?.localAvatarUri || remoteContact?.localAvatarUri}
                                            avatarType={contact?.avatarType as any}
                                            teddyVariant={(contact as any)?.teddyVariant}
                                            size={46}
                                            isOnline={contact?.id ? getPresence(contact.id).isOnline : false}
                                            sharedTransitionTag={ENABLE_PROFILE_AVATAR_SHARED_TRANSITION ? profileAvatarTransitionTag : undefined}
                                            sharedTransition={ENABLE_PROFILE_AVATAR_SHARED_TRANSITION ? PROFILE_AVATAR_SHARED_TRANSITION : undefined}
                                            allowExperimentalSharedTransition={ENABLE_PROFILE_AVATAR_SHARED_TRANSITION}
                                        />
                                    </Pressable>
                                    <View style={styles.headerInfo}>
                                        <Text style={styles.contactName}>{contact?.name || '...'}</Text>
                                        {karaokeText ? (
                                            <KaraokeLine
                                                text={karaokeText}
                                                lineStart={karaokeLineStart}
                                                lineEnd={karaokeLineEnd}
                                                color={activeTheme.primary}
                                                baseColor="rgba(255,255,255,0.55)"
                                                getPlaybackPosition={getPlaybackPosition}
                                                isPlaying={!!musicState?.isPlaying}
                                            />
                                        ) : (
                                            <Text style={[styles.statusText, { color: activeTheme.primary }]} numberOfLines={1}>
                                                {musicVisibleHere
                                                    ? (musicState.currentSong.name.split('(')[0].split('-')[0].split('[')[0].replace(/&quot;/gi, '"').replace(/&amp;/gi, '&').trim())
                                                    : 'ONLINE'
                                                }
                                            </Text>
                                        )}
                                    </View>
                                    <View style={{ flexDirection: 'row', marginLeft: 'auto', alignItems: 'center' }}>
                                        <PressableFlash
                                            style={[styles.headerButton, { marginRight: 8 }]}
                                            borderRadius={22}
                                            flashColor={activeTheme.primary}
                                            onPress={() => setShowMusicPlayer(true)}
                                        >
                                            <MaterialIcons name="music-note" size={20} color="#ffffff" style={{ marginLeft: -2.5 }} />
                                        </PressableFlash>

                                        {/* Placeholder for Morphing Menu (outside) */}
                                        <View style={{ width: 44, height: 44, marginRight: 2 }} />
                                    </View>
                                </View>
                            </View>
                        </Animated.View>

                        {/* Seamless Morphing Call Menu (Root Level for breakout expansion) */}
                        <Animated.View style={animatedCallMorphStyle}>
                            <GlassView intensity={45} tint="dark" style={StyleSheet.absoluteFill} />
                            
                            <Pressable 
                                style={{ position: 'absolute', top: 0, right: 0, width: 44, height: 44, alignItems: 'center', justifyContent: 'center', zIndex: 10 }} 
                                onPress={toggleCallMenu}
                            >
                                <MaterialIcons 
                                    name={isCallExpanded ? "close" : "call"} 
                                    size={20} 
                                    color="#ffffff" 
                                    style={!isCallExpanded ? { marginLeft: 0.8, marginTop: 0.5 } : {}} 
                                />
                            </Pressable>

                                <Animated.View style={[{ flex: 1, padding: 6, marginTop: 38 }, animatedCallContentOpacity]} pointerEvents={isCallExpanded ? 'auto' : 'none'}>
                                    <Pressable style={styles.miniCallItem} onPress={() => { handleCall('audio'); toggleCallMenu(); }}>
                                        <View style={[styles.miniCallIcon, { backgroundColor: 'rgba(34, 197, 94, 0.15)' }]}>
                                            <MaterialIcons name="call" size={18} color="#22c55e" />
                                        </View>
                                        <Text style={styles.miniCallText}>Audio Call</Text>
                                    </Pressable>
                                    <View style={styles.miniCallDivider} />
                                    <Pressable style={styles.miniCallItem} onPress={() => { handleCall('video'); toggleCallMenu(); }}>
                                        <View style={[styles.miniCallIcon, { backgroundColor: 'rgba(244, 63, 94, 0.15)' }]}>
                                            <MaterialIcons name="videocam" size={18} color="#f43f5e" />
                                        </View>
                                        <Text style={styles.miniCallText}>Video Call</Text>
                                    </Pressable>
                                </Animated.View>
                        </Animated.View>

                        {!selectionMode && (
                            <Animated.View style={[
                                { 
                                    position: 'absolute', 
                                    top: HEADER_PILL_TOP + (HEADER_PILL_HEIGHT - BACK_BTN_SIZE) / 2, 
                                    left: 16, 
                                    width: BACK_BTN_SIZE, 
                                    height: BACK_BTN_SIZE, 
                                    borderRadius: BACK_BTN_SIZE / 2,
                                    zIndex: 20,
                                    overflow: 'hidden',
                                    borderWidth: 1,
                                    borderColor: 'rgba(255, 255, 255, 0.22)',
                                    backgroundColor: 'transparent'
                                }
                            ]}>
                                <View style={StyleSheet.absoluteFill} pointerEvents="none">
                                    <GlassView intensity={45} tint="dark" style={StyleSheet.absoluteFill} />
                                </View>
                                <PressableFlash
                                    onPress={handleBack}
                                    borderRadius={BACK_BTN_SIZE / 2}
                                    flashColor={activeTheme.primary}
                                    style={{
                                        flex: 1,
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                >
                                    <MaterialIcons name="arrow-back" size={24} color="#ffffff" />
                                </PressableFlash>
                            </Animated.View>
                        )}
                    </View>
                </>
            ) : null}

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={Platform.OS === 'ios' ? (isOverlay ? 0 : 0) : 0}
                style={{ flex: 1 }}
            >
                {/* Content Wrapper */}
                <Animated.View 
                    style={[StyleSheet.absoluteFill, { backgroundColor: 'transparent' }, backgroundMorphAnimatedStyle as any]}
                    pointerEvents="box-none"
                >
                    <View style={StyleSheet.absoluteFill}>
                        {/* In overlay mode, let taps on the transparent upper region dismiss the keyboard
                            (the call's remote video sits behind this and stays visible through the transparency). */}
                        {isOverlay && (
                            <Pressable
                                onPress={() => {
                                    console.log('[DEBUG] Keyboard dismissed via overlay tap');
                                    Keyboard.dismiss();
                                }}
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    // Keep tap-to-dismiss only on the empty upper region so
                                    // scroll gestures on the live-chat list still reach the FlatList.
                                    height: isOverlayKeyboardVisible ? SCREEN_HEIGHT * 0.22 : SCREEN_HEIGHT * 0.52,
                                    zIndex: 0,
                                }}
                            />
                        )}
                        <View style={{ flex: 1 }}>
                            <Animated.View
                                style={[
                                    { flex: 1 },
                                    isOverlay && {
                                        paddingTop: SCREEN_HEIGHT * (isOverlayKeyboardVisible ? 0.24 : 0.60),
                                    },
                                    messagesContainerAnimatedStyle,
                                ]}
                            >
                                {isOverlay ? (
                                    <View style={{ flex: 1 }}>
                                        {isReady && (
                                            <View style={{ flex: 1 }}>
                                                <MaskedView
                                                    style={{ flex: 1 }}
                                                    maskElement={
                                                        <LinearGradient
                                                            colors={['transparent', 'white', 'white']}
                                                            locations={[0, 0.70, 1]}
                                                            style={StyleSheet.absoluteFill}
                                                        />
                                                    }
                                                >
                                                    <Animated.FlatList
                                                        ref={flatListRef as any}
                                                        data={reversedMessages}
                                                        keyExtractor={keyExtractor}
                                                        inverted={true}
                                                        renderItem={renderMessage}
                                                        style={styles.messagesList}
                                                        contentContainerStyle={[
                                                            styles.messagesContent,
                                                            styles.overlayMessagesContent,
                                                            isOverlayKeyboardVisible && styles.overlayMessagesContentKeyboard,
                                                        ]}
                                                        showsVerticalScrollIndicator={false}
                                                        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
                                                        scrollEventThrottle={16}
                                                        keyboardShouldPersistTaps="handled"
                                                        keyboardDismissMode="on-drag"
                                                        ListEmptyComponent={
                                                            <View style={styles.emptyChat}>
                                                                <MaterialIcons name="chat-bubble-outline" size={60} color="rgba(255,255,255,0.1)" />
                                                                <Text style={styles.emptyChatText}>No messages yet</Text>
                                                            </View>
                                                        }
                                                    />
                                                </MaskedView>
                                            </View>
                                        )}
                                    </View>
                                ) : (
                                    <View style={{ flex: 1 }}>
                                        {isReady && (
                                            <Animated.FlatList
                                                ref={flatListRef as any}
                                                data={reversedMessages}
                                                keyExtractor={keyExtractor}
                                                inverted={true}
                                                renderItem={renderMessage}
                                                style={styles.messagesList}
                                                contentContainerStyle={styles.messagesContent}
                                                showsVerticalScrollIndicator={false}
                                                maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
                                                scrollEventThrottle={16}
                                                keyboardShouldPersistTaps="handled"
                                                keyboardDismissMode="on-drag"
                                                ListEmptyComponent={
                                                    <View style={styles.emptyChat}>
                                                        <MaterialIcons name="chat-bubble-outline" size={60} color="rgba(255,255,255,0.1)" />
                                                        <Text style={styles.emptyChatText}>No messages yet</Text>
                                                    </View>
                                                }
                                            />
                                        )}
                                    </View>
                                )}

                            {!isOverlay && (
                                <ProgressiveBlur
                                    position="top"
                                    height={160}
                                    intensity={60}
                                    maxAlpha={0.85}
                                />
                            )}
                            <ProgressiveBlur position="bottom" height={160} intensity={80} />
                        </Animated.View>

                        {/* Input Area Row — Restored full features */}
                        <Animated.View style={[styles.inputArea, inputAreaAnimatedStyle]}>
                            {/* Typing indicator */}
                            {isTyping && (
                                <Animated.View entering={FadeInDown} exiting={FadeOutDown} style={styles.typingIndicatorWrapper}>
                                    <View style={styles.typingBubbleMini}>
                                        <TypingDots />
                                    </View>
                                </Animated.View>
                            )}
                            
                            {/* Edit/Reply previews */}
                            {editingMessage && (
                                <GlassView intensity={35} tint="dark" style={styles.replyPreview} >
                                    <View style={styles.replyContent}>
                                        <MaterialIcons name="edit" size={16} color={activeTheme.primary} style={{ marginRight: 8 }} />
                                        <View style={styles.replyTextContainer}>
                                            <Text style={[styles.replySender, { color: activeTheme.primary }]}>Editing</Text>
                                            <Text numberOfLines={1} style={styles.replyText}>{editingMessage.text || 'Media'}</Text>
                                        </View>
                                        <Pressable onPress={() => setEditingMessage(null)}>
                                            <MaterialIcons name="close" size={18} color="rgba(255,255,255,0.7)" />
                                        </Pressable>
                                    </View>
                                </GlassView>
                            )}

                            {replyingTo && (
                                <GlassView intensity={35} tint="dark" style={styles.replyPreview} >
                                    <View style={styles.replyContent}>
                                        <View style={[ChatStyles.quoteBar, { backgroundColor: activeTheme.primary }]} />
                                        <View style={styles.replyTextContainer}>
                                            <Text style={[styles.replySender, { color: activeTheme.primary }]}>
                                                {replyingTo.sender === 'me' ? 'You' : contact?.name}
                                            </Text>
                                            <Text numberOfLines={1} style={styles.replyText}>{replyingTo.text || 'Media'}</Text>
                                        </View>
                                        <Pressable onPress={() => setReplyingTo(null)} style={{ padding: 4 }}>
                                            <MaterialIcons name="close" size={20} color="rgba(255,255,255,0.5)" />
                                        </Pressable>
                                    </View>
                                </GlassView>
                            )}

                            {/* Floating Options Menu — FULL RESTORATION */}
                            <View style={styles.inputAreaRow}>
                                <View style={{ width: 44, height: 44, marginRight: 6 }}>
                                    {/* Placeholder for the morphing menu to reserve space */}
                                </View>

                                <View style={[styles.unifiedPillContainer, isRecording && { opacity: 0 }]}>
                                    <GlassView intensity={35} tint="dark" style={StyleSheet.absoluteFill} />
                                    <View style={styles.inputWrapper}>
                                        <TextInput
                                            style={styles.input}
                                            value={inputText}
                                            onChangeText={setInputText}
                                            placeholder="Message"
                                            placeholderTextColor="rgba(255,255,255,0.3)"
                                            multiline
                                            onFocus={handleFocus}
                                        />
                                    </View>
                                </View>

                                {/* Morphing Menu Container — Elevated to top layer */}
                                <Animated.View 
                                    style={[
                                        styles.morphingMenuContainer,
                                        animatedMorphStyle,
                                        { zIndex: 9999 } // Ensure it's above everything
                                    ]}
                                >
                                    <PressableFlash
                                        style={StyleSheet.absoluteFill}
                                        borderRadius={22}
                                        flashColor={activeTheme.primary}
                                        onPress={toggleOptions}
                                    >
                                        <GlassView intensity={65} tint="dark" style={StyleSheet.absoluteFill} />
                                        
                                        <View style={styles.morphingInnerContent}>
                                            {/* The Toggle Button (Always at bottom) */}
                                            <View style={styles.persistentToggleArea}>
                                                <Animated.View style={animatedIconRotation}>
                                                    <MaterialIcons 
                                                        name={isExpanded ? "close" : "add"} 
                                                        size={26} 
                                                        color={isExpanded ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.8)"} 
                                                    />
                                                </Animated.View>
                                            </View>

                                            {/* The Menu Content (Expands upwards) */}
                                            <Animated.View style={[styles.menuItemsList, animatedContentOpacity]} pointerEvents={isExpanded ? 'auto' : 'none'}>
                                                {[
                                                    { name: 'photo-camera', label: 'Camera', color: '#f43f5e', bg: 'rgba(244, 63, 94, 0.12)', action: handleSelectCamera },
                                                    { name: 'photo-library', label: 'Gallery', color: '#60a5fa', bg: 'rgba(96, 165, 250, 0.12)', action: handleSelectGallery },
                                                    { name: 'insert-drive-file', label: 'Document', color: '#4ade80', bg: 'rgba(74, 222, 128, 0.12)', action: handleSelectDocument },
                                                    { name: 'person-outline', label: 'Contact', color: 'rgba(255,255,255,0.85)', bg: 'rgba(255,255,255,0.06)', action: handleSelectContact },
                                                ].map((opt, idx, arr) => (
                                                    <React.Fragment key={opt.label}>
                                                        <Pressable 
                                                            style={styles.optionItem} 
                                                            onPress={(e) => { 
                                                                e.stopPropagation();
                                                                opt.action(); 
                                                                toggleOptions(); 
                                                            }}
                                                        >
                                                            <View style={[styles.optionIcon, { backgroundColor: opt.bg }]}>
                                                                <MaterialIcons name={opt.name as any} size={22} color={opt.color} />
                                                            </View>
                                                            <Text style={styles.optionText}>{opt.label}</Text>
                                                        </Pressable>
                                                        {idx < arr.length - 1 && <View style={styles.optionDivider} />}
                                                    </React.Fragment>
                                                ))}
                                            </Animated.View>
                                        </View>
                                    </PressableFlash>
                                </Animated.View>

                                {inputText.trim() ? (
                                    <PressableFlash
                                        style={styles.sendButton}
                                        borderRadius={22}
                                        flashColor={activeTheme.primary}
                                        onPress={handleSend}
                                    >
                                        <GlassView intensity={35} tint="dark" style={StyleSheet.absoluteFill} />
                                        <MaterialIcons name="arrow-upward" size={22} color="#fff" />
                                    </PressableFlash>
                                ) : (
                                    <View
                                        onTouchStart={handleMicTouchStart}
                                        onTouchMove={handleMicTouchMove}
                                        onTouchEnd={handleMicTouchEnd}
                                        style={isRecording ? { opacity: 0 } : {}}
                                    >
                                        <Animated.View style={[styles.sendButton, recordingPulseStyle]}>
                                            <GlassView intensity={35} tint="dark" style={StyleSheet.absoluteFill} />
                                            <MaterialIcons name="mic" size={22} color={isRecording ? '#fff' : 'rgba(255,255,255,0.7)'} />
                                        </Animated.View>
                                    </View>
                                )}

                                {isRecording && (
                                    <Animated.View style={[StyleSheet.absoluteFill, { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, zIndex: 10 }]}>
                                        <Animated.View style={[styles.deleteIconWrap, deleteIconAnimatedStyle]}>
                                            <MaterialIcons name="delete-outline" size={24} color="#ef4444" />
                                        </Animated.View>
                                        <Animated.View style={[styles.deleteIconWrap, deleteIconAnimatedStyle, { position: 'absolute', left: 4, backgroundColor: 'transparent' }]}>
                                            <MaterialIcons name="delete" size={24} color="#ef4444" />
                                        </Animated.View>

                                        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(18, 16, 26, 0.4)', borderRadius: 24, height: 44, marginHorizontal: 4, paddingHorizontal: 12, borderWidth: 1.2, borderColor: 'rgba(255,255,255,0.22)', overflow: 'hidden' }}>
                                            <GlassView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
                                            <Animated.View style={[styles.recordingIndicator, recordingPulseStyle]} />
                                            <Text style={styles.recordingTimer}>{formatDuration(recordingDuration)}</Text>
                                            
                                            <View style={{ flex: 1, paddingHorizontal: 8, justifyContent: 'center' }}>
                                               <Animated.View style={[{ position: 'absolute', width: '100%', alignItems: 'center' }, cancelTextAnimatedStyle]}>
                                                   <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: '500' }}>Slide to cancel</Text>
                                               </Animated.View>
                                               <Animated.View style={recordingWaveAnimatedStyle}>
                                                   <SiriWaveform level={recordingLevel} active={isRecording} themeColor={activeTheme.primary} />
                                               </Animated.View>
                                            </View>

                                            <Animated.View style={[{ opacity: 0.4 }, slideToCancelStyle]}>
                                                <MaterialIcons name="chevron-left" size={20} color="white" />
                                            </Animated.View>
                                        </View>

                                        <Animated.View style={[styles.recordingMicIconWrap, recordingMicAnimatedStyle, { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' }]}>
                                            <MaterialIcons name="mic" size={24} color="#fff" />
                                        </Animated.View>
                                    </Animated.View>
                                )}
                            </View>
                        </Animated.View>
                    </View>
                </View>
            </Animated.View>
            </KeyboardAvoidingView>

            {/* Root-level Close Button for Overlay — Top Priority */}
            {isOverlay && (
                <View style={{ position: 'absolute', top: Math.max(insets.top, 20), right: 20, zIndex: 100000 }} pointerEvents="auto">
                    <Pressable 
                        onPress={() => {
                            Keyboard.dismiss();
                            onBack?.();
                        }} 
                        hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
                        style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' }}
                    >
                        <MaterialIcons name="close" size={24} color="white" />
                    </Pressable>
                </View>
            )}

            {/* Reaction Modal */}
            <MessageContextMenu
                visible={!!selectedContextMessage}
                msg={selectedContextMessage?.msg}
                layout={selectedContextMessage?.layout}
                onClose={() => setSelectedContextMessage(null)}
                onReaction={handleReaction}
                onAction={handleAction}
                chatMessages={chatMessages}
                contactName={contact?.name || 'Them'}
                isAdmin={isAdmin}
            />

            {/* Call Options Dropdown */}






            <MediaPickerSheet
                visible={showMediaPicker}
                onClose={() => setShowMediaPicker(false)}
                onSelectCamera={handleSelectCamera}
                onSelectGallery={handleSelectGallery}
                onSelectAssets={(assets) => {
                    setShowMediaPicker(false);
                    const formattedAssets = assets.map(a => ({
                        uri: a.uri,
                        type: a.mediaType === 'video' ? 'video' : 'image'
                    }));
                    setMediaPreview(formattedAssets as any);
                }}
                onSelectAudio={handleSelectDocument}
                onSelectNote={() => {
                    setShowMediaPicker(false);
                    showSoulAlert("Soul Notes", "Leave a note from the Home screen!");
                }}
            />

            {/* Media Preview Modal */}
            <MediaPreviewModal
                visible={!!mediaPreview && mediaPreview.length > 0}
                initialMediaItems={mediaPreview || undefined}
                onClose={() => setMediaPreview(null)}
                onSend={handleSendMedia}
                isUploading={isUploading}
            />

            {/* Media Collection Modal */}
            <Modal
                visible={!!mediaCollection}
                transparent
                animationType="fade"
                onRequestClose={() => setMediaCollection(null)}
            >
                <View style={styles.mediaCollectionOverlay}>
                    <View style={styles.mediaCollectionHeader}>
                        <Text style={styles.mediaCollectionTitle}>Media</Text>
                        <Pressable onPress={() => setMediaCollection(null)} style={styles.mediaCollectionCloseBtn}>
                            <MaterialIcons name="close" size={22} color="#fff" />
                        </Pressable>
                    </View>

                    <FlatList
                        data={mediaCollection?.items || []}
                        keyExtractor={(item, index) => `${item.url}-${index}`}
                        numColumns={3}
                        contentContainerStyle={styles.mediaCollectionGrid}
                        renderItem={renderCollectionItem}
                    />

                    {!!mediaCollection?.messageId && (
                        <View style={styles.mediaCollectionReactionBar}>
                            {['❤️', '🔥', '😂'].map(emoji => (
                                <Pressable
                                    key={emoji}
                                    style={styles.mediaCollectionReactionBtn}
                                    onPress={() => handleReactAllMedia(mediaCollection.messageId, emoji)}
                                >
                                    <Text style={styles.mediaCollectionReactionText}>{emoji}</Text>
                                </Pressable>
                            ))}
                        </View>
                    )}
                </View>
            </Modal>

            {/* Single Media Viewer (Old Removed) */}

            {/* Premium Media Viewer (Seamless Morph & Blur) */}
            <EnhancedMediaViewer
                visible={!!mediaViewer}
                isStatus={false}
                media={mediaViewer && mediaViewer.items && typeof mediaViewer.index === 'number' 
                    ? mediaViewer.items[mediaViewer.index] as any 
                    : null}
                sourceLayout={selectedMediaLayout}
                userInfo={(() => {
                    if (!mediaViewer) return undefined;
                    const msg = chatMessages.find((m: any) => m.id === mediaViewer.messageId);
                    if (!msg) return { name: 'You', timestamp: 'Just now' };

                    const isMe = msg.sender === 'me';

                    // Robust timestamp parsing
                    let formattedTime = 'Just now';
                    if (msg.timestamp) {
                        try {
                            const date = new Date(msg.timestamp);
                            if (!isNaN(date.getTime())) {
                                formattedTime = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                            }
                        } catch (e) {
                            console.error('Error parsing date:', e);
                        }
                    }

                    return {
                        name: isMe ? 'You' : (contact?.name || 'Contact'),
                        avatar: isMe ? currentUser?.avatar : contact?.avatar,
                        timestamp: formattedTime
                    };
                })()}
                onClose={() => {
                    setMediaViewer(null);
                    setSelectedMediaLayout(null);
                }}
                onSendComment={(comment) => {
                    if (id && comment.trim()) {
                        sendChatMessage(messageKey, comment);
                    }
                }}
                onDownload={handleSaveCurrentMedia}
                onReply={() => {
                    if (mediaViewer) {
                        const msg = chatMessages.find((m: any) => m.id === mediaViewer.messageId);
                        setEditingMessage(null);
                        if (msg) setReplyingTo(msg);
                        setMediaViewer(null);
                        setSelectedMediaLayout(null);
                    }
                }}
                onForward={() => {
                    showSoulAlert('Coming Soon', 'Forwarding will be available soon.');
                }}
                onReaction={(emoji) => {
                    if (mediaViewer && id) {
                        addReaction(id, mediaViewer.messageId, emoji);
                    }
                }}
                onEdit={() => {
                    if (!mediaViewer) return;
                    const msg = chatMessages.find((m: any) => m.id === mediaViewer.messageId);
                    if (!msg || msg.sender !== 'me') return;
                    setReplyingTo(null);
                    setEditingMessage(msg as any);
                    setInputText(msg.text || msg.media?.caption || '');
                    setMediaViewer(null);
                    setSelectedMediaLayout(null);
                }}
                onShare={() => showSoulAlert('Share', 'External sharing will be available soon.')}
            />

            {/* Music Player Overlay - Moved to root for z-index and blur reliability */}
            <MusicPlayerOverlay
                isOpen={showMusicPlayer}
                onClose={() => setShowMusicPlayer(false)}
                contactName={contact?.name || 'Someone'}
                chatId={rawId}
            />

            <GlassAlert
                visible={alertConfig.visible}
                title={alertConfig.title}
                message={alertConfig.message}
                buttons={alertConfig.buttons}
                onClose={closeSoulAlert}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    headerWrapper: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 999,
        pointerEvents: 'box-none',
    },
    headerPill: {
        height: HEADER_PILL_HEIGHT,
        borderRadius: HEADER_PILL_RADIUS,
        backgroundColor: 'transparent',
        overflow: 'hidden',
        right: 24,
    },
    headerGlass: {
        borderRadius: HEADER_PILL_RADIUS,
        overflow: 'hidden',
        backgroundColor: 'transparent',
        borderWidth: 1.2,
        borderColor: 'rgba(255, 255, 255, 0.22)',
    },
    header: {
        flex: 1,
        backgroundColor: 'transparent',
        paddingLeft: 8,
        paddingRight: 10,
        flexDirection: 'row',
        alignItems: 'center',
        // gap: 14,
    },
    backButton: {
        padding: 4,
    },
    avatarWrapper: {
        position: 'relative',
    },
    avatarWrapperHidden: {
        opacity: 0,
    },
    avatar: {
        width: 46,
        height: 46,
        borderRadius: 23,
        borderWidth: 0,
    },
    onlineIndicator: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        width: 14,
        height: 14,
        borderRadius: 7,
        backgroundColor: '#22c55e',
    },
    headerInfo: {
        flex: 1,
        marginLeft: 3,
        justifyContent: 'center',
    },
    contactName: {
        color: '#ffffff',
        fontSize: 17,
        fontWeight: '700',
        letterSpacing: 0.5,
        marginBottom: 2,
    },
    statusText: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 8.5,
        fontWeight: '600',
        letterSpacing: 0.5,
        textTransform: 'uppercase',
        marginLeft: -2, // Pull closer to the dot
    },
    headerButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.22)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    messagesList: {
        flex: 1,
    },
    messagesContent: {
        paddingHorizontal: 16,
        paddingTop: 110, // Visually paddingBottom due to inverted
        paddingBottom: 100, // Visually paddingTop due to inverted
        flexGrow: 1,
    },
    overlayMessagesContent: {
        // Inverted list: paddingTop is the visual bottom spacer above the composer.
        // Keep the room here so the user can still scroll naturally like the normal chat.
        paddingTop: 156,
        paddingBottom: 24,
    },
    overlayMessagesContentKeyboard: {
        paddingTop: 88,
        paddingBottom: 12,
    },
    emptyChat: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 100,
    },
    emptyChatText: {
        color: 'rgba(255,255,255,0.3)',
        fontSize: 16,
        fontWeight: '600',
        marginTop: 16,
    },
    stickyDateHeaderContainer: {
        position: 'absolute',
        top: 140, // Below header
        left: 0,
        right: 0,
        alignItems: 'center',
        zIndex: 80,
    },
    stickyDateBubble: {
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 16,
        paddingHorizontal: 16,
        paddingVertical: 6,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    stickyDateText: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
    emptyChatHint: {
        color: 'rgba(255,255,255,0.2)',
        fontSize: 13,
        marginTop: 4,
    },
    typingContainer: {
        paddingHorizontal: 20,
        paddingBottom: 10,
        alignItems: 'flex-start' as const,
    },
    typingIndicatorWrapper: {
        position: 'absolute',
        bottom: 85,
        left: 20,
        zIndex: 100,
    },
    typingBubbleMini: {
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 999,
        width: 48,
        height: 28,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    typingLottie: {
        width: 40,
        height: 40,
    },
    typingBubble: {
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 16,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderTopLeftRadius: 4,
    },
    replyPreview: {
        marginBottom: 8,
        borderRadius: 16,
        padding: 12,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        overflow: 'hidden',
        width: '100%',
        alignSelf: 'center',
    },
    replyContent: {
        flexDirection: 'row',
        // gap: 10,
        flex: 1,
    },
    replyTextContainer: {
        flex: 1,
    },
    replySender: {
        fontSize: 8,
        fontWeight: '900',
        letterSpacing: 2,
    },
    replyText: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.5)',
    },
    replyThumbnail: {
        width: 44,
        height: 44,
        borderRadius: 6,
        marginLeft: 10,
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    inputArea: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        paddingHorizontal: 16,
        paddingTop: 10,
        paddingBottom: Platform.OS === 'ios' ? 24 : 16,
        backgroundColor: 'transparent',
        zIndex: 60,
    },
    inputAreaRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        // gap: 8,
    },
    unifiedPillContainer: {
        flex: 1,
        backgroundColor: 'transparent',
        borderRadius: 24,
        borderWidth: 1.2,
        borderColor: 'rgba(255, 255, 255, 0.22)',
        overflow: 'hidden',
        minHeight: 44,
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 4,
        minHeight: 44,
        maxHeight: 120,
    },
    attachButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.2,
        borderColor: 'rgba(255, 255, 255, 0.22)',
        flexShrink: 0,
        marginBottom: 0,
        marginRight: 6,
        overflow: 'hidden',
    },
    input: {
        flex: 1,
        color: '#ffffff',
        fontSize: 14,
        paddingVertical: 0,
        paddingHorizontal: 8,
        fontWeight: '300',
    },
    sendButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.2,
        borderColor: 'rgba(255, 255, 255, 0.22)',
        flexShrink: 0,
        overflow: 'hidden',
        marginLeft: 6,
    },
    sendButtonActive: {
        // Handled via inline themeAccent for dynamic switching
    },
    errorText: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 16,
        textAlign: 'center',
        marginTop: 100,
    },
    headerScrollBlur: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 140,
        zIndex: 90,
    },
    bottomScrollBlur: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 140,
        zIndex: 50,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    callDropdown: {
        position: 'absolute',
        width: 160,
        borderRadius: 16,
        overflow: 'hidden',
        borderWidth: 1.2,
        borderColor: 'rgba(255, 255, 255, 0.22)',
        backgroundColor: 'rgba(15, 15, 20, 0.4)',
    },
    callDropdownContent: {
        borderRadius: 16,
        overflow: 'hidden',
    },
    callDropdownItem: {
        flexDirection: 'row',
        alignItems: 'center',
        // gap: 12,
        paddingVertical: 14,
        paddingHorizontal: 16,
    },
    callDropdownIcon: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    callDropdownText: {
        color: '#ffffff',
        fontSize: 14,
        fontWeight: '600',
        marginLeft: 12,
    },
    callDropdownDivider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.08)',
        marginHorizontal: 16,
    },
    mediaCollectionOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.95)',
        paddingTop: 56,
    },
    mediaCollectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingBottom: 14,
    },
    mediaCollectionTitle: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '700',
    },
    mediaCollectionCloseBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    mediaCollectionGrid: {
        paddingHorizontal: 10,
        paddingBottom: 20,
    },
    mediaCollectionTile: {
        width: (SCREEN_WIDTH - 20) / 3,
        aspectRatio: 1,
        padding: 2,
    },
    mediaCollectionImage: {
        width: '100%',
        height: '100%',
        borderRadius: 6,
    },
    mediaCollectionVideoBadge: {
        position: 'absolute',
        bottom: 8,
        right: 8,
        width: 26,
        height: 26,
        borderRadius: 13,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.55)',
    },
    mediaCollectionReactionBar: {
        flexDirection: 'row',
        justifyContent: 'center',
        // gap: 12,
        paddingVertical: 12,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.1)',
    },
    mediaCollectionReactionBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.08)',
    },
    mediaCollectionReactionText: {
        fontSize: 20,
    },
    mediaViewerContainer: {
        flex: 1,
        backgroundColor: '#000',
        justifyContent: 'center',
    },
    mediaViewerCloseBtn: {
        position: 'absolute',
        top: 50,
        left: 16,
        zIndex: 3,
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.45)',
    },
    mediaViewerSaveBtn: {
        position: 'absolute',
        top: 50,
        right: 16,
        zIndex: 3,
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.45)',
    },
    mediaViewerMedia: {
        width: '100%',
        height: '100%',
    },
    mediaViewerBottom: {
        position: 'absolute',
        left: 16,
        right: 16,
        bottom: 28,
    },
    mediaViewerReactionsRow: {
        flexDirection: 'row',
        // gap: 10,
    },
    mediaViewerReactionBtn: {
        width: 42,
        height: 42,
        borderRadius: 21,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.14)',
    },
    mediaViewerReactionText: {
        fontSize: 20,
    },
    mediaViewerReactionList: {
        marginTop: 8,
        color: 'rgba(255,255,255,0.85)',
        fontSize: 14,
    },
    nowPlayingStatus: {
        flexDirection: 'row',
        alignItems: 'center',
        // gap: 4,
    },
    morphingMenuContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        backgroundColor: 'transparent',
        borderWidth: 1.2,
        borderColor: 'rgba(255, 255, 255, 0.15)',
        overflow: 'hidden',
    },
    morphingInnerContent: {
        flex: 1,
        flexDirection: 'column-reverse',
    },
    persistentToggleArea: {
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
    menuItemsList: {
        padding: 6,
        paddingBottom: 4,
        flex: 1,
    },
    optionItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 12,
    },
    optionIcon: {
        width: 34,
        height: 34,
        borderRadius: 17,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 14,
    },
    optionText: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: '500',
        letterSpacing: -0.2,
    },
    optionDivider: {
        height: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        marginLeft: 56,
        marginRight: 10,
    },
    inputWrapperHidden: {
        opacity: 0,
    },
    recordingIndicator: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: 8,
    },
    deleteIconWrap: {
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.06)',
        marginRight: 6,
    },
    recordingTimer: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
        width: 45,
    },
    siriWaveWrap: {
        width: 200,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 20,
        overflow: 'hidden',
        shadowOpacity: 0.55,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 0 },
    },
    cancelHintChevron: {
        alignItems: 'center',
        justifyContent: 'center',
        width: 18,
        marginLeft: 2,
    },
    recordingMicIconWrap: {
        width: 42,
        height: 42,
        borderRadius: 21,
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 6,
    },
    searchBarWrap: {
        position: 'absolute',
        top: HEADER_PILL_TOP + HEADER_PILL_HEIGHT + 10,
        left: 16,
        right: 16,
        zIndex: 999,
    },
    searchBar: {
        minHeight: 42,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        // gap: 6,
    },
    searchInput: {
        flex: 1,
        color: '#fff',
        fontSize: 14,
        paddingVertical: 8,
    },
    searchCount: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 11,
    },
    searchNavBtn: {
        width: 24,
        height: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    starredOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
    },
    starredPanel: {
        width: '100%',
        maxHeight: '70%',
        borderRadius: 18,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        padding: 14,
    },
    starredHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    starredTitle: {
        color: '#fff',
        fontSize: 17,
        fontWeight: '700',
    },
    starredEmpty: {
        color: 'rgba(255,255,255,0.6)',
        textAlign: 'center',
        marginTop: 20,
    },
    starredItem: {
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.08)',
    },
    starredText: {
        color: '#fff',
        fontSize: 14,
        marginBottom: 4,
    },
    starredTime: {
        color: 'rgba(255,255,255,0.55)',
        fontSize: 11,
    },
    miniCallItem: { flexDirection: 'row', alignItems: 'center', padding: 10, gap: 12 },
    miniCallIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
    miniCallText: { color: 'white', fontSize: 15, fontWeight: '700' },
    miniCallDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginHorizontal: 8 },
});
