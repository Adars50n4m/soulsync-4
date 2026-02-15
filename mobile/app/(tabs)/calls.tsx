import React from 'react';
import { View, Text, FlatList, Image, Pressable, StyleSheet, StatusBar } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { useApp } from '../../context/AppContext';

export default function CallsScreen() {
    const { calls, contacts, startCall, activeTheme } = useApp();

    const getContact = (contactId: string) => {
        return contacts.find(c => c.id === contactId);
    };

    const renderCallItem = ({ item }: { item: any }) => {
        const contact = getContact(item.contactId);
        const isMissed = item.type === 'missed';
        const isIncoming = item.type === 'incoming';

        return (
            <Pressable
                style={styles.callItem}
                onPress={() => contact && startCall(contact.id, item.callType || 'audio')}
            >
                <View style={styles.avatarWrapper}>
                    <Image
                        source={{ uri: contact?.avatar || 'https://via.placeholder.com/50' }}
                        style={styles.avatar}
                    />
                </View>
                <View style={styles.callInfo}>
                    <Text style={[styles.contactName, isMissed && styles.missedCall]}>
                        {contact?.name || 'Unknown'}
                    </Text>
                    <View style={styles.callDetails}>
                        <MaterialIcons
                            name={isIncoming ? 'call-received' : 'call-made'}
                            size={14}
                            color={isMissed ? '#ef4444' : 'rgba(255,255,255,0.4)'}
                        />
                        <Text style={[styles.callType, isMissed && styles.missedCall]}>
                            {item.callType === 'video' ? 'Video' : 'Audio'} • {item.time || 'Just now'}
                        </Text>
                    </View>
                </View>
                <Pressable
                    style={[styles.callButton, { backgroundColor: `${activeTheme.primary}1A` }]}
                    onPress={() => contact && startCall(contact.id, item.callType || 'audio')}
                >
                    <MaterialIcons
                        name={item.callType === 'video' ? 'videocam' : 'call'}
                        size={22}
                        color={activeTheme.primary}
                    />
                </Pressable>
            </Pressable>
        );
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" />

            {/* Header */}
            <LinearGradient
                colors={['#000000', 'rgba(0,0,0,0.8)', 'transparent']}
                style={styles.header}
            >
                <Text style={styles.headerTitle}>CALLS</Text>
            </LinearGradient>

            {/* Call History */}
            <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>CALL HISTORY</Text>
            </View>

            {calls.length === 0 ? (
                <View style={styles.emptyState}>
                    <MaterialIcons name="call" size={60} color="rgba(255,255,255,0.1)" />
                    <Text style={styles.emptyStateText}>NO CALLS YET</Text>
                    <Text style={styles.emptyStateHint}>Your call history will appear here</Text>
                </View>
            ) : (
                <FlatList
                    data={calls}
                    keyExtractor={item => item.id}
                    renderItem={renderCallItem}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000000',
    },
    header: {
        paddingTop: 50,
        paddingBottom: 24,
        paddingHorizontal: 24,
    },
    headerTitle: {
        color: '#ffffff',
        fontSize: 18,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 3,
    },
    sectionHeader: {
        paddingHorizontal: 24,
        paddingVertical: 16,
    },
    sectionTitle: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 11,
        fontWeight: '900',
        letterSpacing: 2,
    },
    listContent: {
        paddingHorizontal: 16,
        paddingBottom: 120,
    },
    callItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    avatarWrapper: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    avatar: {
        width: '100%',
        height: '100%',
        borderRadius: 24,
    },
    callInfo: {
        flex: 1,
    },
    contactName: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: '600',
    },
    missedCall: {
        color: '#ef4444',
    },
    callDetails: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginTop: 2,
    },
    callType: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 12,
    },
    callButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(244, 63, 94, 0.1)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingBottom: 100,
    },
    emptyStateText: {
        color: 'rgba(255,255,255,0.2)',
        fontSize: 12,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 3,
        marginTop: 16,
    },
    emptyStateHint: {
        color: 'rgba(255,255,255,0.2)',
        fontSize: 12,
        marginTop: 8,
        textAlign: 'center',
    },
});
