import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

interface ChatStorageInfo {
    chatId: string;
    contactName: string;
    avatar: string;
    totalMessages: number;
    mediaMessages: number;
    imageCount: number;
    videoCount: number;
    audioCount: number;
    fileCount: number;
}

interface ChatStorageItemProps {
    chat: ChatStorageInfo;
    isLast: boolean;
}

const ChatStorageItem = ({ chat, isLast }: ChatStorageItemProps) => {
    return (
        <View>
            <View style={styles.chatStorageItem}>
                {chat.avatar ? (
                    <Image source={{ uri: chat.avatar }} style={styles.chatAvatar} />
                ) : (
                    <View style={[styles.chatAvatar, styles.chatAvatarPlaceholder]}>
                        <MaterialIcons name="person" size={22} color="rgba(255,255,255,0.4)" />
                    </View>
                )}
                <View style={{ flex: 1 }}>
                    <Text style={styles.chatName}>{chat.contactName}</Text>
                    <Text style={styles.chatStorageDetail}>
                        {chat.totalMessages} message{chat.totalMessages !== 1 ? 's' : ''}
                        {chat.mediaMessages > 0 && ` \u00B7 ${chat.mediaMessages} media`}
                    </Text>
                </View>
                <View style={styles.chatMediaCounts}>
                    {chat.imageCount > 0 && (
                        <View style={styles.mediaBadge}>
                            <MaterialIcons name="image" size={12} color="#10b981" />
                            <Text style={styles.mediaBadgeText}>{chat.imageCount}</Text>
                        </View>
                    )}
                    {chat.videoCount > 0 && (
                        <View style={styles.mediaBadge}>
                            <MaterialIcons name="videocam" size={12} color="#3b82f6" />
                            <Text style={styles.mediaBadgeText}>{chat.videoCount}</Text>
                        </View>
                    )}
                    {chat.audioCount > 0 && (
                        <View style={styles.mediaBadge}>
                            <MaterialIcons name="audiotrack" size={12} color="#f59e0b" />
                            <Text style={styles.mediaBadgeText}>{chat.audioCount}</Text>
                        </View>
                    )}
                    {chat.fileCount > 0 && (
                        <View style={styles.mediaBadge}>
                            <MaterialIcons name="insert-drive-file" size={12} color="#8b5cf6" />
                            <Text style={styles.mediaBadgeText}>{chat.fileCount}</Text>
                        </View>
                    )}
                </View>
            </View>
            {!isLast && <View style={styles.separator} />}
        </View>
    );
};

export default ChatStorageItem;

const styles = StyleSheet.create({
    chatStorageItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        gap: 14,
    },
    chatAvatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    chatAvatarPlaceholder: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    chatName: {
        fontSize: 16,
        fontWeight: '700',
        color: '#fff',
    },
    chatStorageDetail: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.4)',
        marginTop: 2,
    },
    chatMediaCounts: {
        flexDirection: 'row',
        gap: 6,
    },
    mediaBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        backgroundColor: 'rgba(255,255,255,0.05)',
        paddingHorizontal: 6,
        paddingVertical: 3,
        borderRadius: 6,
    },
    mediaBadgeText: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.5)',
    },
    separator: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.05)',
        marginLeft: 74,
    },
});
