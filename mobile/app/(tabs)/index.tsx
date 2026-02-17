import React, { useRef, useState } from 'react';
import { View, Text, Image, FlatList, Pressable, StyleSheet, StatusBar, Animated as RNAnimated, Dimensions, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import * as ImagePicker from 'expo-image-picker';

import { useApp } from '../../context/AppContext';
import { SoulSyncLogo } from '../../components/SoulSyncLogo';
import { StatusViewerModal } from '../../components/StatusViewerModal';
import { MediaPickerSheet } from '../../components/MediaPickerSheet';
import { Contact, Story } from '../../types';

const ChatListItem = React.memo(({ item, lastMsg, router, isTyping }: { item: any, lastMsg: any, router: any, isTyping: boolean }) => {
  const scaleAnim = useSharedValue(1);
  const translateYAnim = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleAnim.value }, { translateY: translateYAnim.value }]
  }));

  const handlePressIn = () => {
    scaleAnim.value = withSpring(0.96, { damping: 10, stiffness: 100 });
    translateYAnim.value = withSpring(-4, { damping: 10, stiffness: 100 });
  };

  const handlePressOut = () => {
    scaleAnim.value = withSpring(1, { damping: 10, stiffness: 100 });
    translateYAnim.value = withSpring(0, { damping: 10, stiffness: 100 });
  };

  return (
    <Pressable
      onPress={() => router.push(`/chat/${item.id}`)}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={styles.chatItem}
    >
      <Animated.View
        style={[styles.chatPillContainer, animatedStyle]}
        sharedTransitionTag={`pill-container-${item.id}`}
      >
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
  const { contacts, messages, activeTheme, musicState, typingUsers, currentUser, statuses, addStatus } = useApp();
  
  // Status State
  const [selectedStatusContact, setSelectedStatusContact] = useState<Contact | null>(null);
  const [isViewerVisible, setIsViewerVisible] = useState(false);
  const [isMediaPickerVisible, setIsMediaPickerVisible] = useState(false);

  // Group statuses by user and map to Story type
  const contactStoriesMap = React.useMemo(() => {
    const map = new Map<string, Story[]>();
    
    statuses.forEach(s => {
      const story: Story = {
        id: s.id,
        url: s.mediaUrl,
        type: s.mediaType,
        timestamp: s.timestamp,
        seen: false, // You might want to track 'seen' state locally or in context
        caption: s.caption
      };
      if (!map.has(s.userId)) {
        map.set(s.userId, []);
      }
      map.get(s.userId)?.push(story);
    });
    return map;
  }, [statuses]);

  // Derived list of contacts who have stories
  const contactsWithStories = React.useMemo(() => {
     return contacts.filter(c => contactStoriesMap.has(c.id)).map(c => ({
         ...c,
         stories: contactStoriesMap.get(c.id)
     }));
  }, [contacts, contactStoriesMap]);

  const handleStatusPress = (contact: Contact) => {
    setSelectedStatusContact(contact);
    setIsViewerVisible(true);
  };

  const handleMyStatusPress = () => {
    setIsMediaPickerVisible(true);
  };

  const createStatus = (result: ImagePicker.ImagePickerResult) => {
      if (!result.canceled && result.assets && result.assets.length > 0 && currentUser) {
          const asset = result.assets[0];
          const type = asset.type === 'video' ? 'video' : 'image';
          
          // Create 24h expiration
          const expiresAt = new Date();
          expiresAt.setHours(expiresAt.getHours() + 24);

          addStatus({
              userId: currentUser.id,
              mediaUrl: asset.uri,
              mediaType: type,
              timestamp: new Date().toISOString(),
              expiresAt: expiresAt.toISOString(),
              caption: ''
          });
      }
      setIsMediaPickerVisible(false);
  };

  const handleSelectCamera = async () => {
      try {
          const permission = await ImagePicker.requestCameraPermissionsAsync();
          if (!permission.granted) {
              Alert.alert('Permission needed', 'Camera permission is required to post status.');
              return;
          }
          const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images, // Video support can be added later if needed
              quality: 0.8,
          });
          createStatus(result);
      } catch (error) {
          Alert.alert('Error', 'Failed to open camera');
      }
  };

  const handleSelectGallery = async () => {
      try {
          const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!permission.granted) {
              Alert.alert('Permission needed', 'Gallery permission is required to post status.');
              return;
          }
           const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.All,
              quality: 0.8,
          });
          createStatus(result);
      } catch (error) {
          Alert.alert('Error', 'Failed to open gallery');
      }
  };


  const renderItem = ({ item, index }: { item: any, index: number }) => {
    const chatMessages = messages[item.id] || [];
    const lastMsg = chatMessages[chatMessages.length - 1] || { text: item.lastMessage || 'Start a conversation', timestamp: '' };
    const isTyping = typingUsers.includes(item.id);

    return <ChatListItem item={item} lastMsg={lastMsg} router={router} isTyping={isTyping} />;
  };

  // Status Rail Component
  const StatusRail = () => (
    <View style={styles.statusRail}>
      <FlatList
        horizontal
        data={[{ id: 'my-status' }, ...contactsWithStories]}
        keyExtractor={item => item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.statusContent}
        renderItem={({ item }) => {
          if (item.id === 'my-status') {
            return (
              <Pressable style={styles.statusCard} onPress={handleMyStatusPress}>
                <View style={styles.myStatusBackground}>
                  <View style={styles.myStatusAvatarContainer}>
                    <Image 
                      source={{ uri: currentUser?.avatar || 'https://via.placeholder.com/150' }} 
                      style={styles.myStatusAvatar} 
                    />
                    <View style={styles.myStatusAddBadge}>
                      <MaterialIcons name="add" size={16} color="#fff" />
                    </View>
                  </View>
                  <Text style={styles.startStoryText}>Start a story</Text>
                </View>
              </Pressable>
            );
          }
          
          const contact = item as Contact;
          const hasUnseen = contact.stories?.some(s => !s.seen);
          const firstStory = contact.stories?.[0];

          return (
            <Pressable 
              style={styles.statusCard}
              onPress={() => handleStatusPress(contact)}
            >
              <Image source={{ uri: firstStory?.url }} style={styles.statusMediaBackground} />
              <View style={styles.statusOverlay}>
                <View style={[styles.contactAvatarBadge, { borderColor: hasUnseen ? '#3b82f6' : 'rgba(255,255,255,0.2)' }]}>
                  <Image source={{ uri: contact.avatar }} style={styles.smallStatusAvatar} />
                </View>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />


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
          ListHeaderComponent={StatusRail}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Status Viewer Modal */}
      {selectedStatusContact && (
        <StatusViewerModal
          visible={isViewerVisible}
          stories={selectedStatusContact.stories || []}
          contactName={selectedStatusContact.name}
          contactAvatar={selectedStatusContact.avatar}
          onClose={() => {
            setIsViewerVisible(false);
            setSelectedStatusContact(null);
          }}
          onComplete={() => {
            setIsViewerVisible(false);
            setSelectedStatusContact(null);
          }}
        />
      )}

      {/* Media Picker for My Status */}
      <MediaPickerSheet
        visible={isMediaPickerVisible}
        onClose={() => setIsMediaPickerVisible(false)}
        onSelectCamera={handleSelectCamera}
        onSelectGallery={handleSelectGallery}
        onSelectAudio={() => Alert.alert("Audio Status", "Coming soon!")}
      />

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  // Status Rail Styles
  statusRail: {
    marginTop: 60,
    marginBottom: 24,
  },
  statusContent: {
    paddingHorizontal: 20,
    gap: 12,
  },
  statusCard: {
    width: 110,
    height: 140,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
  },
  myStatusBackground: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#262626',
    padding: 12,
  },
  myStatusAvatarContainer: {
    position: 'relative',
    marginBottom: 12,
  },
  myStatusAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: '#3b82f6',
  },
  myStatusAddBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#262626',
  },
  startStoryText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  statusMediaBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#1a1a1a',
  },
  statusOverlay: {
    ...StyleSheet.absoluteFillObject,
    padding: 10,
  },
  contactAvatarBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    padding: 2,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  smallStatusAvatar: {
    width: '100%',
    height: '100%',
    borderRadius: 15,
  },
  
  listContent: {
    paddingBottom: 100,
    paddingHorizontal: 4,
  },
  chatItem: {
    marginBottom: 8,
    marginHorizontal: 16,
    borderRadius: 36, // Exactly half of height (72)
    overflow: 'hidden',
    height: 72, // Match Chat Header Height
  },
  chatPillContainer: {
    flex: 1,
    borderRadius: 36,
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
