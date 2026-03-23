import * as React from 'react';
import { useState, useEffect, createContext, useContext, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../config/supabase';
import { proxySupabaseUrl, SERVER_URL, safeFetchJson } from '../config/api';
import { chatService, type ChatMessage } from '../services/ChatService';
import { offlineService, type QueuedMessage } from '../services/LocalDBService';
import { storageService } from '../services/StorageService';
import { useAuth } from './AuthContext';
import { type Contact, type Message } from '../types';
import { socketService } from '../services/SocketService';
import { Asset } from 'expo-asset';

const SYNC_INTERVAL = 30000; // 30 seconds

const SUPERUSERS: Contact[] = [
  {
    id: 'f00f00f0-0000-0000-0000-000000000002',
    name: 'Shri Ram',
    avatar: 'https://xuipxbyvsawhuldopvjn.supabase.co/storage/v1/object/public/avatars/shri_avatar.png',
    status: 'online',
    about: 'Owner & Superuser',
    unreadCount: 0,
    lastMessage: 'Jai Shri Ram'
  },
  {
    id: 'f00f00f0-0000-0000-0000-000000000001',
    name: 'Hari',
    avatar: 'https://xuipxbyvsawhuldopvjn.supabase.co/storage/v1/object/public/avatars/hari_avatar.png',
    status: 'online',
    about: 'Owner & Superuser',
    unreadCount: 0,
    lastMessage: 'Radhe Radhe'
  }
];

const SUPERUSERS_IDS = SUPERUSERS.map(s => s.id);

interface ChatContextType {
  contacts: Contact[];
  setContacts: React.Dispatch<React.SetStateAction<Contact[]>>;
  refreshContactsFromServer: () => Promise<void>;
  messages: Record<string, Message[]>;
  onlineUsers: string[];
  typingUsers: string[];
  otherUser: any | null;
  connectivity: {
    isDeviceOnline: boolean;
    isServerReachable: boolean;
    isRealtimeConnected: boolean;
  };
  setOtherUser: (user: any) => void;
  addMessage: (chatId: string, text: string, media?: Message['media'], replyTo?: string) => Promise<void>;
  sendChatMessage: (chatId: string, text: string, media?: Message['media'], replyTo?: string, localUri?: string) => Promise<void>;
  updateMessage: (chatId: string, messageId: string, updates: Partial<Message>) => Promise<void>;
  addReaction: (chatId: string, messageId: string, emoji: string | null) => Promise<void>;
  deleteMessage: (chatId: string, messageId: string) => Promise<void>;
  toggleHeart: (chatId: string, messageId: string) => Promise<void>;
  sendTyping: (isTyping: boolean) => void;
  clearChatMessages: (partnerId: string) => Promise<void>;
  fetchOtherUserProfile: (userId: string) => Promise<void>;
  initializeChatSession: (partnerId: string) => Promise<void>;
  cleanupChatSession: (partnerId?: string) => void;
  refreshLocalCache: () => Promise<void>;
  uploadProgressTracker: Record<string, number>;
  pendingRequestsCount: number;
  updateContactPreview: (partnerId: string, message: Message) => void;
  outgoingRequestIds: string[];
  refreshRequests: () => Promise<void>;
  broadcastProfileUpdate: (updates: Partial<any>) => void;
  archiveContact: (partnerId: string, archive?: boolean) => Promise<void>;
  unfriendContact: (partnerId: string) => Promise<void>;
}

export const ChatContext = createContext<ChatContextType | undefined>(undefined);

function mapQueuedMessage(row: QueuedMessage): Message {
  return {
    id: row.id,
    sender: row.sender,
    text: row.text ?? '',
    timestamp: row.timestamp,
    status: row.status,
    media: row.media,
    replyTo: row.replyTo,
    localFileUri: row.localFileUri,
  };
}

function mapChatMessage(message: ChatMessage, currentUserId: string): Message {
  return {
    id: message.id,
    sender: message.sender_id === currentUserId ? 'me' : 'them',
    text: message.text ?? '',
    timestamp: message.timestamp,
    status: message.status,
    reactions: message.reactions,
    replyTo: message.reply_to,
    media: message.media,
    localFileUri: message.localFileUri,
  };
}

function normalizeContact(row: any): Contact {
  return {
    id: row.id,
    name: row.name ?? 'Unknown',
    avatar: row.avatar ?? '',
    status: row.status ?? 'offline',
    lastMessage: row.lastMessage ?? row.last_message ?? '',
    unreadCount: row.unreadCount ?? row.unread_count ?? 0,
    about: row.about ?? row.bio ?? '',
    lastSeen: row.lastSeen ?? row.last_seen ?? undefined,
    isArchived: !!(row.isArchived ?? row.is_archived),
  };
}

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [uploadProgressTracker, setUploadProgressTracker] = useState<Record<string, number>>({});
  const [otherUser, setOtherUser] = useState<any | null>(null);
  const [pendingRequestsCount, setPendingRequestsCount] = useState<number>(0);
  const [outgoingRequestIds, setOutgoingRequestIds] = useState<string[]>([]);
  const [connectivity, setConnectivity] = useState(chatService.getConnectivityState());
  const presenceChannelRef = useRef<any>(null);
  const activeChatIdRef = useRef<string | null>(null);

  const contactsRef = useRef<Contact[]>([]);

  const hydrateFromLocalDb = useCallback(async () => {
    try {
      const hydrationTimeout = 15000;
      await Promise.race([
        offlineService.initialize(),
        new Promise<void>((resolve) => setTimeout(() => {
          console.warn('[ChatContext] Offline DB init timed out (15s), moving on');
          resolve();
        }, hydrationTimeout))
      ]);

    } catch (e) {
      console.warn('[ChatContext] Offline DB init failed:', e);
    }

    try {
      const dbQueryTimeout = 15000;
      const [localContacts, localMessages] = (await Promise.race([
        Promise.all([
          offlineService.getContacts(),
          offlineService.getAllMessages(),
        ]),
        new Promise<[any[], any[]]>((resolve) => setTimeout(() => {
          console.warn('[ChatContext] DB queries timed out (15s)');
          resolve([[], []]);
        }, dbQueryTimeout))
      ])) as [any[], any[]];

      const grouped = (localMessages || []).reduce((acc: Record<string, Message[]>, row: any) => {
      const rawChatId = row.chatId;
      // Healing: map legacy string IDs to database UUIDs
      let normalizedChatId = rawChatId;
      if (rawChatId === 'shri') normalizedChatId = 'f00f00f0-0000-0000-0000-000000000002';
      if (rawChatId === 'hari') normalizedChatId = 'f00f00f0-0000-0000-0000-000000000001';

      if (!acc[normalizedChatId]) {
        acc[normalizedChatId] = [];
      }
      acc[normalizedChatId].push(mapQueuedMessage(row));
      return acc;
    }, {});

    (Object.values(grouped) as Message[][]).forEach((chatRows) => {
      chatRows.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    });

    const normalizedContacts = localContacts.map(normalizeContact);
    
    // Ensure all people we have messages with are in the contacts list
    // (This allows superusers or searched users to stay on home screen once messaged)
    const chatPartnerIds = Object.keys(grouped);
    for (const partnerId of chatPartnerIds) {
      if (!normalizedContacts.find(c => c.id === partnerId)) {
        // Try to finding metadata for this partner from the messages if available,
        // or we'll fetch it in the background if needed.
        const partnerMsgs = grouped[partnerId];
        const lastMsg = partnerMsgs[partnerMsgs.length - 1];
        
        // Check if this partnerId is a superuser to get better default info
        const superInfo = SUPERUSERS.find(s => s.id === partnerId);
        
        normalizedContacts.push({
          id: partnerId,
          name: superInfo?.name || 'User',
          avatar: superInfo?.avatar || '',
          status: 'offline',
          lastMessage: lastMsg.text || '',
          unreadCount: 0,
        });
      }
    }

    contactsRef.current = normalizedContacts;
    setContacts(normalizedContacts);
    setMessages(grouped);
    } catch (e) {
      console.warn('[ChatContext] hydrateFromLocalDb error:', e);
    }
  }, []);

  const refreshContactsFromServer = useCallback(async () => {
    if (!currentUser?.id) return;
    try {
      console.log('[ChatContext] Refreshing contacts from server connections...');
      const { success, data, error } = await safeFetchJson<any>(`${SERVER_URL}/api/connections`, {
        headers: { 'x-user-id': currentUser.id }
      });

      if (success && data?.success && Array.isArray(data.connections)) {
        const serverConnections = data.connections;

        // All connections returned by this API are inherently accepted
        const visibleConnections = serverConnections;

        // Save to local DB - only visible ones
        await offlineService.saveConnections(visibleConnections.map((c: any) => ({
          id: c.connection_id,
          user_1_id: currentUser.id,
          user_2_id: c.id,
          is_favorite: c.is_favorite,
          custom_name: c.custom_name,
          mute_notifications: c.mute_notifications,
          connected_at: c.connected_at
        })));

        // Transform into contacts for the UI
        const mappedContacts = visibleConnections.map((u: any) => {
          // Use server avatar URL immediately (fast - no download)
          // Background caching will happen automatically when SoulAvatar component loads
          const avatarUrl = u.avatar_url || '';

          return {
            id: u.id,
            name: u.display_name || u.username || 'Unknown',
            avatar: avatarUrl, // Use server URL directly
            status: u.is_online ? 'online' : 'offline',
            about: u.bio || '',
            lastSeen: u.last_seen
          };
        });

        // Cache avatars in background (non-blocking)
        setTimeout(() => {
          serverConnections.forEach(async (u: any) => {
            if (u.avatar_url) {
              try {
                await storageService.getAvatarUrl(u.id, u.avatar_url);
              } catch (e) {
                // Silent fail - avatar will load from server next time
              }
            }
          });
        }, 2000); // Start caching after 2 seconds

        for (const contact of mappedContacts) {
          await offlineService.saveContact(contact);
        }

        const localContacts = await offlineService.getContacts();
        const normalizedLocal = localContacts.map(normalizeContact);

        setContacts(normalizedLocal);
        console.log('[ChatContext] Contacts refreshed. Count:', normalizedLocal.length);
      } else {
        console.warn('[ChatContext] Failed to fetch server connections:', error || data?.error);
      }

      // Also refresh pending requests count and outgoing IDs
      await refreshRequests();
    } catch (err) {
      console.error('[ChatContext] refreshContactsFromServer error:', err);
    }
  }, [currentUser]);

  const refreshRequests = useCallback(async () => {
    if (!currentUser?.id) return;
    try {
      const { success, data } = await safeFetchJson<any>(`${SERVER_URL}/api/connections/requests`, {
        headers: { 'x-user-id': currentUser.id }
      });
      if (success && data?.success) {
        setPendingRequestsCount(data.incoming?.length || 0);
        // Track outgoing request IDs for Search Screen logic (be robust with receiver ID location)
        const outgoing = (data.outgoing || []).map((r: any) => 
          r.receiver_id || r.receiver?.id || r.receiver?.user_id
        ).filter(Boolean);
        
        // Use a simple array for predictable reactivity in all conditions
        setOutgoingRequestIds([...new Set<string>(outgoing)]);
        console.log('[ChatContext] Refreshed outgoing requests:', outgoing.length);
      }
    } catch (e) {
      console.warn('[ChatContext] refreshRequests error:', e);
    }
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) {
      contactsRef.current = [];
      setContacts([]);
      setMessages({});
      setTypingUsers([]);
      setOnlineUsers([]);
      setOutgoingRequestIds([]);
      activeChatIdRef.current = null;
      chatService.cleanup();
      return;
    }

    let cancelled = false;

    (async () => {
      // 1. One-time migration of legacy string IDs ('shri', 'hari') to UUIDs in local DB
      try {
        await offlineService.migrateLegacyIds({
          'shri': 'f00f00f0-0000-0000-0000-000000000002',
          'hari': 'f00f00f0-0000-0000-0000-000000000001'
        });
      } catch (err) {
        console.warn('[ChatContext] Legacy ID migration failed:', err);
      }

      await hydrateFromLocalDb();
      if (!cancelled) {
        await refreshContactsFromServer();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentUser, hydrateFromLocalDb, refreshContactsFromServer]);

  const upsertMessage = useCallback((partnerId: string, nextMessage: Message) => {
    setMessages((prev) => {
      const current = prev[partnerId] || [];
      const exists = current.find((item) => item.id === nextMessage.id);
      const updated = exists
        ? current.map((item) => (item.id === nextMessage.id ? { ...item, ...nextMessage } : item))
        : [...current, nextMessage];

      updated.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      return { ...prev, [partnerId]: updated };
    });
  }, []);

  const updateContactPreview = useCallback((partnerId: string, message: Message) => {
    const preview = message.text?.trim() || (message.media ? 'Media' : '');

    setContacts((prev) => {
      const existing = prev.find((contact) => contact.id === partnerId);
      const unreadDelta = message.sender === 'them' && activeChatIdRef.current !== partnerId ? 1 : 0;

      if (!existing) {
        // Partner not in list, add them (likely from search or fresh message)
        const superInfo = SUPERUSERS.find(s => s.id === partnerId);
        const newContact: Contact = {
          id: partnerId,
          name: superInfo?.name || 'User',
          avatar: superInfo?.avatar || '',
          status: 'offline',
          lastMessage: preview,
          unreadCount: unreadDelta,
        };
        return [...prev, newContact];
      }

      return prev.map((contact) =>
        contact.id === partnerId
          ? {
              ...contact,
              lastMessage: preview,
              unreadCount: Math.max(0, (contact.unreadCount || 0) + unreadDelta),
            }
          : contact
      );
    });
  }, []);

  const handleIncomingMessage = useCallback((message: ChatMessage) => {
    if (!currentUser) return;

    const partnerId =
      message.sender_id === currentUser.id ? message.receiver_id : message.sender_id;
    const normalized = mapChatMessage(message, currentUser.id);

    upsertMessage(partnerId, normalized);
    updateContactPreview(partnerId, normalized);
  }, [currentUser, updateContactPreview, upsertMessage]);

  const handleStatusUpdate = useCallback((messageId: string, status: ChatMessage['status'], newId?: string) => {
    setMessages((prev) => {
      const nextState = { ...prev };

      for (const chatId of Object.keys(nextState)) {
        const chatRows = nextState[chatId];
        const hasMatch = chatRows.some((message) => message.id === messageId || (!!newId && message.id === newId));
        if (!hasMatch) continue;

        nextState[chatId] = chatRows.map((message) => {
          if (message.id !== messageId && (!newId || message.id !== newId)) {
            return message;
          }

          return {
            ...message,
            id: newId && message.id === messageId ? newId : message.id,
            status,
          };
        });
      }

      return nextState;
    });
  }, []);

  const initializeChatSession = useCallback(async (partnerId: string) => {
    if (!currentUser) return;

    activeChatIdRef.current = partnerId;
    await chatService.initialize(
      currentUser.id,
      partnerId,
      currentUser.name,
      handleIncomingMessage,
      handleStatusUpdate,
      () => setConnectivity(chatService.getConnectivityState()),
      (msgId, progress) => {
        setUploadProgressTracker(prev => ({ ...prev, [msgId]: progress }));
      }
    );
    setConnectivity(chatService.getConnectivityState());

    const existingMessages = await offlineService.getMessages(partnerId, 500);
    setMessages((prev) => ({
      ...prev,
      [partnerId]: existingMessages.map(mapQueuedMessage),
    }));
  }, [currentUser, handleIncomingMessage, handleStatusUpdate]);

  const cleanupChatSession = useCallback((partnerId?: string) => {
    if (!partnerId || activeChatIdRef.current === partnerId) {
      activeChatIdRef.current = null;
      chatService.cleanup();
      setConnectivity(chatService.getConnectivityState());
    }
  }, []);

  useEffect(() => {
    if (!currentUser) return;

    const channel = supabase.channel('presence-global', {
      config: { presence: { key: currentUser.id } },
    });
    presenceChannelRef.current = channel;

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      const users = new Set<string>();

      Object.values(state).forEach((presences: any) => {
        presences.forEach((presence: any) => {
          if (presence.user_id) {
            users.add(presence.user_id);
          }
        });
      });

      const uniqueUsers = Array.from(users);
      setOnlineUsers(uniqueUsers);
      setContacts((prev) =>
        prev.map((contact) => ({
          ...contact,
          status: uniqueUsers.includes(contact.id) ? 'online' : 'offline',
        }))
      );
      // We can also fetch statuses or basic profile data for online users if needed, 
      // but for now, just tracking IDs is enough for "online" indicator.
    });

    channel.on('broadcast', { event: 'typing' }, ({ payload }) => {
      // Only show typing if they are typing to US specifically (or fallback for older clients)
      if (payload.userId !== currentUser.id && (!payload.toUserId || payload.toUserId === currentUser.id)) {
        setTypingUsers((prev) => Array.from(new Set([...prev, payload.userId])));
      }
    });

    channel.on('broadcast', { event: 'stop-typing' }, ({ payload }) => {
      setTypingUsers((prev) => prev.filter((id) => id !== payload.userId));
    });

    channel.on('broadcast', { event: 'profile:update' }, ({ payload }) => {
      const { userId, updates } = payload;
      if (!userId || !updates) return;

      console.log('[ChatContext] Received profile:update broadcast:', userId, updates);

      setContacts((prev) => {
        let updated = false;
        const newContacts = prev.map((c) => {
          if (c.id === userId) {
            updated = true;
            return { ...c, ...updates };
          }
          return c;
        });

        if (updated) {
          const contact = newContacts.find((c) => c.id === userId);
          if (contact) {
            // Persist the updated contact info to SQLite instantly
            offlineService.saveContact(contact).catch(e => console.warn('Failed to save contact via broadcast', e));
          }
        }
        return newContacts;
      });

      setOtherUser((prev: any) => {
        if (prev && prev.id === userId) {
          return { ...prev, ...updates };
        }
        return prev;
      });
    });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ user_id: currentUser.id, online_at: new Date().toISOString() });
      }
    });

    return () => {
      channel.untrack();
      supabase.removeChannel(channel);
    };
  }, [currentUser]);

  // Listen for connection events via SocketService
  useEffect(() => {
    if (!currentUser?.id) return;

    // Initialize socket connection
    socketService.initialize(currentUser.id);

    const handleSocketEvent = (event: string, payload: any) => {
      switch (event) {
        case 'connection:request_accepted':
          console.log('[ChatContext] Received connection:request_accepted:', payload);
          refreshContactsFromServer();
          break;
        case 'connection:request_received':
          console.log('[ChatContext] Received connection:request_received:', payload);
          refreshContactsFromServer();
          break;
        case 'connection:request_rejected':
          console.log('[ChatContext] Received connection:request_rejected:', payload);
          refreshContactsFromServer();
          break;
      }
    };

    socketService.addListener(handleSocketEvent);

    return () => {
      socketService.removeListener(handleSocketEvent);
    };
  }, [currentUser?.id, refreshContactsFromServer]);

  // Initial refresh and periodic check for reliability
  useEffect(() => {
    if (currentUser) {
      refreshContactsFromServer();
      const interval = setInterval(refreshContactsFromServer, SYNC_INTERVAL);
      return () => clearInterval(interval);
    }
  }, [currentUser, refreshContactsFromServer]);

  const sendChatMessage = useCallback(async (chatId: string, text: string, media?: Message['media'], replyTo?: string, localUri?: string) => {
    if (!currentUser) return;

    if (activeChatIdRef.current !== chatId) {
      await initializeChatSession(chatId);
    }

    const sent = await chatService.sendMessage(chatId, text, media, replyTo, localUri);
    if (sent) {
      const normalized = mapChatMessage(sent, currentUser.id);
      upsertMessage(chatId, normalized);
      updateContactPreview(chatId, normalized);
    }
  }, [currentUser, initializeChatSession, updateContactPreview, upsertMessage]);

  const updateMessage = useCallback(async (chatId: string, messageId: string, updates: Partial<Message>) => {
    if (!chatId) return;
    
    setMessages((prev) => {
      const chatMsgs = prev[chatId];
      if (!chatMsgs) return prev;
      
      return {
        ...prev,
        [chatId]: chatMsgs.map((message) =>
          message.id === messageId ? { ...message, ...updates } : message
        ),
      };
    });

    if (updates.localFileUri) {
      await offlineService.updateMessageLocalUri(messageId, updates.localFileUri);
    }
  }, []);

  const addReaction = useCallback(async (chatId: string, messageId: string, emoji: string | null) => {
    setMessages((prev) => ({
      ...prev,
      [chatId]: (prev[chatId] || []).map((message) =>
        message.id === messageId
          ? {
              ...message,
              reactions: emoji ? [emoji] : [],
            }
          : message
      ),
    }));

    await offlineService.updateMessageReaction(messageId, emoji);
  }, []);

  const deleteMessage = useCallback(async (chatId: string, messageId: string) => {
    setMessages((prev) => ({
      ...prev,
      [chatId]: (prev[chatId] || []).filter((message) => message.id !== messageId),
    }));

    await offlineService.deleteMessage(messageId);
  }, []);

  const toggleHeart = useCallback(async (chatId: string, messageId: string) => {
    const current = messages[chatId]?.find((message) => message.id === messageId);
    const nextEmoji = current?.reactions?.[0] === '❤️' ? null : '❤️';
    await addReaction(chatId, messageId, nextEmoji);
  }, [addReaction, messages]);

  const sendTyping = useCallback((isTyping: boolean) => {
    if (!currentUser || !activeChatIdRef.current) return;

    presenceChannelRef.current?.send({
      type: 'broadcast',
      event: isTyping ? 'typing' : 'stop-typing',
      payload: { userId: currentUser.id, toUserId: activeChatIdRef.current },
    });
  }, [currentUser]);

  const broadcastProfileUpdate = useCallback((updates: Partial<any>) => {
    if (!currentUser) return;
    presenceChannelRef.current?.send({
      type: 'broadcast',
      event: 'profile:update',
      payload: { userId: currentUser.id, updates }
    });
  }, [currentUser]);

  const clearChatMessages = useCallback(async (partnerId: string) => {
    await offlineService.clearChat(partnerId);

    setMessages((prev) => ({
      ...prev,
      [partnerId]: [],
    }));

    setContacts((prev) =>
      prev.map((contact) =>
        contact.id === partnerId
          ? { ...contact, lastMessage: '', unreadCount: 0 }
          : contact
      )
    );
  }, []);

  const archiveContact = useCallback(async (partnerId: string, archive: boolean = true) => {
    await offlineService.archiveContact(partnerId, archive);
    setContacts(prev => prev.map(c => c.id === partnerId ? { ...c, isArchived: archive } : c));
  }, []);

  const unfriendContact = useCallback(async (partnerId: string) => {
    try {
      const response = await fetch(`${SERVER_URL}/api/connections/${partnerId}`, {
        method: 'DELETE',
        headers: {
          'x-user-id': currentUser?.id || '',
        }
      });
      const data = await response.json() as any;
      if (data.success) {
        // Remove from local contacts
        setContacts(prev => prev.filter(c => c.id !== partnerId));
        // Clear chat history
        await clearChatMessages(partnerId);
      }
    } catch (err) {
      console.error('[ChatContext] unfriendContact error:', err);
    }
  }, [currentUser, clearChatMessages]);

  const fetchOtherUserProfile = useCallback(async (userId: string) => {
    try {
      if (!supabase) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.warn(`[ChatContext] Could not fetch profile for ${userId}:`, error.message);
        return null;
      }
      setOtherUser({
        id: data.id,
        name: data.display_name || data.name || 'User',
        avatar: proxySupabaseUrl(data.avatar_url),
        bio: data.bio || 'Forever in sync',
      });
      return data;
    } catch (err) {
      console.error('[ChatContext] fetchOtherUserProfile error:', err);
      return null;
    }
  }, [supabase]);

  const value = useMemo<ChatContextType>(() => ({
    contacts,
    setContacts,
    refreshContactsFromServer,
    messages,
    onlineUsers,
    typingUsers,
    uploadProgressTracker,
    otherUser,
    connectivity,
    setOtherUser,
    addMessage: sendChatMessage,
    sendChatMessage,
    updateMessage,
    addReaction,
    deleteMessage,
    toggleHeart,
    sendTyping,
    clearChatMessages,
    fetchOtherUserProfile,
    initializeChatSession,
    cleanupChatSession,
    refreshLocalCache: hydrateFromLocalDb,
    pendingRequestsCount,
    updateContactPreview,
    outgoingRequestIds,
    refreshRequests,
    broadcastProfileUpdate,
    archiveContact,
    unfriendContact,
  }), [
    contacts,
    messages,
    onlineUsers,
    typingUsers,
    uploadProgressTracker,
    otherUser,
    connectivity,
    sendChatMessage,
    updateMessage,
    addReaction,
    deleteMessage,
    toggleHeart,
    sendTyping,
    clearChatMessages,
    fetchOtherUserProfile,
    initializeChatSession,
    cleanupChatSession,
    hydrateFromLocalDb,
    pendingRequestsCount,
    updateContactPreview,
    outgoingRequestIds,
    refreshRequests,
    broadcastProfileUpdate,
    archiveContact,
    unfriendContact,
  ]);

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
};
