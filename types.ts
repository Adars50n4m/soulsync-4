
export interface Message {
  id: string;
  sender: 'me' | 'them';
  text: string;
  timestamp: string;
  status?: 'sent' | 'delivered' | 'read';
  reactions?: string[];
  media?: {
    type: 'image' | 'file';
    url: string;
    name?: string;
  };
}

export interface Contact {
  id: string;
  name: string;
  avatar: string;
  status: 'online' | 'offline' | 'away' | 'busy';
  lastSeen?: string;
  about?: string;
  lastMessage?: string;
  unreadCount?: number;
}

export interface StatusUpdate {
  id: string;
  contactName: string;
  avatar: string;
  time: string;
  previewImage: string;
  caption?: string;
}

export interface CallLog {
  id: string;
  contactName: string;
  avatar: string;
  type: 'incoming' | 'outgoing' | 'missed';
  callType: 'audio' | 'video';
  time: string;
}

export interface ActiveCall {
  callId?: string;
  contactId: string;
  type: 'audio' | 'video';
  isMinimized: boolean;
  startTime: number;
  isMuted: boolean;
  isSpeaker: boolean;
  isIncoming?: boolean;
  isAccepted?: boolean;
  callerName?: string;
  callerAvatar?: string;
  roomId?: string;
}

export interface Song {
  id: string;
  name: string;
  artist: string;
  image: string;
  url: string;
  duration?: number;
}

export interface MusicState {
  currentSong: Song | null;
  isPlaying: boolean;
  favorites: Song[];
}
