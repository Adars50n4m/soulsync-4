import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import {
    View, Text, Image, Pressable, StyleSheet, StatusBar,
    TextInput, ScrollView, Alert, Modal, Animated as RNAnimated,
    KeyboardAvoidingView, useWindowDimensions, Platform
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
const DEFAULT_AVATAR = '';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useApp } from '../context/AppContext';
import { SoulAvatar } from '../components/SoulAvatar';
import { storageService } from '../services/StorageService';
import Animated, {
    Easing,
    SharedTransition,
    withTiming,
} from 'react-native-reanimated';


const SettingRow = ({ label, value, icon, onPress }: {
    label: string;
    value: string;
    icon: string;
    onPress: () => void;
}) => (
    <Pressable style={styles.settingRow} onPress={onPress}>
        <View style={styles.settingContent}>
            <Text style={styles.settingLabel}>{label}</Text>
            <Text style={styles.settingValue} numberOfLines={1}>{value || 'Not set'}</Text>
        </View>
        <MaterialIcons name="chevron-right" size={24} color="rgba(255,255,255,0.3)" />
    </Pressable>
);

const profileMorphTransition = SharedTransition.custom((values) => {
    'worklet';
    const morph = {
        duration: 400,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    };
    return {
        originX: withTiming(values.targetOriginX, morph),
        originY: withTiming(values.targetOriginY, morph),
        width: withTiming(values.targetWidth, morph),
        height: withTiming(values.targetHeight, morph),
        borderRadius: withTiming(values.targetBorderRadius, morph),
    };
}).duration(400);

const profileBoundsTransition = SharedTransition.custom((values) => {
    'worklet';
    const morph = {
        duration: 400,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    };
    return {
        originX: withTiming(values.targetOriginX, morph),
        originY: withTiming(values.targetOriginY, morph),
        width: withTiming(values.targetWidth, morph),
        height: withTiming(values.targetHeight, morph),
        borderRadius: withTiming(values.targetBorderRadius, morph),
    };
}).duration(400);

export default function ProfileEditScreen() {
    const enableSharedMorph = Platform.OS === 'ios';
    const { width } = useWindowDimensions();
    const router = useRouter();
    const { currentUser, updateProfile, activeTheme } = useApp();

    const [name, setName] = useState(currentUser?.name || '');
    const [bio, setBio] = useState(currentUser?.bio || '');
    const [avatar, setAvatar] = useState(currentUser?.avatar || '');
    const [birthdate, setBirthdate] = useState(currentUser?.birthdate || '');
    const [tempBirthdate, setTempBirthdate] = useState(currentUser?.birthdate || '');
    const [pickerDate, setPickerDate] = useState<Date>(new Date());
    const [showImageModal, setShowImageModal] = useState(false);
    const [showFullImage, setShowFullImage] = useState(false);
    const [isEditing, setIsEditing] = useState<'name' | 'bio' | null>(null);
    const [showDatePicker, setShowDatePicker] = useState(false);

    useEffect(() => {
        if (currentUser) {
            if (currentUser.name && !isEditing) setName(currentUser.name);
            if (currentUser.bio && !isEditing) setBio(currentUser.bio);
            // Only sync birthdate if we aren't currently picking one
            // and the value is actually different from what we have locally
            if (currentUser.birthdate && !showDatePicker && currentUser.birthdate !== birthdate) {
                setBirthdate(currentUser.birthdate);
                setTempBirthdate(currentUser.birthdate);
            }
        }
    }, [currentUser?.birthdate, currentUser?.name, currentUser?.bio, isEditing, showDatePicker]);

    const slideAnim = useRef(new RNAnimated.Value(0)).current;
    const handleBack = () => {
        router.back();
    };

    const showModal = () => {
        setShowImageModal(true);
        RNAnimated.spring(slideAnim, {
            toValue: 1,
            useNativeDriver: true,
            friction: 800,
        }).start();
    };

    const hideModal = () => {
        RNAnimated.timing(slideAnim, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
        }).start(() => setShowImageModal(false));
    };

    const handleTakePhoto = async () => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permission needed', 'Camera permission is required');
            return;
        }

        hideModal();

        // Small delay to allow modal animation to finish before launching native picker
        setTimeout(async () => {
            try {
                const result = await ImagePicker.launchCameraAsync({
                    mediaTypes: ImagePicker.MediaTypeOptions.Images,
                    allowsEditing: true,
                    aspect: [1, 1],
                    quality: 0.8,
                });

                if (!result.canceled && result.assets[0]) {
                    const localUri = result.assets[0].uri;
                    setAvatar(localUri); // Show immediately
                    
                    // Upload to Supabase
                    try {
                        const uploadedUrl = await storageService.uploadImage(localUri, 'avatars', currentUser?.id);
                        if (uploadedUrl) {
                            updateProfile({ avatar: uploadedUrl });
                        }
                    } catch (error: any) {
                        console.warn('Avatar upload error (camera):', error);
                        Alert.alert('Upload Failed', `Could not save profile picture: ${error.message || 'Unknown error'}`);
                    }
                }
            } catch (error) {
                Alert.alert('Camera Error', 'Could not open camera.');
            }
        }, 500);
    };

    const handleChoosePhoto = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permission needed', 'Media library permission is required');
            return;
        }

        hideModal();

        setTimeout(async () => {
            try {
                const result = await ImagePicker.launchImageLibraryAsync({
                    mediaTypes: ImagePicker.MediaTypeOptions.Images,
                    allowsEditing: true,
                    aspect: [1, 1],
                    quality: 0.8,
                    legacy: true,
                    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
                });

                if (!result.canceled && result.assets[0]) {
                    const localUri = result.assets[0].uri;
                    setAvatar(localUri); // Show immediately

                    // Upload to Supabase
                    try {
                        const uploadedUrl = await storageService.uploadImage(localUri, 'avatars', currentUser?.id);
                        if (uploadedUrl) {
                            updateProfile({ avatar: uploadedUrl });
                        }
                    } catch (error: any) {
                        console.warn('Avatar upload error (gallery):', error);
                        Alert.alert('Upload Failed', `Could not save profile picture: ${error.message || 'Unknown error'}`);
                    }
                }
            } catch (error) {
                console.log('Image picker error:', error);
            }
        }, 500);
    };

    const handleDeletePhoto = () => {
        hideModal();
        Alert.alert(
            'Delete Photo',
            'Are you sure you want to remove your profile photo?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => {
                        const defaultAvatar = '';
                        setAvatar(defaultAvatar);
                        updateProfile({ avatar: defaultAvatar });
                    }
                }
            ]
        );
    };

    const handleSaveName = () => {
        if (name.trim()) {
            updateProfile({ name: name.trim() });
            setIsEditing(null);
        }
    };

    const handleSaveBio = () => {
        updateProfile({ bio: bio.trim() });
        setIsEditing(null);
    };

    const handleDateChange = (event: any, selectedDate?: Date) => {
        if (Platform.OS === 'android') {
            setShowDatePicker(false);
        }
        
        if (event.type === 'dismissed') {
            setShowDatePicker(false);
            return;
        }
        
        if (selectedDate) {
            setPickerDate(selectedDate);
            // Format as YYYY-MM-DD using local time to avoid timezone shifts
            const year = selectedDate.getFullYear();
            const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
            const day = String(selectedDate.getDate()).padStart(2, '0');
            const formatted = `${year}-${month}-${day}`;
            setTempBirthdate(formatted);
            
            if (Platform.OS === 'android') {
                setBirthdate(formatted);
                updateProfile({ birthdate: formatted });
            }
        }
    };

    const confirmBirthdate = () => {
        setBirthdate(tempBirthdate);
        updateProfile({ birthdate: tempBirthdate });
        setShowDatePicker(false);
    };

    const formatDisplayDate = (dateString: string) => {
        if (!dateString) return '';
        const parts = dateString.split('-');
        if (parts.length === 3) {
            return `${parts[2]}-${parts[1]}-${parts[0]}`; // DD-MM-YYYY
        }
        return dateString;
    };


    return (
        <Animated.View 
            style={styles.container}
        >
            <StatusBar barStyle="light-content" />

            {/* Header */}
            <Animated.View style={styles.header}>
                <Pressable 
                    style={styles.backButton} 
                    onPress={handleBack}
                >
                    <MaterialIcons name="arrow-back" size={24} color="#ffffff" />
                </Pressable>
                <Text style={styles.headerTitle}>Profile</Text>
                <Pressable style={styles.backButton} onPress={showModal}>
                    <MaterialIcons name="edit" size={22} color="#ffffff" />
                </Pressable>
            </Animated.View>

            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <ScrollView
                    style={styles.scrollView}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                >
                    {/* Profile Photo Section */}
                    <Animated.View style={styles.avatarSection} collapsable={false}>
                        <Pressable onPress={() => setShowFullImage(true)} collapsable={false}>
                            <Animated.View
                                style={styles.avatarMorphShell}
                                {...(enableSharedMorph
                                    ? {
                                        sharedTransitionTag: 'profile-avatar-bounds',
                                        sharedTransitionStyle: profileBoundsTransition,
                                    }
                                    : {})}
                                collapsable={false}
                            >
                                <SoulAvatar
                                    sharedTransitionTag={enableSharedMorph ? 'profile-avatar' : undefined}
                                    sharedTransitionStyle={enableSharedMorph ? profileMorphTransition : undefined}
                                    uri={avatar}
                                    style={styles.avatarMorphImage}
                                    size={120}
                                    iconSize={60}
                                />
                            </Animated.View>
                        </Pressable>
                        <Animated.View>
                            <Pressable onPress={showModal}>
                                <Text style={[styles.editButton, { color: activeTheme.primary }]}>Edit</Text>
                            </Pressable>
                        </Animated.View>
                    </Animated.View>

                    {/* Settings Rows */}
                    <Animated.View style={styles.section}>
                        <Text style={styles.sectionLabel}>About</Text>
                        <View style={styles.settingsGroup}>
                            {isEditing === 'bio' ? (
                                <View style={styles.editRow}>
                                    <TextInput
                                        style={styles.editInput}
                                        value={bio}
                                        onChangeText={setBio}
                                        placeholder="Enter your bio"
                                        placeholderTextColor="rgba(255,255,255,0.3)"
                                        maxLength={140}
                                        multiline
                                    />
                                    <View style={styles.editActions}>
                                        <Pressable onPress={() => setIsEditing(null)} style={styles.cancelBtn}>
                                            <MaterialIcons name="close" size={20} color="rgba(255,255,255,0.5)" />
                                        </Pressable>
                                        <Pressable onPress={handleSaveBio} style={[styles.saveBtn, { backgroundColor: activeTheme.primary }]}>
                                            <MaterialIcons name="check" size={20} color="#ffffff" />
                                        </Pressable>
                                    </View>
                                </View>
                            ) : (
                                <SettingRow
                                    label=""
                                    value={bio}
                                    icon="edit"
                                    onPress={() => setIsEditing('bio')}
                                />
                            )}
                        </View>
                    </Animated.View>

                    <Animated.View style={styles.section}>
                        <Text style={styles.sectionLabel}>Soul ID</Text>
                        <View style={styles.settingsGroup}>
                            <SettingRow
                                label=""
                                value={`@${currentUser?.username || 'user'}`}
                                icon="alternate-email"
                                onPress={() => {}} // Read-only for now as per plan
                            />
                        </View>
                    </Animated.View>

                    <Animated.View style={styles.section}>
                        <Text style={styles.sectionLabel}>Name</Text>
                        <View style={styles.settingsGroup}>
                            {isEditing === 'name' ? (
                                <View style={styles.editRow}>
                                    <TextInput
                                        style={styles.editInput}
                                        value={name}
                                        onChangeText={setName}
                                        placeholder="Enter your name"
                                        placeholderTextColor="rgba(255,255,255,0.3)"
                                        maxLength={25}
                                    />
                                    <View style={styles.editActions}>
                                        <Pressable onPress={() => setIsEditing(null)} style={styles.cancelBtn}>
                                            <MaterialIcons name="close" size={20} color="rgba(255,255,255,0.5)" />
                                        </Pressable>
                                        <Pressable onPress={handleSaveName} style={[styles.saveBtn, { backgroundColor: activeTheme.primary }]}>
                                            <MaterialIcons name="check" size={20} color="#ffffff" />
                                        </Pressable>
                                    </View>
                                </View>
                            ) : (
                                <SettingRow
                                    label=""
                                    value={name}
                                    icon="person"
                                    onPress={() => setIsEditing('name')}
                                />
                            )}
                        </View>
                    </Animated.View>

                    <Animated.View style={styles.section}>
                        <Text style={styles.sectionLabel}>Birthdate</Text>
                        <View style={styles.settingsGroup}>
                            <SettingRow
                                label=""
                                value={formatDisplayDate(showDatePicker ? tempBirthdate : birthdate)}
                                icon="cake"
                                onPress={() => {
                                    setTempBirthdate(birthdate);
                                    const parts = birthdate ? birthdate.split('-') : [];
                                    if (parts.length === 3) {
                                        setPickerDate(new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 12, 0, 0));
                                    } else {
                                        setPickerDate(new Date());
                                    }
                                    setShowDatePicker(true);
                                }}
                            />
                        </View>
                    </Animated.View>

                    {/* Smart Birthday Picker Modal */}
                    <Modal
                        visible={showDatePicker}
                        transparent
                        animationType="slide"
                        onRequestClose={() => setShowDatePicker(false)}
                    >
                        <View style={styles.modalOverlay}>
                            <Pressable style={styles.modalBackdrop} onPress={() => setShowDatePicker(false)} />
                            <View style={[styles.modalContent, { paddingBottom: 40 }]}>
                                <View style={styles.modalHeader}>
                                    <Text style={styles.modalTitle}>Choose Birthdate</Text>
                                    <Pressable 
                                        onPress={confirmBirthdate} 
                                        style={[styles.saveBtn, { backgroundColor: activeTheme.primary }]}
                                    >
                                        <MaterialIcons name="check" size={24} color="#ffffff" />
                                    </Pressable>
                                </View>
                                
                                <View style={{ padding: 20, minHeight: 250, justifyContent: 'center', alignItems: 'center' }}>
                                    <DateTimePicker
                                        value={pickerDate}
                                        mode="date"
                                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                        onChange={handleDateChange}
                                        maximumDate={new Date()}
                                        themeVariant="dark"
                                        textColor="#ffffff"
                                        accentColor={activeTheme.primary}
                                        style={{ height: 200, width: '100%' }}
                                    />
                                </View>
                            </View>
                        </View>
                    </Modal>
                </ScrollView>
            </KeyboardAvoidingView>

            {/* Full Image Modal */}
            <Modal visible={showFullImage} transparent animationType="fade">
                <View style={styles.fullImageModal}>
                    <View style={styles.fullImageHeader}>
                        <Pressable onPress={() => setShowFullImage(false)} style={styles.closeBtn}>
                            <MaterialIcons name="arrow-back" size={24} color="#ffffff" />
                        </Pressable>
                        <Text style={styles.fullImageTitle}>Profile picture</Text>
                        <View style={styles.fullImageActions}>
                            <Pressable onPress={showModal} style={styles.editIconBtn}>
                                <MaterialIcons name="edit" size={22} color="#ffffff" />
                            </Pressable>
                        </View>
                    </View>
                    <View style={styles.fullImageContainer}>
                        <Image source={{ uri: avatar }} style={styles.fullImage} resizeMode="contain" />
                    </View>
                </View>
            </Modal>

            {/* Edit Photo Modal */}
            <Modal visible={showImageModal} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <Pressable style={styles.modalBackdrop} onPress={hideModal} />
                    <RNAnimated.View
                        style={[
                            styles.modalContent,
                            {
                                transform: [{
                                    translateY: slideAnim.interpolate({
                                        inputRange: [0, 1],
                                        outputRange: [300, 0],
                                    })
                                }]
                            }
                        ]}
                    >
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Edit profile picture</Text>
                            <Pressable onPress={hideModal} style={styles.modalClose}>
                                <MaterialIcons name="close" size={24} color="rgba(255,255,255,0.5)" />
                            </Pressable>
                        </View>

                        <Pressable style={styles.modalOption} onPress={handleTakePhoto}>
                            <MaterialIcons name="camera-alt" size={24} color="#ffffff" />
                            <Text style={styles.modalOptionText}>Take photo</Text>
                        </Pressable>

                        <Pressable style={styles.modalOption} onPress={handleChoosePhoto}>
                            <MaterialIcons name="photo-library" size={24} color="#ffffff" />
                            <Text style={styles.modalOptionText}>Choose photo</Text>
                        </Pressable>

                        <View style={styles.separator} />

                        <Pressable style={styles.modalOption} onPress={handleDeletePhoto}>
                            <MaterialIcons name="delete" size={24} color="#ef4444" />
                            <Text style={[styles.modalOptionText, { color: '#ef4444' }]}>Delete photo</Text>
                        </Pressable>
                    </RNAnimated.View>
                </View>
            </Modal>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000000',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 54,
        paddingHorizontal: 16,
        paddingBottom: 16,
    },
    backButton: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        color: '#ffffff',
        fontSize: 18,
        fontWeight: '600',
    },
    placeholder: {
        width: 40,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: 40,
    },
    avatarSection: {
        alignItems: 'center',
        paddingVertical: 32,
    },
    avatarMorphShell: {
        width: 140,
        height: 140,
        borderRadius: 70,
        overflow: 'hidden',
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    avatarMorphImage: {
        width: '100%',
        height: '100%',
        borderRadius: 70,
    },
    editButton: {
        marginTop: 12,
        fontSize: 16,
        fontWeight: '600',
    },
    section: {
        marginBottom: 24,
    },
    sectionLabel: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 14,
        fontWeight: '500',
        paddingHorizontal: 20,
        marginBottom: 8,
    },
    settingsGroup: {
        marginHorizontal: 16,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 12,
        overflow: 'hidden',
    },
    settingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
        paddingHorizontal: 16,
    },
    settingContent: {
        flex: 1,
    },
    settingLabel: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 12,
        marginBottom: 4,
    },
    settingValue: {
        color: '#ffffff',
        fontSize: 16,
    },
    editRow: {
        padding: 16,
    },
    editInput: {
        color: '#ffffff',
        fontSize: 16,
        padding: 12,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 8,
        marginBottom: 12,
    },
    editActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 12,
    },
    cancelBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    saveBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    // Full image modal
    fullImageModal: {
        flex: 1,
        backgroundColor: '#000000',
    },
    fullImageHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 54,
        paddingHorizontal: 16,
        paddingBottom: 16,
    },
    closeBtn: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    fullImageTitle: {
        color: '#ffffff',
        fontSize: 18,
        fontWeight: '600',
    },
    fullImageActions: {
        flexDirection: 'row',
        gap: 16,
    },
    editIconBtn: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    fullImageContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    fullImage: {
        // Dynamic styles moved to inline or component
    },
    // Edit photo modal
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'flex-end',
    },
    modalBackdrop: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
    },
    modalContent: {
        backgroundColor: '#1c1c1e',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingBottom: 40,
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    modalTitle: {
        color: '#ffffff',
        fontSize: 18,
        fontWeight: '600',
    },
    modalClose: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    modalOption: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        padding: 16,
        paddingHorizontal: 20,
    },
    modalOptionText: {
        color: '#ffffff',
        fontSize: 16,
    },
    separator: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.1)',
        marginVertical: 8,
    },
});
