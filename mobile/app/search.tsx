import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Platform, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { SERVER_URL, safeFetchJson, proxySupabaseUrl } from '../config/api';
import { useApp } from '../context/AppContext';
import { useChat } from '../context/ChatContext';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import GlassView from '../components/ui/GlassView';
import { SoulAvatar } from '../components/SoulAvatar';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';

const SUPERUSERS: any[] = [];

const SUPERUSERS_IDS: string[] = [];

export default function SearchScreen() {
    const { currentUser } = useApp();
    const { 
        updateContactPreview, 
        contacts, 
        outgoingRequestIds, 
        refreshRequests 
    } = useChat();
    
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [connectingId, setConnectingId] = useState<string | null>(null);
    const [searchError, setSearchError] = useState<string | null>(null);
    const router = useRouter();

    const searchUsers = useCallback(async (text: string) => {
        if (text.length < 2) {
            setResults([]);
            setSearchError(null);
            return;
        }
        setLoading(true);
        setSearchError(null);
        try {
            const { success, data, error } = await safeFetchJson<any>(
                `${SERVER_URL}/api/users/search?query=${encodeURIComponent(text)}`,
                {
                    headers: {
                        'x-user-id': currentUser?.id || ''
                    }
                }
            );

            let serverUsers = (success && data?.success) ? data.users : [];
            
            // Add local fallback for superusers if they match the query
            const lowerText = text.toLowerCase();
            const matchedSuperusers = SUPERUSERS.filter(s => 
                s.username.toLowerCase().includes(lowerText) || 
                s.full_name.toLowerCase().includes(lowerText)
            );

            // Filter out duplicates if server already returned them
            const additionalUsers = matchedSuperusers.filter(s => !serverUsers.some((u: any) => u.id === s.id));

            // Map statuses based on global context (more reliable than just server results)
            const finalUsers = [...serverUsers, ...additionalUsers].map(user => {
                if (contacts.find(c => c.id === user.id)) {
                    return { ...user, connectionStatus: 'connected' };
                }
                if (outgoingRequestIds.includes(user.id)) {
                    return { ...user, connectionStatus: 'request_sent' };
                }
                return { ...user, connectionStatus: user.connectionStatus || 'not_connected' };
            });

            console.log(`[Search] Text: "${text}", Found: ${finalUsers.length} (Server: ${serverUsers.length}, Local: ${additionalUsers.length})`);
            setResults(finalUsers);
            
            if (!success && finalUsers.length === 0) {
                const msg = error || 'Search failed';
                console.warn('[Search] Search failed:', msg);
                setSearchError(msg);
            } else {
                setSearchError(null);
            }
        } catch (err: any) {
            console.warn('[Search] Unexpected error:', err);
            
            // Even on error, show matched superusers as fallback
            const lowerText = text.toLowerCase();
            const fallback = SUPERUSERS.filter(s => 
                s.username.toLowerCase().includes(lowerText) || 
                s.full_name.toLowerCase().includes(lowerText)
            );
            
            if (fallback.length > 0) {
                // Map statuses even for fallback results
                const mappedFallback = fallback.map(user => {
                    if (contacts.find(c => c.id === user.id)) {
                        return { ...user, connectionStatus: 'connected' };
                    }
                    if (outgoingRequestIds.includes(user.id)) {
                        return { ...user, connectionStatus: 'request_sent' };
                    }
                    return { ...user, connectionStatus: 'not_connected' };
                });
                setResults(mappedFallback);
                setSearchError(null);
            } else {
                setSearchError(err?.message || 'Network error');
            }
        } finally {
            setLoading(false);
        }
    }, [currentUser, contacts, outgoingRequestIds]);

    useFocusEffect(
        useCallback(() => {
            // Refresh requests every time the screen comes into focus
            refreshRequests();
        }, [refreshRequests])
    );

    useEffect(() => {
        const timer = setTimeout(() => {
            searchUsers(query);
        }, 500);
        return () => clearTimeout(timer);
    }, [query, searchUsers]);

    const sendRequest = async (receiverId: string) => {
        setConnectingId(receiverId);
        try {
            const isSuperuser = SUPERUSERS_IDS.includes(receiverId);

            const { success, data, error } = await safeFetchJson<any>(
                `${SERVER_URL}/api/connections/request`, 
                {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'x-user-id': currentUser?.id || ''
                    },
                    body: JSON.stringify({ receiverId })
                }
            );

            if (success && data?.success) {
                // Update local status ONLY if server confirmed success
                setResults(prev => prev.map(u => u.id === receiverId ? { ...u, connectionStatus: 'request_sent' } : u));
                
                // Refresh global requests state to sync other screens
                refreshRequests();
            } else {
                console.warn('[Search] Request failed:', error);
                Alert.alert('Connection Error', error || 'Could not send request. Please ensure the server is running.');
            }
        } catch (err) {
            console.warn('[Search] Unexpected request error:', err);
        } finally {
            setConnectingId(null);
        }
    };

    const cancelRequest = async (receiverId: string) => {
        setConnectingId(receiverId);
        try {
            // Use the new dedicated receiver-based endpoint for reliability
            const { success, data } = await safeFetchJson<any>(
                `${SERVER_URL}/api/connections/request/receiver/${receiverId}`, 
                {
                    method: 'DELETE',
                    headers: { 'x-user-id': currentUser?.id || '' }
                }
            );

            if (success && data?.success) {
                setResults(prev => prev.map(u => u.id === receiverId ? { ...u, connectionStatus: 'not_connected' } : u));
                refreshRequests();
            }
        } catch (err) {
            console.warn('[Search] Cancel error:', err);
        } finally {
            setConnectingId(null);
        }
    };

    const renderItem = ({ item, index }: { item: any; index: number }) => (
        <Animated.View entering={FadeInDown.delay(index * 50).duration(400)}>
            <View style={styles.userCard}>
                <GlassView intensity={25} tint="dark" style={styles.glassBackground} />
                <View style={styles.cardContent}>
                    <SoulAvatar uri={proxySupabaseUrl(item.avatar_url)} size={52} />
                    <View style={styles.userInfo}>
                        <Text style={styles.username}>{item.username}</Text>
                        <Text style={styles.fullName}>{item.full_name || `@${item.username}`}</Text>
                    </View>
                    
                    {item.connectionStatus === 'connected' ? (
                        <TouchableOpacity 
                            style={styles.chatButton} 
                            onPress={() => router.push({
                                pathname: '/chat/[id]',
                                params: { id: item.id, name: item.username }
                            })}
                        >
                            <LinearGradient
                                colors={['#22c55e', '#15803d']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.chatButtonGradient}
                            >
                                <Ionicons name="chatbubble-ellipses" size={20} color="#fff" />
                            </LinearGradient>
                        </TouchableOpacity>
                    ) : item.connectionStatus === 'request_sent' ? (
                        <View style={styles.requestSentGroup}>
                            <View style={styles.pendingBadge}>
                                <MaterialIcons name="done" size={16} color="rgba(255,255,255,0.8)" />
                                <Text style={styles.pendingText}>Sent</Text>
                            </View>
                            <TouchableOpacity 
                                style={styles.cancelButton} 
                                onPress={() => cancelRequest(item.id)}
                                disabled={connectingId === item.id}
                            >
                                {connectingId === item.id ? (
                                    <ActivityIndicator size="small" color="#ff4444" />
                                ) : (
                                    <Text style={styles.cancelText}>Cancel</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <TouchableOpacity 
                            style={styles.connectButtonWrapper} 
                            onPress={() => sendRequest(item.id)}
                            disabled={connectingId === item.id}
                        >
                            <LinearGradient
                                colors={['#FF6A88', '#FF1E56']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.connectButton}
                            >
                                {connectingId === item.id ? (
                                    <ActivityIndicator size="small" color="#fff" />
                                ) : (
                                    <Text style={styles.connectText}>Send Request</Text>
                                )}
                            </LinearGradient>
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        </Animated.View>
    );

    return (
        <View style={styles.container}>
            <LinearGradient colors={['#1a1a1a', '#000']} style={StyleSheet.absoluteFill} />
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton} activeOpacity={0.7}>
                    <MaterialIcons name="arrow-back-ios" size={20} color="#fff" />
                </TouchableOpacity>
                <View style={styles.searchWrapper}>
                    <GlassView intensity={30} tint="dark" style={styles.searchGlass} />
                    <View style={styles.searchContainer}>
                        <MaterialIcons name="search" size={20} color="rgba(255,255,255,0.5)" />
                        <TextInput
                            style={styles.searchInput}
                            placeholder="Find Soulmates..."
                            placeholderTextColor="rgba(255,255,255,0.4)"
                            value={query}
                            onChangeText={setQuery}
                            autoFocus
                            selectionColor="#3b82f6"
                        />
                        {loading && <ActivityIndicator color="#3b82f6" size="small" />}
                    </View>
                </View>
            </View>

            <FlatList
                data={results}
                renderItem={renderItem}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.list}
                ListEmptyComponent={
                    !loading ? (
                        searchError ? (
                            <View style={styles.emptyContainer}>
                                <MaterialIcons name="wifi-off" size={60} color="rgba(255,255,255,0.1)" />
                                <Text style={styles.emptyText}>Could not connect to server</Text>
                            </View>
                        ) : query.length >= 2 ? (
                            <View style={styles.emptyContainer}>
                                <MaterialIcons name="person-search" size={60} color="rgba(255,255,255,0.1)" />
                                <Text style={styles.emptyText}>No users found named "{query}"</Text>
                            </View>
                        ) : (
                            <View style={styles.emptyContainer}>
                                <Text style={styles.hintText}>Type at least 2 characters to search</Text>
                            </View>
                        )
                    ) : null
                }
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    header: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        paddingTop: Platform.OS === 'ios' ? 60 : 40, 
        paddingHorizontal: 20, 
        marginBottom: 20,
        gap: 12
    },
    backButton: { 
        width: 44, 
        height: 44, 
        justifyContent: 'center', 
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 22
    },
    searchWrapper: { flex: 1, height: 48, borderRadius: 24, overflow: 'hidden' },
    searchGlass: { ...StyleSheet.absoluteFillObject },
    searchContainer: { 
        flex: 1, 
        flexDirection: 'row', 
        alignItems: 'center', 
        paddingHorizontal: 15,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)'
    },
    searchInput: { flex: 1, color: '#fff', fontSize: 16, marginLeft: 10, height: '100%' },
    list: { paddingHorizontal: 20, paddingBottom: 60, flexGrow: 1 },
    userCard: { height: 84, borderRadius: 24, marginBottom: 16, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    glassBackground: { ...StyleSheet.absoluteFillObject },
    cardContent: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
    userInfo: { flex: 1, marginLeft: 16 },
    username: { color: '#fff', fontSize: 17, fontWeight: '700' },
    fullName: { color: 'rgba(255,255,255,0.5)', fontSize: 14, marginTop: 2 },
    connectButtonWrapper: { borderRadius: 20, overflow: 'hidden' },
    connectButton: { paddingHorizontal: 16, paddingVertical: 10, justifyContent: 'center', alignItems: 'center', minWidth: 110 },
    connectText: { color: '#fff', fontWeight: '800', fontSize: 13, letterSpacing: 0.5 },
    pendingBadge: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        backgroundColor: 'rgba(255,255,255,0.08)', 
        paddingHorizontal: 14, 
        paddingVertical: 8, 
        borderRadius: 18,
        gap: 6
    },
    pendingText: { color: 'rgba(255,255,255,0.5)', fontWeight: '600', fontSize: 13 },
    requestSentGroup: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        gap: 8 
    },
    cancelButton: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 18,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)'
    },
    cancelText: {
        color: '#ff4444',
        fontSize: 12,
        fontWeight: '700'
    },
    chatButton: { 
        width: 44, 
        height: 44, 
        borderRadius: 22, 
        overflow: 'hidden',
        shadowColor: '#22c55e',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4
    },
    chatButtonGradient: {
        flex: 1,
        justifyContent: 'center', 
        alignItems: 'center',
    },
    emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 100 },
    emptyText: { color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginTop: 16, fontSize: 16, fontWeight: '500' },
    hintText: { color: 'rgba(255,255,255,0.2)', textAlign: 'center', fontSize: 15, fontWeight: '500' }
});
