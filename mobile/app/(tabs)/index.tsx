import React, { useRef } from 'react';
import { View, Text, Image, FlatList, Pressable, StyleSheet, StatusBar, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { MaterialIcons } from '@expo/vector-icons';

import { useApp } from '../../context/AppContext';
import { SoulSyncLogo } from '../../components/SoulSyncLogo';

const ChatListItem = React.memo(({ item, lastMsg, router, isTyping }: { item: any, lastMsg: any, router: any, isTyping: boolean }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const translateYAnim = useRef(new Animated.Value(0)).current;

  const handlePressIn = () => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 0.96,
        useNativeDriver: true,
        tension: 100,
        friction: 8,
      }),
      Animated.spring(translateYAnim, {
        toValue: -4,
        useNativeDriver: true,
        tension: 100,
        friction: 8,
      }),
    ]).start();
  };

  const handlePressOut = () => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 100,
        friction: 8,
      }),
      Animated.spring(translateYAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 100,
        friction: 8,
      }),
    ]).start();
  };

  return (
    <Pressable
      onPress={() => router.push(`/chat/${item.id}`)}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={styles.chatItem}
    >
      <Animated.View style={[
        styles.chatPillContainer,
        {
          transform: [{ scale: scaleAnim }, { translateY: translateYAnim }]
        }
      ]}>
        {/* Absolute Background Layers */}
        <View style={styles.pillBackground} />
        <BlurView intensity={40} tint="dark" style={styles.pillBlur} />

        {/* Content Layer (on top) */}
        <View style={styles.pillContent}>
          {/* Avatar */}
          <View style={styles.avatarContainer}>
            <Image source={{ uri: item.avatar }} style={styles.avatar} />
            {item.status === 'online' && (
              <View style={styles.onlineIndicator} />
            )}
          </View>

          {/* Content */}
          <View style={styles.chatContent}>
            <Text style={styles.contactName}>{item.name}</Text>
            {isTyping ? (
                 <Text numberOfLines={1} style={[styles.lastMessage, { color: '#22c55e', fontWeight: '700' }]}>
                  Typing...
                </Text>
            ) : (
                <Text numberOfLines={1} style={styles.lastMessage}>
                  {lastMsg.text || 'Start a conversation'}
                </Text>
            )}
          </View>

          {/* Right Side */}
          <View style={styles.rightSide}>
            {lastMsg.timestamp && (
              <Text style={styles.timestamp}>{lastMsg.timestamp}</Text>
            )}
            <MaterialIcons name="chevron-right" size={20} color="rgba(255,255,255,0.3)" />
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
});

export default function HomeScreen() {
  const router = useRouter();
  const { contacts, messages, activeTheme, musicState, typingUsers } = useApp();

  const renderItem = ({ item, index }: { item: any, index: number }) => {
    const chatMessages = messages[item.id] || [];
    const lastMsg = chatMessages[chatMessages.length - 1] || { text: item.lastMessage || 'Start a conversation', timestamp: '' };
    const isTyping = typingUsers.includes(item.id);

    return <ChatListItem item={item} lastMsg={lastMsg} router={router} isTyping={isTyping} />;
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Ambient Background Glow */}
      <View style={styles.ambientGlow}>
        <LinearGradient
          colors={[`${activeTheme.primary}15`, 'transparent']}
          style={styles.ambientGradient}
        />
      </View>

      {/* Header with Glass Effect */}
      <BlurView intensity={100} tint="dark" style={styles.header}>
        <LinearGradient
          colors={['rgba(0,0,0,0.9)', 'rgba(0,0,0,0.7)', 'transparent']}
          style={styles.headerGradient}
        >
          <View style={styles.headerContent}>
            <View style={styles.headerLeft}>
              <SoulSyncLogo width={32} height={32} />
              <Text style={styles.headerTitle}>SoulSync</Text>
            </View>
          </View>
        </LinearGradient>
      </BlurView>

      {contacts.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconContainer}>
            <LinearGradient
              colors={[`${activeTheme.primary}20`, 'transparent']}
              style={styles.emptyIconGlow}
            />
            <MaterialIcons name="people-outline" size={80} color="rgba(255,255,255,0.15)" />
          </View>
          <Text style={styles.emptyStateTitle}>No Connections Yet</Text>
          <Text style={styles.emptyStateText}>
            Your soulmate awaits...
          </Text>
        </View>
      ) : (
        <FlatList
          data={contacts}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  ambientGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 300,
    zIndex: 0,
  },
  ambientGradient: {
    flex: 1,
    borderRadius: 150,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    overflow: 'hidden',
  },
  headerGradient: {
    paddingTop: 48,
    paddingBottom: 12,
    paddingHorizontal: 16,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  headerTitleContainer: {
    flex: 1,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 1,
  },
  nowPlayingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  playingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  nowPlayingText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    fontWeight: '600',
    maxWidth: 150,
  },
  musicButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  listContent: {
    paddingTop: 120,
    paddingBottom: 100,
    paddingHorizontal: 4,
  },
  chatItem: {
    marginBottom: 8,
    marginHorizontal: 16,
    borderRadius: 35, // Half of height
    overflow: 'hidden',
    height: 70, // Match Header Height
  },
  chatPillContainer: {
    flex: 1,
    borderRadius: 35,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
    position: 'relative',
  },
  // New Styles for Absolute Layout
  pillBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#151515', 
    opacity: 0.95, // Almost solid like header
    zIndex: 0,
  },
  pillBlur: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  pillContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12, // Match header padding
    gap: 12,
    zIndex: 2,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 46, // Slightly larger than header (42) for list readability, but smaller than before (60)
    height: 46,
    borderRadius: 23,
    borderWidth: 0,
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#22c55e',
    borderWidth: 2,
    borderColor: '#151515',
  },
  chatContent: {
    flex: 1,
    justifyContent: 'center',
    
  },
  contactName: {
    color: '#ffffff',
    fontSize: 17, // Match Header
    fontWeight: '700',
    letterSpacing: 0.5, // Match Header
    marginBottom: 0, // Minimal spacing
  },
  lastMessage: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 16,
  },
  rightSide: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: 4,
    gap: 4,
    top: 8, // Match chatContent alignment
  },
  timestamp: {
    color: 'rgba(255,255,255,0.5)', // Match lastMessage color
    fontSize: 11,
    fontWeight: '600',
  },

  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyIconContainer: {
    position: 'relative',
    marginBottom: 24,
  },
  emptyIconGlow: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    marginLeft: -40,
    marginTop: -40,
  },
  emptyStateTitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptyStateText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
});
