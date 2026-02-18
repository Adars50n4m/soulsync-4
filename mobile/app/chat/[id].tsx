import React, { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import {
    View, Text, Image, FlatList, TextInput, Pressable,
    StyleSheet, StatusBar, KeyboardAvoidingView, Platform,
    Modal, Animated as RNAnimated, Dimensions, Keyboard, Alert
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming,
    runOnJS,
    interpolate,
    Extrapolation,
    Easing,
} from 'react-native-reanimated';
import { MORPH_EASING, MORPH_IN_DURATION, MORPH_OUT_DURATION, MORPH_SPRING_CONFIG } from '../../constants/transitions';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { useApp } from '../../context/AppContext';
import { MusicPlayerOverlay } from '../../components/MusicPlayerOverlay';
import { MediaPickerSheet } from '../../components/MediaPickerSheet';
import { MediaPreviewModal } from '../../components/MediaPreviewModal';
import { MediaPlayerModal } from '../../components/MediaPlayerModal';
import { storageService } from '../../services/StorageService';
import { Message } from '../../types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Sanitize song title - remove metadata like "(From ...)" or "[Album Name]"
const sanitizeSongTitle = (title: string): string => {
    if (!title) return '';
    // Remove text in parentheses and brackets
    return title
        .replace(/\s*\([^)]*\)/g, '')  // Remove (anything)
        .replace(/\s*\[[^\]]*\]/g, '') // Remove [anything]
        .trim();
};

const ProgressiveBlur = ({ position = 'top', height = 180, intensity = 100, steps = 6 }: { position?: 'top' | 'bottom', height?: number, intensity?: number, steps?: number }) => {
    return (
        <View style={{
            position: 'absolute',
            [position]: 0,
            left: 0,
            right: 0,
            height,
            zIndex: position === 'top' ? 90 : 50,
            overflow: 'hidden',
        }} pointerEvents="none">
            {/* Base layers for progressive blur */}
            {Array.from({ length: steps }).map((_, i) => {
                const ratio = i / steps;
                
                // Balanced Cubic-Quartic falloff for smoothness
                // Power 10 was too sharp, creating "lines"
                const intensityFactor = Math.pow(1 - ratio, 3.5);
                
                // Smoother opacity distribution
                const opacityFactor = Math.pow(1 - ratio, 1.5);

                const stepHeight = height / steps;
                
                return (
                    <BlurView
                        key={i}
                        intensity={intensity * intensityFactor}
                        tint="dark"
                        style={{
                            position: 'absolute',
                            [position]: i * stepHeight,
                            left: 0,
                            right: 0,
                            height: stepHeight + 4, // More overlap to hide joins
                            opacity: Math.max(0.1, opacityFactor),
                        }}
                    />
                );
            })}

            {/* Smoothing Gradient - This acts as a 'diffuser' to hide the banding lines */}
            <LinearGradient
                colors={[
                    position === 'top' ? 'rgba(0,0,0,0.8)' : 'transparent',
                    position === 'top' ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.4)',
                    position === 'top' ? 'transparent' : 'rgba(0,0,0,0.8)',
                ]}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
            />
        </View>
    );
};

// Message Bubble with Liquid Glass UI
const MessageBubble = ({ msg, onLongPress, onReply, isSelected, onReaction, quotedMessage, onDoubleTap, onMediaTap }: any) => {
    const { activeTheme } = useApp();
    const translateX = useSharedValue(0);
    const isMe = msg.sender === 'me';

    const doubleTapGesture = Gesture.Tap()
        .numberOfTaps(2)
        .maxDuration(250)
        .onEnd(() => {
            if (onDoubleTap) runOnJS(onDoubleTap)(msg.id);
        });

    const longPressGesture = Gesture.LongPress()
        .minDuration(500)
        .onStart(() => {
            runOnJS(onLongPress)(msg.id);
        });

    const panGesture = Gesture.Pan()
        .activeOffsetX([-10, 10])
        .failOffsetY([-10, 10])
        .onUpdate((event) => {
            if (event.translationX > 0) translateX.value = event.translationX * 0.3;
        })
        .onEnd((event) => {
            if (event.translationX > 60) runOnJS(onReply)(msg);
            translateX.value = withSpring(0);
        });

    const composedGestures = Gesture.Simultaneous(panGesture, Gesture.Exclusive(doubleTapGesture, longPressGesture));

    const bubbleStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: translateX.value }]
    }));

    const iconStyle = useAnimatedStyle(() => ({
        opacity: interpolate(translateX.value, [0, 50], [0, 1], Extrapolation.CLAMP),
        transform: [
            { scale: interpolate(translateX.value, [0, 50], [0.5, 1], Extrapolation.CLAMP) },
            { translateX: interpolate(translateX.value, [0, 50], [-20, 0], Extrapolation.CLAMP) }
        ]
    }));

    return (
        <View style={[styles.messageWrapper, isMe && styles.messageWrapperMe]}>
            <View style={styles.replyIconContainer}>
                <Animated.View style={[styles.replyIcon, iconStyle]}>
                    <MaterialIcons name="reply" size={24} color={activeTheme.primary} />
                </Animated.View>
            </View>

            <GestureDetector gesture={composedGestures}>
                <Animated.View style={bubbleStyle}>
                    <View style={[
                        styles.bubbleContainer,
                        isMe ? styles.bubbleContainerMe : styles.bubbleContainerThem
                    ]}>
                        {/* Background - Solid Color */ }
                        <View style={[StyleSheet.absoluteFill, { backgroundColor: isMe ? activeTheme.primary : 'rgba(255, 255, 255, 0.1)' }]} />

                        <View style={styles.messageContent}>
                            {/* Quoted Message */}
                            {quotedMessage && (
                                <View style={[styles.quotedContainer, isMe ? styles.quotedMe : styles.quotedThem]}>
                                    <View style={[styles.quoteBar, { backgroundColor: isMe ? '#fff' : activeTheme.primary }]} />
                                    <View style={styles.quoteContent}>
                                        <Text style={[styles.quoteSender, { color: isMe ? '#fff' : activeTheme.primary }]}>
                                            {quotedMessage.sender === 'me' ? 'YOU' : 'THEM'}
                                        </Text>
                                        <Text numberOfLines={1} style={[styles.quoteText, { color: isMe ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.5)' }]}>
                                            {quotedMessage.text}
                                        </Text>
                                    </View>
                                </View>
                            )}

                            {/* Media */}
                            {msg.media?.url && (
                                <Pressable onPress={() => onMediaTap && onMediaTap(msg.media)}>
                                    {msg.media.type === 'image' && (
                                        <Image source={{ uri: msg.media.url }} style={styles.mediaImage} />
                                    )}
                                    {msg.media.type === 'video' && (
                                        <View>
                                            <Image source={{ uri: msg.media.url }} style={styles.mediaImage} />
                                            <View style={styles.playIconOverlay}>
                                                <MaterialIcons name="play-circle-filled" size={50} color="rgba(255,255,255,0.9)" />
                                            </View>
                                        </View>
                                    )}
                                    {msg.media.type === 'audio' && (
                                        <View style={styles.audioWaveform}>
                                            <MaterialIcons name="graphic-eq" size={20} color={activeTheme.primary} />
                                            <Text style={styles.audioDuration}>0:45</Text>
                                            <MaterialIcons name="play-arrow" size={24} color="#fff" />
                                        </View>
                                    )}
                                </Pressable>
                            )}

                            {/* Caption */}
                            {msg.media?.caption && (
                                <Text style={[styles.captionText, isMe ? { color: 'rgba(255,255,255,0.8)' } : { color: 'rgba(255,255,255,0.6)' }]}>
                                    {msg.media.caption}
                                </Text>
                            )}

                            {/* Text */}
                            <Text style={[styles.messageText, isMe && styles.messageTextMe]}>
                                {msg.text}
                            </Text>

                            {/* Timestamp inside bubble (bottom right) */}
                            <View style={styles.messageFooter}>
                                <Text style={[styles.timestamp, isMe && { color: 'rgba(255,255,255,0.8)' }]}>{msg.timestamp}</Text>
                                {isMe && (
                                    <MaterialIcons
                                        name={msg.status === 'read' ? 'done-all' : 'done'}
                                        size={12}
                                        color={msg.status === 'read' ? '#fff' : 'rgba(255,255,255,0.8)'}
                                    />
                                )}
                            </View>
                        </View>
                    </View>

                    {/* Reactions */}
                    {msg.reactions && msg.reactions.length > 0 && (
                        <View style={[styles.reactionsRow, isMe ? styles.reactionsRight : styles.reactionsLeft]}>
                            {msg.reactions.map((r: string, idx: number) => (
                                <BlurView key={idx} intensity={40} tint="dark" style={styles.reactionPill}>
                                    <Text style={styles.reactionEmoji}>{r}</Text>
                                </BlurView>
                            ))}
                        </View>
                    )}
                </Animated.View>
            </GestureDetector>
        </View>
    );
};

// Emoji Reaction Modal
const ReactionModal = ({ visible, onClose, onSelect }: any) => {
    const emojis = ['❤️', '👍', '😂', '😮', '😢', '🔥'];

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <Pressable style={styles.reactionModalOverlay} onPress={onClose}>
                <BlurView intensity={80} tint="dark" style={styles.reactionModalContent}>
                    <View style={styles.emojiBar}>
                        {emojis.map(emoji => (
                            <Pressable key={emoji} onPress={() => onSelect(emoji)} style={styles.emojiButton}>
                                <Text style={styles.emojiText}>{emoji}</Text>
                            </Pressable>
                        ))}
                    </View>
                    <Pressable style={styles.deleteButton} onPress={() => onSelect('delete')}>
                        <MaterialIcons name="delete" size={20} color="#ef4444" />
                        <Text style={styles.deleteText}>Delete</Text>
                    </Pressable>
                </BlurView>
            </Pressable>
        </Modal>
    );
};

export default function SingleChatScreen() {
    const { id: rawId, sourceY: rawSourceY } = useLocalSearchParams();
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const sourceY = rawSourceY ? Number(Array.isArray(rawSourceY) ? rawSourceY[0] : rawSourceY) : undefined;
    const router = useRouter();
    const { contacts, messages, sendChatMessage, startCall, activeCall, addReaction, deleteMessage, musicState, currentUser, activeTheme, sendTyping, typingUsers } = useApp();
    const [inputText, setInputText] = useState('');
    const [showCallModal, setShowCallModal] = useState(false);

    const [callOptionsPosition, setCallOptionsPosition] = useState({ x: 0, y: 0 });
    const [isExpanded, setIsExpanded] = useState(false);

    // Morph Animation — iOS-style smooth bezier, no spring jitter
    const HEADER_TOP = 50;
    const morphTranslateY = useSharedValue(sourceY !== undefined ? sourceY - HEADER_TOP : 0);
    const chatBodyOpacity = useSharedValue(sourceY !== undefined ? 0 : 1);

    const headerMorphStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: morphTranslateY.value }],
    }));

    const chatBodyAnimStyle = useAnimatedStyle(() => ({
        opacity: chatBodyOpacity.value,
    }));

    // Animate IN immediately before paint - use Timing for performance stability
    useLayoutEffect(() => {
        if (sourceY !== undefined) {
            morphTranslateY.value = withTiming(0, { duration: MORPH_IN_DURATION, easing: MORPH_EASING });
            chatBodyOpacity.value = withTiming(1, { duration: MORPH_IN_DURATION, easing: MORPH_EASING });
        }
    }, []);

    // Animate OUT on back
    const handleBack = useCallback(() => {
        if (id) {
            // Rapid fade of body to reveal Home screen
            chatBodyOpacity.value = withTiming(0, { duration: 150 });
            
            // SharedTransition kicks in as soon as we navigate back.
            // A tiny delay ensures the opacity animation starts before unmount.
            setTimeout(() => router.back(), 16);
        } else {
            router.back();
        }
    }, [id, chatBodyOpacity, router]);

    // Animation Values
    const plusRotation = useSharedValue(0);
    const optionsHeight = useSharedValue(0);
    const optionsOpacity = useSharedValue(0);
    const modalAnim = useRef(new RNAnimated.Value(0)).current;

    // Missing State & Refs
    const flatListRef = useRef<FlatList>(null);
    const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const [replyingTo, setReplyingTo] = useState<any>(null);
    const [selectedMsgId, setSelectedMsgId] = useState<string | null>(null);
    const [showMusicPlayer, setShowMusicPlayer] = useState(false);

    // Derived State
    const contact = contacts.find(c => c.id === id);
    const chatMessages = messages[id || ''] || [];
    const isTyping = contact ? typingUsers.includes(contact.id) : false;

    // Toggle Options Menu
    const toggleOptions = () => {
        if (isExpanded) {
            // Close
            plusRotation.value = withSpring(0);
            optionsHeight.value = withTiming(0);
            optionsOpacity.value = withTiming(0);
            setIsExpanded(false);
        } else {
            // Open
            Keyboard.dismiss();
            plusRotation.value = withSpring(45); // Rotate to X
            optionsHeight.value = withTiming(90);
            optionsOpacity.value = withTiming(1);
            setIsExpanded(true);
        }
    };

    // Close options when typing
    const handleFocus = () => {
        if (isExpanded) toggleOptions();
    };

    const animatedPlusStyle = useAnimatedStyle(() => ({
        transform: [{ rotate: `${plusRotation.value}deg` }]
    }));

    const animatedOptionsStyle = useAnimatedStyle(() => ({
        height: optionsHeight.value,
        opacity: optionsOpacity.value,
        marginBottom: isExpanded ? 20 : 0
    }));

    const callButtonRef = useRef<View>(null);

    // Media picker state
    const [showMediaPicker, setShowMediaPicker] = useState(false);
    const [mediaPreview, setMediaPreview] = useState<{ uri: string; type: 'image' | 'video' | 'audio' } | null>(null);
    const [playerMedia, setPlayerMedia] = useState<{ url: string; type: 'image' | 'video' | 'audio'; caption?: string } | null>(null);
    const [isUploading, setIsUploading] = useState(false);



    useEffect(() => {
        if (chatMessages.length > 0) {
            setTimeout(() => {
                flatListRef.current?.scrollToEnd({ animated: true });
            }, 100);
        }
    }, [chatMessages.length]);

    const openCallModal = () => {
        // Measure call button position
        callButtonRef.current?.measure((x, y, width, height, pageX, pageY) => {
            setCallOptionsPosition({ x: pageX - 80, y: pageY + height + 8 });
        });
        setShowCallModal(true);
        RNAnimated.spring(modalAnim, {
            toValue: 1,
            useNativeDriver: true,
            tension: 100,
            friction: 10,
        }).start();
    };

    const closeCallModal = () => {
        RNAnimated.timing(modalAnim, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
        }).start(() => setShowCallModal(false));
    };

    const handleCall = (type: 'audio' | 'video') => {
        closeCallModal();
        setTimeout(() => startCall(id!, type), 300);
    };

    const handleSend = () => {
        if (!inputText.trim() || !id) return;

        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        sendTyping(false);

        const content = inputText.trim();
        setInputText('');

        const replyToId = replyingTo ? replyingTo.id : undefined;
        sendChatMessage(id, content, undefined, replyToId);

        setReplyingTo(null);
    };

    const handleReaction = (emoji: string) => {
        if (selectedMsgId && id) {
            if (emoji === 'delete') {
                deleteMessage(id, selectedMsgId);
            } else {
                addReaction(id, selectedMsgId, emoji);
            }
        }
        setSelectedMsgId(null);
    };

    const handleDoubleTap = (msgId: string) => {
        if (id) {
            addReaction(id, msgId, '❤️');
        }
    };

    const handleMediaTap = (media: any) => {
        if (!media) return;
        setPlayerMedia({
            url: media.url,
            type: media.type,
            caption: media.caption,
        });
    };

    const renderMessage = useCallback(({ item }: { item: any }) => (
        <MessageBubble
            msg={item}
            isSelected={selectedMsgId === item.id}
            onLongPress={(mid: string) => setSelectedMsgId(mid)}
            onReply={(m: any) => setReplyingTo(m)}
            onReaction={handleReaction}
            onDoubleTap={handleDoubleTap}
            onMediaTap={handleMediaTap}
            quotedMessage={item.replyTo ? chatMessages.find((m: any) => m.id === item.replyTo) : null}
        />
    ), [selectedMsgId, chatMessages]);

    // Media picker handlers
    const handleSelectCamera = async () => {
        if (isExpanded) toggleOptions();
        setShowMediaPicker(false);
        const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
        if (!permissionResult.granted) {
            Alert.alert('Permission Required', 'Camera access is needed to take photos.');
            return;
        }
        const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.All,
            quality: 0.8,
            allowsEditing: false,
            videoMaxDuration: 120,
        });
        if (!result.canceled && result.assets[0]) {
            const asset = result.assets[0];
            const type = asset.type === 'video' ? 'video' : 'image';
            setMediaPreview({ uri: asset.uri, type });
        }
    };

    const handleSelectGallery = async () => {
        if (isExpanded) toggleOptions();
        setShowMediaPicker(false);
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.All,
            quality: 0.8,
            allowsEditing: false,
            videoMaxDuration: 120,
        });
        if (!result.canceled && result.assets[0]) {
            const asset = result.assets[0];
            const type = asset.type === 'video' ? 'video' : 'image';
            setMediaPreview({ uri: asset.uri, type });
        }
    };

    const handleSelectAudio = async () => {
        setShowMediaPicker(false);
        Alert.alert('Coming Soon', 'Audio file selection will be available soon.');
    };

    const handleSendMedia = async (caption?: string) => {
        if (!mediaPreview || !id) return;
        setIsUploading(true);
        try {
            const publicUrl = await storageService.uploadImage(
                mediaPreview.uri,
                'chat-media',
                currentUser?.id || ''
            );
            if (!publicUrl) throw new Error('Upload failed');

            const media: Message['media'] = {
                type: mediaPreview.type,
                url: publicUrl,
                caption: caption || undefined,
            };

            sendChatMessage(id, caption || '', media);
            setMediaPreview(null);
        } catch (error: any) {
            Alert.alert('Upload Failed', error.message || 'Please try again.');
        } finally {
            setIsUploading(false);
        }
    };

    if (!contact) {
        return (
            <View style={styles.container}>
                <Text style={styles.errorText}>Contact not found</Text>
            </View>
        );
    }

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={0}
        >
            <StatusBar barStyle="light-content" />

            {/* Header - morphs up from source pill position using Shared Element Transition */}
            <Animated.View 
                sharedTransitionTag={`pill-${id}`}
                style={[styles.headerContainer, headerMorphStyle]}
            >
                <BlurView intensity={100} tint="dark" style={styles.header}>
                    <Pressable onPress={handleBack} style={styles.backButton}>
                        <MaterialIcons name="arrow-back" size={24} color="#ffffff" />
                    </Pressable>

                    <Pressable style={styles.avatarWrapper} onPress={() => router.push(`/profile/${contact.id}` as any)}>
                        <Image source={{ uri: contact.avatar }} style={styles.avatar} />
                        {contact.status === 'online' && <View style={styles.onlineIndicator} />}
                    </Pressable>

                    <View style={styles.headerInfo}>
                        <Text style={styles.contactName}>{contact.name}</Text>
                        {musicState.currentSong ? (
                            <View style={styles.nowPlayingStatus}>
                                <MaterialIcons name="library-music" size={10} color={activeTheme.primary} />
                                <Text style={[styles.statusText, { color: activeTheme.primary }]} numberOfLines={1}>
                                    {sanitizeSongTitle(musicState.currentSong.name)}
                                </Text>
                            </View>
                        ) : (
                            <Text style={[styles.statusText, { color: 'rgba(255,255,255,0.5)' }]}>
                                {contact.status === 'online' ? 'ONLINE' : 'OFFLINE'}
                            </Text>
                        )}
                    </View>

                    {/* Music Button - Navigates to 3D Music Screen */}
                    <Pressable style={styles.headerButton} onPress={() => router.push('/music')}>
                        <MaterialIcons name="library-music" size={20} color={activeTheme.primary} />
                    </Pressable>

                    {/* Call Button */}
                    <View ref={callButtonRef} collapsable={false}>
                        <Pressable style={styles.headerButton} onPress={openCallModal}>
                            <MaterialIcons name="call" size={20} color={activeTheme.primary} />
                        </Pressable>
                    </View>
                </BlurView>
            </Animated.View>

            {/* Chat background and body — fades in/out during morph */}
            <Animated.View style={[StyleSheet.absoluteFill, chatBodyAnimStyle]}>
                {/* Opaque Background Layer - this fades out to reveal Home screen */}
                <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000000' }]} />
                
                {/* Chat content */}
                <View style={{ flex: 1 }}>
                {/* Messages */}
                <FlatList
                    ref={flatListRef}
                    data={chatMessages}
                    keyExtractor={item => item.id}
                    renderItem={renderMessage}
                    style={styles.messagesList}
                    contentContainerStyle={styles.messagesContent}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={
                        <View style={styles.emptyChat}>
                            <MaterialIcons name="chat-bubble-outline" size={60} color="rgba(255,255,255,0.1)" />
                            <Text style={styles.emptyChatText}>No messages yet</Text>
                            <Text style={styles.emptyChatHint}>Say hi to {contact.name}!</Text>
                        </View>
                    }
                />

                {/* iOS-style Progressive Blur Effects */}
                <ProgressiveBlur position="top" height={160} intensity={80} />
                <ProgressiveBlur position="bottom" height={200} intensity={80} />

                {/* Typing Indicator */}
                {isTyping && (
                    <View style={styles.typingContainer}>
                        <Text style={[styles.typingText, { color: activeTheme.primary }]}>typing...</Text>
                    </View>
                )}

                {/* Reply Preview */}
                {replyingTo && (
                    <BlurView intensity={60} tint="dark" style={styles.replyPreview}>
                        <View style={styles.replyContent}>
                            <View style={styles.quoteBar} />
                            <View style={styles.replyTextContainer}>
                                <Text style={styles.replySender}>REPLYING TO</Text>
                                <Text numberOfLines={1} style={styles.replyText}>{replyingTo.text}</Text>
                            </View>
                        </View>
                        <Pressable onPress={() => setReplyingTo(null)}>
                            <MaterialIcons name="close" size={20} color="rgba(255,255,255,0.5)" />
                        </Pressable>
                    </BlurView>
                )}

                {/* Input Area */}
                <View style={styles.inputArea}>
                {/* Unified Pill Container */}
                <View style={styles.unifiedPillContainer}>
                    <BlurView intensity={100} tint="dark" style={StyleSheet.absoluteFill} />
                    
                    <View style={styles.inputWrapper}>
                        {/* + Button on left inside */}
                        <Pressable style={styles.attachButton} onPress={toggleOptions}>
                            <Animated.View style={animatedPlusStyle}>
                                <MaterialIcons name="add" size={20} color="rgba(255,255,255,0.7)" />
                            </Animated.View>
                        </Pressable>

                        <TextInput
                            style={styles.input}
                            value={inputText}
                            onChangeText={(text) => {
                                setInputText(text);
                                
                                // Typing indicator logic
                                sendTyping(true);
                                
                                if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                                typingTimeoutRef.current = setTimeout(() => {
                                    sendTyping(false);
                                }, 2000) as unknown as NodeJS.Timeout;
                            }}
                            onFocus={handleFocus}
                            placeholder="Sync fragment..."
                            placeholderTextColor="rgba(255,255,255,0.3)"
                            multiline
                            maxLength={1000}
                        />

                        {/* Emoji button (optional, can remove if not needed) */}
                        <Pressable style={styles.emojiInputButton}>
                            <MaterialIcons name="sentiment-satisfied" size={20} color="rgba(255,255,255,0.5)" />
                        </Pressable>

                        {/* Mic button on right inside */}
                        <Pressable
                            style={styles.sendButton}
                            onPress={handleSend}
                        >
                            <MaterialIcons
                                name={inputText.trim() ? 'arrow-upward' : 'mic'}
                                size={18}
                                color={inputText.trim() ? activeTheme.primary : 'rgba(255,255,255,0.7)'}
                            />
                        </Pressable>
                    </View>
                    
                    {/* Expandable Options Menu - Now inside the pill */}
                    <Animated.View style={[styles.optionsMenu, animatedOptionsStyle]}>
                         <Pressable style={styles.optionItem} onPress={handleSelectGallery}>
                            <View style={[styles.optionIcon, { backgroundColor: '#3b82f6' }]}>
                                <MaterialIcons name="image" size={24} color="white" />
                            </View>
                            <Text style={styles.optionText}>Gallery</Text>
                         </Pressable>
                         <Pressable style={styles.optionItem} onPress={handleSelectCamera}>
                            <View style={[styles.optionIcon, { backgroundColor: '#ef4444' }]}>
                                <MaterialIcons name="camera-alt" size={24} color="white" />
                            </View>
                            <Text style={styles.optionText}>Camera</Text>
                         </Pressable>
                         <Pressable style={styles.optionItem}>
                            <View style={[styles.optionIcon, { backgroundColor: '#a855f7' }]}>
                                <MaterialIcons name="location-pin" size={24} color="white" />
                            </View>
                            <Text style={styles.optionText}>Location</Text>
                         </Pressable>
                         <Pressable style={styles.optionItem}>
                            <View style={[styles.optionIcon, { backgroundColor: '#10b981' }]}>
                                <MaterialIcons name="person" size={24} color="white" />
                            </View>
                            <Text style={styles.optionText}>Contact</Text>
                         </Pressable>
                    </Animated.View>
                </View>
            </View>
            </View>
            </Animated.View>

            {/* Reaction Modal */}
            <ReactionModal
                visible={!!selectedMsgId}
                onClose={() => setSelectedMsgId(null)}
                onSelect={handleReaction}
            />

            {/* Call Options Dropdown */}
            <Modal visible={showCallModal} transparent animationType="none" onRequestClose={closeCallModal}>
                <Pressable style={styles.modalOverlay} onPress={closeCallModal}>
                    <RNAnimated.View
                        style={[
                            styles.callDropdown,
                            {
                                top: callOptionsPosition.y,
                                right: 16,
                                opacity: modalAnim,
                                transform: [{
                                    scale: modalAnim.interpolate({
                                        inputRange: [0, 1],
                                        outputRange: [0.9, 1],
                                    })
                                }]
                            }
                        ]}
                    >
                        <BlurView intensity={100} tint="dark" style={styles.callDropdownBlur}>
                            <Pressable style={styles.callDropdownItem} onPress={() => handleCall('audio')}>
                                <View style={[styles.callDropdownIcon, { backgroundColor: 'rgba(34, 197, 94, 0.15)' }]}>
                                    <MaterialIcons name="call" size={20} color="#22c55e" />
                                </View>
                                <Text style={styles.callDropdownText}>Audio</Text>
                            </Pressable>
                            <View style={styles.callDropdownDivider} />
                            <Pressable style={styles.callDropdownItem} onPress={() => handleCall('video')}>
                                <View style={[styles.callDropdownIcon, { backgroundColor: 'rgba(244, 63, 94, 0.15)' }]}>
                                    <MaterialIcons name="videocam" size={20} color="#f43f5e" />
                                </View>
                                <Text style={styles.callDropdownText}>Video</Text>
                            </Pressable>
                        </BlurView>
                    </RNAnimated.View>
                </Pressable>
            </Modal>

            {/* Music Player Overlay */}
            <MusicPlayerOverlay
                isOpen={showMusicPlayer}
                onClose={() => setShowMusicPlayer(false)}
                contactName={contact.name}
            />

            {/* Media Picker Sheet */}
            <MediaPickerSheet
                visible={showMediaPicker}
                onClose={() => setShowMediaPicker(false)}
                onSelectCamera={handleSelectCamera}
                onSelectGallery={handleSelectGallery}
                onSelectAudio={handleSelectAudio}
            />

            {/* Media Preview Modal */}
            <MediaPreviewModal
                visible={!!mediaPreview}
                mediaUri={mediaPreview?.uri || ''}
                mediaType={mediaPreview?.type || 'image'}
                onClose={() => setMediaPreview(null)}
                onSend={handleSendMedia}
                isUploading={isUploading}
            />

            {/* Media Player Modal */}
            <MediaPlayerModal
                visible={!!playerMedia}
                mediaUrl={playerMedia?.url || ''}
                mediaType={playerMedia?.type || 'image'}
                caption={playerMedia?.caption}
                onClose={() => setPlayerMedia(null)}
            />

        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    headerContainer: {
        position: 'absolute',
        top: 50,
        left: 16,
        right: 16,
        zIndex: 100,
        borderRadius: 36, // Exact pill shape matching home screen
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        backgroundColor: 'rgba(21, 21, 21, 0.95)',
    },
    header: {
        backgroundColor: 'rgba(30, 30, 35, 0.4)',
        paddingHorizontal: 16,
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        height: 72,
    },
    backButton: {
        padding: 4,
    },
    avatarWrapper: {
        position: 'relative',
        marginLeft: -4, 
    },
    avatar: {
        width: 42,
        height: 42,
        borderRadius: 21,
        borderWidth: 0, // No border in screenshot
    },
    onlineIndicator: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        width: 14,
        height: 14,
        borderRadius: 7,
        backgroundColor: '#22c55e',
        borderWidth: 2,
        borderColor: '#151515', // Match header bg
    },
    headerInfo: {
        flex: 1,
        marginLeft: 8,
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
    },
    headerButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#252525', // Slightly lighter than header bg
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    messagesList: {
        flex: 1,
    },
    messagesContent: {
        paddingHorizontal: 16,
        paddingTop: 130, // Header height (60) + Top (60) + Buffer (10)
        paddingBottom: 120, // Increased for floating input
        flexGrow: 1,
    },
    messageWrapper: {
        width: '100%',
        marginBottom: 12,
        alignItems: 'flex-start',
    },
    messageWrapperMe: {
        alignItems: 'flex-end',
    },
    replyIconContainer: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: 50,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: -1,
    },
    replyIcon: {
        // Shared value handles this
    },
    bubbleContainer: {
        maxWidth: '75%',
        borderRadius: 24,
        overflow: 'hidden',
        position: 'relative',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 10,
        elevation: 3,
    },
    bubbleContainerMe: {
        borderBottomRightRadius: 10,
        shadowColor: '#F50057',
        shadowOpacity: 0.3,
        shadowRadius: 15,
    },
    bubbleContainerThem: {
        borderTopLeftRadius: 10,
    },
    glassBorder: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: 24,
        borderWidth: 0.5,
        borderColor: 'rgba(255,255,255,0.15)',
        zIndex: 1,
        pointerEvents: 'none',
    },
    messageContent: {
        padding: 12,
        paddingHorizontal: 14,
        paddingBottom: 8,
        zIndex: 2,
        overflow: 'hidden',
        borderRadius: 24,
    },
    quotedContainer: {
        flexDirection: 'row',
        gap: 10,
        marginBottom: 10,
        padding: 10,
        backgroundColor: 'rgba(0,0,0,0.15)',
        borderRadius: 10,
        borderLeftWidth: 3,
        borderLeftColor: 'rgba(255,255,255,0.3)',
    },
    quotedMe: {
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderLeftColor: '#ffffff',
    },
    quotedThem: {
        backgroundColor: 'rgba(0,0,0,0.15)',
        borderLeftColor: '#F50057',
    },
    quoteBar: {
        width: 3,
        borderRadius: 2,
    },
    quoteContent: {
        flex: 1,
    },
    quoteSender: {
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 0.5,
        marginBottom: 3,
    },
    quoteText: {
        fontSize: 13,
        lineHeight: 18,
    },
    mediaImage: {
        width: 220,
        height: 220,
        borderRadius: 12,
        marginBottom: 8,
    },
    playIconOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.3)',
        borderRadius: 12,
    },
    audioWaveform: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 12,
        padding: 12,
        minWidth: 200,
    },
    audioDuration: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 13,
        fontWeight: '500',
        flex: 1,
    },
    captionText: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 13,
        lineHeight: 18,
        marginTop: 4,
        fontWeight: '500',
    },
    messageText: {
        color: 'rgba(229, 229, 229, 1)',
        fontSize: 14,
        lineHeight: 20,
        fontWeight: '300',
        letterSpacing: 0.2,
        marginBottom: 0,
    },
    messageTextMe: {
        color: '#ffffff',
        fontWeight: '500',
    },
    messageFooter: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
        gap: 3,
        marginTop: 4,
    },
    timestamp: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 10,
        fontWeight: '400',
    },
    reactionsRow: {
        position: 'absolute',
        bottom: -16,
        flexDirection: 'row',
        gap: 6,
        zIndex: 10,
    },
    reactionsRight: {
        right: 16,
    },
    reactionsLeft: {
        left: 16,
    },
    reactionPill: {
        borderRadius: 14,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
        backgroundColor: 'rgba(0,0,0,0.7)',
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 3,
    },
    reactionEmoji: {
        fontSize: 14,
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
    emptyChatHint: {
        color: 'rgba(255,255,255,0.2)',
        fontSize: 13,
        marginTop: 4,
    },
    typingContainer: {
        paddingHorizontal: 20,
        paddingBottom: 10,
    },
    typingText: {
        fontSize: 8,
        fontWeight: '900',
        color: '#f43f5e', // Keeping default for now, or dynamic? Let's verify if user wants ALL pinks changed.
        letterSpacing: 4,
    },
    replyPreview: {
        marginHorizontal: 16,
        marginBottom: 8,
        borderRadius: 16,
        padding: 12,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        overflow: 'hidden',
    },
    replyContent: {
        flexDirection: 'row',
        gap: 10,
        flex: 1,
    },
    replyTextContainer: {
        flex: 1,
    },
    replySender: {
        fontSize: 8,
        fontWeight: '900',
        color: '#f43f5e', // TODO: Make dynamic via style injection if possible, or leave as default brand color
        letterSpacing: 2,
    },
    replyText: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.5)',
    },
    inputArea: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingHorizontal: 16,
        paddingTop: 160, // Significantly extended for "long fade"
        paddingBottom: Platform.OS === 'ios' ? 32 : 16,
        backgroundColor: 'transparent',
        zIndex: 60, // Ensure it floats above messages
    },
    unifiedPillContainer: {
        backgroundColor: 'rgba(30, 30, 35, 0.4)',
        borderRadius: 25,
        overflow: 'hidden',
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 8,
        minHeight: 40,
        maxHeight: 100,
        gap: 4,
    },
    attachButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
        flexShrink: 0,
    },
    input: {
        flex: 1,
        color: '#ffffff',
        fontSize: 14,
        paddingVertical: 0,
        paddingHorizontal: 8,
        fontWeight: '300',
    },
    emojiInputButton: {
        padding: 4,
        flexShrink: 0,
    },
    sendButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
        flexShrink: 0,
    },
    sendButtonActive: {
        backgroundColor: 'rgba(245, 0, 87, 0.1)',
        borderColor: 'rgba(245, 0, 87, 0.3)',
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
        height: 140, // Height to cover header and status bar
        zIndex: 90,
    },
    bottomScrollBlur: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 180, // Height to cover input area's float zone
        zIndex: 50,
    },
    // Reaction Modal
    reactionModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    reactionModalContent: {
        width: '80%',
        backgroundColor: '#1a1a1a',
        borderRadius: 20,
        padding: 20,
        overflow: 'hidden',
    },
    emojiBar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 20,
    },
    emojiButton: {
        padding: 8,
        borderRadius: 8,
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    emojiText: {
        fontSize: 24,
    },
    deleteButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        borderRadius: 12,
        gap: 8,
    },
    deleteText: {
        color: '#ef4444',
        fontSize: 16,
        fontWeight: '600',
    },
    // Call Options Modal
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    callDropdown: {
        position: 'absolute',
        width: 140,
        borderRadius: 16,
        overflow: 'hidden',
    },
    callDropdownBlur: {
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        overflow: 'hidden',
    },
    callDropdownItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
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
    },
    callDropdownDivider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.08)',
        marginHorizontal: 16,
    },
    nowPlayingStatus: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    optionsMenu: {
        width: '100%',
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-around',
        overflow: 'hidden',
        // Removed margins/padding/border radius as it's now inside the unified pill
    },
    optionItem: {
        alignItems: 'center',
        margin: 10,
        width: 60,
    },
    optionIcon: {
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 6,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 3,
        elevation: 4,
    },
    optionText: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 11,
        fontWeight: '500',
    },
});
