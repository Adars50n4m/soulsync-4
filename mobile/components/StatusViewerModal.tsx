import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Image, StyleSheet, Modal, Pressable, Dimensions, SafeAreaView, StatusBar as RNStatusBar } from 'react-native';
import { BlurView } from 'expo-blur';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withTiming, 
  runOnJS, 
  Easing, 
  cancelAnimation 
} from 'react-native-reanimated';
import { Story } from '../types';

const { width, height } = Dimensions.get('window');

interface StatusViewerModalProps {
  visible: boolean;
  stories: Story[];
  contactName: string;
  contactAvatar: string;
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

export const StatusViewerModal = ({ visible, stories, contactName, contactAvatar, onClose, onComplete }: StatusViewerModalProps) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentStory = stories[currentIndex];

  useEffect(() => {
    if (visible) {
      setCurrentIndex(0);
       // Hide status bar on Android/iOS if possible for immersion
    }
  }, [visible]);

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

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.container}>
        <RNStatusBar hidden />
        
        {/* Main Content */}
        <View style={styles.contentContainer}>
             {currentStory.type === 'image' ? (
                <Image 
                    source={{ uri: currentStory.url }} 
                    style={styles.media} 
                    resizeMode="cover" 
                />
             ) : (
                // Placeholder for Video
                <View style={[styles.media, { backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }]}>
                    <Text style={{color: 'white'}}>Video Playback Placeholder</Text>
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
            <View style={styles.header}>
                <View style={styles.userInfo}>
                    <Image source={{ uri: contactAvatar }} style={styles.avatar} />
                    <Text style={styles.userName}>{contactName}</Text>
                    <Text style={styles.timestamp}>{currentStory.timestamp}</Text>
                </View>
                <Pressable onPress={onClose} style={styles.closeButton}>
                    <MaterialIcons name="close" size={24} color="#fff" />
                </Pressable>
            </View>
        </SafeAreaView>

        {/* Touch Navigation Overlay */}
        <View style={styles.touchOverlay}>
            <Pressable style={styles.touchLeft} onPress={handlePrev} />
            <Pressable style={styles.touchRight} onPress={handleNext} />
        </View>

        {/* Caption */}
        {currentStory.caption && (
            <BlurView intensity={30} tint="dark" style={styles.captionContainer}>
                <Text style={styles.captionText}>{currentStory.caption}</Text>
            </BlurView>
        )}

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
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  media: {
    width: width,
    height: height,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 10, // Adjust for Safe Area
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
  closeButton: {
    padding: 8,
  },
  touchOverlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    zIndex: 5,
  },
  touchLeft: {
    flex: 1,
  },
  touchRight: {
    flex: 2, // Larger area for next
  },
  captionContainer: {
    position: 'absolute',
    bottom: 50,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    maxWidth: width * 0.8,
    overflow: 'hidden',
  },
  captionText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
  },
});
