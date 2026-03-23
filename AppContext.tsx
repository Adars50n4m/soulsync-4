import React, { createContext, useContext, useState, useEffect } from 'react';

// Define the interface for a contact (Node)
export interface Contact {
  id: string;
  name: string;
  avatar: string;
  status: 'online' | 'offline';
  lastSeen?: string;
  lastMessage?: string;
  unreadCount?: number;
}

export interface Message {
  id: string;
  text: string;
  sender_id: string;
  timestamp: string;
  status: 'sent' | 'delivered' | 'read';
}

interface AppContextType {
  contacts: Contact[];
  setContacts: React.Dispatch<React.SetStateAction<Contact[]>>;
  messages: Record<string, Message[]>;
  setMessages: React.Dispatch<React.SetStateAction<Record<string, Message[]>>>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// Initial placeholder data for the web dashboard
const MAPPING_NODES: Contact[] = [
  { id: 'node-1', name: 'Adarsh', avatar: 'https://i.pravatar.cc/150?u=1', status: 'online' },
  { id: 'node-2', name: 'Soul AI', avatar: 'https://i.pravatar.cc/150?u=2', status: 'online' },
  { id: 'node-3', name: 'Node Beta', avatar: 'https://i.pravatar.cc/150?u=3', status: 'offline' },
  { id: 'node-4', name: 'Vector 7', avatar: 'https://i.pravatar.cc/150?u=4', status: 'online' },
  { id: 'node-5', name: 'Alpha Prime', avatar: 'https://i.pravatar.cc/150?u=5', status: 'offline' },
];

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [contacts, setContacts] = useState<Contact[]>(MAPPING_NODES);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});

  return (
    <AppContext.Provider value={{ contacts, setContacts, messages, setMessages }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
