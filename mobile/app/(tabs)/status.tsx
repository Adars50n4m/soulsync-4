import React from 'react';
import { View, Text, FlatList, Image, Pressable, StyleSheet, StatusBar, SectionList, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useApp } from '../../context/AppContext';
import { SwiftUIButton } from '../../components/SwiftUIButton';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';

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
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        router.push('/add-status');
    };

    const handleViewMyStatus = () => {
        Haptics.selectionAsync();
        if (hasMyStatus && currentUser) {
            router.push({ pathname: '/view-status', params: { id: currentUser.id, index: '0' } });
        } else {
            handleAddStatus();
        }
    };

    const handleViewStatus = (userId: string) => {
        Haptics.selectionAsync();
        router.push({ pathname: '/view-status', params: { id: userId, index: '0' } });
    };

    const renderContactStatus = ({ item }: { item: any }) => {
        const { contact, statuses: contactStatuses } = item;
        const latestStatus = contactStatuses[contactStatuses.length - 1];

        return (
            <Pressable 
                style={({ pressed }) => [styles.statusRow, pressed && styles.rowPressed]} 
                onPress={() => handleViewStatus(contact.id)}
            >
                 <View style={styles.statusAvatarRing}>
                    <Image source={{ uri: contact.avatar }} style={styles.statusAvatar} />
                </View>
                <View style={styles.statusInfo}>
                    <Text style={styles.statusName}>{contact.name}</Text>
                    <Text style={styles.statusTime}>
                        {`${latestStatus.timestamp} • ${contactStatuses.length} update${contactStatuses.length > 1 ? 's' : ''}`}
                    </Text>
                </View>
                <MaterialIcons name="chevron-right" size={20} color="rgba(255,255,255,0.3)" />
            </Pressable>
        );
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" />
            
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Status</Text>
            </View>

            <ScrollView style={styles.contentContainer} showsVerticalScrollIndicator={false}>
                {/* My Status Section */}
                <View style={styles.sectionContainer}>
                    <Pressable 
                        style={({ pressed }) => [styles.statusRow, pressed && styles.rowPressed]} 
                        onPress={handleViewMyStatus}
                    >
                         <View style={styles.myAvatarContainer}>
                            <Image source={{ uri: currentUser?.avatar }} style={styles.myAvatar} />
                            {hasMyStatus ? (
                                <View style={styles.statusRingIndicator}>
                                    <View style={styles.statusDot} />
                                </View>
                            ) : (
                                <View style={styles.addButton}>
                                    <MaterialIcons name="add" size={14} color="#ffffff" />
                                </View>
                            )}
                        </View>
                        <View style={styles.statusInfo}>
                            <Text style={styles.statusName}>My Status</Text>
                            <Text style={styles.statusTime}>
                                {hasMyStatus ? `${myStatuses.length} new` : 'Tap to add to your status'}
                            </Text>
                        </View>
                        <MaterialIcons name="chevron-right" size={20} color="rgba(255,255,255,0.3)" />
                    </Pressable>
                </View>

                {/* Recent Updates Header */}
                {contactStatusGroups.length > 0 && (
                    <Text style={styles.sectionHeader}>RECENT UPDATES</Text>
                )}

                {/* Contact Statuses */}
                {contactStatusGroups.length === 0 ? (
                    <View style={styles.emptyContainer}>
                        <Text style={styles.emptyText}>No recent updates</Text>
                    </View>
                ) : (
                    <View style={styles.listSectionContainer}>
                        <FlatList
                            data={contactStatusGroups}
                            keyExtractor={(item) => item.contact.id}
                            renderItem={renderContactStatus}
                            scrollEnabled={false} // Disable FlatList scrolling inside ScrollView
                            ItemSeparatorComponent={() => <View style={styles.separator} />}
                        />
                    </View>
                )}
                <View style={styles.spacer} />
            </ScrollView>

            {/* iOS Style Floating Button */}
            <View style={styles.fabContainer}>
                <SwiftUIButton 
                    title="Camera" 
                    icon="camera-alt" 
                    type="glass" 
                    onPress={handleAddStatus} 
                    style={styles.fab}
                />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000000',
        paddingTop: 60,
    },
    header: {
        paddingHorizontal: 20,
        paddingBottom: 10,
    },
    headerTitle: {
        color: '#ffffff',
        fontSize: 34,
        fontWeight: '700',
        letterSpacing: 0.3,
    },
    contentContainer: {
        flex: 1,
        paddingHorizontal: 16,
    },
    sectionContainer: {
        backgroundColor: 'rgba(28, 28, 30, 0.6)', // iOS secondary system fill dark
        borderRadius: 16,
        overflow: 'hidden',
        marginBottom: 24,
    },
    listSectionContainer: {
        backgroundColor: 'rgba(28, 28, 30, 0.6)', // iOS secondary system fill dark
        borderRadius: 16,
        overflow: 'hidden',
    },
    sectionHeader: {
        color: 'rgba(235, 235, 245, 0.6)', // iOS secondary label
        fontSize: 13,
        fontWeight: '600',
        marginBottom: 8,
        paddingLeft: 12,
        textTransform: 'uppercase',
    },
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
    },
    rowPressed: {
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
    },
    separator: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
        marginLeft: 68, // Aligned with text
    },
    statusAvatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
    },
    statusAvatarRing: {
        width: 50,
        height: 50,
        borderRadius: 25,
        borderWidth: 2,
        borderColor: '#0a84ff', // iOS Blue for updates
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    myAvatarContainer: {
        position: 'relative',
        marginRight: 12,
        width: 50,
        height: 50,
        alignItems: 'center',
        justifyContent: 'center',
    },
    myAvatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
    },
    addButton: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        backgroundColor: '#0a84ff',
        width: 18,
        height: 18,
        borderRadius: 9,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.5,
        borderColor: '#000',
    },
    statusRingIndicator: {
        position: 'absolute',
        top: -3,
        right: -3,
        bottom: -3,
        left: -3,
        borderRadius: 28,
        borderWidth: 2,
        borderColor: '#0a84ff',
    },
    statusDot: {
        flex: 1,
    },
    statusInfo: {
        flex: 1,
        justifyContent: 'center',
    },
    statusName: {
        color: '#ffffff',
        fontSize: 17,
        fontWeight: '600',
    },
    statusTime: {
        color: 'rgba(235, 235, 245, 0.6)',
        fontSize: 14,
        marginTop: 2,
    },
    emptyContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 40,
    },
    emptyText: {
        color: 'rgba(235, 235, 245, 0.6)',
        fontSize: 15,
    },
    fabContainer: {
        position: 'absolute',
        bottom: 30,
        right: 20,
    },
    fab: {
        minWidth: 140,
    },
    spacer: {
        height: 120,
    },
});
