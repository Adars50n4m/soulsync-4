import React from 'react';
import { View, StyleSheet, Platform, ScrollView } from 'react-native';
import Skeleton from './Skeleton';
import GlassView from '../ui/GlassView';

const StatusRailSkeleton = () => {
  return (
    <View style={styles.statusRail}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.statusContent}
      >
        {[1, 2, 3, 4].map((i) => (
          <View key={i} style={styles.statusCard}>
             <View style={styles.statusCardSurface}>
                <Skeleton width="100%" height="100%" borderRadius={28} />
                
                {/* Bottom info area placeholder */}
                <View style={styles.statusInfoGlassWrapper}>
                   <View style={styles.statusInfoContent}>
                      <Skeleton width="60%" height={10} borderRadius={5} style={{ marginBottom: 4 }} />
                      <Skeleton width="40%" height={8} borderRadius={4} />
                   </View>
                </View>
             </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  statusRail: { marginTop: 15, marginBottom: 0 },
  statusContent: { paddingHorizontal: 20, paddingVertical: 12, paddingTop: 35, gap: 14 },
  statusCard: { 
    width: 115, 
    height: 175, 
    marginTop: 10, 
    borderRadius: 28, 
    backgroundColor: 'transparent',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 10,
      },
      android: {
        elevation: 4,
      }
    })
  },
  statusCardSurface: {
    flex: 1,
    borderRadius: 28,
    backgroundColor: '#1a1a1a',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  statusInfoGlassWrapper: { 
    position: 'absolute', 
    bottom: 0, 
    left: 0, 
    right: 0, 
    height: 54, 
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)'
  },
  statusInfoContent: { padding: 12, alignItems: 'center', justifyContent: 'center' },
});

export default StatusRailSkeleton;
