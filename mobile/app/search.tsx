import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Platform, Alert } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { SERVER_URL, proxySupabaseUrl } from '../config/api';
import { supabase } from '../config/supabase';
import { useApp } from '../context/AppContext';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import GlassView from '../components/ui/GlassView';
import { SoulAvatar } from '../components/SoulAvatar';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';

export default function SearchScreen() {
    const { currentUser, activeTheme } = useApp();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchError, setSearchError] = useState<string | null>(null);
    const router = useRouter();
    const debounceRef = useRef<NodeJS.Timeout | null>(null);

    const searchUsers = useCallback(async (text: string) => {
        if (text.length < 2) {
            setResults([]);
            setSearchError(null);
            return;
        }
        setLoading(true);
        setSearchError(null);
        const userId = currentUser?.id || '';

        try {
            // Try server with 2s timeout (no retries — instant fallback)
            let serverOk = false;
            try {
                const ctrl = new AbortController();
                const tid = setTimeout(() => ctrl.abort(), 2000);
                const res = await fetch(
                    `${SERVER_URL}/api/users/search?query=${encodeURIComponent(text)}`,
                    { headers: { 'x-user-id': userId }, signal: ctrl.signal }
                );
                clearTimeout(tid);
                if (res.ok) {
                    const data = await res.json();
                    if (data?.success) {
                        setResults(data.users || []);
                        serverOk = true;
                    }
                }
            } catch (_) {}

            if (serverOk) return;

            // Direct Supabase search (instant)
            const { data: profiles, error: sbError } = await supabase
                .from('profiles')
                .select('id, username, display_name, name, avatar_url')
                .or(`username.ilike.%${text}%,display_name.ilike.%${text}%,name.ilike.%${text}%`)
                .neq('id', userId)
                .limit(20);

            if (sbError) throw sbError;

            // Enrich with connection status (parallel queries)
            const userIds = (profiles || []).map((p: any) => p.id);
            let statusMap: Record<string, string> = {};

            if (userIds.length > 0) {
                const [connRes, reqRes] = await Promise.all([
                    supabase.from('connections').select('user_1_id, user_2_id')
                        .or(`user_1_id.eq.${userId},user_2_id.eq.${userId}`),
                    supabase.from('connection_requests').select('sender_id, receiver_id, status')
                        .eq('status', 'pending')
                        .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`),
                ]);

                (connRes.data || []).forEach((c: any) => {
                    const otherId = c.user_1_id === userId ? c.user_2_id : c.user_1_id;
                    if (userIds.includes(otherId)) statusMap[otherId] = 'connected';
                });
                (reqRes.data || []).forEach((r: any) => {
                    if (r.sender_id === userId && userIds.includes(r.receiver_id) && !statusMap[r.receiver_id]) {
                        statusMap[r.receiver_id] = 'request_sent';
                    } else if (r.receiver_id === userId && userIds.includes(r.sender_id) && !statusMap[r.sender_id]) {
                        statusMap[r.sender_id] = 'request_received';
                    }
                });
            }

            setResults((profiles || []).map((p: any) => ({
                ...p,
                connectionStatus: statusMap[p.id] || 'not_connected',
            })));
        } catch (err: any) {
            setSearchError(err?.message || 'Search failed');
        } finally {
            setLoading(false);
        }
    }, [currentUser]);

    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => searchUsers(query), 200);
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, [query, searchUsers]);

    const sendRequest = async (receiverId: string) => {
        // Optimistic UI — update instantly
        setResults(prev => prev.map(u => u.id === receiverId ? { ...u, connectionStatus: 'request_sent' } : u));

        try {
            const { error: reqErr } = await supabase.from('connection_requests')
                .insert({ sender_id: currentUser?.id, receiver_id: receiverId, status: 'pending' });

            if (reqErr) {
                // Revert on error
                setResults(prev => prev.map(u => u.id === receiverId ? { ...u, connectionStatus: 'not_connected' } : u));
                Alert.alert('Error', reqErr.message);
            }
        } catch (err: any) {
            setResults(prev => prev.map(u => u.id === receiverId ? { ...u, connectionStatus: 'not_connected' } : u));
            Alert.alert('Error', err?.message || 'Request failed');
        }
    };

    const cancelRequest = async (receiverId: string) => {
        // Optimistic UI
        setResults(prev => prev.map(u => u.id === receiverId ? { ...u, connectionStatus: 'not_connected' } : u));

        try {
            await supabase.from('connection_requests')
                .delete()
                .eq('sender_id', currentUser?.id || '')
                .eq('receiver_id', receiverId)
                .eq('status', 'pending');
        } catch (err: any) {
            setResults(prev => prev.map(u => u.id === receiverId ? { ...u, connectionStatus: 'request_sent' } : u));
            Alert.alert('Error', err?.message || 'Cancel failed');
        }
    };

    const handleAccept = async (senderId: string) => {
        setResults(prev => prev.map(u => u.id === senderId ? { ...u, connectionStatus: 'connected' } : u));
        try {
            // Direct Supabase — fast
            const { data: pendingReq } = await supabase.from('connection_requests')
                .select('id').eq('sender_id', senderId).eq('receiver_id', currentUser?.id || '').eq('status', 'pending').single();

            if (pendingReq) {
                await supabase.from('connection_requests')
                    .update({ status: 'accepted', responded_at: new Date().toISOString() })
                    .eq('id', pendingReq.id);
                const ids = [currentUser?.id || '', senderId].sort();
                await supabase.from('connections')
                    .upsert({ user_1_id: ids[0], user_2_id: ids[1] }, { onConflict: 'user_1_id,user_2_id' });
            }
        } catch (err: any) {
            setResults(prev => prev.map(u => u.id === senderId ? { ...u, connectionStatus: 'request_received' } : u));
            Alert.alert('Error', err?.message || 'Accept failed');
        }
    };

    const renderItem = useCallback(({ item, index }: { item: any; index: number }) => (
        <Animated.View entering={FadeInDown.delay(Math.min(index * 40, 200)).duration(300)}>
            <View style={styles.userCard}>
                <GlassView intensity={25} tint="dark" style={styles.glassBackground} />
                <View style={styles.cardContent}>
                    <SoulAvatar uri={proxySupabaseUrl(item.avatar_url)} size={52} />
                    <View style={styles.userInfo}>
                        <Text style={styles.username}>{item.username}</Text>
                        <Text style={styles.fullName}>{item.display_name || item.name || `@${item.username}`}</Text>
                    </View>

                    {item.connectionStatus === 'not_connected' && (
                        <TouchableOpacity style={styles.connectButtonWrapper} onPress={() => sendRequest(item.id)} disabled={false}>
                            <LinearGradient colors={[activeTheme.primary, activeTheme.accent]} style={styles.connectButton}>
                                <Text style={styles.connectText}>Request</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    )}

                    {item.connectionStatus === 'request_sent' && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: '600' }}>Requested</Text>
                            <TouchableOpacity
                                onPress={() => cancelRequest(item.id)}
                                disabled={false}
                                style={styles.cancelBtnSmall}
                            >
                                <MaterialIcons name="close" size={18} color="#ff4444" />
                            </TouchableOpacity>
                        </View>
                    )}

                    {item.connectionStatus === 'request_received' && (
                        <TouchableOpacity style={styles.connectButtonWrapper} onPress={() => handleAccept(item.id)} disabled={false}>
                            <LinearGradient colors={['#22c55e', '#16a34a']} style={[styles.connectButton, { opacity: 0.9 }]}>
                                <Text style={styles.connectText}>Accept</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    )}

                    {item.connectionStatus === 'connected' && (
                        <TouchableOpacity style={styles.chatButton} onPress={() => router.push(`/chat/${item.id}`)}>
                            <LinearGradient colors={[activeTheme.primary, activeTheme.accent]} style={styles.chatButtonGradient}>
                                <MaterialIcons name="chat" size={20} color="#fff" />
                            </LinearGradient>
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        </Animated.View>
    ), [activeTheme, sendRequest, cancelRequest, handleAccept, router]);

    return (
        <View style={styles.container}>
            <LinearGradient colors={['#000000', '#080808']} style={StyleSheet.absoluteFill} />
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton} activeOpacity={0.7}>
                    <MaterialIcons name="arrow-back-ios" size={20} color="#fff" />
                </TouchableOpacity>
                <View style={styles.searchWrapper}>
                    <GlassView intensity={30} tint="dark" style={styles.searchGlass} />
                    <View style={styles.searchContainer}>
                        <MaterialIcons name="search" size={20} color={activeTheme.primary} />
                        <TextInput
                            style={styles.searchInput}
                            placeholder="Find Soulmates..."
                            placeholderTextColor="rgba(255,255,255,0.4)"
                            value={query}
                            onChangeText={setQuery}
                            autoFocus
                            selectionColor={activeTheme.primary}
                        />
                        {query.length > 0 && (
                            <TouchableOpacity onPress={() => setQuery('')} style={{ marginRight: 8 }}>
                                <Ionicons name="close-circle" size={20} color="rgba(255,255,255,0.3)" />
                            </TouchableOpacity>
                        )}
                        {loading && <ActivityIndicator color={activeTheme.primary} size="small" />}
                    </View>
                </View>
            </View>

            <FlashList
                data={results}
                renderItem={renderItem}
                keyExtractor={item => item.id}
                estimatedItemSize={84}
                contentContainerStyle={styles.list}
                ListEmptyComponent={
                    !loading && query.length >= 2 ? (
                        <View style={styles.emptyContainer}>
                            <MaterialIcons name="person-search" size={60} color="rgba(255,255,255,0.1)" />
                            <Text style={styles.emptyText}>
                                {searchError ? 'Could not connect to server' : `No users found named "${query}"`}
                            </Text>
                        </View>
                    ) : !loading && query.length < 2 ? (
                        <View style={styles.emptyContainer}>
                            <Text style={styles.hintText}>Type at least 2 characters to search</Text>
                        </View>
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
        width: 44, height: 44, justifyContent: 'center', alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 22,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)'
    },
    searchWrapper: { flex: 1, height: 48, borderRadius: 24, overflow: 'hidden' },
    searchGlass: { ...StyleSheet.absoluteFillObject },
    searchContainer: {
        flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)'
    },
    searchInput: { flex: 1, color: '#fff', fontSize: 16, marginLeft: 10, height: '100%' },
    list: { paddingHorizontal: 20, paddingBottom: 60 },
    userCard: { height: 84, borderRadius: 24, marginBottom: 16, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
    glassBackground: { ...StyleSheet.absoluteFillObject },
    cardContent: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
    userInfo: { flex: 1, marginLeft: 16 },
    username: { color: '#fff', fontSize: 17, fontWeight: '700' },
    fullName: { color: 'rgba(255,255,255,0.5)', fontSize: 14, marginTop: 2 },
    connectButtonWrapper: { borderRadius: 20, overflow: 'hidden' },
    connectButton: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, minWidth: 90, alignItems: 'center' },
    connectText: { color: '#fff', fontWeight: '800', fontSize: 13, letterSpacing: 0.5 },
    cancelBtnSmall: {
        width: 32, height: 32, borderRadius: 16,
        backgroundColor: 'rgba(255, 68, 68, 0.12)',
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: 'rgba(255, 68, 68, 0.2)',
    },
    chatButton: {
        width: 44, height: 44, borderRadius: 22, overflow: 'hidden',
        shadowColor: '#3b82f6', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4
    },
    chatButtonGradient: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 100 },
    emptyText: { color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginTop: 16, fontSize: 16, fontWeight: '500' },
    hintText: { color: 'rgba(255,255,255,0.2)', textAlign: 'center', fontSize: 15, fontWeight: '500' }
});
