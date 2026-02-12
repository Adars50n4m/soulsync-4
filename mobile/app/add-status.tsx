import React, { useState, useEffect } from 'react';
import {
    View, Text, Image, TextInput, Pressable, StyleSheet, Dimensions,
    StatusBar, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Keyboard
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { 
    FadeIn, 
    SlideInDown, 
    Layout
} from 'react-native-reanimated';
import { useApp } from '../context/AppContext';
import { storageService } from '../services/StorageService';

const { width, height } = Dimensions.get('window');

export default function AddStatusScreen() {
    const router = useRouter();
    const { addStatus, activeTheme, currentUser } = useApp();
    const [media, setMedia] = useState<{ uri: string; type: 'image' | 'video' } | null>(null);
    const [caption, setCaption] = useState('');
    const [uploading, setUploading] = useState(false);
    const [keyboardVisible, setKeyboardVisible] = useState(false);

    useEffect(() => {
        const showSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardVisible(true));
        const hideSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardVisible(false));
        return () => {
            showSub.remove();
            hideSub.remove();
        };
    }, []);

    const handlePickMedia = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.All,
            allowsEditing: true,
            quality: 0.8,
        });

        if (!result.canceled && result.assets[0]) {
            const asset = result.assets[0];
            setMedia({
                uri: asset.uri,
                type: asset.type === 'video' ? 'video' : 'image',
            });
        }
    };

    const handleTakePhoto = async () => {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
            Alert.alert('Permission needed', 'Camera permission is required');
            return;
        }

        try {
            const result = await ImagePicker.launchCameraAsync({
                allowsEditing: true,
                quality: 0.8,
            });

            if (!result.canceled && result.assets[0]) {
                setMedia({
                    uri: result.assets[0].uri,
                    type: 'image',
                });
            }
        } catch (error) {
            Alert.alert('Camera Error', 'Could not open camera.');
        }

    };

    const handlePost = async () => {
        if (!media) {
            Alert.alert('Error', 'Please select an image or video');
            return;
        }

        setUploading(true);

        // Simulate upload
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Add status with 24h expiry
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

        // Upload media first
        let publicUrl = media.uri;
        if (media.uri.startsWith('file://')) {
            try {
                const uploadedUrl = await storageService.uploadImage(media.uri, 'status-media', currentUser?.id);
                if (uploadedUrl) {
                    publicUrl = uploadedUrl;
                }
            } catch (error: any) {
                setUploading(false);
                console.warn('Status upload error:', error);
                Alert.alert('Upload Error', `Could not process media: ${error.message || 'Unknown error'}`);
                return;
            }
        }

        addStatus({
            userId: currentUser?.id || 'anonymous',
            mediaUrl: publicUrl,
            mediaType: media.type,
            caption: caption.trim(),
            timestamp: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            expiresAt: expiresAt.toISOString(),
            views: [],
        });

        setUploading(false);
        Alert.alert('Success', 'Status posted! It will expire in 24 hours.');
        router.back();
    };

    if (!media) {
        return (
            <View style={styles.container}>
                <StatusBar barStyle="light-content" />
                <Animated.View entering={FadeIn.duration(300)} style={styles.emptyStateContainer}>
                    <Pressable onPress={() => router.back()} style={styles.closeButton}>
                        <MaterialIcons name="close" size={28} color="white" />
                    </Pressable>
                    
                    <View style={styles.actionsContainer}>
                        <Pressable style={styles.actionButton} onPress={handleTakePhoto}>
                            <View style={[styles.actionIcon, { backgroundColor: 'rgba(255,255,255,0.1)' }]}>
                                <MaterialIcons name="camera-alt" size={40} color="white" />
                            </View>
                            <Text style={styles.actionText}>Camera</Text>
                        </Pressable>

                        <Pressable style={styles.actionButton} onPress={handlePickMedia}>
                            <View style={[styles.actionIcon, { backgroundColor: 'rgba(255,255,255,0.1)' }]}>
                                <MaterialIcons name="photo-library" size={40} color="white" />
                            </View>
                            <Text style={styles.actionText}>Gallery</Text>
                        </Pressable>
                    </View>

                    <Text style={styles.hintText}>Share a moment to your Signal</Text>
                </Animated.View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" hidden />

            {/* Full Screen Media */}
            <Image source={{ uri: media.uri }} style={styles.fullScreenImage} resizeMode="contain" />
            
            {/* Top Controls */}
            <LinearGradient colors={['rgba(0,0,0,0.6)', 'transparent']} style={styles.topGradient}>
                <View style={styles.topBar}>
                    <Pressable onPress={() => setMedia(null)} style={styles.iconButton}>
                        <MaterialIcons name="close" size={28} color="white" />
                    </Pressable>
                    <View style={styles.topTools}>
                        <Pressable style={styles.iconButton}>
                            <MaterialIcons name="crop" size={24} color="white" />
                        </Pressable>
                        <Pressable style={styles.iconButton}>
                            <MaterialIcons name="title" size={24} color="white" />
                        </Pressable>
                        <Pressable style={styles.iconButton}>
                            <MaterialIcons name="edit" size={24} color="white" />
                        </Pressable>
                    </View>
                </View>
            </LinearGradient>

            {/* Bottom Controls */}
            <KeyboardAvoidingView 
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.bottomContainer}
            >
                <LinearGradient colors={['transparent', 'rgba(0,0,0,0.8)']} style={styles.bottomGradient} />
                
                <Animated.View 
                    entering={SlideInDown.springify()} 
                    layout={Layout.springify()}
                    style={styles.inputRow}
                >
                    <View style={styles.inputWrapper}>
                        <TextInput
                            style={styles.captionInput}
                            placeholder="Add a caption..."
                            placeholderTextColor="rgba(255,255,255,0.7)"
                            value={caption}
                            onChangeText={setCaption}
                            multiline
                            maxLength={200}
                        />
                    </View>
                    
                    <Pressable 
                        onPress={handlePost}
                        disabled={uploading}
                        style={[styles.sendButton, { backgroundColor: activeTheme.primary }]}
                    >
                        {uploading ? (
                            <ActivityIndicator color="white" size="small" />
                        ) : (
                            <MaterialIcons name="send" size={24} color="white" />
                        )}
                    </Pressable>
                </Animated.View>
            </KeyboardAvoidingView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000000',
    },
    emptyStateContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    closeButton: {
        position: 'absolute',
        top: 60,
        left: 20,
        padding: 8,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 20,
    },
    actionsContainer: {
        flexDirection: 'row',
        gap: 40,
    },
    actionButton: {
        alignItems: 'center',
        gap: 12,
    },
    actionIcon: {
        width: 80,
        height: 80,
        borderRadius: 40,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    actionText: {
        color: 'white',
        fontSize: 16,
        fontWeight: '600',
    },
    hintText: {
        position: 'absolute',
        bottom: 100,
        color: 'rgba(255,255,255,0.4)',
        fontSize: 14,
    },
    fullScreenImage: {
        width: width,
        height: height,
        backgroundColor: '#000',
    },
    topGradient: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 150,
    },
    topBar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        paddingTop: 60,
        paddingHorizontal: 20,
    },
    topTools: {
        flexDirection: 'row',
        gap: 20,
    },
    iconButton: {
        padding: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.5,
        shadowRadius: 4,
    },
    bottomContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        justifyContent: 'flex-end',
    },
    bottomGradient: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 200,
    },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        paddingHorizontal: 16,
        paddingBottom: 40,
        paddingTop: 20,
        gap: 12,
    },
    inputWrapper: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        borderRadius: 25,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
        minHeight: 50,
        justifyContent: 'center',
        paddingHorizontal: 20,
        paddingVertical: 5,
    },
    captionInput: {
        color: 'white',
        fontSize: 16,
        maxHeight: 100,
    },
    sendButton: {
        width: 50,
        height: 50,
        borderRadius: 25,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 5,
    },
});
