import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, StatusBar, Alert } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import GlassView, { GlowPressable } from '../../components/ui/GlassView';
import { GlassPillSurface } from '../../components/ui/IOS26Primitives';
import { MaterialIcons } from '@expo/vector-icons';
import { useApp } from '../../context/AppContext';
import { useScrollMotion } from '../../components/navigation/ScrollMotionProvider';
import { SoulAvatar } from '../../components/SoulAvatar';

type CallFilter = 'all' | 'missed';

const CallItem = React.memo(({ item, contact, onCall, activeTheme, isSelected, toggleSelection, selectionMode }: any) => {
    if (!item) return null;
    const isMissed = item.status === 'missed';
    const isIncoming = item.type === 'incoming';
    const [pressed, setPressed] = useState(false);

    const handlePress = () => {
        if (selectionMode) {
            toggleSelection(item.id);
        } else if (contact) {
            onCall(contact.id, item.callType || 'audio');
        }
    };

    return (
        <Pressable
            style={styles.callItemPressable}
            onPress={handlePress}
            onPressIn={() => setPressed(true)}
            onPressOut={() => setPressed(false)}
            onLongPress={() => toggleSelection(item.id)}
            delayLongPress={200}
        >
            <GlassPillSurface
                radius={28}
                intensity={35}
                selected={isSelected}
                selectedColor="#ff4444"
                pressed={pressed}
                pressColor={activeTheme.primary}
                style={styles.callItem}
                contentStyle={styles.callItemContent}
            >
                <View style={styles.avatarWrapper}>
                    <SoulAvatar 
                        uri={contact?.avatar} 
                        size={48} 
                        style={styles.avatar} 
                    />
                    {isSelected && (
                        <View style={styles.selectionBadge}>
                            <MaterialIcons name="check" size={14} color="#fff" />
                        </View>
                    )}
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
                            {item.callType === 'video' ? 'Video' : 'Audio'} • {item.time ? new Date(item.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Unknown'}
                        </Text>
                    </View>
                </View>
                <Pressable
                    style={[styles.callButton, { backgroundColor: `${activeTheme.primary}1A` }]}
                    onPress={handlePress}
                >
                    <MaterialIcons
                        name={item.callType === 'video' ? 'videocam' : 'call'}
                        size={22}
                        color={activeTheme.primary}
                    />
                </Pressable>
            </GlassPillSurface>
        </Pressable>
    );
});

export default function CallsScreen() {
    const { calls, contacts, startCall, activeTheme, clearCalls, deleteCall } = useApp();
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [filter, setFilter] = useState<CallFilter>('all');
    const { onScroll: handleScrollMotion } = useScrollMotion('calls');

    const selectionMode = selectedIds.size > 0;

    const missedCount = useMemo(
        () => (calls || []).filter((c: any) => c?.status === 'missed').length,
        [calls],
    );

    const filteredCalls = useMemo(() => {
        if (!calls) return [];
        if (filter === 'missed') return calls.filter((c: any) => c?.status === 'missed');
        return calls;
    }, [calls, filter]);

    const toggleSelection = useCallback((id: string) => {
        setSelectedIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) newSet.delete(id);
            else newSet.add(id);
            return newSet;
        });
    }, []);

    const clearSelection = () => setSelectedIds(new Set());

    const getContact = useCallback((contactId: string) => {
        return contacts.find(c => c.id === contactId);
    }, [contacts]);

    const handleClearAll = () => {
        Alert.alert('Clear Call History', 'Are you sure you want to clear your entire call history?', [
            { text: 'Cancel', style: 'cancel' },
            { 
                text: 'Clear All', 
                style: 'destructive', 
                onPress: () => {
                    clearCalls();
                    clearSelection();
                } 
            }
        ]);
    };

    const handleDeleteSelected = () => {
        Alert.alert('Delete Calls', `Are you sure you want to delete ${selectedIds.size} call${selectedIds.size > 1 ? 's' : ''}?`, [
            { text: 'Cancel', style: 'cancel' },
            { 
                text: 'Delete', 
                style: 'destructive', 
                onPress: () => {
                    selectedIds.forEach(id => deleteCall(id));
                    clearSelection();
                } 
            }
        ]);
    };

    const renderCallItem = useCallback(({ item }: { item: any }) => (
        <CallItem 
            item={item} 
            contact={getContact(item.contactId)} 
            onCall={startCall}
            activeTheme={activeTheme}
            isSelected={selectedIds.has(item.id)}
            toggleSelection={toggleSelection}
            selectionMode={selectionMode}
        />
    ), [getContact, startCall, activeTheme?.primary, selectedIds, toggleSelection, selectionMode]);

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" />

            {/* Header */}
            <View style={styles.header}>
                <GlassView intensity={35} tint="dark" style={StyleSheet.absoluteFill} />
                {selectionMode ? (
                    <View style={styles.selectionHeader}>
                        <Pressable onPress={clearSelection} style={styles.iconButton}>
                            <MaterialIcons name="close" size={24} color="#fff" />
                        </Pressable>
                        <Text style={styles.selectionText}>{selectedIds.size} Selected</Text>
                        <Pressable onPress={handleDeleteSelected} style={styles.iconButton}>
                            <MaterialIcons name="delete" size={24} color="#ef4444" />
                        </Pressable>
                    </View>
                ) : (
                    <View style={styles.normalHeader}>
                        <Text style={styles.headerTitle}>CALLS</Text>
                        {calls && calls.length > 0 && (
                            <Pressable 
                                onPress={handleClearAll}
                                style={({ pressed }) => [
                                    styles.clearBtn, 
                                    pressed && { opacity: 0.6 }
                                ]}
                            >
                                <MaterialIcons name="delete-sweep" size={22} color="rgba(255,255,255,0.6)" />
                            </Pressable>
                        )}
                    </View>
                )}
            </View>

            {/* Filter pills — one long centered rail, segmented-control style */}
            <View style={styles.filterRow}>
                <GlassPillSurface
                    radius={24}
                    intensity={24}
                    style={styles.filterRail}
                    borderColor="rgba(255,255,255,0.18)"
                    contentStyle={styles.filterRailContent}
                >
                    {([
                        { key: 'all', label: 'All' },
                        { key: 'missed', label: 'Missed', badge: missedCount },
                    ] as Array<{ key: CallFilter; label: string; badge?: number }>).map((opt) => {
                        const active = filter === opt.key;
                        const accent = opt.key === 'missed' ? '#ef4444' : activeTheme.primary;
                        return (
                            <GlowPressable
                                key={opt.key}
                                onPress={() => setFilter(opt.key)}
                                glowColor={accent}
                                glowIntensity={0.55}
                                style={[
                                    styles.filterPill,
                                    active && {
                                        backgroundColor: opt.key === 'missed'
                                            ? 'rgba(239, 68, 68, 0.20)'
                                            : `${activeTheme.primary}2A`,
                                    },
                                ]}
                            >
                                <Text
                                    style={[
                                        styles.filterLabel,
                                        active && { color: accent },
                                    ]}
                                >
                                    {opt.label}
                                </Text>
                                {opt.badge ? (
                                    <View style={[styles.filterBadge, { backgroundColor: accent }]}>
                                        <Text style={styles.filterBadgeText}>
                                            {opt.badge > 99 ? '99+' : opt.badge}
                                        </Text>
                                    </View>
                                ) : null}
                            </GlowPressable>
                        );
                    })}
                </GlassPillSurface>
            </View>

            {filteredCalls.length === 0 ? (
                <View style={styles.emptyState}>
                    <MaterialIcons
                        name={filter === 'missed' ? 'phone-missed' : 'call'}
                        size={60}
                        color="rgba(255,255,255,0.1)"
                    />
                    <Text style={styles.emptyStateText}>
                        {filter === 'missed' ? 'NO MISSED CALLS' : 'NO CALLS YET'}
                    </Text>
                    <Text style={styles.emptyStateHint}>
                        {filter === 'missed'
                            ? 'Missed calls will show up here'
                            : 'Your call history will appear here'}
                    </Text>
                </View>
            ) : (
                <FlashList
                    data={filteredCalls}
                    keyExtractor={item => item.id}
                    renderItem={renderCallItem}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    onScroll={handleScrollMotion}
                    scrollEventThrottle={16}
                    extraData={`${activeTheme?.primary}_${selectedIds.size}_${filter}`}
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
    normalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    selectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    headerTitle: {
        color: '#ffffff',
        fontSize: 18,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 3,
    },
    selectionText: {
        color: '#ffffff',
        fontSize: 18,
        fontWeight: '700',
    },
    iconButton: {
        padding: 4,
    },
    clearBtn: {
        padding: 4,
    },
    filterRow: {
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingTop: 8,
        paddingBottom: 14,
    },
    filterRail: {
        alignSelf: 'center',
    },
    filterRailContent: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 5,
        gap: 4,
    },
    filterPill: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 20,
        paddingVertical: 8,
        borderRadius: 999,
        gap: 8,
    },
    filterLabel: {
        color: 'rgba(255,255,255,0.55)',
        fontSize: 14,
        fontWeight: '600',
        letterSpacing: 0.2,
    },
    filterBadge: {
        minWidth: 20,
        height: 20,
        paddingHorizontal: 6,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    filterBadgeText: {
        color: '#fff',
        fontSize: 11,
        fontWeight: '700',
    },
    listContent: {
        paddingHorizontal: 16,
        paddingBottom: 120,
    },
    callItemPressable: {
        marginBottom: 10,
    },
    callItem: {
        minHeight: 76,
    },
    callItemContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        paddingVertical: 12,
        paddingHorizontal: 14,
    },
    callItemSelected: {
        backgroundColor: 'rgba(255,255,255,0.08)',
    },
    avatarWrapper: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(255,255,255,0.1)',
        position: 'relative',
    },
    avatar: {
        width: '100%',
        height: '100%',
        borderRadius: 24,
    },
    selectionBadge: {
        position: 'absolute',
        bottom: -2,
        right: -2,
        backgroundColor: '#f43f5e', // Use a standard highlight or active theme color
        borderRadius: 10,
        width: 20,
        height: 20,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: '#000',
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
