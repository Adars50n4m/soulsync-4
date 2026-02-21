import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Modal,
  Pressable,
  Dimensions,
  SafeAreaView,
  StatusBar as RNStatusBar,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withTiming, 
  runOnJS, 
  Easing, 
  cancelAnimation 
} from 'react-native-reanimated';
import { Story } from '../types';
import { useApp } from '../context/AppContext';

const { width, height } = Dimensions.get('window');

interface StatusViewerModalProps {
  visible: boolean;
  stories: Story[];
  contactName: string;
  contactAvatar: string;
  statusOwnerId?: string;
  currentUserId?: string;
  onReact?: (storyId: string) => void;
  onReply?: (story: Story, text: string) => void;
  onDeleteStory?: (storyId: string) => void;
  onStorySeen?: (storyId: string) => void;
  onClose: () => void;
  onComplete: () => void;
}

const ProgressBar = ({ index, currentIndex, duration, onComplete }: { index: number, currentIndex: number, duration: number, onComplete: () => void }) => {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (index === currentIndex) {
      progress.value = 0;
      progress.value = withTiming(1, { duration: duration * 1000, easing: Easing.linear }, (finished) => {
        if (finished) {
          runOnJS(onComplete)();
        }
      });
    } else if (index < currentIndex) {
      progress.value = 1;
    } else {
      progress.value = 0;
    }
    return () => cancelAnimation(progress);
  }, [currentIndex, index]);

  const animatedStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  return (
    <View style={styles.progressTrack}>
      <Animated.View style={[styles.progressFill, animatedStyle]} />
    </View>
  );
};

export const StatusViewerModal = ({
  visible,
  stories,
  contactName,
  contactAvatar,
  statusOwnerId,
  currentUserId,
  onReact,
  onReply,
  onDeleteStory,
  onStorySeen,
  onClose,
  onComplete,
}: StatusViewerModalProps) => {
  const { activeTheme } = useApp();
  const insets = useSafeAreaInsets();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [replyText, setReplyText] = useState('');
  const [mediaLoadFailed, setMediaLoadFailed] = useState(false);
  const currentStory = stories[currentIndex];
  const isOwnStatus = !!currentUserId && statusOwnerId === currentUserId;

  useEffect(() => {
    if (visible) {
      setCurrentIndex(0);
      setReplyText('');
      setMediaLoadFailed(false);
       // Hide status bar on Android/iOS if possible for immersion
    }
  }, [visible]);

  useEffect(() => {
    setMediaLoadFailed(false);
  }, [currentStory?.id]);

  useEffect(() => {
    if (visible && currentStory?.id && onStorySeen) {
      onStorySeen(currentStory.id);
    }
  }, [visible, currentStory?.id, onStorySeen]);

  const handleNext = () => {
    if (currentIndex < stories.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      onComplete(); // Finished all stories
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    } else {
      // Create a restart feel or do nothing
       setCurrentIndex(0);
    }
  };

  if (!visible || !currentStory) return null;

  const handleReplySend = () => {
    const text = replyText.trim();
    if (!text || !onReply) return;
    onReply(currentStory, text);
    setReplyText('');
  };

  const handleMediaError = () => {
    setMediaLoadFailed(true);
    if (currentIndex < stories.length - 1) {
      setTimeout(() => {
        setCurrentIndex(prev => Math.min(prev + 1, stories.length - 1));
      }, 250);
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.container}>
        <RNStatusBar hidden />
        
        <BlurView intensity={24} tint="dark" style={StyleSheet.absoluteFill} />

        {/* Main Content */}
        <View
          style={[
            styles.contentContainer,
            { paddingTop: insets.top + 84, paddingBottom: insets.bottom + 198 },
          ]}
        >
          {currentStory.type === 'image' && !mediaLoadFailed ? (
            <Image
              source={{ uri: currentStory.url }}
              style={styles.media}
              resizeMode="contain"
              onError={handleMediaError}
            />
          ) : (
            <View style={[styles.media, styles.videoPlaceholder]}>
              <MaterialIcons
                name={currentStory.type === 'video' ? 'play-circle-filled' : 'broken-image'}
                size={58}
                color="rgba(255,255,255,0.95)"
              />
              <Text style={styles.videoPlaceholderText}>
                {currentStory.type === 'video' ? 'Video playback coming soon' : 'Image unavailable'}
              </Text>
            </View>
          )}
        </View>

        {/* Overlay UI */}
        <SafeAreaView style={styles.overlay}>
             {/* Progress Bars */}
             <View style={styles.progressContainer}>
                {stories.map((story, index) => (
                    <ProgressBar 
                        key={story.id} 
                        index={index} 
                        currentIndex={currentIndex} 
                        duration={story.duration || 5} 
                        onComplete={handleNext}
                    />
                ))}
            </View>

            {/* Header */}
            <View style={[styles.header, { paddingTop: Math.max(0, insets.top - 6) }]}>
                <View style={styles.userInfo}>
                    <Image source={{ uri: contactAvatar }} style={styles.avatar} />
                    <Text style={styles.userName}>{contactName}</Text>
                    <Text style={styles.timestamp}>{currentStory.timestamp}</Text>
                </View>
                <View style={styles.headerActions}>
                  {isOwnStatus && (
                    <Pressable
                      onPress={() => onDeleteStory?.(currentStory.id)}
                      style={styles.iconButton}
                    >
                      <MaterialIcons name="delete-outline" size={22} color="#fff" />
                    </Pressable>
                  )}
                  <Pressable onPress={onClose} style={styles.iconButton}>
                    <MaterialIcons name="close" size={24} color="#fff" />
                  </Pressable>
                </View>
            </View>
        </SafeAreaView>

        {/* Touch Navigation Overlay */}
        <View style={[styles.touchOverlay, { bottom: insets.bottom + 188 }]}>
            <Pressable style={styles.touchLeft} onPress={handlePrev} />
            <Pressable style={styles.touchRight} onPress={handleNext} />
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? insets.bottom + 4 : 0}
          style={[styles.bottomContainer, { paddingBottom: insets.bottom + 34 }]}
        >
          {!!currentStory.caption && (
            <Text style={styles.captionText}>{currentStory.caption}</Text>
          )}

          <View style={styles.reactionRow}>
            {['❤️', '😍', '🔥', '😂'].map(emoji => (
              <Pressable
                key={emoji}
                style={[styles.emojiChip, { borderColor: `${activeTheme.primary}66` }]}
                onPress={() => onReact?.(currentStory.id)}
              >
                <Text style={styles.emojiText}>{emoji}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.replyRow}>
            <View style={styles.replyInputWrap}>
              <TextInput
                value={replyText}
                onChangeText={setReplyText}
                placeholder="Reply"
                placeholderTextColor="rgba(255,255,255,0.55)"
                style={styles.replyInput}
                returnKeyType="send"
                onSubmitEditing={handleReplySend}
              />
            </View>
            <Pressable
              style={[styles.sendButton, { backgroundColor: activeTheme.primary, borderColor: `${activeTheme.primary}CC` }]}
              onPress={handleReplySend}
            >
              <MaterialIcons name="send" size={20} color="#ffffff" />
            </Pressable>
            <Pressable
              style={[styles.likeButton, { borderColor: `${activeTheme.primary}66`, backgroundColor: `${activeTheme.primary}22` }]}
              onPress={() => onReact?.(currentStory.id)}
            >
              <MaterialIcons name="favorite" size={22} color={activeTheme.primary} />
            </Pressable>
          </View>
        </KeyboardAvoidingView>

      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  contentContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 110,
    paddingBottom: 220,
    paddingHorizontal: 12,
  },
  media: {
    width: width - 24,
    height: height * 0.5,
    maxHeight: height * 0.58,
    borderRadius: 16,
  },
  videoPlaceholder: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  videoPlaceholderText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    fontWeight: '600',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 10,
    zIndex: 10,
  },
  progressContainer: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    gap: 4,
    height: 3,
    marginBottom: 12,
  },
  progressTrack: {
    flex: 1,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  userName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  timestamp: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  touchOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 190,
    flexDirection: 'row',
    zIndex: 5,
  },
  touchLeft: {
    flex: 1,
  },
  touchRight: {
    flex: 2, // Larger area for next
  },
  bottomContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 22,
    paddingHorizontal: 16,
    paddingBottom: 28,
    zIndex: 12,
  },
  captionText: {
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 10,
  },
  reactionRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 8,
  },
  emojiChip: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  emojiText: {
    fontSize: 21,
  },
  replyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  replyInputWrap: {
    flex: 1,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  replyInput: {
    color: '#fff',
    fontSize: 15,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
  },
  likeButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
});
