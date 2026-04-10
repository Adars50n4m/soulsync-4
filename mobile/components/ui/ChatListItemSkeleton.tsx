import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import Skeleton from './Skeleton';
import GlassView from '../ui/GlassView';

const ChatListItemSkeleton = () => {
  return (
    <View style={styles.chatItem}>
      <View style={styles.chatPillContainer}>
        {/* Glass background to match real item */}
        <View style={[StyleSheet.absoluteFill, { borderRadius: 36, overflow: 'hidden' }]}>
            <GlassView intensity={35} tint="dark" style={StyleSheet.absoluteFill} />
        </View>
        <View style={styles.pillContent}>
          {/* Avatar Skeleton */}
          <Skeleton circle width={40} height={40} />
          
          <View style={styles.chatContent}>
            {/* Name Skeleton */}
            <Skeleton width="45%" height={16} borderRadius={8} style={{ marginBottom: 6 }} />
            {/* Message Skeleton */}
            <Skeleton width="75%" height={12} borderRadius={6} />
          </View>

          <View style={styles.rightSide}>
            {/* Time Skeleton */}
            <Skeleton width={35} height={10} borderRadius={5} style={{ marginBottom: 8 }} />
            {/* Chevron Placeholder */}
            <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.05)' }} />
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  chatItem: { 
    marginBottom: 8, 
    marginHorizontal: 16, 
    height: 72,
    borderRadius: 36,
  },
  chatPillContainer: { 
    flex: 1, 
    borderRadius: 36, 
    borderWidth: 1, 
    borderColor: Platform.OS === 'android' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.22)', 
    overflow: 'hidden',
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
  },
  pillContent: { 
    flex: 1, 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingHorizontal: 16, 
    gap: 12 
  },
  chatContent: { flex: 1, justifyContent: 'center' },
  rightSide: { alignItems: 'flex-end', justifyContent: 'center', paddingRight: 4 },
});

export default ChatListItemSkeleton;
