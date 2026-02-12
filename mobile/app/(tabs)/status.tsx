import React from 'react';
import { View, Text, FlatList, Image, Pressable, StyleSheet, StatusBar } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { useApp } from '../../context/AppContext';

export default function StatusScreen() {
    const router = useRouter();
    const { statuses, contacts, currentUser } = useApp();

    // Filter active statuses (not expired - within 24 hours)
    const now = new Date();
    const activeStatuses = statuses.filter(s => {
        if (!s.expiresAt) return true; // Legacy statuses without expiry
        const expires = new Date(s.expiresAt);
        return expires > now;
    });

    // Get my statuses
    const myStatuses = activeStatuses.filter(s => s.userId === currentUser?.id);
    const hasMyStatus = myStatuses.length > 0;

    // Group statuses by user (excluding current user)
    const contactStatusGroups = contacts
        .filter(c => c.id !== currentUser?.id)
        .map(contact => ({
            contact,
            statuses: activeStatuses.filter(s => s.userId === contact.id),
        }))
        .filter(group => group.statuses.length > 0);

    const handleAddStatus = () => {
        router.push('/add-status');
    };

    const handleViewMyStatus = () => {
        if (hasMyStatus && currentUser) {
            router.push({ pathname: '/view-status', params: { id: currentUser.id, index: '0' } });
        } else {
            handleAddStatus();
        }
    };

    const handleViewStatus = (userId: string) => {
        router.push({ pathname: '/view-status', params: { id: userId, index: '0' } });
    };

    const renderContactStatus = ({ item }: { item: any }) => {
        const { contact, statuses: contactStatuses } = item;
        const latestStatus = contactStatuses[contactStatuses.length - 1];

        return (
            <Pressable style={styles.statusItem} onPress={() => handleViewStatus(contact.id)}>
                <View style={styles.statusAvatarRing}>
                    <Image source={{ uri: contact.avatar }} style={styles.statusAvatar} />
                </View>
                <View style={styles.statusInfo}>
                    <Text style={styles.statusName}>{contact.name}</Text>
                    <Text style={styles.statusTime}>
                        {latestStatus.timestamp} • {contactStatuses.length} update{contactStatuses.length > 1 ? 's' : ''}
                    </Text>
                </View>
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
                <Text style={styles.headerTitle}>STATUS</Text>
            </LinearGradient>

            {/* My Status */}
            <View style={styles.myStatusSection}>
                <Pressable style={styles.myStatus} onPress={handleViewMyStatus}>
                    <View style={styles.myAvatarContainer}>
                        <Image source={{ uri: currentUser?.avatar }} style={styles.myAvatar} />
                        {hasMyStatus ? (
                            <View style={styles.statusRingIndicator}>
                                <View style={styles.statusDot} />
                            </View>
                        ) : (
                            <Pressable style={styles.addButton} onPress={handleAddStatus}>
                                <MaterialIcons name="add" size={16} color="#ffffff" />
                            </Pressable>
                        )}
                    </View>
                    <View style={styles.myStatusInfo}>
                        <Text style={styles.myStatusTitle}>My Status</Text>
                        <Text style={styles.myStatusHint}>
                            {hasMyStatus
                                ? `${myStatuses.length} update${myStatuses.length > 1 ? 's' : ''} • Tap to view`
                                : 'Tap to add status update'
                            }
                        </Text>
                    </View>
                    {hasMyStatus && (
                        <Pressable style={styles.addMoreButton} onPress={handleAddStatus}>
                            <MaterialIcons name="add" size={20} color="#f43f5e" />
                        </Pressable>
                    )}
                </Pressable>
            </View>

            {/* Recent Updates */}
            <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>RECENT UPDATES</Text>
            </View>

            {contactStatusGroups.length === 0 ? (
                <View style={styles.emptyState}>
                    <MaterialIcons name="photo-library" size={60} color="rgba(255,255,255,0.1)" />
                    <Text style={styles.emptyStateText}>NO STATUS UPDATES</Text>
                    <Text style={styles.emptyStateHint}>Status updates from your contacts will appear here</Text>
                </View>
            ) : (
                <FlatList
                    data={contactStatusGroups}
                    keyExtractor={item => item.contact.id}
                    renderItem={renderContactStatus}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                />
            )}

            {/* Info */}
            <View style={styles.infoContainer}>
                <MaterialIcons name="access-time" size={14} color="rgba(255,255,255,0.3)" />
                <Text style={styles.infoText}>Status updates disappear after 24 hours</Text>
            </View>
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
    myStatusSection: {
        paddingHorizontal: 16,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    myStatus: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        padding: 12,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 16,
    },
    myAvatarContainer: {
        position: 'relative',
    },
    myAvatar: {
        width: 56,
        height: 56,
        borderRadius: 28,
    },
    addButton: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#f43f5e',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: '#000000',
    },
    statusRingIndicator: {
        position: 'absolute',
        top: -2,
        left: -2,
        right: -2,
        bottom: -2,
        borderRadius: 30,
        borderWidth: 2,
        borderColor: '#f43f5e',
    },
    statusDot: {
        position: 'absolute',
        top: 0,
        right: 4,
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#f43f5e',
    },
    myStatusInfo: {
        flex: 1,
    },
    myStatusTitle: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: '700',
    },
    myStatusHint: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 12,
        marginTop: 2,
    },
    addMoreButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(244, 63, 94, 0.1)',
        alignItems: 'center',
        justifyContent: 'center',
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
    statusItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        paddingVertical: 12,
    },
    statusAvatarRing: {
        width: 56,
        height: 56,
        borderRadius: 28,
        padding: 2,
        borderWidth: 2,
        borderColor: '#f43f5e',
    },
    statusAvatar: {
        width: '100%',
        height: '100%',
        borderRadius: 26,
    },
    statusInfo: {
        flex: 1,
    },
    statusName: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: '600',
    },
    statusTime: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 12,
        marginTop: 2,
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
    infoContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingBottom: 120,
    },
    infoText: {
        color: 'rgba(255,255,255,0.3)',
        fontSize: 11,
    },
});
