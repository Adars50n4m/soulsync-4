import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
  Platform,
  Dimensions,
  StatusBar,
  FlatList,
  Image,
  Modal,
  TextInput,
  Animated,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import GlassView from '../../components/ui/GlassView';
import { SoulAvatar } from '../../components/SoulAvatar';
import { useApp } from '../../context/AppContext';
import { proxySupabaseUrl } from '../../config/api';
import { supabase } from '../../config/supabase';
import { Contact } from '../../types';
import { hapticService } from '../../services/HapticService';
import * as Haptics from 'expo-haptics';
import ProgressiveBlur from '../../components/chat/ProgressiveBlur';
import { storageService } from '../../services/StorageService';
import * as ImagePicker from 'expo-image-picker';
import { SheetScreen } from 'react-native-sheet-transitions';


const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function GroupInfoScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const { contacts, currentUser, activeTheme, offlineService, refreshLocalCache } = useApp();

    const [group, setGroup] = useState<any>(null);
    const [members, setMembers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);
    const [isAddModalVisible, setIsAddModalVisible] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedNewMembers, setSelectedNewMembers] = useState<string[]>([]);
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [isUpdating, setIsUpdating] = useState(false);

    const scrollY = React.useRef(new Animated.Value(0)).current;

    const fetchGroupDetails = useCallback(async () => {
        if (!id) return;
        setLoading(true);
        try {
            // 1. Fetch group metadata
            const { data: groupData, error: groupError } = await supabase
                .from('groups')
                .select('*')
                .eq('id', id)
                .single();

            if (groupError) throw groupError;
            setGroup(groupData);
            setEditName(groupData.name);
            setEditDescription(groupData.description || '');

            // 2. Fetch members with profiles
            const { data: memberData, error: memberError } = await supabase
                .from('group_members')
                .select(`
                    user_id,
                    role,
                    joined_at,
                    profiles:user_id (id, name, avatar_url, username, avatar_type, teddy_variant)
                `)
                .eq('group_id', id);

            if (memberError) throw memberError;

            const formattedMembers = memberData.map((m: any) => ({
                id: m.user_id,
                role: m.role,
                ...m.profiles
            }));

            setMembers(formattedMembers);

            // 3. Check if current user is admin
            const myMember = formattedMembers.find(m => m.id === currentUser?.id);
            setIsAdmin(myMember?.role === 'admin');

        } catch (error) {
            console.error('[GroupInfo] Error fetching details:', error);
            // Fallback to local data if available
            const localGroup = contacts.find(c => c.id === id);
            if (localGroup) {
                setGroup({
                    name: localGroup.name,
                    avatar_url: localGroup.avatar
                });
            }
        } finally {
            setLoading(false);
        }
    }, [id, currentUser?.id, contacts]);

    useEffect(() => {
        fetchGroupDetails();
    }, [fetchGroupDetails]);

    const handleRemoveMember = (memberId: string, name: string) => {
        Alert.alert(
            'Remove Member',
            `Are you sure you want to remove ${name} from the group?`,
            [
                { text: 'Cancel', style: 'cancel' },
                { 
                    text: 'Remove', 
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const { error } = await supabase
                                .from('group_members')
                                .delete()
                                .eq('group_id', id)
                                .eq('user_id', memberId);

                            if (error) throw error;
                            
                            hapticService.notification(Haptics.NotificationFeedbackType.Success);
                            fetchGroupDetails();
                        } catch (err: any) {
                            Alert.alert('Error', err.message);
                        }
                    }
                }
            ]
        );
    };

    const handleToggleAdmin = async (memberId: string, currentRole: string) => {
        const newRole = currentRole === 'admin' ? 'member' : 'admin';
        try {
            const { error } = await supabase
                .from('group_members')
                .update({ role: newRole })
                .eq('group_id', id)
                .eq('user_id', memberId);

            if (error) throw error;
            
            hapticService.notification(Haptics.NotificationFeedbackType.Success);
            fetchGroupDetails();
        } catch (err: any) {
            Alert.alert('Error', err.message);
        }
    };

    const handleLeaveGroup = () => {
        Alert.alert(
            'Leave Group',
            'Are you sure you want to leave this group?',
            [
                { text: 'Cancel', style: 'cancel' },
                { 
                    text: 'Leave', 
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const { error } = await supabase
                                .from('group_members')
                                .delete()
                                .eq('group_id', id)
                                .eq('user_id', currentUser?.id);

                            if (error) throw error;
                            
                            // Delete local group data
                            await offlineService.deleteContact(id as string);
                            await refreshLocalCache();
                            
                            hapticService.notification(Haptics.NotificationFeedbackType.Success);
                            router.replace('/(tabs)');
                        } catch (err: any) {
                            Alert.alert('Error', err.message);
                        }
                    }
                }
            ]
        );
    };

    const handleUpdateGroupInfo = async () => {
        if (!editName.trim()) return;
        setIsUpdating(true);
        try {
            const { error } = await supabase
                .from('groups')
                .update({
                    name: editName.trim(),
                    description: editDescription.trim(),
                })
                .eq('id', id);

            if (error) throw error;

            // Update locally (contacts table also holds group info)
            await offlineService.saveContact({
                id: id,
                name: editName.trim(),
                avatar: group.avatar_url,
                about: editDescription.trim(),
                isGroup: true
            });

            setGroup({ ...group, name: editName.trim(), description: editDescription.trim() });
            setIsEditing(false);
            hapticService.notification(Haptics.NotificationFeedbackType.Success);
            refreshLocalCache();
        } catch (err: any) {
            Alert.alert('Error', err.message);
        } finally {
            setIsUpdating(false);
        }
    };

    const handleUpdateGroupAvatar = async () => {
        if (!isAdmin) return;
        
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.7,
        });

        if (result.canceled) return;

        setIsUpdating(true);
        try {
            const storageKey = await storageService.uploadImage(result.assets[0].uri, 'profiles', 'groups');
            if (!storageKey) throw new Error('Failed to upload image');

            const { error } = await supabase
                .from('groups')
                .update({ avatar_url: storageKey })
                .eq('id', id);

            if (error) throw error;

            setGroup({ ...group, avatar_url: storageKey });
            
            // Update local DB
            await offlineService.saveContact({
                id: id,
                name: group.name,
                avatar: storageKey,
                isGroup: true
            });
            
            hapticService.notification(Haptics.NotificationFeedbackType.Success);
            refreshLocalCache();
        } catch (err: any) {
            Alert.alert('Error', err.message);
        } finally {
            setIsUpdating(false);
        }
    };

    const handleAddMembers = async () => {
        if (selectedNewMembers.length === 0) return;
        
        try {
            const memberRows = selectedNewMembers.map(uid => ({
                group_id: id,
                user_id: uid,
                role: 'member'
            }));

            const { error } = await supabase
                .from('group_members')
                .insert(memberRows);

            if (error) throw error;

            hapticService.notification(Haptics.NotificationFeedbackType.Success);
            setIsAddModalVisible(false);
            setSelectedNewMembers([]);
            fetchGroupDetails();
        } catch (err: any) {
            Alert.alert('Error', err.message);
        }
    };

    const toggleNewMember = (uid: string) => {
        setSelectedNewMembers(prev => 
            prev.includes(uid) ? prev.filter(i => i !== uid) : [...prev, uid]
        );
    };

    const renderMemberItem = ({ item }: { item: any }) => (
        <Pressable 
            style={styles.memberItem}
            onLongPress={() => {
                if (!isAdmin || item.id === currentUser?.id) return;
                hapticService.impact(Haptics.ImpactFeedbackStyle.Medium);
                Alert.alert(
                    item.name || item.username,
                    'Manage group member',
                    [
                        { text: 'Cancel', style: 'cancel' },
                        { 
                            text: item.role === 'admin' ? 'Dismiss as Admin' : 'Make Group Admin', 
                            onPress: () => handleToggleAdmin(item.id, item.role) 
                        },
                        { 
                            text: 'Remove from Group', 
                            style: 'destructive', 
                            onPress: () => handleRemoveMember(item.id, item.name || item.username) 
                        },
                    ]
                );
            }}
        >
            <SoulAvatar 
                uri={proxySupabaseUrl(item.avatar_url)} 
                size={50} 
                avatarType={item.avatar_type}
                teddyVariant={item.teddy_variant}
            />
            <View style={styles.memberInfo}>
                <View style={styles.memberNameRow}>
                    <Text style={styles.memberName}>{item.id === currentUser?.id ? 'You' : (item.name || item.username)}</Text>
                    {item.role === 'admin' && (
                        <View style={styles.adminBadge}>
                            <Text style={styles.adminBadgeText}>admin</Text>
                        </View>
                    )}
                </View>
                <Text style={styles.memberRole}>{item.role.toUpperCase()}</Text>
            </View>
            {isAdmin && item.id !== currentUser?.id && (
                <View style={styles.memberMore}>
                    <MaterialIcons name="more-vert" size={20} color="rgba(255,255,255,0.4)" />
                </View>
            )}
        </Pressable>
    );

    return (
        <SheetScreen 
            onClose={() => {
                hapticService.impact(Haptics.ImpactFeedbackStyle.Light);
                router.back();
            }}
            onCloseStart={() => hapticService.selection()}
            opacityOnGestureMove
            customBackground={
                <GlassView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
            }
        >
            <View style={styles.container}>


            <StatusBar barStyle="light-content" translucent />
            
            {/* Hero Section */}
            <Animated.View 
                style={[
                    styles.heroSection,
                    {
                        transform: [
                            {
                                scale: scrollY.interpolate({
                                    inputRange: [-SCREEN_HEIGHT, 0],
                                    outputRange: [3, 1],
                                    extrapolate: 'clamp',
                                }),
                            },
                        ],
                    }
                ]}
            >
                <Pressable onPress={handleUpdateGroupAvatar} disabled={!isAdmin || isUpdating}>
                    <Image 
                        source={{ uri: proxySupabaseUrl(group?.avatar_url) || 'https://via.placeholder.com/500?text=Group' }} 
                        style={styles.heroImage}
                    />
                    {isAdmin && (
                        <View style={styles.editAvatarOverlay}>
                            <MaterialIcons name="photo-camera" size={24} color="#fff" />
                        </View>
                    )}
                </Pressable>
                <ProgressiveBlur position="bottom" height={200} intensity={60} tint="dark" />
            </Animated.View>

            <View style={styles.header}>
                <Pressable onPress={() => router.back()} style={styles.headerButton}>
                    <GlassView intensity={30} tint="dark" style={styles.headerIconGlass}>
                        <MaterialIcons name="arrow-back-ios" size={20} color="#fff" style={{ marginLeft: 8 }} />
                    </GlassView>
                </Pressable>
            </View>

            <Animated.ScrollView 
                style={styles.scrollView} 
                showsVerticalScrollIndicator={false}
                onScroll={Animated.event(
                    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                    { useNativeDriver: true }
                )}
                scrollEventThrottle={16}
            >
                <View style={styles.headerSpacer} />
                <View style={styles.groupMeta}>
                    <Text style={styles.groupName}>{group?.name || '...'}</Text>
                    <Text style={styles.groupSubTitle}>{members.length} members</Text>
                </View>

                <View style={styles.content}>
                    {/* Basic Info */}
                    <GlassView intensity={20} tint="dark" style={styles.sectionCard}>
                        <View style={styles.sectionHeader}>
                            <Text style={styles.sectionTitle}>DESCRIPTION</Text>
                            {isAdmin && (
                                <Pressable onPress={() => setIsEditing(true)}>
                                    <MaterialIcons name="edit" size={16} color="rgba(255,255,255,0.4)" />
                                </Pressable>
                            )}
                        </View>
                        {isEditing ? (
                            <View>
                                <TextInput
                                    style={styles.editInput}
                                    value={editName}
                                    onChangeText={setEditName}
                                    placeholder="Group Name"
                                    placeholderTextColor="rgba(255,255,255,0.4)"
                                />
                                <TextInput
                                    style={[styles.editInput, { height: 80, marginTop: 10 }]}
                                    value={editDescription}
                                    onChangeText={setEditDescription}
                                    placeholder="Group Description"
                                    placeholderTextColor="rgba(255,255,255,0.4)"
                                    multiline
                                />
                                <View style={styles.editActions}>
                                    <Pressable style={styles.cancelBtn} onPress={() => setIsEditing(false)}>
                                        <Text style={styles.cancelBtnText}>Cancel</Text>
                                    </Pressable>
                                    <Pressable 
                                        style={[styles.saveBtn, { backgroundColor: activeTheme.primary }]} 
                                        onPress={handleUpdateGroupInfo}
                                        disabled={isUpdating}
                                    >
                                        <Text style={styles.saveBtnText}>{isUpdating ? 'Saving...' : 'Save'}</Text>
                                    </Pressable>
                                </View>
                            </View>
                        ) : (
                            <Text style={styles.descriptionText}>
                                {group?.description || 'No group description set.'}
                            </Text>
                        )}
                    </GlassView>

                    {/* Members List */}
                    <View style={styles.membersSection}>
                        <View style={styles.sectionHeader}>
                            <Text style={styles.sectionTitle}>MEMBERS ({members.length})</Text>
                            {isAdmin && (
                                <Pressable style={styles.addMemberBtn} onPress={() => setIsAddModalVisible(true)}>
                                    <MaterialIcons name="person-add" size={18} color={activeTheme.primary} />
                                    <Text style={[styles.addMemberText, { color: activeTheme.primary }]}>Add</Text>
                                </Pressable>
                            )}
                        </View>

                        <View style={styles.membersCard}>
                            <GlassView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                            {members.map((member, index) => (
                                <View key={member.id}>
                                    {renderMemberItem({ item: member })}
                                    {index < members.length - 1 && <View style={styles.divider} />}
                                </View>
                            ))}
                        </View>
                    </View>

                    {/* Danger Zone */}
                    <Pressable style={styles.dangerButton} onPress={handleLeaveGroup}>
                        <GlassView intensity={20} tint="dark" style={styles.dangerButtonContent}>
                            <MaterialIcons name="exit-to-app" size={22} color="#ff4444" />
                            <Text style={styles.dangerButtonText}>Exit Group</Text>
                        </GlassView>
                    </Pressable>

                    {isAdmin && (
                        <Pressable style={[styles.dangerButton, { marginTop: 12 }]} onPress={() => {
                            Alert.alert(
                                'Delete Group',
                                'Are you sure you want to delete this group and all its members? This cannot be undone.',
                                [
                                    { text: 'Cancel', style: 'cancel' },
                                    { 
                                        text: 'Delete', 
                                        style: 'destructive',
                                        onPress: async () => {
                                            try {
                                                const { error } = await supabase
                                                    .from('groups')
                                                    .delete()
                                                    .eq('id', id);

                                                if (error) throw error;
                                                
                                                hapticService.notification(Haptics.NotificationFeedbackType.Success);
                                                router.replace('/(tabs)');
                                            } catch (err: any) {
                                                Alert.alert('Error', err.message);
                                            }
                                        }
                                    }
                                ]
                            );
                        }}>
                            <GlassView intensity={20} tint="dark" style={styles.dangerButtonContent}>
                                <MaterialIcons name="delete-outline" size={22} color="#ff4444" />
                                <Text style={styles.dangerButtonText}>Delete Group</Text>
                            </GlassView>
                        </Pressable>
                    )}

                    <View style={{ height: 100 }} />
                </View>
            </Animated.ScrollView>

            {/* Add Member Modal */}
            <Modal
                visible={isAddModalVisible}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setIsAddModalVisible(false)}
            >
                <View style={styles.modalContainer}>
                    <GlassView intensity={95} tint="dark" style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Pressable onPress={() => setIsAddModalVisible(false)} style={styles.modalHeaderIcon}>
                                <MaterialIcons name="close" size={24} color="#fff" />
                            </Pressable>
                            <Text style={styles.modalTitle}>Add Members</Text>
                            <Pressable 
                                onPress={handleAddMembers} 
                                disabled={selectedNewMembers.length === 0}
                                style={[styles.modalHeaderAction, selectedNewMembers.length === 0 && { opacity: 0.5 }]}
                            >
                                <Text style={[styles.modalActionText, { color: activeTheme.primary }]}>Add</Text>
                            </Pressable>
                        </View>

                        <View style={styles.searchContainer}>
                            <MaterialIcons name="search" size={20} color="rgba(255,255,255,0.4)" style={styles.searchIcon} />
                            <TextInput
                                style={styles.searchInput}
                                placeholder="Search contacts..."
                                placeholderTextColor="rgba(255,255,255,0.4)"
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                                autoCorrect={false}
                            />
                        </View>

                        <FlatList
                            data={contacts.filter(c => 
                                !c.isGroup && 
                                !members.some(m => m.id === c.id) &&
                                (c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                 c.id.toLowerCase().includes(searchQuery.toLowerCase()))
                            )}
                            keyExtractor={item => item.id}
                            renderItem={({ item }) => {
                                const isSelected = selectedNewMembers.includes(item.id);
                                return (
                                    <Pressable 
                                        style={styles.contactItem} 
                                        onPress={() => toggleNewMember(item.id)}
                                    >
                                        <SoulAvatar uri={proxySupabaseUrl(item.avatar)} size={50} />
                                        <View style={styles.contactInfo}>
                                            <Text style={styles.contactName}>{item.name}</Text>
                                        </View>
                                        <View style={[styles.checkbox, isSelected && { backgroundColor: activeTheme.primary, borderColor: activeTheme.primary }]}>
                                            {isSelected && <MaterialIcons name="check" size={16} color="#fff" />}
                                        </View>
                                    </Pressable>
                                );
                            }}
                            contentContainerStyle={{ padding: 20 }}
                        />
                    </GlassView>
                </View>
            </Modal>
        </View>
      </SheetScreen>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    heroSection: { height: SCREEN_HEIGHT * 0.45, position: 'relative' },
    heroImage: { width: '100%', height: '100%' },
    header: {
        position: 'absolute',
        top: Platform.OS === 'ios' ? 50 : 30,
        left: 20,
        zIndex: 10,
    },
    headerButton: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden' },
    headerIconGlass: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    groupMeta: {
        paddingHorizontal: 20,
        marginBottom: 20,
    },
    groupName: { color: '#fff', fontSize: 32, fontWeight: '800', letterSpacing: -0.5 },
    groupSubTitle: { color: 'rgba(255,255,255,0.6)', fontSize: 16, marginTop: 4, fontWeight: '600' },
    headerSpacer: { height: SCREEN_HEIGHT * 0.35 },
    scrollView: { flex: 1, marginTop: -SCREEN_HEIGHT * 0.45 },
    content: { padding: 20, paddingTop: 40 },
    editAvatarOverlay: { 
        ...StyleSheet.absoluteFillObject, 
        backgroundColor: 'rgba(0,0,0,0.3)', 
        alignItems: 'center', 
        justifyContent: 'center' 
    },
    editInput: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 10,
        padding: 12,
        color: '#fff',
        fontSize: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    editActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        marginTop: 15,
        gap: 12,
    },
    cancelBtn: { padding: 10 },
    cancelBtnText: { color: 'rgba(255,255,255,0.5)', fontWeight: '600' },
    saveBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
    saveBtnText: { color: '#fff', fontWeight: '700' },
    sectionCard: { borderRadius: 20, padding: 20, marginBottom: 20, overflow: 'hidden' },
    sectionTitle: { color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: '800', letterSpacing: 1, marginBottom: 12 },
    descriptionText: { color: '#fff', fontSize: 15, lineHeight: 22 },
    membersSection: { marginBottom: 20 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingHorizontal: 5 },
    addMemberBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    addMemberText: { fontWeight: '700', fontSize: 14 },
    membersCard: { borderRadius: 20, overflow: 'hidden' },
    memberItem: { flexDirection: 'row', alignItems: 'center', padding: 15 },
    memberInfo: { flex: 1, marginLeft: 15 },
    memberNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    memberName: { color: '#fff', fontSize: 16, fontWeight: '600' },
    adminBadge: { backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    adminBadgeText: { color: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: '700' },
    memberRole: { color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: '800', marginTop: 2 },
    memberMore: { padding: 5 },
    divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.05)', marginLeft: 80 },
    dangerButton: { borderRadius: 16, overflow: 'hidden' },
    dangerButtonContent: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, gap: 12 },
    dangerButtonText: { color: '#ff4444', fontSize: 16, fontWeight: '700' },
    
    // Modal & Contact Picker
    modalContainer: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
    modalContent: { height: '85%', borderTopLeftRadius: 30, borderTopRightRadius: 30, overflow: 'hidden' },
    modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
    modalHeaderIcon: { width: 44, height: 44, justifyContent: 'center' },
    modalTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
    modalHeaderAction: { width: 54, height: 44, justifyContent: 'center', alignItems: 'flex-end' },
    modalActionText: { fontSize: 16, fontWeight: '700' },
    searchContainer: { flexDirection: 'row', alignItems: 'center', margin: 20, marginBottom: 10, paddingHorizontal: 15, height: 50, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 15 },
    searchIcon: { marginRight: 10 },
    searchInput: { flex: 1, color: '#fff', fontSize: 16 },
    contactItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.03)' },
    contactAvatarContainer: { position: 'relative' },
    contactInfo: { flex: 1, marginLeft: 15 },
    contactName: { color: '#fff', fontSize: 16, fontWeight: '600' },
    checkbox: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
});
