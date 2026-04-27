import React, { useCallback, useMemo, useRef } from 'react';
import { View, StyleSheet, Text, Image, useWindowDimensions, Pressable } from 'react-native';
import BottomSheet, { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

// Mock data for Stories and Chats
const MOCK_STORIES = Array.from({ length: 15 }).map((_, i) => ({
  id: `story-${i}`,
  name: `User ${i + 1}`,
  avatar: `https://i.pravatar.cc/150?u=${i}`,
}));

const MOCK_CHATS = Array.from({ length: 30 }).map((_, i) => ({
  id: `chat-${i}`,
  name: `Contact ${i + 1}`,
  message: `This is a sample message for chat ${i + 1}...`,
  time: '12:00 PM',
  avatar: `https://i.pravatar.cc/150?u=${i + 100}`,
}));

const RAIL_FULL_HEIGHT = 120;
const RAIL_COLLAPSED_HEIGHT = 70;

export const TelegramStoriesBottomSheet = () => {
  const { height: screenHeight } = useWindowDimensions();
  const bottomSheetRef = useRef<BottomSheet>(null);
  
  // The animated index tracks the BottomSheet's position.
  // index 0: fully expanded stories (sheet pulled down)
  // index 1: collapsed stories (sheet pulled up)
  const animatedIndex = useSharedValue(1);

  // Define snap points based on the stories height.
  // When sheet is at snapPoint[1] (100%), it sits just below the collapsed header.
  // When sheet is at snapPoint[0] (0%), it sits below the expanded header.
  const snapPoints = useMemo(() => [
    screenHeight - RAIL_FULL_HEIGHT - 100, // Expanded state (leaving space for top nav)
    screenHeight - RAIL_COLLAPSED_HEIGHT - 100 // Collapsed state
  ], [screenHeight]);

  const headerAnimStyle = useAnimatedStyle(() => {
    // Interpolate animatedIndex (0 to 1) -> height (FULL to COLLAPSED)
    const height = interpolate(
      animatedIndex.value,
      [0, 1],
      [RAIL_FULL_HEIGHT, RAIL_COLLAPSED_HEIGHT],
      Extrapolation.CLAMP
    );

    return {
      height,
    };
  });

  const storyItemAnimStyle = useAnimatedStyle(() => {
    const size = interpolate(
      animatedIndex.value,
      [0, 1],
      [80, 50], // 80px when expanded, 50px when collapsed
      Extrapolation.CLAMP
    );
    
    const borderRadius = size / 2;

    return {
      width: size,
      height: size,
      borderRadius,
    };
  });

  const renderStory = useCallback(({ item }: { item: typeof MOCK_STORIES[0] }) => {
    return (
      <View style={styles.storyContainer}>
        <Animated.Image
          source={{ uri: item.avatar }}
          style={[styles.storyAvatar, storyItemAnimStyle]}
        />
        <Text style={styles.storyName} numberOfLines={1}>{item.name}</Text>
      </View>
    );
  }, [storyItemAnimStyle]);

  const renderChat = useCallback(({ item }: { item: typeof MOCK_CHATS[0] }) => {
    return (
      <Pressable style={styles.chatContainer}>
        <Image source={{ uri: item.avatar }} style={styles.chatAvatar} />
        <View style={styles.chatContent}>
          <View style={styles.chatHeader}>
            <Text style={styles.chatName}>{item.name}</Text>
            <Text style={styles.chatTime}>{item.time}</Text>
          </View>
          <Text style={styles.chatMessage} numberOfLines={1}>{item.message}</Text>
        </View>
      </Pressable>
    );
  }, []);

  return (
    <View style={styles.container}>
      {/* Top Navigation Bar */}
      <View style={styles.topNav}>
        <Text style={styles.navTitle}>Telegram</Text>
      </View>

      {/* Background Stories Layer */}
      <Animated.View style={[styles.storiesWrapper, headerAnimStyle]}>
        <Animated.FlatList
          horizontal
          data={MOCK_STORIES}
          keyExtractor={(item) => item.id}
          renderItem={renderStory}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.storiesContent}
        />
      </Animated.View>

      {/* Foreground Chats Layer */}
      <BottomSheet
        ref={bottomSheetRef}
        index={1}
        snapPoints={snapPoints}
        animatedIndex={animatedIndex}
        backgroundStyle={styles.sheetBackground}
        handleIndicatorStyle={styles.sheetIndicator}
      >
        <BottomSheetFlatList
          data={MOCK_CHATS}
          keyExtractor={(item) => item.id}
          renderItem={renderChat}
          contentContainerStyle={styles.chatsContent}
        />
      </BottomSheet>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1c1c1d', // Telegram Dark Mode Background
  },
  topNav: {
    height: 100,
    paddingTop: 50,
    paddingHorizontal: 20,
    justifyContent: 'center',
    backgroundColor: '#1c1c1d',
  },
  navTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
  },
  storiesWrapper: {
    width: '100%',
    overflow: 'hidden',
  },
  storiesContent: {
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 12,
  },
  storyContainer: {
    alignItems: 'center',
    width: 80,
  },
  storyAvatar: {
    borderWidth: 2,
    borderColor: '#34b7f1', // Telegram Blue
  },
  storyName: {
    color: '#a0a0a0',
    fontSize: 12,
    marginTop: 6,
    textAlign: 'center',
  },
  sheetBackground: {
    backgroundColor: '#000000',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  sheetIndicator: {
    backgroundColor: '#333',
    width: 40,
  },
  chatsContent: {
    paddingBottom: 40,
  },
  chatContainer: {
    flexDirection: 'row',
    padding: 16,
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1c1c1d',
  },
  chatAvatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    marginRight: 16,
  },
  chatContent: {
    flex: 1,
    justifyContent: 'center',
  },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  chatName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  chatTime: {
    color: '#a0a0a0',
    fontSize: 12,
  },
  chatMessage: {
    color: '#a0a0a0',
    fontSize: 14,
  },
});
