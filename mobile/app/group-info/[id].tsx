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
  BackHandler,
} from 'react-native';
import Reanimated, {
  useSharedValue as useRNSharedValue,
  useAnimatedStyle as useRNAnimatedStyle,
  withSpring as withRNSpring,
  withTiming as withRNTiming,
  interpolate as rnInterpolate,
  Extrapolation as RNExtrapolation,
  Easing as RNEasing,
  useAnimatedScrollHandler,
} from 'react-native-reanimated';
import { documentDirectory, copyAsync, getInfoAsync, makeDirectoryAsync } from 'expo-file-system';
import { SoulLoader } from '../../components/ui/SoulLoader';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import GlassView from '../../components/ui/GlassView';
import { SoulAvatar } from '../../components/SoulAvatar';
import { useApp } from '../../context/AppContext';
import { proxySupabaseUrl, SERVER_URL, safeFetchJson } from '../../config/api';
import { supabase } from '../../config/supabase';
import { Contact } from '../../types';
import { hapticService } from '../../services/HapticService';
import * as Haptics from 'expo-haptics';
import ProgressiveBlur from '../../components/chat/ProgressiveBlur';
import { storageService } from '../../services/StorageService';
import { profileAvatarTransitionState } from '../../services/profileAvatarTransitionState';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { BlurView } from 'expo-blur';
import { SheetScreen } from 'react-native-sheet-transitions';
import { 
  getProfileAvatarTransitionTag, 
  SUPPORT_PROFILE_AVATAR_SHARED_TRANSITION,
  PROFILE_AVATAR_SHARED_TRANSITION 
} from '../../constants/sharedTransitions';
import { normalizeId } from '../../utils/idNormalization';


const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const AVATAR_UPLOAD_TIMEOUT_MS = 45000;
const GROUP_AVATAR_MORPH_DURATION = 500;
const GROUP_AVATAR_MORPH_EASING = RNEasing.bezier(0.5, 0, 0.1, 1);

export default function GroupInfoScreen() {
    const params = useLocalSearchParams<{
        id: string;
        avatarX?: string;
        avatarY?: string;
        avatarW?: string;
        avatarH?: string;
    }>();
    const id = params.id;
    const transitionTargetId = useMemo(() => String(Array.isArray(id) ? id[0] : id || ''), [id]);
    const groupAvatarTransitionTag = useMemo(() => {
        const tid = normalizeId(transitionTargetId);
        return tid ? getProfileAvatarTransitionTag(tid) : undefined;
    }, [transitionTargetId]);

    const useSharedAvatarTransition = SUPPORT_PROFILE_AVATAR_SHARED_TRANSITION && !!groupAvatarTransitionTag;

    const router = useRouter();
    const navigation = useNavigation();
    const { contacts, currentUser, activeTheme, offlineService, refreshLocalCache } = useApp();

    // Mirror the single-chat → profile morph: chat-header passes the measured
    // avatar rect via avatarX/Y/W/H params; we expand that circle into the
    // hero. Spring-driven, native-thread (Reanimated). Once at progress=1 the
    // overlay fades out and the underlying hero takes over.
    const avatarOrigin = useMemo(() => ({
        x: Number(params.avatarX),
        y: Number(params.avatarY),
        width: Number(params.avatarW),
        height: Number(params.avatarH),
    }), [params.avatarX, params.avatarY, params.avatarW, params.avatarH]);
    const hasAvatarMorph =
        Number.isFinite(avatarOrigin.x) &&
        Number.isFinite(avatarOrigin.y) &&
        Number.isFinite(avatarOrigin.width) &&
        Number.isFinite(avatarOrigin.height) &&
        avatarOrigin.width > 0 &&
        avatarOrigin.height > 0;

    const heroMorphProgress = useRNSharedValue(hasAvatarMorph ? 0 : 1);
    const chromeOpacity = useRNSharedValue(hasAvatarMorph ? 0 : 1);

    useEffect(() => {
        if (!transitionTargetId) {
            return;
        }

        profileAvatarTransitionState.show(transitionTargetId);

        return () => {
            profileAvatarTransitionState.clear(transitionTargetId);
        };
    }, [transitionTargetId]);

    useEffect(() => {
        if (!hasAvatarMorph) {
            heroMorphProgress.value = 1;
            chromeOpacity.value = 1;
            return;
        }
        heroMorphProgress.value = withRNSpring(1, {
            damping: 26,
            stiffness: 180,
            mass: 1.1,
        });
        chromeOpacity.value = withRNTiming(1, {
            duration: 250,
            easing: RNEasing.out(RNEasing.cubic),
        });
    }, [hasAvatarMorph, heroMorphProgress, chromeOpacity]);

    const scrollY = useRNSharedValue(0);
    const onScroll = useAnimatedScrollHandler((event) => {
        scrollY.value = event.contentOffset.y;
    });

    const heroChromeStyle = useRNAnimatedStyle(() => {
        'worklet';
        return {
            opacity: chromeOpacity.value,
        };
    });

    const contentRevealStyle = useRNAnimatedStyle(() => {
        'worklet';
        const revealProgress = hasAvatarMorph
            ? rnInterpolate(heroMorphProgress.value, [0, 0.78, 1], [0, 0, 1], RNExtrapolation.CLAMP)
            : 1;

        return {
            opacity: chromeOpacity.value * revealProgress,
            transform: [
                { translateY: rnInterpolate(revealProgress, [0, 1], [24, 0], RNExtrapolation.CLAMP) }
            ] as any,
        };
    });

    const groupMetaAnimatedStyle = useRNAnimatedStyle(() => {
        'worklet';
        const revealProgress = hasAvatarMorph
            ? rnInterpolate(heroMorphProgress.value, [0, 0.78, 1], [0, 0, 1], RNExtrapolation.CLAMP)
            : 1;
        const heroProgress = rnInterpolate(heroMorphProgress.value, [0, 1], [0, 1], RNExtrapolation.CLAMP);
        const scrollParallax = rnInterpolate(
            scrollY.value,
            [-SCREEN_HEIGHT, 0, SCREEN_HEIGHT * 0.45],
            [SCREEN_HEIGHT / 2, 0, -SCREEN_HEIGHT * 0.45 * 0.8],
            RNExtrapolation.CLAMP
        );

        return {
            opacity: chromeOpacity.value * revealProgress,
            transform: [
                { translateY: (scrollParallax * heroProgress) + rnInterpolate(revealProgress, [0, 1], [24, 0], RNExtrapolation.CLAMP) }
            ] as any,
        };
    });

    const heroAnimatedStyle = useRNAnimatedStyle(() => {
        'worklet';
        const heroProgress = rnInterpolate(heroMorphProgress.value, [0, 1], [0, 1], RNExtrapolation.CLAMP);
        const scrollParallax = rnInterpolate(
            scrollY.value,
            [-SCREEN_HEIGHT, 0, SCREEN_HEIGHT * 0.45],
            [SCREEN_HEIGHT / 2, 0, -SCREEN_HEIGHT * 0.45 * 0.8],
            RNExtrapolation.CLAMP
        );
        const scrollScale = rnInterpolate(
            scrollY.value,
            [-SCREEN_HEIGHT, 0],
            [3, 1],
            RNExtrapolation.CLAMP
        );

        return {
            transform: [
                { translateY: scrollParallax * heroProgress },
                { scale: 1 + ((scrollScale - 1) * heroProgress) }
            ] as any,
        };
    });

    const heroEntryAnimatedStyle = useRNAnimatedStyle(() => {
        'worklet';
        const targetW = SCREEN_WIDTH;
        const targetH = SCREEN_HEIGHT * 0.45;

        if (!hasAvatarMorph) {
            return {
                width: targetW,
                height: targetH,
                borderRadius: 0,
                transform: [{ translateX: 0 }, { translateY: 0 }],
                opacity: 1,
            };
        }

        const p = heroMorphProgress.value;
        const sourceW = avatarOrigin.width;
        const sourceH = avatarOrigin.height;

        return {
            width: rnInterpolate(p, [0, 1], [sourceW, targetW], RNExtrapolation.CLAMP),
            height: rnInterpolate(p, [0, 1], [sourceH, targetH], RNExtrapolation.CLAMP),
            borderRadius: rnInterpolate(p, [0, 1], [sourceW / 2, 0], RNExtrapolation.CLAMP),
            opacity: rnInterpolate(p, [0, 0.4, 1], [0, 1, 1], RNExtrapolation.CLAMP),
            transform: [
                {
                    translateX: rnInterpolate(p, [0, 1], [avatarOrigin.x, 0], RNExtrapolation.CLAMP),
                },
                {
                    translateY: rnInterpolate(p, [0, 1], [avatarOrigin.y, 0], RNExtrapolation.CLAMP),
                }
            ] as any,
        };
    });

    const pageBackgroundStyle = useRNAnimatedStyle(() => {
        'worklet';
        return {
            opacity: rnInterpolate(heroMorphProgress.value, [0, 0.4, 1], [0, 1, 1], RNExtrapolation.CLAMP),
        };
    });

    const isClosingRef = React.useRef(false);
    const allowNativePopRef = React.useRef(false);

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
    const [pendingAvatarUri, setPendingAvatarUri] = useState<string | null>(null);

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

    const persistLocalGroupAvatar = useCallback(async (uri: string) => {
        const baseDir = `${documentDirectory || ''}Soul/Media/Soul Profile Photos/`;
        const dirInfo = await getInfoAsync(baseDir);
        if (!dirInfo.exists) {
            await makeDirectoryAsync(baseDir, { intermediates: true });
        }

        const ext = uri.split('.').pop()?.split('?')[0] || 'jpg';
        const targetUri = `${baseDir}group-${id}-${Date.now()}.${ext}`;
        await copyAsync({ from: uri, to: targetUri });
        return targetUri;
    }, [id]);

    const resolveGroupTable = useCallback(async () => {
        // The active table is verified as 'chat_groups'
        return 'chat_groups';
    }, []);

    const updateGroupViaServer = useCallback(async (patch: {
        name?: string;
        description?: string;
        avatar_url?: string | null;
    }) => {
        return safeFetchJson<any>(`${SERVER_URL.replace(/\/$/, '')}/api/groups/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch),
        });
    }, [id]);

    const fetchGroupDetails = useCallback(async () => {
        if (!id) return;
        setLoading(true);
        try {
            const localContact = contacts.find(c => c.id === id);
            if (localContact) {
                setGroup(prev => ({
                    ...(prev || {}),
                    id,
                    name: localContact.name,
                    description: localContact.about ?? prev?.description ?? '',
                    avatar_url: localContact.avatar ?? prev?.avatar_url ?? null,
                    local_avatar_uri: localContact.localAvatarUri ?? prev?.local_avatar_uri ?? null,
                }));
                setEditName(localContact.name || '');
                setEditDescription(localContact.about ?? '');
            }

            const [localGroup, localContactRow, localMemberRows] = await Promise.all([
                offlineService?.getGroup?.(id).catch(() => null),
                offlineService?.getContact?.(id).catch(() => null),
                offlineService?.getGroupMembers?.(id).catch(() => []),
            ]);

            const localGroupSnapshot = localGroup || localContact;
            if (localGroupSnapshot) {
                setGroup(prev => ({
                    ...(prev || {}),
                    id,
                    name: localGroupSnapshot.name,
                    description: localGroupSnapshot.description ?? localGroupSnapshot.about ?? '',
                    avatar_url: localGroupSnapshot.avatarUrl ?? localGroupSnapshot.avatar ?? prev?.avatar_url ?? null,
                    local_avatar_uri: localContactRow?.localAvatarUri || localContact?.localAvatarUri || prev?.local_avatar_uri || null,
                    creator_id: localGroupSnapshot.creatorId ?? prev?.creator_id ?? null,
                }));
                setEditName(localGroupSnapshot.name || '');
                setEditDescription(localGroupSnapshot.description ?? localGroupSnapshot.about ?? '');
            }

            if (Array.isArray(localMemberRows) && localMemberRows.length > 0) {
                const locallyHydratedMembers = localMemberRows.map((member: any) => {
                    const isSelf = member.userId === currentUser?.id;
                    const contact = contacts.find(c => c.id === member.userId);
                    return {
                        id: member.userId,
                        role: member.role,
                        name: isSelf ? (currentUser?.name || 'You') : (contact?.name || member.userId),
                        username: isSelf ? currentUser?.username : undefined,
                        avatar_url: isSelf ? (currentUser?.avatar || '') : (contact?.avatar || ''),
                        local_avatar_uri: isSelf ? currentUser?.localAvatarUri : contact?.localAvatarUri,
                        avatar_type: isSelf ? currentUser?.avatarType : contact?.avatarType,
                        teddy_variant: isSelf ? currentUser?.teddyVariant : contact?.teddyVariant,
                    };
                });
                setMembers(locallyHydratedMembers);
                setIsAdmin(locallyHydratedMembers.some((m: any) => m.id === currentUser?.id && m.role === 'admin'));
            }

            const groupTable = await resolveGroupTable();
            // 1. Fetch group metadata (maybeSingle so 0 rows isn't a hard error)
            const { data: groupData, error: groupError } = await supabase
                .from(groupTable)
                .select('*')
                .eq('id', id)
                .maybeSingle();

            if (groupError) throw groupError;

            let resolvedGroup: any = groupData;
            if (!resolvedGroup) {
                // Row not visible (RLS) or not found remotely — fall back to local mirror.
                if (localGroup) {
                    resolvedGroup = {
                        id: localGroup.id,
                        name: localGroup.name,
                        description: localGroup.description ?? '',
                        avatar_url: localGroup.avatarUrl ?? null,
                        creator_id: localGroup.creatorId ?? null,
                    };
                } else if (localContact) {
                    resolvedGroup = {
                        id: localContact.id,
                        name: localContact.name,
                        description: localContact.about ?? '',
                        avatar_url: localContact.avatar ?? null,
                    };
                }
            }

            if (!resolvedGroup) {
                throw new Error('Group not found');
            }

            const localContactAvatar = localContactRow?.localAvatarUri || localContact?.localAvatarUri;
            if (localContactAvatar) {
                resolvedGroup = {
                    ...resolvedGroup,
                    local_avatar_uri: localContactAvatar,
                };
            }

            // Sync remote → local. The chat list / chat header read from
            // SQLite, so without this they stay on the placeholder for any
            // group whose avatar was uploaded from a different device or
            // before the local-tables wiring existed. Fire-and-forget; group
            // info already has the data it needs in `resolvedGroup`.
            if (groupData?.avatar_url || groupData?.name) {
                offlineService?.saveGroup?.({
                    id: id as string,
                    name: groupData.name || resolvedGroup.name || 'Group',
                    description: groupData.description ?? null,
                    avatarUrl: groupData.avatar_url ?? null,
                    creatorId: groupData.creator_id ?? null,
                    createdAt: groupData.created_at ?? null,
                    updatedAt: groupData.updated_at ?? new Date().toISOString(),
                } as any).catch(() => {});
                if (groupData.avatar_url) {
                    offlineService?.upsertContactAvatar?.({
                        id: id as string,
                        name: groupData.name || resolvedGroup.name || 'Group',
                        avatar: groupData.avatar_url,
                        localAvatarUri: localContactAvatar ?? null,
                        isGroup: true,
                    }).catch(() => {});
                }
            }

            setGroup(resolvedGroup);
            setEditName(resolvedGroup.name || '');
            setEditDescription(resolvedGroup.description || '');

            // 2. Fetch members with profiles
            const { data: memberData, error: memberError } = await supabase
                .from('chat_group_members')
                .select(`
                    user_id,
                    role,
                    joined_at,
                    profiles!chat_group_members_user_id_profiles_fkey (id, name, avatar_url, username, avatar_type, teddy_variant)
                `)
                .eq('group_id', id);

            if (memberError) throw memberError;

            const formattedMembers = memberData.map((m: any) => {
                const isSelf = m.user_id === currentUser?.id;
                const contact = contacts.find(c => c.id === m.user_id);
                return {
                    id: m.user_id,
                    role: m.role,
                    ...m.profiles,
                    local_avatar_uri: isSelf ? currentUser?.localAvatarUri : contact?.localAvatarUri,
                };
            });

            setMembers(formattedMembers);

            // 3. Check if current user is admin
            const myMember = formattedMembers.find(m => m.id === currentUser?.id);
            setIsAdmin(myMember?.role === 'admin');

        } catch (error: any) {
            const code = error?.code;
            const isMissing = code === 'PGRST116' || /Group not found/i.test(error?.message || '');
            if (isMissing) {
                // Group truly gone — clean up local mirror and exit.
                try { await offlineService?.deleteGroup?.(id as string); } catch {}
                try { await refreshLocalCache?.(true); } catch {}
                router.replace('/(tabs)');
                return;
            }
            // Soft-fail to local mirror. console.warn instead of console.error so
            // a network blip doesn't trigger the dev redbox — the screen still
            // renders the group from local data and the user sees no breakage.
            console.warn('[GroupInfo] Falling back to local data after fetch failure:', error?.message || error);
            const localGroup = contacts.find(c => c.id === id);
            if (localGroup) {
                setGroup({
                    name: localGroup.name,
                    avatar_url: localGroup.avatar,
                    local_avatar_uri: localGroup.localAvatarUri,
                });
            }
        } finally {
            setLoading(false);
        }
    }, [id, currentUser?.id, currentUser?.name, currentUser?.avatar, currentUser?.avatarType, currentUser?.teddyVariant, currentUser?.username, currentUser?.localAvatarUri, contacts, offlineService, resolveGroupTable, refreshLocalCache, router]);

    useEffect(() => {
        fetchGroupDetails();
    }, [fetchGroupDetails]);
    
    const finishDismiss = useCallback((action?: any) => {
        allowNativePopRef.current = true;
        if (action) {
            navigation.dispatch(action);
            return;
        }
        if (navigation.canGoBack()) {
            navigation.goBack();
        } else {
            router.back();
        }
    }, [navigation, router]);

    const runDismissAnimation = useCallback((action?: any) => {
        if (isClosingRef.current) return;
        isClosingRef.current = true;

        if (transitionTargetId) {
            profileAvatarTransitionState.dismiss(transitionTargetId);
        }

        if (!hasAvatarMorph) {
            chromeOpacity.value = withRNTiming(0, { duration: 200 });
            setTimeout(() => finishDismiss(action), 200);
            return;
        }

        hapticService.selection();

        chromeOpacity.value = withRNTiming(0, { duration: 250 });
        heroMorphProgress.value = withRNTiming(0, {
            duration: GROUP_AVATAR_MORPH_DURATION,
            easing: GROUP_AVATAR_MORPH_EASING,
        });
        setTimeout(() => finishDismiss(action), GROUP_AVATAR_MORPH_DURATION);
    }, [chromeOpacity, finishDismiss, hasAvatarMorph, heroMorphProgress, transitionTargetId]);

    useEffect(() => {
        const unsubscribe = navigation.addListener('beforeRemove' as any, (event: any) => {
            if (!hasAvatarMorph || isClosingRef.current || allowNativePopRef.current) {
                return;
            }
            event.preventDefault();
            runDismissAnimation(event.data.action);
        });

        const backSubscription = BackHandler.addEventListener('hardwareBackPress', () => {
            if (!hasAvatarMorph || isClosingRef.current) {
                return false;
            }
            runDismissAnimation();
            return true;
        });

        return () => {
            allowNativePopRef.current = false;
            unsubscribe();
            backSubscription.remove();
        };
    }, [hasAvatarMorph, navigation, runDismissAnimation]);

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
                                .from('chat_group_members')
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
                .from('chat_group_members')
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
                                .from('chat_group_members')
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
            const groupTable = await resolveGroupTable();
            let { error } = await supabase
                .from(groupTable)
                .update({
                    name: editName.trim(),
                    description: editDescription.trim(),
                })
                .eq('id', id);

            if (error?.code === '42501') {
                const serverResult = await updateGroupViaServer({
                    name: editName.trim(),
                    description: editDescription.trim(),
                });
                if (!serverResult.success) {
                    throw new Error(serverResult.error || error.message || 'Failed to update group');
                }
                error = null;
            }

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
        console.log('[GroupInfo] 📸 Change Photo pressed', { isAdmin, isUpdating });
        if (!isAdmin) {
            console.warn('[GroupInfo] Press ignored — current user is not admin');
            return;
        }
        if (isUpdating) {
            console.warn('[GroupInfo] Press ignored — update already in progress');
            return;
        }

        hapticService.impact(Haptics.ImpactFeedbackStyle.Light);

        let result: ImagePicker.ImagePickerResult;
        try {
            const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!permission.granted) {
                Alert.alert('Permission needed', 'Please allow photo library access to change the group photo.');
                return;
            }

            result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.7,
            });
        } catch (pickerErr: any) {
            console.error('[GroupInfo] ImagePicker failed:', pickerErr?.message || pickerErr);
            Alert.alert('Could not open photo library', pickerErr?.message || 'Please try again.');
            return;
        }

        if (result.canceled) return;
        if (!result.assets?.[0]?.uri) {
            console.warn('[GroupInfo] Picker returned no asset URI');
            return;
        }

        setIsUpdating(true);
        setPendingAvatarUri(result.assets[0].uri);
        let preparedUri = result.assets[0].uri;
        try {
            preparedUri = await prepareAvatarForUpload(result.assets[0].uri);
            const storageKey = await Promise.race([
                storageService.uploadImage(preparedUri, 'avatars', 'groups'),
                new Promise<null>((_, reject) =>
                    setTimeout(() => reject(new Error('Photo upload timed out. Please try again.')), AVATAR_UPLOAD_TIMEOUT_MS)
                ),
            ]);
            if (!storageKey) throw new Error('Failed to upload image');

            const groupTable = await resolveGroupTable();
            let { error } = await supabase
                .from(groupTable)
                .update({ avatar_url: storageKey })
                .eq('id', id);

            if (error?.code === '42501') {
                const serverResult = await updateGroupViaServer({ avatar_url: storageKey });
                if (!serverResult.success) {
                    throw new Error(serverResult.error || error.message || 'Failed to update group photo');
                }
                error = null;
            }

            if (error) throw error;

            // Persist the avatar bytes into our durable Soul Profile Photos
            // directory. `prepareAvatarForUpload` returns a path inside the
            // ImageManipulator cache, which the OS can wipe at any time. By
            // copying to documentDirectory we guarantee the local DP keeps
            // rendering even after cache eviction or app restart.
            let durableLocalUri = preparedUri;
            try {
                durableLocalUri = await persistLocalGroupAvatar(preparedUri);
            } catch (persistErr) {
                console.warn('[GroupInfo] Could not copy avatar to durable storage, falling back to manipulator path:', persistErr);
            }

            setGroup((prev: any) => ({ ...(prev || {}), avatar_url: storageKey, local_avatar_uri: durableLocalUri }));
            setPendingAvatarUri(null);

            // Update local DB. We isolate this in its own try/catch — the cloud
            // upload + Supabase row update have already succeeded by this point,
            // so a transient SQLite BUSY ("database is locked") shouldn't surface
            // as a hard failure to the user.
            //
            // We update BOTH local tables:
            //   - `contacts` row → drives the chat list & chat header avatar.
            //   - `groups` row   → drives the chat-screen group fallback path
            //     (offlineService.getGroup) and the group-info hero image.
            // Skipping the groups update was leaving the chat header stuck on
            // the placeholder when it fell through to that fallback.
            //
            // For the contacts row we use the lightweight `upsertContactAvatar`
            // path — it issues a single INSERT...ON CONFLICT statement (no
            // BEGIN/COMMIT block, no prepared statement) so it survives long-
            // running concurrent writes from ChatContext's bulk profile import.
            try {
                await offlineService.upsertContactAvatar({
                    id: id as string,
                    name: group?.name || 'Group',
                    avatar: storageKey,
                    localAvatarUri: durableLocalUri,
                    isGroup: true,
                });
            } catch (dbErr: any) {
                console.warn('[GroupInfo] Local cache save failed after successful cloud upload:', dbErr?.message || dbErr);
            }
            try {
                await offlineService.saveGroup({
                    id: id as string,
                    name: group?.name || 'Group',
                    description: group?.description ?? null,
                    avatarUrl: storageKey,
                    creatorId: group?.creator_id ?? group?.creatorId ?? null,
                    createdAt: group?.created_at ?? group?.createdAt ?? null,
                    updatedAt: new Date().toISOString(),
                } as any);
            } catch (groupDbErr: any) {
                console.warn('[GroupInfo] Local groups table update failed:', groupDbErr?.message || groupDbErr);
            }

            hapticService.notification(Haptics.NotificationFeedbackType.Success);
            // Force re-hydration so the chat list / chat header pick up the new
            // avatar immediately. Without `true` the hydration short-circuits on
            // `isHydratedRef` and the contact stays stale until next app launch.
            refreshLocalCache(true);
        } catch (err: any) {
            const fallbackPreviewUri = preparedUri || result.assets[0].uri;
            setGroup((prev: any) => ({ ...(prev || {}), local_avatar_uri: fallbackPreviewUri }));
            setPendingAvatarUri(null);
            try {
                let localAvatarUri = fallbackPreviewUri;
                try {
                    localAvatarUri = await persistLocalGroupAvatar(fallbackPreviewUri);
                } catch {}
                setGroup((prev: any) => ({ ...(prev || {}), local_avatar_uri: localAvatarUri }));
                try {
                    await offlineService.saveContact({
                        id: id,
                        name: group?.name || 'Group',
                        avatar: group?.avatar_url ?? null,
                        localAvatarUri,
                        avatarUpdatedAt: new Date().toISOString(),
                        isGroup: true
                    });
                } catch (dbErr: any) {
                    console.warn('[GroupInfo] Local cache save failed in fallback path:', dbErr?.message || dbErr);
                }
                hapticService.notification(Haptics.NotificationFeedbackType.Success);
                refreshLocalCache(true);
                Alert.alert('Saved locally', 'Group photo was applied on this device. Cloud sync is unavailable right now.');
            } catch {
                Alert.alert('Error', err.message);
            }
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
                .from('chat_group_members')
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

    const showMemberActions = useCallback((item: any) => {
        if (!isAdmin || item.id === currentUser?.id) return;
        hapticService.impact(Haptics.ImpactFeedbackStyle.Medium);
        Alert.alert(
            item.name || item.username || 'Member',
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
    }, [isAdmin, currentUser?.id]);

    const renderMemberItem = ({ item }: { item: any }) => (
        <Pressable
            style={styles.memberItem}
            onLongPress={() => showMemberActions(item)}
        >
            <SoulAvatar 
                uri={proxySupabaseUrl(item.avatar_url)} 
                localUri={item.local_avatar_uri}
                size={50} 
                avatarType={item.avatar_type}
                teddyVariant={item.teddy_variant}
            />
            <View style={styles.memberInfo}>
                <View style={styles.memberNameRow}>
                    <Text
                        style={styles.memberName}
                        numberOfLines={1}
                    >
                        {item.id === currentUser?.id ? 'You' : (item.name || item.username)}
                    </Text>
                    {item.role === 'admin' && (
                        <View style={styles.adminBadge}>
                            <Text style={styles.adminBadgeText}>admin</Text>
                        </View>
                    )}
                </View>
                <Text style={styles.memberRole}>
                    {item.id === currentUser?.id ? 'Group admin' : item.role === 'admin' ? 'Admin' : 'Member'}
                </Text>
            </View>
            {isAdmin && item.id !== currentUser?.id && (
                <Pressable
                    style={styles.memberMore}
                    onPress={() => showMemberActions(item)}
                    hitSlop={10}
                >
                    <MaterialIcons name="more-vert" size={20} color="rgba(255,255,255,0.6)" />
                </Pressable>
            )}
        </Pressable>
    );

    return (
        <SheetScreen 
            onClose={() => {
                hapticService.impact(Haptics.ImpactFeedbackStyle.Light);
                if (!isClosingRef.current) {
                    runDismissAnimation();
                }
            }}
            onCloseStart={() => {
                if (!isClosingRef.current) {
                    hapticService.selection();
                }
            }}
            opacityOnGestureMove
            disableRootScale
            customBackground={
                <Reanimated.View style={[StyleSheet.absoluteFill, pageBackgroundStyle]}>
                    <GlassView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
                </Reanimated.View>
            }
        >
            <View style={styles.container}>


            <StatusBar barStyle="light-content" translucent />

            <View style={styles.heroBackgroundContainer}>
                <Reanimated.View
                    style={[
                        styles.heroSection,
                        heroAnimatedStyle
                    ]}
                >
                    {group?.local_avatar_uri || group?.avatar_url ? (
                        <Reanimated.Image
                            source={{ uri: proxySupabaseUrl(group?.local_avatar_uri || group?.avatar_url) }}
                            style={[styles.heroImage]}
                            resizeMode="cover"
                        />
                    ) : (
                        <View style={styles.placeholderIconContainer}>
                            <LinearGradient
                                colors={['#222', '#111']}
                                style={StyleSheet.absoluteFill}
                            >
                                <View style={styles.placeholderIconContainer}>
                                    <MaterialIcons name="group" size={120} color="rgba(255,255,255,0.15)" />
                                </View>
                            </LinearGradient>
                        </View>
                    )}
                    {/* Bottom fade lives INSIDE the hero so it parallaxes
                        with the image — otherwise scroll detaches them and
                        leaves a hard black edge. */}
                    <ProgressiveBlur position="bottom" height={200} intensity={60} tint="dark" />
                </Reanimated.View>

                <Reanimated.View
                    pointerEvents="none"
                    style={[styles.groupMeta, groupMetaAnimatedStyle]}
                >
                    <Text style={styles.groupName}>{group?.name || '...'}</Text>
                    <Text style={styles.groupSubTitle}>{members.length} members</Text>
                </Reanimated.View>
            </View>

            {/* Center "Change Photo" sits OUTSIDE the hero so its Pressable lands above
                the ScrollView (which overlaps the hero via negative marginTop). The
                Animated wrapper applies the same translateY as the hero so it still
                scrolls together with the photo. */}
            {isAdmin && !(pendingAvatarUri || group?.local_avatar_uri || group?.avatar_url) && (
                <Reanimated.View
                    pointerEvents="box-none"
                    style={[
                        styles.floatingPhotoButton,
                        heroAnimatedStyle,
                        heroChromeStyle,
                    ]}
                >
                    <Pressable
                        onPress={handleUpdateGroupAvatar}
                        disabled={isUpdating}
                        hitSlop={16}
                    >
                        <View style={styles.editAvatarOverlay}>
                            <View style={[styles.cameraIconCircle, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
                                <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
                                <MaterialIcons name="photo-camera" size={28} color="#fff" />
                            </View>
                            <Text style={styles.changePhotoText}>
                                {isUpdating ? 'Updating...' : 'Change Photo'}
                            </Text>
                            {isUpdating && (
                                <View style={StyleSheet.absoluteFill}>
                                    <SoulLoader size={100} />
                                </View>
                            )}
                        </View>
                    </Pressable>
                </Reanimated.View>
            )}

            {isAdmin && (pendingAvatarUri || group?.local_avatar_uri || group?.avatar_url) && (
                <Reanimated.View style={[styles.cornerPhotoButton, heroChromeStyle]}>
                    <Pressable
                        onPress={handleUpdateGroupAvatar}
                        disabled={isUpdating}
                        style={StyleSheet.absoluteFill}
                        hitSlop={16}
                    >
                        <GlassView intensity={30} tint="dark" style={styles.headerIconGlass}>
                            {isUpdating ? (
                                <SoulLoader size={20} />
                            ) : (
                                <MaterialIcons name="photo-camera" size={20} color="#fff" />
                            )}
                        </GlassView>
                    </Pressable>
                </Reanimated.View>
            )}

            <Reanimated.View style={[styles.header, heroChromeStyle]}>
                <Pressable onPress={() => runDismissAnimation()} style={styles.headerButton}>
                    <GlassView intensity={30} tint="dark" style={styles.headerIconGlass}>
                        <MaterialIcons name="arrow-back-ios" size={20} color="#fff" style={{ marginLeft: 8 }} />
                    </GlassView>
                </Pressable>
            </Reanimated.View>

            <Reanimated.ScrollView 
                style={[styles.scrollView, contentRevealStyle]} 
                showsVerticalScrollIndicator={false}
                onScroll={onScroll}
                scrollEventThrottle={16}
            >
                <View style={styles.headerSpacer} />

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
                                                const groupTable = await resolveGroupTable();
                                                const { error } = await supabase
                                                    .from(groupTable)
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
            </Reanimated.ScrollView>

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
    container: { flex: 1, backgroundColor: 'transparent' },
    heroBackgroundContainer: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: SCREEN_HEIGHT * 0.45,
        zIndex: 0,
        // CRITICAL: clip the parallaxed/scaled hero so it never bleeds
        // below the container during overscroll-down. Without this the
        // scaled image renders past the hero bounds and visually appears
        // as a duplicated band inside the scroll content.
        overflow: 'hidden',
    },
    heroSection: { 
        height: SCREEN_HEIGHT * 0.45, 
        position: 'absolute',
        top: 0,
        left: 0,
        zIndex: 0,
        overflow: 'hidden',
    },
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
        position: 'absolute',
        left: 20,
        right: 20,
        bottom: 56,
        zIndex: 5,
    },
    groupName: { color: '#fff', fontSize: 32, fontWeight: '800', letterSpacing: -0.5 },
    groupSubTitle: { color: 'rgba(255,255,255,0.6)', fontSize: 16, marginTop: 4, fontWeight: '600' },
    headerSpacer: { height: SCREEN_HEIGHT * 0.45 + 12 },
    scrollView: { flex: 1 },
    content: { padding: 20, paddingTop: 40 },
    editAvatarOverlay: {
        flex: 1,
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
        // gap: 12,
    },
    cancelBtn: { padding: 10 },
    cancelBtnText: { color: 'rgba(255,255,255,0.5)', fontWeight: '600' },
    saveBtn: { 
        marginLeft: 12,
        paddingHorizontal: 20, 
        paddingVertical: 10, 
        borderRadius: 8 
    },
    saveBtnText: { color: '#fff', fontWeight: '700' },
    sectionCard: { borderRadius: 20, padding: 20, marginBottom: 20, overflow: 'hidden' },
    sectionTitle: { color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: '800', letterSpacing: 1, marginBottom: 12 },
    descriptionText: { color: '#fff', fontSize: 15, lineHeight: 22 },
    membersSection: { marginBottom: 20 },
    sectionHeader: { 
        flexDirection: 'row', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: 12, 
        paddingHorizontal: 5 
    },
    addMemberBtn: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        // gap: 6 
    },
    addMemberText: { fontWeight: '700', fontSize: 14, marginLeft: 6 },
    membersCard: { borderRadius: 20, overflow: 'hidden' },
    memberItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 18,
        minHeight: 78,
    },
    memberInfo: { 
        flex: 1, 
        marginLeft: 15,
        justifyContent: 'center',
        minWidth: 0,
    },
    memberNameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        paddingRight: 12,
    },
    memberName: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
        flexShrink: 1,
        marginRight: 8,
    },
    adminBadge: { 
        backgroundColor: 'rgba(255,255,255,0.1)', 
        paddingHorizontal: 8, 
        paddingVertical: 4, 
        borderRadius: 999,
        alignSelf: 'flex-start',
    },
    adminBadgeText: {
        color: 'rgba(255,255,255,0.72)',
        fontSize: 11,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.4,
    },
    memberRole: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 13,
        fontWeight: '500',
        marginTop: 4,
    },
    memberMore: {
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 8,
    },
    divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.05)', marginLeft: 80 },
    dangerButton: { borderRadius: 16, overflow: 'hidden' },
    dangerButtonContent: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        paddingHorizontal: 20, 
        paddingVertical: 16, 
        // gap: 12 
    },
    dangerButtonText: { color: '#ff4444', fontSize: 16, fontWeight: '700', marginLeft: 12 },
    
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
    heroPressable: { flex: 1 },
    floatingPhotoButton: {
        position: 'absolute',
        top: SCREEN_HEIGHT * 0.18,
        left: 0,
        right: 0,
        zIndex: 30,
        alignItems: 'center',
        justifyContent: 'center',
    },
    placeholderIconContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', opacity: 0.5 },
    cameraIconCircle: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
    changePhotoText: { color: '#fff', fontSize: 12, fontWeight: '700', marginTop: 12, textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
    cornerPhotoButton: {
        position: 'absolute',
        top: Platform.OS === 'ios' ? 50 : 30,
        right: 20,
        zIndex: 30,
        width: 44,
        height: 44,
        borderRadius: 22,
        overflow: 'hidden',
    },
});
