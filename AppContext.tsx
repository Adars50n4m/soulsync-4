
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Message, Contact, StatusUpdate, CallLog, ActiveCall, Song, MusicState } from './types.ts';
import { getSocket } from './src/webrtc/socket';

export type ThemeName = 'midnight' | 'liquid-blue' | 'sunset' | 'emerald' | 'cyber' | 'amethyst';

interface ThemeConfig {
  primary: string;
  accent: string;
  bg: string;
}

export const THEMES: Record<ThemeName, ThemeConfig> = {
  'midnight': { primary: '#f43f5e', accent: '#a855f7', bg: '#09090b' },
  'liquid-blue': { primary: '#135bec', accent: '#00f2ff', bg: '#020408' },
  'sunset': { primary: '#803c00ff', accent: '#fb923c', bg: '#120202' },
  'emerald': { primary: '#10b981', accent: '#2dd4bf', bg: '#02120e' },
  'cyber': { primary: '#d4ff00', accent: '#00e5ff', bg: '#050505' },
  'amethyst': { primary: '#d946ef', accent: '#6366f1', bg: '#0a050f' },
};

interface AppContextType {
  contacts: Contact[];
  messages: Record<string, Message[]>;
  calls: CallLog[];
  statuses: StatusUpdate[];
  userName: string;
  userAvatar: string;
  theme: ThemeName;
  activeCall: ActiveCall | null;
  musicState: MusicState;
  addMessage: (chatId: string, text: string, sender: 'me' | 'them', media?: Message['media']) => string;
  updateMessage: (chatId: string, messageId: string, text: string) => void;
  updateMessageStatus: (chatId: string, messageId: string, status: 'sent' | 'delivered' | 'read') => void;
  deleteMessage: (chatId: string, messageId: string) => void;
  addReaction: (chatId: string, messageId: string, emoji: string) => void;
  addCall: (call: Omit<CallLog, 'id'>) => void;
  addStatus: (status: Omit<StatusUpdate, 'id'>) => void;
  addContact: (name: string, avatar?: string) => void;
  updateUserName: (name: string) => void;
  updateUserAvatar: (base64: string) => void;
  setTheme: (theme: ThemeName) => void;
  startCall: (contactId: string, type: 'audio' | 'video') => void;
  endCall: () => void;
  toggleMinimizeCall: (val: boolean) => void;
  toggleMute: () => void;
  playSong: (song: Song) => void;
  togglePlayMusic: () => void;
  toggleFavoriteSong: (song: Song) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const INITIAL_CONTACTS: Contact[] = [
  {
    id: 'shri',
    name: 'SHRI',
    avatar: 'https://images.unsplash.com/photo-1531427186611-ecfd6d936c79?q=80&w=200&h=200&fit=crop',
    status: 'online',
    lastMessage: '',
    unreadCount: 0,
  }
];

const INITIAL_MESSAGES: Record<string, Message[]> = {};

const isLocalStorageAvailable = () => {
  try {
    const test = '__storage_test__';
    window.localStorage.setItem(test, test);
    window.localStorage.removeItem(test);
    return true;
  } catch (e) {
    return false;
  }
};

const storageAvailable = isLocalStorageAvailable();

const safeParse = <T,>(key: string, fallback: T): T => {
  if (!storageAvailable) return fallback;
  try {
    const item = localStorage.getItem(key);
    if (!item) return fallback;
    const parsed = JSON.parse(item);
    return parsed;
  } catch (e) {
    return fallback;
  }
};

const safeSet = (key: string, value: any) => {
  if (!storageAvailable) return;
  try {
    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
  } catch (e) {
    console.warn('Storage failed:', e);
  }
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [contacts, setContacts] = useState<Contact[]>(() => safeParse('ss_contacts', INITIAL_CONTACTS));
  const [messages, setMessages] = useState<Record<string, Message[]>>(() => safeParse('ss_messages', INITIAL_MESSAGES));
  const [calls, setCalls] = useState<CallLog[]>(() => safeParse('ss_calls', []));
  const [statuses, setStatuses] = useState<StatusUpdate[]>(() => safeParse('ss_statuses', []));
  const [userName, setUserName] = useState(() => (storageAvailable ? localStorage.getItem('ss_username') : null) || 'Sync User');
  const [userAvatar, setUserAvatar] = useState(() => (storageAvailable ? localStorage.getItem('ss_user_avatar') : null) || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=200');
  const [theme, setThemeState] = useState<ThemeName>(() => (storageAvailable ? localStorage.getItem('ss_theme') as ThemeName : null) || 'midnight');
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);

  const [musicState, setMusicState] = useState<MusicState>(() => ({
    currentSong: null,
    isPlaying: false,
    favorites: safeParse('ss_favorites', [])
  }));

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }
    const audio = audioRef.current;

    if (musicState.currentSong && musicState.isPlaying) {
      if (audio.src !== musicState.currentSong.url) {
        audio.src = musicState.currentSong.url;
      }
      audio.play().catch(console.error);
    } else {
      audio.pause();
    }
  }, [musicState.currentSong, musicState.isPlaying]);

  // Socket.io Signaling Setup
  useEffect(() => {
    const socket = getSocket();
    const myId = userName || 'Sync User';

    // Register mapping for P2P calls
    socket.emit('register', myId);

    const handleIncomingCall = (data: { callerId: string, roomId: string, callType: 'audio' | 'video' }) => {
      const { callerId, roomId, callType } = data;
      console.log('Incoming call from:', callerId);

      const callerContact = contacts.find(c => c.id === callerId) || {
        id: callerId,
        name: callerId,
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${callerId}`,
        status: 'online'
      } as Contact;

      setActiveCall({
        contactId: callerId,
        type: callType,
        isMinimized: false,
        startTime: Date.now(),
        isMuted: false,
        isSpeaker: false,
        isIncoming: true,
        isAccepted: false,
        callerName: callerContact.name,
        callerAvatar: callerContact.avatar,
        roomId
      });
    };

    socket.on('incoming-call', handleIncomingCall);
    return () => {
      socket.off('incoming-call', handleIncomingCall);
    };
  }, [contacts, userName]);

  const playSong = (song: Song) => {
    setMusicState(prev => ({ ...prev, currentSong: song, isPlaying: true }));
  };

  const togglePlayMusic = () => {
    setMusicState(prev => ({ ...prev, isPlaying: !prev.isPlaying }));
  };

  const toggleFavoriteSong = (song: Song) => {
    setMusicState(prev => {
      const isFav = prev.favorites.some(s => s.id === song.id);
      const newFavs = isFav
        ? prev.favorites.filter(s => s.id !== song.id)
        : [...prev.favorites, song];
      safeSet('ss_favorites', newFavs);
      return { ...prev, favorites: newFavs };
    });
  };

  useEffect(() => {
    safeSet('ss_username', userName);
    safeSet('ss_user_avatar', userAvatar);
  }, [userName, userAvatar]);

  useEffect(() => {
    safeSet('ss_theme', theme);
    const config = THEMES[theme];
    const root = document.documentElement;
    root.style.setProperty('--color-primary', config.primary);
    root.style.setProperty('--color-accent', config.accent);
    root.style.setProperty('--color-bg', config.bg);
  }, [theme]);

  useEffect(() => {
    safeSet('ss_contacts', contacts);
    safeSet('ss_messages', messages);
    safeSet('ss_calls', calls);
    safeSet('ss_statuses', statuses);
  }, [contacts, messages, calls, statuses]);

  const addMessage = (chatId: string, text: string, sender: 'me' | 'them', media?: Message['media']) => {
    const messageId = Date.now().toString();
    const newMessage: Message = {
      id: messageId,
      sender,
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: sender === 'me' ? 'sent' : undefined,
      media,
    };

    setMessages((prev) => {
      const newChatMessages = [...(prev[chatId] || []), newMessage];
      const updatedMessages = { ...prev, [chatId]: newChatMessages };

      setContacts(prevContacts => prevContacts.map(c =>
        c.id === chatId ? { ...c, lastMessage: media ? (media.type === 'image' ? 'Sent an image' : `Sent ${media.name}`) : text, unreadCount: sender === 'them' ? (c.unreadCount || 0) + 1 : 0 } : c
      ));

      return updatedMessages;
    });

    return messageId;
  };

  const updateMessage = (chatId: string, messageId: string, text: string) => {
    setMessages((prev) => {
      const chatMessages = prev[chatId] || [];
      const updatedMessages = chatMessages.map((msg) =>
        msg.id === messageId ? { ...msg, text } : msg
      );
      return { ...prev, [chatId]: updatedMessages };
    });
  };

  const updateMessageStatus = (chatId: string, messageId: string, status: 'sent' | 'delivered' | 'read') => {
    setMessages((prev) => {
      const chatMessages = prev[chatId] || [];
      const updatedMessages = chatMessages.map((msg) =>
        msg.id === messageId ? { ...msg, status } : msg
      );
      return { ...prev, [chatId]: updatedMessages };
    });
  };

  const deleteMessage = (chatId: string, messageId: string) => {
    setMessages((prev) => {
      const chatMessages = prev[chatId] || [];
      const filteredMessages = chatMessages.filter(m => m.id !== messageId);
      const lastMsg = filteredMessages[filteredMessages.length - 1];

      setContacts(prevContacts => prevContacts.map(c =>
        c.id === chatId ? { ...c, lastMessage: lastMsg ? (lastMsg.media ? (lastMsg.media.type === 'image' ? 'Sent an image' : `Sent ${lastMsg.media.name}`) : lastMsg.text) : '' } : c
      ));

      return { ...prev, [chatId]: filteredMessages };
    });
  };

  const addReaction = (chatId: string, messageId: string, emoji: string) => {
    setMessages((prev) => {
      const chatMessages = prev[chatId] || [];
      const updatedMessages = chatMessages.map((msg) => {
        if (msg.id === messageId) {
          const reactions = msg.reactions || [];
          const newReactions = reactions.includes(emoji)
            ? reactions.filter((r) => r !== emoji)
            : [...reactions, emoji];
          return { ...msg, reactions: newReactions };
        }
        return msg;
      });
      return { ...prev, [chatId]: updatedMessages };
    });
  };

  const addCall = (call: Omit<CallLog, 'id'>) => {
    setCalls((prev) => [{ ...call, id: Date.now().toString() }, ...prev]);
  };

  const startCall = (contactId: string, type: 'audio' | 'video') => {
    const myId = userName || 'Sync User';
    const roomId = `callRoom-${[myId, contactId].sort().join('-')}`;

    const socket = getSocket();
    socket.emit('join-call', roomId); // Caller joins immediately
    socket.emit('call-request', {
      callerId: myId,
      calleeId: contactId,
      roomId,
      callType: type
    });

    setActiveCall({
      contactId,
      type,
      isMinimized: false,
      startTime: Date.now(),
      isMuted: false,
      isSpeaker: false,
      isIncoming: false,
      isAccepted: true,
      roomId
    });
  };

  const endCall = () => {
    if (activeCall) {
      // Notify the signaling server so the remote peer is informed
      try {
        const socket = getSocket();
        if (socket.connected) {
          const roomId = activeCall.roomId || `callRoom-${activeCall.contactId}`; // Fallback for safety
          socket.emit('end-call', roomId);
        }
      } catch (e) {
        // Socket may not be initialized, safe to ignore
      }

      const contact = contacts.find(c => c.id === activeCall.contactId);
      addCall({
        contactName: contact?.name || 'Unknown',
        avatar: contact?.avatar || '',
        type: 'outgoing',
        callType: activeCall.type,
        time: 'Just now'
      });
    }
    setActiveCall(null);
  };

  const toggleMinimizeCall = (val: boolean) => {
    setActiveCall(prev => prev ? { ...prev, isMinimized: val } : null);
  };

  const toggleMute = () => {
    setActiveCall(prev => prev ? { ...prev, isMuted: !prev.isMuted } : null);
  };

  const addStatus = (status: Omit<StatusUpdate, 'id'>) => {
    setStatuses((prev) => [{ ...status, id: Date.now().toString() }, ...prev]);
  };

  const addContact = (name: string, avatar?: string) => {
    const newContact: Contact = {
      id: `user-${Date.now()}`,
      name: name.toUpperCase(),
      avatar: avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`,
      status: 'online',
      about: 'Connected.',
      lastMessage: ''
    };
    setContacts(prev => [newContact, ...prev]);
    setMessages(prev => ({ ...prev, [newContact.id]: [] }));
  };

  const updateUserName = (name: string) => setUserName(name);

  const updateUserAvatar = (base64: string) => {
    setUserAvatar(base64);
  };

  const setTheme = (newTheme: ThemeName) => setThemeState(newTheme);

  return (
    <AppContext.Provider value={{
      contacts, messages, calls, statuses, userName, userAvatar, theme, activeCall, musicState,
      addMessage, updateMessage, updateMessageStatus, deleteMessage, addReaction, addCall, addStatus, addContact, updateUserName, updateUserAvatar, setTheme,
      startCall, endCall, toggleMinimizeCall, toggleMute,
      playSong, togglePlayMusic, toggleFavoriteSong
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within an AppProvider');
  return context;
};
