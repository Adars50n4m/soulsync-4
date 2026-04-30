import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Platform,
  Alert,
  KeyboardAvoidingView,
  ScrollView,
  Dimensions,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import { SoulAvatar } from '../components/SoulAvatar';
import { SoulLoader } from '../components/ui/SoulLoader';
import { proxySupabaseUrl, SERVER_URL, safeFetchJson } from '../config/api';
import { supabase } from '../config/supabase';
import { Contact } from '../types';
import { LEGACY_TO_UUID } from '../utils/idNormalization';
import { hapticService } from '../services/HapticService';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { storageService } from '../services/StorageService';
import * as Crypto from 'expo-crypto';
import Animated, { FadeIn, FadeOut, ZoomIn, ZoomOut } from 'react-native-reanimated';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const AVATAR_UPLOAD_TIMEOUT_MS = 45000;

export default function CreateGroupScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { contacts, currentUser, activeTheme, offlineService, refreshLocalCache } = useApp();
    
    const [step, setStep] = useState<1 | 2>(1);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [groupName, setGroupName] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [groupAvatar, setGroupAvatar] = useState<string | null>(null);

    const createGroupRecord = useCallback(async (payload: {
        id: string;
        name: string;
        creator_id?: string;
        avatar_url?: string | null;
    }) => {
        try {
            const result = await supabase
                .from('chat_groups')
                .insert(payload)
                .select()
                .single();

            if (result.error) {
                // Handle already exists or unique constraint errors if needed
                if (result.error.code === 'PGRST205') {
                    return { data: { id: payload.id }, error: null };
                }
                return result;
            }
            return result;
        } catch (err: any) {
            console.error('[CreateGroup] Internal insertion error:', err);
            return { data: null, error: err };
        }
    }, []);

    const createGroupViaServer = useCallback(async (payload: {
        id: string;
        name: string;
        creator_id: string;
        avatar_url?: string | null;
        member_ids: string[];
    }) => {
        return safeFetchJson<{ id: string }>(`${SERVER_URL.replace(/\/$/, '')}/api/groups/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
    }, []);

    const prepareAvatarForUpload = useCallback(async (uri: string) => {
        const result = await ImageManipulator.manipulateAsync(
            uri,
            [{ resize: { width: 720 } }],
            {
                compress: 0.55,
                format: ImageManipulator.SaveFormat.JPEG,
            }
        );
        return result.uri;
    }, []);

    const filteredContacts = useMemo(() => {
        return contacts.filter(c => 
            !c.isGroup && 
            (c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
             c.id.toLowerCase().includes(searchQuery.toLowerCase()))
        );
    }, [contacts, searchQuery]);

    const toggleUser = (id: string) => {
        hapticService.impact(Haptics.ImpactFeedbackStyle.Light);
        setSelectedIds(prev => 
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const handlePickAvatar = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.7,
        });

        if (!result.canceled) {
            setGroupAvatar(result.assets[0].uri);
        }
    };

    const handleCreateGroup = async () => {
        if (!groupName.trim()) {
            Alert.alert('Group Name', 'Please enter a name for your group');
            return;
        }
        if (!currentUser?.id) {
            Alert.alert('Error', 'User session not ready. Please reopen the app and try again.');
            return;
        }

        setIsCreating(true);
        try {
            let uploadedAvatarUrl = groupAvatar;
            
            if (groupAvatar && !groupAvatar.startsWith('http')) {
                const preparedUri = await prepareAvatarForUpload(groupAvatar);
                const storageKey = await Promise.race([
                    storageService.uploadImage(preparedUri, 'avatars', 'groups'),
                    new Promise<null>((_, reject) =>
                        setTimeout(() => reject(new Error('Photo upload timed out. Please try again.')), AVATAR_UPLOAD_TIMEOUT_MS)
                    ),
                ]);
                if (storageKey) {
                    uploadedAvatarUrl = storageKey;
                }
            }

            // Ensure we have a valid UUID. Crypto.randomUUID() might be unavailable on some Android versions
            // or specific Expo environments if not configured.
            let newGroupId;
            try {
                newGroupId = Crypto.randomUUID();
            } catch (e) {
                newGroupId = Math.random().toString(36).substring(2) + Date.now().toString(36);
                console.warn('[CreateGroup] Crypto.randomUUID failed, using fallback ID');
            }

            let { data: groupData, error: groupError } = await createGroupRecord({
                id: newGroupId,
                name: groupName.trim(),
                creator_id: currentUser.id,
                avatar_url: uploadedAvatarUrl,
            });
            let groupCreatedViaServer = false;

            if (groupError?.code === '42501') {
                const serverResult = await createGroupViaServer({
                    id: newGroupId,
                    name: groupName.trim(),
                    creator_id: currentUser.id,
                    avatar_url: uploadedAvatarUrl,
                    member_ids: selectedIds,
                });
                if (!serverResult.success || !serverResult.data?.id) {
                    throw new Error(serverResult.error || groupError.message || 'Failed to create group');
                }
                groupData = { id: serverResult.data.id };
                groupError = null;
                groupCreatedViaServer = true;
            }

            if (groupError) throw groupError;
            if (!groupData) throw new Error("No data returned after group creation");

            const normalizedCreatorId = LEGACY_TO_UUID[currentUser.id] || currentUser.id;
            const memberRows = [
                { 
                    group_id: groupData.id, 
                    user_id: normalizedCreatorId, 
                    role: 'admin',
                    joined_at: new Date().toISOString()
                },
                ...selectedIds.map(id => ({ 
                    group_id: groupData.id, 
                    user_id: LEGACY_TO_UUID[id] || id, 
                    role: 'member',
                    joined_at: new Date().toISOString()
                }))
            ];

            if (!groupCreatedViaServer) {
                const { error: memberError } = await supabase
                    .from('chat_group_members')
                    .insert(memberRows);

                if (memberError) {
                    if (memberError.code === '42501') {
                        const serverResult = await createGroupViaServer({
                            id: groupData.id,
                            name: groupName.trim(),
                            creator_id: currentUser.id,
                            avatar_url: uploadedAvatarUrl,
                            member_ids: selectedIds,
                        });
                        if (!serverResult.success) {
                            throw new Error(serverResult.error || 'Permission denied while creating group');
                        }
                    } else {
                        throw memberError;
                    }
                }
            }

            // Local Persistence
            await offlineService.saveGroup({
                id: groupData.id,
                name: groupName.trim(),
                description: '',
                avatarUrl: uploadedAvatarUrl || '',
                creatorId: currentUser.id,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });

            const localMembers = memberRows.map(m => ({
                id: `${groupData.id}_${m.user_id}`,
                groupId: groupData.id,
                userId: m.user_id,
                role: m.role as string,
                joinedAt: new Date().toISOString()
            }));
            await offlineService.saveGroupMembers(groupData.id, localMembers);

            await refreshLocalCache(true);
            hapticService.notification(Haptics.NotificationFeedbackType.Success);
            router.replace(`/chat/${groupData.id}`);
            
        } catch (error: any) {
            console.error('[CreateGroup] Fatal Error:', error);
            // Detailed alert for better user feedback
            const errorMsg = error.message || 'Check your internet connection and try again.';
            Alert.alert('Creation Failed', errorMsg);
        } finally {
            setIsCreating(false);
        }
    };

    const renderContactItem = ({ item }: { item: Contact }) => {
        const isSelected = selectedIds.includes(item.id);
        return (
            <Pressable 
                style={[styles.contactItem, isSelected && styles.contactItemActive]} 
                onPress={() => toggleUser(item.id)}
            >
                <View style={styles.contactAvatarContainer}>
                    <SoulAvatar uri={proxySupabaseUrl(item.avatar)} size={54} />
                    {isSelected && (
                        <Animated.View entering={ZoomIn} exiting={ZoomOut} style={[styles.checkBadge, { backgroundColor: activeTheme.primary }]}>
                            <Ionicons name="checkmark" size={12} color="#fff" />
                        </Animated.View>
                    )}
                </View>
                <View style={styles.contactInfo}>
                    <Text style={styles.contactName}>{item.name}</Text>
                    <Text style={styles.contactStatus} numberOfLines={1}>{item.status || 'Available'}</Text>
                </View>
                <View
                    style={[
                        styles.checkbox,
                        isSelected && {
                            backgroundColor: activeTheme.primary,
                            borderColor: activeTheme.primary,
                        }
                    ]}
                >
                    <Ionicons
                        name="checkmark"
                        size={16}
                        color="#fff"
                        style={{ opacity: isSelected ? 1 : 0 }}
                    />
                </View>
            </Pressable>
        );
    };

    const Header = ({ title, subtitle, showBack = true, onBack = () => router.back(), rightElement = null }: any) => (
        <BlurView intensity={80} tint="dark" style={[styles.headerBlur, { paddingTop: insets.top }]}>
            <View style={styles.headerContent}>
                {showBack ? (
                    <Pressable onPress={onBack} style={styles.headerIconBtn}>
                        <Ionicons name="chevron-back" size={28} color="#fff" />
                    </Pressable>
                ) : <View style={{ width: 44 }} />}
                
                <View style={styles.headerTextContainer}>
                    <Text style={styles.headerTitleText}>{title}</Text>
                    {subtitle && <Text style={styles.headerSubtitleText}>{subtitle}</Text>}
                </View>

                {rightElement || <View style={{ width: 44 }} />}
            </View>
        </BlurView>
    );

    if (step === 2) {
        return (
            <KeyboardAvoidingView 
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.container}
            >
                <LinearGradient colors={['#000', '#0a0a0a', '#000']} style={StyleSheet.absoluteFill} />
                
                <Header 
                    title="New Group" 
                    subtitle="Finalize details" 
                    onBack={() => setStep(1)}
                    rightElement={
                        <Pressable 
                            onPress={handleCreateGroup}
                            disabled={!groupName.trim() || isCreating}
                            style={{ opacity: !groupName.trim() || isCreating ? 0.5 : 1 }}
                        >
                            {isCreating ? (
                                <SoulLoader size={50} />
                            ) : (
                                <Text style={[styles.headerActionText, { color: activeTheme.primary }]}>Create</Text>
                            )}
                        </Pressable>
                    }
                />

                <ScrollView contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 80 }]}>
                    <Pressable style={styles.avatarPickerMain} onPress={handlePickAvatar}>
                        <View style={styles.avatarPickerWrapper}>
                            <LinearGradient
                                colors={['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.02)']}
                                style={styles.avatarOuterCircle}
                            >
                                {groupAvatar ? (
                                    <SoulAvatar uri={groupAvatar} size={120} />
                                ) : (
                                    <View style={styles.cameraIconBg}>
                                        <Ionicons name="camera" size={48} color="rgba(255,255,255,0.4)" />
                                    </View>
                                )}
                            </LinearGradient>
                            <BlurView intensity={30} style={styles.editBadge}>
                                <Ionicons name="pencil" size={16} color="#fff" />
                            </BlurView>
                        </View>
                        <Text style={styles.avatarPickerLabel}>Add Group Photo</Text>
                    </Pressable>

                    <View style={styles.groupInputSection}>
                        <BlurView intensity={20} tint="light" style={styles.inputWrapper}>
                            <TextInput
                                style={styles.groupNameInput}
                                placeholder="Group Name"
                                placeholderTextColor="rgba(255,255,255,0.3)"
                                value={groupName}
                                onChangeText={setGroupName}
                                autoFocus
                                selectionColor={activeTheme.primary}
                            />
                        </BlurView>
                        <Text style={styles.inputHint}>Provide a group name and optional group icon</Text>
                    </View>

                    <View style={styles.participantsSection}>
                        <View style={styles.sectionHeader}>
                            <Text style={styles.sectionTitle}>PARTICIPANTS</Text>
                            <Text style={styles.sectionCount}>{selectedIds.length} Members</Text>
                        </View>
                        
                        <View style={styles.participantsGrid}>
                            {selectedIds.map((id, index) => {
                                const contact = contacts.find(c => c.id === id);
                                return (
                                    <Animated.View key={id} entering={FadeIn.delay(index * 50)} style={styles.participantThumb}>
                                        <SoulAvatar uri={proxySupabaseUrl(contact?.avatar)} size={56} />
                                        <Text style={styles.participantName} numberOfLines={1}>
                                            {contact?.name.split(' ')[0]}
                                        </Text>
                                    </Animated.View>
                                );
                            })}
                        </View>
                    </View>
                </ScrollView>

                {!isCreating && groupName.trim().length > 0 && (
                   <View style={[styles.floatingAction, { bottom: Math.max(insets.bottom, 20) }]}>
                       <Pressable style={styles.mainCreateBtn} onPress={handleCreateGroup}>
                           <LinearGradient
                               colors={[activeTheme.primary, activeTheme.accent || activeTheme.primary]}
                               start={{ x: 0, y: 0 }}
                               end={{ x: 1, y: 1 }}
                               style={styles.mainCreateBtnGradient}
                           >
                               <Text style={styles.mainCreateBtnText}>Create Group ({selectedIds.length + 1})</Text>
                               <Ionicons name="arrow-forward" size={20} color="#fff" style={{ marginLeft: 10 }} />
                           </LinearGradient>
                       </Pressable>
                   </View>
                )}
            </KeyboardAvoidingView>
        );
    }

    const footerHeight = selectedIds.length > 0 ? 110 + insets.bottom : 0;

    return (
        <View style={styles.container}>
            <LinearGradient colors={['#000', '#0a0a0a']} style={StyleSheet.absoluteFill} />
            
            <Header 
                title="Add Members" 
                subtitle={`${selectedIds.length} contacts selected`}
                rightElement={
                    <Pressable 
                        onPress={() => setStep(2)} 
                        disabled={selectedIds.length === 0}
                        style={{ opacity: selectedIds.length === 0 ? 0.3 : 1 }}
                    >
                        <Text style={[styles.headerActionText, { color: activeTheme.primary }]}>Next</Text>
                    </Pressable>
                }
            />

            <View style={[styles.searchSection, { marginTop: insets.top + 70 }]}>
                <BlurView intensity={20} tint="light" style={styles.searchWrapper}>
                    <Ionicons name="search" size={20} color="rgba(255,255,255,0.4)" style={{ marginRight: 10 }} />
                    <TextInput
                        style={styles.searchField}
                        placeholder="Search for people..."
                        placeholderTextColor="rgba(255,255,255,0.3)"
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        selectionColor={activeTheme.primary}
                    />
                    {searchQuery.length > 0 && (
                        <Pressable onPress={() => setSearchQuery('')}>
                            <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.4)" />
                        </Pressable>
                    )}
                </BlurView>
            </View>

            <FlashList
                data={filteredContacts}
                renderItem={renderContactItem}
                keyExtractor={item => item.id}
                estimatedItemSize={76}
                extraData={selectedIds}
                contentContainerStyle={{ 
                    paddingTop: 10,
                    paddingBottom: footerHeight + 20 
                }}
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Ionicons name="people-outline" size={80} color="rgba(255,255,255,0.05)" />
                        <Text style={styles.emptyTitle}>No contacts found</Text>
                        <Text style={styles.emptySubtitle}>Try searching for someone else</Text>
                    </View>
                }
            />

            {selectedIds.length > 0 && (
                <Animated.View entering={FadeIn} exiting={FadeOut} style={[styles.selectionFooter, { paddingBottom: insets.bottom + 10 }]}>
                    <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill} />
                    <View style={styles.footerTopRow}>
                        <Text style={styles.selectionTitleText}>SELECTED MEMBERS</Text>
                        <Pressable onPress={() => setSelectedIds([])}>
                            <Text style={[styles.clearAllText, { color: activeTheme.primary }]}>Clear All</Text>
                        </Pressable>
                    </View>
                    <FlashList
                        horizontal
                        data={selectedIds}
                        renderItem={({ item }) => {
                            const contact = contacts.find(c => c.id === item);
                            return (
                                <View style={styles.footerMember}>
                                    <View style={styles.footerAvatarWrapper}>
                                        <SoulAvatar uri={proxySupabaseUrl(contact?.avatar)} size={50} />
                                        <Pressable 
                                            style={styles.removeMemberBtn}
                                            onPress={() => toggleUser(item)}
                                        >
                                            <Ionicons name="close" size={12} color="#fff" />
                                        </Pressable>
                                    </View>
                                    <Text style={styles.footerMemberName} numberOfLines={1}>
                                        {contact?.name.split(' ')[0]}
                                    </Text>
                                </View>
                            );
                        }}
                        keyExtractor={item => item}
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.footerList}
                    />
                </Animated.View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    headerBlur: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        borderBottomWidth: 0.5,
        borderBottomColor: 'rgba(255,255,255,0.1)'
    },
    headerContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 64,
        paddingHorizontal: 8,
    },
    headerIconBtn: {
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTextContainer: {
        alignItems: 'center',
        flex: 1,
    },
    headerTitleText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '700',
        letterSpacing: -0.3,
    },
    headerSubtitleText: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 12,
        fontWeight: '500',
        marginTop: 1,
    },
    headerActionText: {
        fontSize: 17,
        fontWeight: '600',
        paddingHorizontal: 16,
    },
    searchSection: {
        paddingHorizontal: 16,
        marginBottom: 12,
    },
    searchWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        height: 40,
        paddingHorizontal: 12,
        borderRadius: 12,
        overflow: 'hidden',
        borderWidth: 0.5,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    searchField: {
        flex: 1,
        color: '#fff',
        fontSize: 16,
        paddingHorizontal: 10,
    },
    contactItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 5,
        marginHorizontal: 8,
        borderRadius: 12,
    },
    contactItemActive: {
        backgroundColor: 'rgba(255,255,255,0.03)',
    },
    contactAvatarContainer: {
        position: 'relative',
    },
    checkBadge: {
        position: 'absolute',
        bottom: -2,
        right: -2,
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: '#000',
        alignItems: 'center',
        justifyContent: 'center',
    },
    contactInfo: {
        flex: 1,
        marginLeft: 16,
    },
    contactName: {
        color: '#fff',
        fontSize: 17,
        fontWeight: '600',
        letterSpacing: -0.2,
    },
    contactStatus: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 13,
        marginTop: 2,
        fontWeight: '400',
    },
    checkbox: {
        width: 26,
        height: 26,
        borderRadius: 13,
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.15)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 120,
        paddingHorizontal: 40,
    },
    emptyTitle: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '700',
        marginTop: 20,
    },
    emptySubtitle: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 14,
        textAlign: 'center',
        marginTop: 8,
        lineHeight: 20,
    },
    selectionFooter: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingTop: 16,
        borderTopWidth: 0.5,
        borderColor: 'rgba(255,255,255,0.15)',
        overflow: 'hidden',
    },
    footerTopRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        marginBottom: 12,
    },
    selectionTitleText: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 1.2,
    },
    clearAllText: {
        fontSize: 12,
        fontWeight: '700',
    },
    footerList: {
        paddingLeft: 20,
        paddingBottom: 4,
    },
    footerMember: {
        alignItems: 'center',
        marginRight: 16,
        width: 60,
    },
    footerAvatarWrapper: {
        position: 'relative',
    },
    removeMemberBtn: {
        position: 'absolute',
        top: -4,
        right: -4,
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: '#222',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    footerMemberName: {
        color: '#fff',
        fontSize: 11,
        marginTop: 6,
        fontWeight: '500',
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingBottom: 120,
    },
    avatarPickerMain: {
        alignItems: 'center',
        marginVertical: 32,
    },
    avatarPickerWrapper: {
        position: 'relative',
    },
    avatarOuterCircle: {
        width: 130,
        height: 130,
        borderRadius: 65,
        padding: 5,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    cameraIconBg: {
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: 'rgba(255,255,255,0.03)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    editBadge: {
        position: 'absolute',
        bottom: 4,
        right: 4,
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(50,50,50,0.8)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
        overflow: 'hidden',
    },
    avatarPickerLabel: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 14,
        fontWeight: '600',
        marginTop: 16,
    },
    groupInputSection: {
        marginBottom: 32,
    },
    inputWrapper: {
        height: 54,
        borderRadius: 14,
        overflow: 'hidden',
        paddingHorizontal: 16,
        borderWidth: 0.5,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    groupNameInput: {
        flex: 1,
        color: '#fff',
        fontSize: 18,
        fontWeight: '600',
    },
    inputHint: {
        color: 'rgba(255,255,255,0.3)',
        fontSize: 12,
        marginTop: 10,
        textAlign: 'center',
        paddingHorizontal: 20,
    },
    participantsSection: {
        marginTop: 8,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        marginBottom: 16,
        paddingHorizontal: 4,
    },
    sectionTitle: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 1,
    },
    sectionCount: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 12,
        fontWeight: '600',
    },
    participantsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    participantThumb: {
        width: (SCREEN_WIDTH - 40) / 4,
        alignItems: 'center',
        marginBottom: 20,
    },
    participantName: {
        color: '#fff',
        fontSize: 12,
        marginTop: 8,
        fontWeight: '500',
    },
    floatingAction: {
        position: 'absolute',
        left: 20,
        right: 20,
        zIndex: 100,
    },
    mainCreateBtn: {
        height: 56,
        borderRadius: 16,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 8,
    },
    mainCreateBtnGradient: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    mainCreateBtnText: {
        color: '#fff',
        fontSize: 17,
        fontWeight: '700',
        letterSpacing: -0.2,
    },
});
