import React, { useRef, useCallback, useMemo, useEffect } from 'react';
import { View, Text, Pressable, Alert, Platform, Image as RNImage, Linking } from 'react-native';
import { Image } from 'expo-image';
import { getInfoAsync } from 'expo-file-system';
import LottieView from 'lottie-react-native';
import GlassView from '../ui/GlassView';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { 
    useSharedValue, 
    useAnimatedStyle, 
    withSpring, 
    withTiming,
    withSequence,
    withRepeat,
    interpolateColor,
    runOnJS 
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useApp } from '../../context/AppContext';
import { Message } from '../../types';
import { ChatStyles } from './ChatStyles';
import { getMessageMediaItems } from '../../utils/chatUtils';
import VoiceNotePlayer from './VoiceNotePlayer';
import { SpoilerView } from 'react-native-spoiler-view';

interface MessageBubbleProps {
    msg: Message;
    contactName: string;
    onLongPress?: (id: string, layout: any) => void;
    onReply?: (m: Message) => void;
    isSelected?: boolean;
    onReaction?: (emoji: string) => void;
    quotedMessage?: Message | null;
    onDoubleTap?: (id: string) => void;
    onMediaTap?: (data: any) => void;
    isClone?: boolean;
    selectionMode?: boolean;
    isChecked?: boolean;
    onSelectToggle?: (id: string) => void;
    initialAspectRatio?: number | null;
    isHighlighted?: boolean;
    onQuotePress?: (msgId: string) => void;
    uploadProgress?: number;
    onMediaDownload?: (msgId: string, url: string, index: number) => void;
    onRetry?: (msgId: string) => void;
    isHidden?: boolean;
}

const URL_REGEX = /(https?:\/\/[^\s]+)/g;

const LinkedText = ({ text, style }: { text: string; style: any }) => {
    const parts = text.split(URL_REGEX);
    if (parts.length === 1) return <Text style={style}>{text}</Text>;

    return (
        <Text style={style}>
            {parts.map((part, i) =>
                URL_REGEX.test(part) ? (
                    <Text
                        key={i}
                        style={{ textDecorationLine: 'underline', color: '#60a5fa' }}
                        onPress={() => Linking.openURL(part).catch(() => {})}
                    >
                        {part}
                    </Text>
                ) : (
                    <Text key={i}>{part}</Text>
                )
            )}
        </Text>
    );
};

const formatTime = (ts: string) => {
    if (!ts) return '';
    if (ts.includes('AM') || ts.includes('PM') || ts.includes(':')) {
        if (!ts.includes('T')) return ts; 
    }
    try {
        return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch(e) {
        return ts;
    }
};

const areNumberArraysEqual = (a: number[], b: number[]) => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
        if (a[i] !== b[i]) return false;
    }
    return true;
};

const isSameRatio = (current: number | null, next: number) => {
    if (current == null) return false;
    return Math.abs(current - next) < 0.02;
};

const mediaAspectRatioCache = new Map<string, number>();
const DEFAULT_MEDIA_RATIO = 0.78;
const MEDIA_DOUBLE_TAP_DELAY_MS = 260;
const MEDIA_LIKE_ANIMATION_HIDE_MS = 920;
const MEDIA_LIKE_ANIMATION_SOURCE = {
    uri: 'https://lottie.host/a1007fcc-beef-400c-ae66-36168992c97a/GaYBDY5AIT.lottie',
};

const isLikeableMediaType = (type?: string) => type === 'image' || type === 'status_reply';

const MessageBubble = React.memo(({ 
  msg, 
  contactName, 
  onLongPress, 
  onReply, 
  isSelected, 
  onReaction, 
  quotedMessage, 
  onDoubleTap, 
  onMediaTap, 
  isClone,
  selectionMode,
  isChecked,
  onSelectToggle,
  initialAspectRatio,
  isHighlighted = false,
  onQuotePress,
  uploadProgress,
    onMediaDownload,
    onRetry,
    isHidden,
}: MessageBubbleProps) => {
    // Fade-in when transitioning from hidden → visible (flying bubble handoff)
    const revealOpacity = useSharedValue(isHidden ? 0 : 1);
    const wasHidden = useRef(isHidden);
    useEffect(() => {
        if (wasHidden.current && !isHidden) {
            revealOpacity.value = 0;
            revealOpacity.value = withTiming(1, { duration: 250 });
        }
        wasHidden.current = isHidden;
    }, [isHidden]);

    const revealStyle = useAnimatedStyle(() => ({
        opacity: revealOpacity.value,
    }));

    const initialMediaItems = getMessageMediaItems(msg);
    const initialMediaSource =
        initialMediaItems[0]?.localFileUri ||
        (initialMediaItems[0]?.url && (
            initialMediaItems[0].url.startsWith('http') ||
            initialMediaItems[0].url.startsWith('file:') ||
            initialMediaItems[0].url.startsWith('data:')
        ) ? initialMediaItems[0].url : undefined) ||
        initialMediaItems[0]?.thumbnail ||
        null;
    const cachedAspectRatio = initialMediaSource ? mediaAspectRatioCache.get(`${msg.id}:${initialMediaSource}`) ?? null : null;
    const { activeTheme } = useApp();
    const [aspectRatio, setAspectRatio] = React.useState<number | null>(initialAspectRatio || cachedAspectRatio || null);
    const [downloadingIndices, setDownloadingIndices] = React.useState<number[]>([]);
    const [invalidLocalIndices, setInvalidLocalIndices] = React.useState<number[]>([]);
    const [likeAnimation, setLikeAnimation] = React.useState<{ index: number; nonce: number } | null>(null);
    const translateX = useSharedValue(0);
    const likeAnimationOpacity = useSharedValue(0);
    const likeAnimationScale = useSharedValue(0.72);
    const isMe = msg.sender === 'me';
    const bubbleRef = useRef<View>(null);
    const likeHideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastLongPressAtRef = useRef(0);
    const pendingMediaTapRef = useRef<{
        index: number;
        at: number;
        timeout: ReturnType<typeof setTimeout> | null;
    }>({
        index: -1,
        at: 0,
        timeout: null,
    });

    const mediaItems = useMemo(() => getMessageMediaItems(msg), [msg]);
    const enableMessageLevelDoubleTap = useMemo(
        () => !mediaItems.some((media) => isLikeableMediaType(media.type)),
        [mediaItems]
    );
    const mediaValidationKey = useMemo(
        () => mediaItems.map((media, index) => `${index}:${media.localFileUri || ''}:${media.url || ''}:${media.thumbnail || ''}`).join('|'),
        [mediaItems]
    );
    const invalidLocalIndexSet = useMemo(() => new Set(invalidLocalIndices), [invalidLocalIndices]);
    const primaryMediaPreviewSource = useMemo(() => {
        const media = mediaItems[0];
        if (!media || media.type === 'audio') return null;
        const usableLocalUri = invalidLocalIndexSet.has(0) ? undefined : media.localFileUri;
        const fallbackRemoteUri = media.url && (media.url.startsWith('http') || media.url.startsWith('file:') || media.url.startsWith('data:'))
            ? media.url
            : undefined;
        return usableLocalUri || fallbackRemoteUri || media.thumbnail || null;
    }, [mediaItems, invalidLocalIndexSet]);
    const primaryMediaAspectCacheKey = primaryMediaPreviewSource ? `${msg.id}:${primaryMediaPreviewSource}` : null;

    React.useEffect(() => {
        let cancelled = false;

        const validateLocalMedia = async () => {
            const results = await Promise.all(mediaItems.map(async (media, index) => {
                if (!media.localFileUri?.startsWith('file://')) return null;
                try {
                    const info = await getInfoAsync(media.localFileUri);
                    return info.exists ? null : index;
                } catch {
                    return index;
                }
            }));

            if (!cancelled) {
                const nextInvalidIndices = results.filter((value): value is number => value !== null);
                setInvalidLocalIndices((prev) => (
                    areNumberArraysEqual(prev, nextInvalidIndices) ? prev : nextInvalidIndices
                ));
            }
        };

        validateLocalMedia();

        return () => {
            cancelled = true;
        };
    }, [mediaItems, mediaValidationKey]);

    React.useEffect(() => {
        if (!primaryMediaPreviewSource || aspectRatio != null) return;

        let cancelled = false;

        RNImage.getSize(
            primaryMediaPreviewSource,
            (width, height) => {
                if (cancelled || !width || !height) return;
                const ratio = Math.max(0.6, Math.min(width / height, 1.8));
                if (primaryMediaAspectCacheKey) {
                    mediaAspectRatioCache.set(primaryMediaAspectCacheKey, ratio);
                }
                setAspectRatio(prev => (isSameRatio(prev, ratio) ? prev : ratio));
            },
            () => {
                if (!cancelled) {
                    // Fallback to square aspect ratio on measurement failure
                    setAspectRatio(prev => prev ?? 1);
                }
            }
        );

        return () => {
            cancelled = true;
        };
    }, [aspectRatio, primaryMediaAspectCacheKey, primaryMediaPreviewSource]);

    React.useEffect(() => () => {
        if (pendingMediaTapRef.current.timeout) {
            clearTimeout(pendingMediaTapRef.current.timeout);
        }
        if (likeHideTimeoutRef.current) {
            clearTimeout(likeHideTimeoutRef.current);
        }
    }, []);
    
    React.useEffect(() => {
        if (!isMe && onMediaDownload) {
            mediaItems.forEach((media, index) => {
                const usableLocalUri = invalidLocalIndexSet.has(index) ? undefined : media.localFileUri;

                // If we JUST got the localFileUri, remove it from downloadingIndices
                if (usableLocalUri && downloadingIndices.includes(index)) {
                    console.log(`[MessageBubble] Media downloaded: clearing index ${index}`);
                    setDownloadingIndices(prev => prev.filter(i => i !== index));
                    return;
                }

                // Auto-download any media we don't have locally (keys or remote URLs)
                if (media.url && !usableLocalUri && !downloadingIndices.includes(index)) {
                    const isLocalPath = media.url.startsWith('file:') || media.url.startsWith('data:');
                    if (!isLocalPath) {
                        console.log(`[MessageBubble] Auto-downloading media: ${media.url.substring(0, 60)}...`);
                        setDownloadingIndices(prev => [...prev, index]);
                        onMediaDownload(msg.id, media.url, index);
                    }
                }
            });
        }
    }, [isMe, msg.id, mediaItems, onMediaDownload, downloadingIndices, invalidLocalIndexSet]);

    const hasText = !!msg.text;
    const hasCaption = !!msg.media?.caption;
    const isMediaOnly = mediaItems.length > 0 && !hasText && !hasCaption && mediaItems[0].type !== 'audio';

    const doubleTapGesture = Gesture.Tap()
        .numberOfTaps(2)
        .maxDuration(250)
        .onEnd(() => {
            if (enableMessageLevelDoubleTap && onDoubleTap) runOnJS(onDoubleTap)(msg.id);
        });

    const measureAndShowMenu = useCallback((id: string) => {
        bubbleRef.current?.measure((x, y, width, height, pageX, pageY) => {
            if (onLongPress) {
                onLongPress(id, { x: pageX, y: pageY, width, height, aspectRatio });
            }
        });
    }, [onLongPress, aspectRatio]);

    const measureAndShowMedia = useCallback((index: number, openGallery: boolean) => {
        bubbleRef.current?.measure((x, y, width, height, pageX, pageY) => {
            if (onMediaTap) {
                onMediaTap({
                    messageId: msg.id,
                    mediaItems,
                    index,
                    openGallery,
                    layout: { x: pageX, y: pageY, width, height }
                });
            }
        });
    }, [onMediaTap, msg.id, mediaItems]);

    const longPressGesture = Gesture.LongPress()
        .minDuration(400)
        .runOnJS(true)
        .onStart(() => {
            if (!selectionMode && !isClone) {
                lastLongPressAtRef.current = Date.now();
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                measureAndShowMenu(msg.id);
            }
        });

    const panGesture = Gesture.Pan()
        .activeOffsetX([-10, 10])
        .failOffsetY([-10, 10])
        .onUpdate((e) => {
            if (!selectionMode && !isClone) {
                translateX.value = Math.max(0, Math.min(e.translationX, 80));
            }
        })
        .onEnd(() => {
            if (translateX.value > 60 && onReply && !isClone) {
                runOnJS(Haptics.notificationAsync)(Haptics.NotificationFeedbackType.Success);
                runOnJS(onReply)(msg);
            }
            translateX.value = withSpring(0);
        });

    const singleTapGesture = Gesture.Tap()
        .onEnd(() => {
            if (selectionMode && onSelectToggle && !isClone) {
                runOnJS(onSelectToggle)(msg.id);
            }
        });

    const composedGestures = selectionMode
        ? singleTapGesture
        : enableMessageLevelDoubleTap
            ? Gesture.Simultaneous(panGesture, Gesture.Exclusive(doubleTapGesture, longPressGesture))
            : Gesture.Simultaneous(panGesture, longPressGesture);

    const highlightProgress = useSharedValue(0);

    React.useEffect(() => {
        if (isHighlighted) {
            highlightProgress.value = withSequence(
                withTiming(1, { duration: 200 }),
                withRepeat(withTiming(0, { duration: 400 }), 3, true),
                withTiming(0, { duration: 200 })
            );
        }
    }, [isHighlighted, highlightProgress]);

    const bubbleStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: translateX.value }],
        backgroundColor: interpolateColor(
            highlightProgress.value,
            [0, 1],
            ['transparent', 'rgba(255, 255, 255, 0.3)']
        )
    }));

    const likeAnimationStyle = useAnimatedStyle(() => ({
        opacity: likeAnimationOpacity.value,
        transform: [{ scale: likeAnimationScale.value }],
    }));

    const iconStyle = useAnimatedStyle(() => ({
        opacity: translateX.value / 60,
        transform: [
            { translateX: translateX.value - 60 },
            { scale: Math.min(translateX.value / 60, 1) }
        ] as any,
    }));

    const clearPendingMediaTap = useCallback(() => {
        if (pendingMediaTapRef.current.timeout) {
            clearTimeout(pendingMediaTapRef.current.timeout);
        }
        pendingMediaTapRef.current = {
            index: -1,
            at: 0,
            timeout: null,
        };
    }, []);

    const handleMediaPress = useCallback((index: number, openGallery = false) => {
        if (!isClone) {
            const media = mediaItems[index];
            const usableLocalUri = invalidLocalIndexSet.has(index) ? undefined : media.localFileUri;
            if (!isMe && !usableLocalUri && onMediaDownload) {
                if (!media.url) {
                    console.log(`[MessageBubble] No media URL for ${msg.id} — media not yet uploaded by sender`);
                    return;
                }
                if (!downloadingIndices.includes(index)) {
                    console.log(`[MessageBubble] Downloading media for ${msg.id}: ${media.url.substring(0, 60)}`);
                    setDownloadingIndices(prev => [...prev, index]);
                    onMediaDownload(msg.id, media.url, index);
                }
                return;
            }
            measureAndShowMedia(index, openGallery);
        }
    }, [downloadingIndices, invalidLocalIndexSet, isClone, isMe, mediaItems, measureAndShowMedia, msg.id, onMediaDownload]);

    const triggerLikeAnimation = useCallback((index: number) => {
        if (likeHideTimeoutRef.current) {
            clearTimeout(likeHideTimeoutRef.current);
        }

        clearPendingMediaTap();
        setLikeAnimation((prev) => ({
            index,
            nonce: (prev?.nonce ?? 0) + 1,
        }));

        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

        likeAnimationOpacity.value = 0;
        likeAnimationScale.value = 0.72;
        likeAnimationOpacity.value = withSequence(
            withTiming(1, { duration: 90 }),
            withTiming(1, { duration: 560 }),
            withTiming(0, { duration: 220 })
        );
        likeAnimationScale.value = withSequence(
            withSpring(1.08, { damping: 13, stiffness: 220 }),
            withTiming(0.96, { duration: 170 }),
            withTiming(1, { duration: 110 })
        );

        likeHideTimeoutRef.current = setTimeout(() => {
            setLikeAnimation(null);
        }, MEDIA_LIKE_ANIMATION_HIDE_MS);
    }, [clearPendingMediaTap, likeAnimationOpacity, likeAnimationScale]);

    const handleMediaTapIntent = useCallback((index: number, openGallery = false) => {
        const media = mediaItems[index];
        if (!media) return;

        if (Date.now() - lastLongPressAtRef.current < 450) {
            return;
        }

        if (!isLikeableMediaType(media.type) || selectionMode || isClone) {
            handleMediaPress(index, openGallery);
            return;
        }

        const now = Date.now();
        const pending = pendingMediaTapRef.current;
        const isDoubleTap =
            pending.timeout &&
            pending.index === index &&
            now - pending.at <= MEDIA_DOUBLE_TAP_DELAY_MS;

        if (isDoubleTap) {
            clearPendingMediaTap();
            triggerLikeAnimation(index);
            onDoubleTap?.(msg.id);
            return;
        }

        clearPendingMediaTap();
        pendingMediaTapRef.current = {
            index,
            at: now,
            timeout: setTimeout(() => {
                clearPendingMediaTap();
                handleMediaPress(index, openGallery);
            }, MEDIA_DOUBLE_TAP_DELAY_MS),
        };
    }, [clearPendingMediaTap, handleMediaPress, isClone, mediaItems, msg.id, onDoubleTap, selectionMode, triggerLikeAnimation]);

    const renderLikeOverlay = (index: number, size: number, borderRadius = 12) => {
        if (likeAnimation?.index !== index) return null;

        return (
            <Animated.View
                pointerEvents="none"
                style={[
                    ChatStyles.mediaLikeOverlay,
                    { borderRadius },
                    likeAnimationStyle,
                ]}
            >
                <LottieView
                    key={`media-like-${msg.id}-${likeAnimation.nonce}`}
                    source={MEDIA_LIKE_ANIMATION_SOURCE}
                    autoPlay
                    loop={false}
                    style={{ width: size, height: size }}
                />
            </Animated.View>
        );
    };

    const renderMediaContent = () => {
        if (!mediaItems.length) return null;

        if (mediaItems.length === 1) {
            const media = mediaItems[0];
            const usableLocalUri = invalidLocalIndexSet.has(0) ? undefined : media.localFileUri;
            const fallbackRemoteUri = media.url && (media.url.startsWith('http') || media.url.startsWith('file:') || media.url.startsWith('data:'))
                ? media.url
                : undefined;
            const previewSource = usableLocalUri || fallbackRemoteUri || media.thumbnail;
            const showDownloadOverlay = !isMe && !usableLocalUri;
            const shouldMeasureImage = !showDownloadOverlay || aspectRatio == null;
            if (media.type === 'audio') {
                return (
                    <VoiceNotePlayer 
                        uri={usableLocalUri || media.url} 
                        isMe={isMe} 
                        theme={activeTheme} 
                        initialDuration={media.duration} 
                    />
                );
            }

            const currentAspectRatio = aspectRatio || DEFAULT_MEDIA_RATIO;
            const mediaWidth = 260;
            const mediaHeight = mediaWidth / currentAspectRatio;
            const shouldHideInitialFlash = showDownloadOverlay && aspectRatio == null;

            return (
                <Pressable
                    onPress={() => handleMediaTapIntent(0)}
                    style={[
                        ChatStyles.mediaSurface,
                        isMe ? ChatStyles.mediaSurfaceMe : ChatStyles.mediaSurfaceThem,
                        !hasText && !hasCaption && ChatStyles.mediaSingleNoGap,
                        { 
                            width: mediaWidth,
                            height: mediaHeight,
                            backgroundColor: shouldHideInitialFlash ? 'transparent' : 'rgba(255,255,255,0.05)',
                        }
                    ]}
                >
                    {!shouldHideInitialFlash && (
                        <>
                            <Image
                                source={previewSource ? { uri: previewSource } : undefined}
                                placeholder={media.thumbnail && !media.thumbnail.startsWith('http') && !media.thumbnail.startsWith('file:')
                                    ? { blurhash: media.thumbnail }
                                    : undefined
                                }
                                style={{
                                    width: mediaWidth,
                                    height: mediaHeight,
                                }}
                                contentFit="cover"
                                transition={showDownloadOverlay ? 0 : 120}
                                cachePolicy="memory-disk"
                                blurRadius={showDownloadOverlay ? 20 : 0}
                                onLoad={(e) => {
                                    if (!shouldMeasureImage) return;
                                    const { width, height } = e.source;
                                    if (width && height) {
                                        const ratio = Math.max(0.6, Math.min(width / height, 1.8));
                                        if (primaryMediaAspectCacheKey) {
                                            mediaAspectRatioCache.set(primaryMediaAspectCacheKey, ratio);
                                        }
                                        setAspectRatio(prev => (isSameRatio(prev, ratio) ? prev : ratio));
                                    }
                                }}
                                onError={() => {
                                    if (usableLocalUri && !invalidLocalIndexSet.has(0)) {
                                        setInvalidLocalIndices(prev => (prev.includes(0) ? prev : [...prev, 0]));
                                    }
                                }}
                            />
                            {showDownloadOverlay && (
                                <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, width: mediaWidth, height: mediaHeight }}>
                                    <SpoilerView
                                        revealed={false}
                                        enabled={false}
                                        config={{
                                            particleColor: 'rgba(255, 255, 255, 0.55)',
                                            overlayColor: 'transparent',
                                            particleDensity: 0.04,
                                            particleSizeRange: [0.4, 1.2],
                                            revealDuration: 400,
                                            burstSpeed: 200,
                                        }}
                                        style={{ width: mediaWidth, height: mediaHeight }}
                                    >
                                        <View style={{ width: mediaWidth, height: mediaHeight }} />
                                    </SpoilerView>
                                </View>
                            )}
                        </>
                    )}
                    {media.type === 'video' && uploadProgress === undefined && !showDownloadOverlay && (
                        <View style={ChatStyles.mediaTilePlayOverlay}>
                            <MaterialIcons name="play-circle-filled" size={46} color="rgba(255,255,255,0.92)" />
                        </View>
                    )}
                    {uploadProgress !== undefined && uploadProgress < 1 && (
                        <View style={[ChatStyles.mediaTilePlayOverlay, { backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 46 }]}>
                            <Text style={{ color: 'white', fontSize: 14, fontWeight: 'bold' }}>
                                {Math.round(uploadProgress * 100)}%
                            </Text>
                        </View>
                    )}
                    {showDownloadOverlay && !shouldHideInitialFlash && (
                        <View style={[ChatStyles.mediaTilePlayOverlay, { backgroundColor: 'transparent' }]}>
                            <View style={{ backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 24, width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
                                <MaterialIcons
                                    name={downloadingIndices.includes(0) ? 'downloading' : (media.url ? 'file-download' : 'schedule')}
                                    size={26}
                                    color="#fff"
                                />
                            </View>
                        </View>
                    )}
                    {isLikeableMediaType(media.type) && renderLikeOverlay(0, Math.min(mediaWidth * 0.58, 164), 14)}
                </Pressable>
            );
        }

        const visibleItems = mediaItems.slice(0, 4);
        const extraCount = mediaItems.length - 4;

        // Split items into rows of 2 (WhatsApp-style grid)
        const rows: typeof visibleItems[] = [];
        for (let i = 0; i < visibleItems.length; i += 2) {
            rows.push(visibleItems.slice(i, i + 2));
        }

        const renderTile = (media: typeof visibleItems[0], index: number) => {
            const usableLocalUri = invalidLocalIndexSet.has(index) ? undefined : media.localFileUri;
            const fallbackRemoteUri = media.url && (media.url.startsWith('http') || media.url.startsWith('file:') || media.url.startsWith('data:'))
                ? media.url
                : undefined;
            const previewSource = usableLocalUri || fallbackRemoteUri || media.thumbnail;
            const showDownloadOverlay = !isMe && !usableLocalUri;
            const showMore = index === 3 && extraCount > 0;
            return (
                <Pressable
                    key={`grid-${index}`}
                    style={ChatStyles.mediaGridTile}
                    onPress={() => handleMediaTapIntent(index, showMore)}
                >
                    <Image
                        source={previewSource ? { uri: previewSource } : undefined}
                        placeholder={media.thumbnail && !media.thumbnail.startsWith('http') && !media.thumbnail.startsWith('file:')
                            ? { blurhash: media.thumbnail }
                            : undefined
                        }
                        style={ChatStyles.mediaGridImage}
                        contentFit="cover"
                        transition={showDownloadOverlay ? 0 : 120}
                        cachePolicy="memory-disk"
                        blurRadius={showDownloadOverlay ? 20 : 0}
                        onError={() => {
                            if (usableLocalUri && !invalidLocalIndexSet.has(index)) {
                                setInvalidLocalIndices(prev => (prev.includes(index) ? prev : [...prev, index]));
                            }
                        }}
                    />
                    {showDownloadOverlay && (
                        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
                            <SpoilerView
                                revealed={false}
                                enabled={false}
                                config={{
                                    particleColor: 'rgba(255, 255, 255, 0.55)',
                                    overlayColor: 'transparent',
                                    particleDensity: 0.04,
                                    particleSizeRange: [0.4, 1.2],
                                    revealDuration: 400,
                                    burstSpeed: 200,
                                }}
                                style={{ flex: 1 }}
                            >
                                <View style={{ flex: 1 }} />
                            </SpoilerView>
                        </View>
                    )}
                    {media.type === 'video' && !showMore && uploadProgress === undefined && !showDownloadOverlay && (
                        <View style={ChatStyles.mediaTilePlayOverlay}>
                            <MaterialIcons name="play-circle-filled" size={34} color="rgba(255,255,255,0.92)" />
                        </View>
                    )}
                    {uploadProgress !== undefined && uploadProgress < 1 && (
                        <View style={[ChatStyles.mediaTilePlayOverlay, { backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 34 }]}>
                            <Text style={{ color: 'white', fontSize: 12, fontWeight: 'bold' }}>
                                {Math.round(uploadProgress * 100)}%
                            </Text>
                        </View>
                    )}
                    {showDownloadOverlay && (
                        <View style={[ChatStyles.mediaTilePlayOverlay, { backgroundColor: 'transparent' }]}>
                            <View style={{ backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 20, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
                                <MaterialIcons
                                    name={downloadingIndices.includes(index) ? 'downloading' : 'file-download'}
                                    size={22}
                                    color="#fff"
                                />
                            </View>
                        </View>
                    )}
                    {showMore && (
                        <View style={ChatStyles.mediaMoreOverlay}>
                            <Text style={ChatStyles.mediaMoreText}>{`+${extraCount}`}</Text>
                        </View>
                    )}
                    {isLikeableMediaType(media.type) && renderLikeOverlay(index, 88, 10)}
                </Pressable>
            );
        };

        return (
            <View style={[
                ChatStyles.mediaSurface,
                ChatStyles.mediaGridSurface,
                isMe ? ChatStyles.mediaSurfaceMe : ChatStyles.mediaSurfaceThem,
                !hasText && !hasCaption && ChatStyles.mediaGridNoGap
            ]}>
                {rows.map((row, rowIndex) => (
                    <View
                        key={`row-${rowIndex}`}
                        style={[
                            ChatStyles.mediaGridRow,
                            rowIndex === rows.length - 1 && ChatStyles.mediaGridRowLast
                        ]}
                    >
                        {row.map((media, colIndex) => renderTile(media, rowIndex * 2 + colIndex))}
                    </View>
                ))}
            </View>
        );
    };

    if (isClone) {
        return (
            <Animated.View style={[bubbleStyle, { alignItems: isMe ? 'flex-end' : 'flex-start' }]}>
                <View style={[
                    ChatStyles.bubbleContainer,
                    isMe ? ChatStyles.bubbleContainerMe : ChatStyles.bubbleContainerThem,
                    quotedMessage && ChatStyles.bubbleContainerWithQuote,
                    isMediaOnly && ChatStyles.bubbleContainerMediaOnly,
                    { width: '100%', height: '100%', maxWidth: '100%' }
                ]}>
                    <View style={[ChatStyles.messageContent, isMediaOnly && ChatStyles.messageContentMediaOnly]}>
                        {quotedMessage && (
                            <View style={[ChatStyles.quotedContainer, isMe ? ChatStyles.quotedMe : ChatStyles.quotedThem]}>
                                <View style={ChatStyles.quoteContent}>
                                    <Text numberOfLines={1} style={[ChatStyles.quoteSender, { color: isMe ? '#fff' : activeTheme.primary }]}>
                                        {quotedMessage.sender === 'me' ? 'You' : contactName}
                                    </Text>
                                    <Text numberOfLines={1} style={[ChatStyles.quoteText, { color: isMe ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.5)' }]}>
                                        {quotedMessage.text}
                                    </Text>
                                </View>
                            </View>
                        )}
                        {renderMediaContent()}
                        {msg.media?.caption && (
                            <Text style={[ChatStyles.captionText, isMe ? { color: 'rgba(255,255,255,0.8)' } : { color: 'rgba(255,255,255,0.6)' }]}>
                                {msg.media.caption}
                            </Text>
                        )}
                        {hasText && (
                            <LinkedText text={msg.text} style={[ChatStyles.messageText, isMe && ChatStyles.messageTextMe]} />
                        )}
                    </View>
                </View>
                {msg.reactions && msg.reactions.length > 0 && (
                    <View style={[ChatStyles.reactionsRow, isMe ? ChatStyles.reactionsRight : ChatStyles.reactionsLeft]}>
                        {msg.reactions.map((r, idx) => (
                            <GlassView key={idx} intensity={40} tint="dark" style={ChatStyles.reactionPill} >
                                <Text style={ChatStyles.reactionEmoji}>{r}</Text>
                            </GlassView>
                        ))}
                    </View>
                )}
            </Animated.View>
        );
    }

    return (
        <View style={[
            ChatStyles.messageWrapper,
            isMe && ChatStyles.messageWrapperMe,
            msg.reactions && msg.reactions.length > 0 && ChatStyles.messageWrapperWithReactions
        ]}>
            {selectionMode && !isClone && (
                <View style={ChatStyles.selectionCheckboxContainer}>
                    <View style={[ChatStyles.selectionCheckbox, isChecked && { backgroundColor: activeTheme.primary, borderColor: activeTheme.primary }]}>
                        {isChecked && <MaterialIcons name="check" size={14} color="#fff" />}
                    </View>
                </View>
            )}

            <View style={ChatStyles.replyIconContainer}>
                <Animated.View style={[ChatStyles.replyIcon, iconStyle]}>
                    <MaterialIcons name="reply" size={24} color={activeTheme.primary} />
                </Animated.View>
            </View>

            <GestureDetector gesture={composedGestures}>
                <Animated.View style={[
                    bubbleStyle,
                    { alignItems: isMe ? 'flex-end' : 'flex-start' },
                    selectionMode && !isClone && !isMe && { paddingLeft: 34 },
                    revealStyle,
                ]}>
                    <View style={ChatStyles.bubbleReactionAnchor}>
                        <View ref={bubbleRef} style={[
                            ChatStyles.bubbleContainer,
                            isMe ? ChatStyles.bubbleContainerMe : ChatStyles.bubbleContainerThem,
                            quotedMessage && ChatStyles.bubbleContainerWithQuote,
                            isMediaOnly && ChatStyles.bubbleContainerMediaOnly,
                        ]}>
                            <View style={[ChatStyles.messageContent, isMediaOnly && ChatStyles.messageContentMediaOnly]}>
                                {quotedMessage && (
                                    <Pressable
                                        style={[ChatStyles.quotedContainer, isMe ? ChatStyles.quotedMe : ChatStyles.quotedThem]}
                                        onPress={() => {
                                            if (onQuotePress && quotedMessage) {
                                                onQuotePress(quotedMessage.id);
                                            }
                                        }}
                                        onLongPress={() => {
                                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                            Alert.alert(
                                                quotedMessage.sender === 'me' ? 'You' : contactName,
                                                quotedMessage.text || '📎 Media',
                                            );
                                        }}
                                    >
                                        <View style={ChatStyles.quoteContent}>
                                            <Text numberOfLines={1} style={[ChatStyles.quoteSender, { color: isMe ? '#fff' : activeTheme.primary }]}>
                                                {quotedMessage.sender === 'me' ? 'You' : contactName}
                                            </Text>
                                            <Text numberOfLines={1} style={[ChatStyles.quoteText, { color: isMe ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.5)' }]}>
                                                {(() => {
                                                    const quoteMedia = getMessageMediaItems(quotedMessage);
                                                    const hasQuoteMedia = quoteMedia.length > 0;
                                                    const firstQuoteMedia = hasQuoteMedia ? quoteMedia[0] : null;
                                                    if (quotedMessage.text) return quotedMessage.text;
                                                    if (firstQuoteMedia?.type === 'video') return '🎥 Video';
                                                    if (firstQuoteMedia?.type === 'audio') return '🎵 Audio Voice Note';
                                                    if (firstQuoteMedia?.type === 'image') return '📷 Photo';
                                                    return '📎 Media';
                                                })()}
                                            </Text>
                                        </View>
                                        {(() => {
                                            const quoteMedia = getMessageMediaItems(quotedMessage);
                                            const hasQuoteMedia = quoteMedia.length > 0;
                                            const firstQuoteMedia = hasQuoteMedia ? quoteMedia[0] : null;
                                            if (hasQuoteMedia && firstQuoteMedia?.type !== 'audio' && firstQuoteMedia?.url) {
                                                const isValid = firstQuoteMedia.url.startsWith('http') || firstQuoteMedia.url.startsWith('file:') || firstQuoteMedia.url.startsWith('data:');
                                                return <Image source={(firstQuoteMedia.localFileUri || isValid) ? { uri: firstQuoteMedia.localFileUri || firstQuoteMedia.url } : undefined} style={ChatStyles.quoteThumbnail} contentFit="cover" />;
                                            }
                                            return null;
                                        })()}
                                    </Pressable>
                                )}

                                {renderMediaContent()}
                                {msg.media?.caption && (
                                    <Text style={[ChatStyles.captionText, isMe ? { color: 'rgba(255,255,255,0.8)' } : { color: 'rgba(255,255,255,0.6)' }]}>
                                        {msg.media.caption}
                                    </Text>
                                )}
                                {hasText && (
                                    <LinkedText text={msg.text} style={[ChatStyles.messageText, isMe && ChatStyles.messageTextMe]} />
                                )}
                            </View>
                        </View>
                        {msg.reactions && msg.reactions.length > 0 && (
                            <View style={[ChatStyles.reactionsRow, isMe ? ChatStyles.reactionsRight : ChatStyles.reactionsLeft]}>
                                {msg.reactions.map((r, idx) => (
                                    <GlassView key={idx} intensity={40} tint="dark" style={ChatStyles.reactionPill} >
                                        <Text style={ChatStyles.reactionEmoji}>{r}</Text>
                                    </GlassView>
                                ))}
                            </View>
                        )}
                    </View>

                    <View style={[
                        ChatStyles.messageFooter,
                        isMe ? ChatStyles.messageFooterMe : ChatStyles.messageFooterThem,
                        msg.reactions && msg.reactions.length > 0 && ChatStyles.messageFooterWithReaction
                    ]}>
                        {!!msg.isStarred && (
                            <MaterialIcons name="star" size={10} color="#facc15" style={{ marginRight: 4 }} />
                        )}
                        {!!msg.editedAt && (
                            <Text style={[ChatStyles.timestamp, { marginRight: 4, fontSize: 10 }]}>edited</Text>
                        )}
                        <Text style={ChatStyles.timestamp}>{formatTime(msg.timestamp)}</Text>
                        {isMe && msg.status !== 'failed' && (
                            <MaterialIcons
                                name={
                                    msg.status === 'pending' ? 'schedule' :
                                    msg.status === 'delivered' || msg.status === 'read' ? 'done-all' :
                                    'done'
                                }
                                size={10}
                                color={msg.status === 'read' ? '#34B7F1' : 'rgba(255,255,255,0.3)'}
                            />
                        )}
                    </View>
                </Animated.View>
            </GestureDetector>

            {/* WhatsApp-style retry banner for failed messages */}
            {isMe && msg.status === 'failed' && (
                <Pressable
                    onPress={() => onRetry?.(msg.id)}
                    style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        alignSelf: 'flex-end',
                        marginTop: 2,
                        paddingVertical: 4,
                        paddingHorizontal: 8,
                    }}
                    hitSlop={8}
                >
                    <MaterialIcons name="error-outline" size={13} color="#ef4444" style={{ marginRight: 4 }} />
                    <Text style={{ color: '#ef4444', fontSize: 11, fontWeight: '500' }}>
                        Not sent. Tap to retry
                    </Text>
                </Pressable>
            )}
        </View>
    );
}, (prevProps, nextProps) => {
  if (prevProps.msg?.id !== nextProps.msg?.id) return false;
  if (prevProps.msg?.text !== nextProps.msg?.text) return false;
  if (prevProps.msg?.status !== nextProps.msg?.status) return false;
  
  // CRITICAL: Ensure re-render when media is downloaded or resolved
  if (prevProps.msg?.localFileUri !== nextProps.msg?.localFileUri) return false;
  if (prevProps.msg?.media?.url !== nextProps.msg?.media?.url) return false;

  const prevReactions = (prevProps.msg?.reactions || []).join('|');
  const nextReactions = (nextProps.msg?.reactions || []).join('|');
  if (prevReactions !== nextReactions) return false;
  if (prevProps.isSelected !== nextProps.isSelected) return false;
  if (prevProps.isClone !== nextProps.isClone) return false;
  if (prevProps.quotedMessage?.id !== nextProps.quotedMessage?.id) return false;
  if (prevProps.selectionMode !== nextProps.selectionMode) return false;
  if (prevProps.isChecked !== nextProps.isChecked) return false;
  if (prevProps.isHidden !== nextProps.isHidden) return false;
  return true;
});

export default MessageBubble;
