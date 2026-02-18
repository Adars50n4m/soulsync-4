import React, { useRef, useState, useCallback, useMemo } from 'react';
import { View, Text, Image, FlatList, Pressable, StyleSheet, StatusBar, Dimensions, Alert } from 'react-native';
import { useRouter, useNavigation } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring, 
  LinearTransition,
  FadeIn,
  FadeOut
} from 'react-native-reanimated';
import * as ImagePicker from 'expo-image-picker';

import { useApp } from '../../context/AppContext';
import { SoulSyncLogo } from '../../components/SoulSyncLogo';
import { StatusViewerModal } from '../../components/StatusViewerModal';
import { MediaPickerSheet } from '../../components/MediaPickerSheet';
import { Contact, Story } from '../../types';
import SingleChatScreen from '../chat/[id]';

const ChatListItem = React.memo(({ item, lastMsg, onSelect, isTyping }: { 
  item: Contact, 
  lastMsg: any, 
  onSelect: (contact: Contact, y: number) => void,
  isTyping: boolean
}) => {
  const scaleAnim = useSharedValue(1);
  const itemRef = useRef<View>(null);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleAnim.value }]
  }));

  const handlePressIn = () => {
    scaleAnim.value = withSpring(0.96);
  };

  const handlePressOut = () => {
    scaleAnim.value = withSpring(1);
  };

  const handlePress = () => {
    itemRef.current?.measure((x, y, width, height, pageX, pageY) => {
      onSelect(item, pageY);
    });
  };

  return (
    <Pressable
      ref={itemRef}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={styles.chatItem}
    >
      <Animated.View style={[styles.chatPillContainer, animatedStyle]}>
        <View style={styles.pillBackground} />
        <BlurView intensity={40} tint="dark" style={styles.pillBlur} />

        <View style={styles.pillContent}>
          <View style={styles.avatarContainer}>
            <Image source={{ uri: item.avatar }} style={styles.avatar} />
            {item.status === 'online' && <View style={styles.onlineIndicator} />}
          </View>

          <View style={styles.chatContent}>
            <Text style={styles.contactName}>{item.name}</Text>
            <Text numberOfLines={1} style={[styles.lastMessage, isTyping && { color: '#22c55e', fontWeight: '700' }]}>
              {isTyping ? 'Typing...' : (lastMsg.text || 'Start a conversation')}
            </Text>
          </View>

          <View style={styles.rightSide}>
            {lastMsg.timestamp && <Text style={styles.timestamp}>{lastMsg.timestamp}</Text>}
            <MaterialIcons name="chevron-right" size={20} color="rgba(255,255,255,0.3)" />
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
});

export default function HomeScreen() {
  const { contacts, messages, activeTheme, typingUsers, currentUser, statuses, addStatus } = useApp();
  const navigation = useNavigation();
  const [selectedUser, setSelectedUser] = useState<Contact | null>(null);
  const [sourceY, setSourceY] = useState<number | undefined>(undefined);

  // Hide Tab Bar when Chat is open
  React.useLayoutEffect(() => {
    navigation.setOptions({
      tabBarStyle: selectedUser ? { display: 'none' } : undefined
    });
  }, [navigation, selectedUser]);

  // Status Handlers
  const [selectedStatusContact, setSelectedStatusContact] = useState<Contact | null>(null);
  const [isViewerVisible, setIsViewerVisible] = useState(false);
  const [isMediaPickerVisible, setIsMediaPickerVisible] = useState(false);

  const contactStoriesMap = useMemo(() => {
    const map = new Map<string, Story[]>();
    statuses.forEach(s => {
      const story: Story = { id: s.id, url: s.mediaUrl, type: s.mediaType, timestamp: s.timestamp, seen: false, caption: s.caption };
      if (!map.has(s.userId)) map.set(s.userId, []);
      map.get(s.userId)?.push(story);
    });
    return map;
  }, [statuses]);

  const contactsWithStories = useMemo(() => {
     return contacts.filter(c => contactStoriesMap.has(c.id)).map(c => ({
         ...c,
         stories: contactStoriesMap.get(c.id)
     }));
  }, [contacts, contactStoriesMap]);

  const handleStatusPress = (contact: Contact) => {
    setSelectedStatusContact(contact);
    setIsViewerVisible(true);
  };

  const createStatus = (result: ImagePicker.ImagePickerResult) => {
      if (!result.canceled && result.assets?.[0] && currentUser) {
          const asset = result.assets[0];
          const expiresAt = new Date();
          expiresAt.setHours(expiresAt.getHours() + 24);
          addStatus({
              userId: currentUser.id,
              mediaUrl: asset.uri,
              mediaType: asset.type === 'video' ? 'video' : 'image',
              timestamp: new Date().toISOString(),
              expiresAt: expiresAt.toISOString(),
              caption: ''
          });
      }
      setIsMediaPickerVisible(false);
  };

  const handleSelectCamera = async () => {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) return Alert.alert('Permission needed', 'Camera permission required.');
      const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
      createStatus(result);
  };

  const handleSelectGallery = async () => {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) return Alert.alert('Permission needed', 'Gallery permission required.');
      const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });
      createStatus(result);
  };

  const handleUserSelect = useCallback((contact: Contact, y: number) => {
    setSourceY(y);
    setSelectedUser(contact);
  }, []);

  const renderItem = ({ item }: { item: Contact }) => {
    const chatMessages = messages[item.id] || [];
    const lastMsg = chatMessages[chatMessages.length - 1] || { text: item.lastMessage, timestamp: '' };
    const isTyping = typingUsers.includes(item.id);
    return (
      <View style={{ opacity: selectedUser?.id === item.id ? 0 : 1 }}>
        <ChatListItem item={item} lastMsg={lastMsg} onSelect={handleUserSelect} isTyping={isTyping} />
      </View>
    );
  };

  if (selectedUser) {
    return (
      <Animated.View 
        style={styles.fullScreenContent} 
        entering={FadeIn.duration(350).delay(50)} 
        exiting={FadeOut.duration(300)}
        layout={LinearTransition.springify().damping(18)}
      >
        <SingleChatScreen user={selectedUser} sourceY={sourceY} onBack={() => setSelectedUser(null)} />
      </Animated.View>
    );
  }

  return (
    <Animated.View 
        style={styles.container} 
        entering={FadeIn.duration(350)} 
        exiting={FadeOut.duration(300)}
        layout={LinearTransition.springify().damping(18)}
    >
      <StatusBar barStyle="light-content" />
      
      <FlatList
        data={contacts}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        ListHeaderComponent={() => (
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
                    <Pressable style={styles.statusCard} onPress={() => setIsMediaPickerVisible(true)}>
                      <View style={styles.myStatusBackground}>
                        <View style={styles.myStatusAvatarContainer}>
                          <Image source={{ uri: currentUser?.avatar || 'https://via.placeholder.com/150' }} style={styles.myStatusAvatar} />
                          <View style={styles.myStatusAddBadge}><MaterialIcons name="add" size={16} color="#fff" /></View>
                        </View>
                        <Text style={styles.startStoryText}>Start a story</Text>
                      </View>
                    </Pressable>
                  );
                }
                const contact = item as Contact;
                const hasUnseen = contact.stories?.some(s => !s.seen);
                return (
                  <Pressable style={styles.statusCard} onPress={() => handleStatusPress(contact)}>
                    <Image source={{ uri: contact.stories?.[0]?.url }} style={styles.statusMediaBackground} />
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
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

      <StatusViewerModal
        visible={isViewerVisible}
        stories={selectedStatusContact?.stories || []}
        contactName={selectedStatusContact?.name || ''}
        contactAvatar={selectedStatusContact?.avatar || ''}
        onClose={() => setIsViewerVisible(false)}
        onComplete={() => setIsViewerVisible(false)}
      />

      <MediaPickerSheet
        visible={isMediaPickerVisible}
        onClose={() => setIsMediaPickerVisible(false)}
        onSelectCamera={handleSelectCamera}
        onSelectGallery={handleSelectGallery}
        onSelectAudio={() => Alert.alert("Audio Status", "Coming soon!")}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  fullScreenContent: { flex: 1, backgroundColor: '#000' },
  statusRail: { marginTop: 60, marginBottom: 24 },
  statusContent: { paddingHorizontal: 20, gap: 12 },
  statusCard: { width: 110, height: 140, borderRadius: 28, overflow: 'hidden', backgroundColor: '#1a1a1a' },
  myStatusBackground: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#262626', padding: 12 },
  myStatusAvatarContainer: { position: 'relative', marginBottom: 12 },
  myStatusAvatar: { width: 56, height: 56, borderRadius: 28, borderWidth: 2, borderColor: '#3b82f6' },
  myStatusAddBadge: { position: 'absolute', bottom: -2, right: -2, width: 22, height: 22, borderRadius: 11, backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#262626' },
  startStoryText: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '600', textAlign: 'center' },
  statusMediaBackground: { ...StyleSheet.absoluteFillObject, backgroundColor: '#1a1a1a' },
  statusOverlay: { ...StyleSheet.absoluteFillObject, padding: 10 },
  contactAvatarBadge: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, padding: 2, backgroundColor: 'rgba(0,0,0,0.5)' },
  smallStatusAvatar: { width: '100%', height: '100%', borderRadius: 15 },
  listContent: { paddingBottom: 100, paddingHorizontal: 4 },
  chatItem: { marginBottom: 8, marginHorizontal: 16, borderRadius: 36, height: 72 },
  chatPillContainer: { flex: 1, borderRadius: 36, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)', overflow: 'hidden' },
  pillBackground: { ...StyleSheet.absoluteFillObject, backgroundColor: '#151515', opacity: 0.95 },
  pillBlur: { ...StyleSheet.absoluteFillObject },
  pillContent: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 12 },
  avatarContainer: { position: 'relative' },
  avatar: { width: 46, height: 46, borderRadius: 23 },
  onlineIndicator: { position: 'absolute', bottom: 0, right: 0, width: 12, height: 12, borderRadius: 6, backgroundColor: '#22c55e', borderWidth: 2, borderColor: '#151515' },
  chatContent: { flex: 1, justifyContent: 'center' },
  contactName: { color: '#fff', fontSize: 17, fontWeight: '700', letterSpacing: 0.5 },
  lastMessage: { color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: '500' },
  rightSide: { alignItems: 'flex-end', justifyContent: 'center', paddingRight: 4, gap: 4, top: 8 },
  timestamp: { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '600' },
});
