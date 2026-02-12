import React from 'react';
import { View, Text, Image, FlatList, Pressable, StyleSheet, StatusBar, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { MaterialIcons } from '@expo/vector-icons';

import { useApp } from '../../context/AppContext';
import { SoulSyncLogo } from '../../components/SoulSyncLogo';
import { LiquidGlassCard } from '../../components/LiquidGlassCard';

export default function HomeScreen() {
  const router = useRouter();
  const { contacts, messages, activeTheme, musicState } = useApp();

  const renderItem = ({ item, index }: { item: any, index: number }) => {
    const chatMessages = messages[item.id] || [];
    const lastMsg = chatMessages[chatMessages.length - 1] || { text: item.lastMessage || 'Start a conversation...', timestamp: '' };

    return (
      <Pressable
        onPress={() => router.push(`/chat/${item.id}`)}
        style={({ pressed }) => [
          styles.chatItem,
          pressed && styles.chatItemPressed
        ]}
      >
        <LiquidGlassCard
          variant="default"
          glowColor={`${activeTheme.primary}20`}
          style={styles.chatCard}
        >
          <View style={styles.chatItemContent}>
            {/* Avatar with Glow Ring */}
            <View style={styles.avatarContainer}>
              <LinearGradient
                colors={[activeTheme.primary, activeTheme.accent]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.avatarGlow}
              >
                <View style={styles.avatarInner}>
                  <Image
                    source={{ uri: item.avatar }}
                    style={styles.avatar}
                  />
                </View>
              </LinearGradient>
              {item.status === 'online' && (
                <View style={[styles.onlineIndicator, { backgroundColor: activeTheme.primary }]} />
              )}
            </View>

            {/* Content */}
            <View style={styles.chatContent}>
              <View style={styles.chatHeader}>
                <Text style={styles.contactName}>
                  {item.name}
                </Text>
                {lastMsg.timestamp && (
                  <Text style={[styles.timestamp, { color: `${activeTheme.primary}80` }]}>
                    {lastMsg.timestamp}
                  </Text>
                )}
              </View>
              <View style={styles.chatPreview}>
                <Text numberOfLines={1} style={styles.lastMessage}>
                  {lastMsg.text || 'Tap to start syncing...'}
                </Text>
                {item.unreadCount > 0 && (
                  <LinearGradient
                    colors={[activeTheme.primary, activeTheme.accent]}
                    style={styles.unreadBadge}
                  >
                    <Text style={styles.unreadCount}>
                      {item.unreadCount}
                    </Text>
                  </LinearGradient>
                )}
              </View>
            </View>

            {/* Arrow Indicator */}
            <View style={styles.arrowContainer}>
              <MaterialIcons name="chevron-right" size={20} color="rgba(255,255,255,0.3)" />
            </View>
          </View>
        </LiquidGlassCard>
      </Pressable>
    );
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
    marginBottom: 12,
    marginHorizontal: 12,
  },
  chatItemPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  chatCard: {
    // Additional card styling handled by LiquidGlassCard
  },
  chatItemContent: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatarGlow: {
    width: 54,
    height: 54,
    borderRadius: 27,
    padding: 2,
  },
  avatarInner: {
    flex: 1,
    borderRadius: 25,
    backgroundColor: '#000000',
    overflow: 'hidden',
  },
  avatar: {
    width: '100%',
    height: '100%',
    borderRadius: 25,
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 3,
    borderColor: '#000000',
  },
  chatContent: {
    flex: 1,
  },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  contactName: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
    letterSpacing: 1,
  },
  timestamp: {
    fontSize: 10,
    fontWeight: '700',
  },
  chatPreview: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lastMessage: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
    marginRight: 8,
  },
  unreadBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadCount: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
  arrowContainer: {
    paddingLeft: 4,
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
