import * as React from 'react';
import { useState, useEffect, createContext, useContext, useCallback, useMemo } from 'react';
import { statusService } from '../services/StatusService';
import { useAuth } from './AuthContext';
import { type StatusUpdate } from '../types';

interface StatusContextType {
  stories: StatusUpdate[];
  notes: any[];
  refreshStatuses: () => Promise<void>;
  addStory: (params: { mediaUrl: string; mediaType: 'image' | 'video'; caption?: string; music?: any }) => Promise<boolean>;
  updateNote: (text: string | null) => Promise<boolean>;
  deleteStory: (id: string) => Promise<void>;
  toggleStoryLike: (id: string) => Promise<void>;
  viewStory: (id: string) => Promise<void>;
}

export const StatusContext = createContext<StatusContextType | undefined>(undefined);

export const StatusProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const [stories, setStories] = useState<StatusUpdate[]>([]);
  const [notes, setNotes] = useState<any[]>([]);

  const refreshStatuses = useCallback(async () => {
    if (!currentUser) return;
    
    try {
      const [fetchedStories, fetchedNotes] = await Promise.all([
        statusService.fetchActiveStories(currentUser.id),
        statusService.fetchActiveNotes(currentUser.id)
      ]);
      
      console.log(`[StatusContext] Fetched ${fetchedStories?.length || 0} stories and ${fetchedNotes?.length || 0} notes`);
      setStories(fetchedStories || []);
      setNotes(fetchedNotes || []);
    } catch (e) {
      console.error('[StatusContext] Error refreshing statuses:', e);
    }
  }, [currentUser]);

  useEffect(() => {
    refreshStatuses();
    // Refresh every 5 minutes to catch expiry
    const interval = setInterval(refreshStatuses, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [refreshStatuses]);

  const addStory = useCallback(async (params: { mediaUrl: string; mediaType: 'image' | 'video'; caption?: string; music?: any }) => {
    if (!currentUser) return false;
    
    const success = await statusService.postStory({
      userId: currentUser.id,
      userName: currentUser.name || currentUser.username || 'User',
      userAvatar: currentUser.avatar || '',
      mediaUrl: params.mediaUrl,
      mediaType: params.mediaType,
      caption: params.caption,
      music: params.music
    });
    
    if (success) {
      await refreshStatuses();
    }
    return success;
  }, [currentUser, refreshStatuses]);

  const updateNote = useCallback(async (text: string | null) => {
    if (!currentUser) return false;
    
    const success = await statusService.postNote(currentUser.id, text);
    if (success) {
      await refreshStatuses();
    }
    return success;
  }, [currentUser, refreshStatuses]);

  const deleteStory = useCallback(async (id: string) => {
    if (!currentUser) return;
    const success = await statusService.deleteStory(id, currentUser.id);
    if (success) {
      setStories(prev => prev.filter(s => s.id !== id));
    }
  }, [currentUser]);

  const toggleStoryLike = useCallback(async (id: string) => {
    if (!currentUser) return;
    await statusService.likeStory(id, currentUser.id);
    await refreshStatuses();
  }, [currentUser, refreshStatuses]);

  const viewStory = useCallback(async (id: string) => {
    if (!currentUser) return;
    await statusService.viewStory(id, currentUser.id);
    // Silent update locally if needed, or refresh
  }, [currentUser]);

  const value = useMemo(() => ({
    stories,
    notes,
    refreshStatuses,
    addStory,
    updateNote,
    deleteStory,
    toggleStoryLike,
    viewStory
  }), [stories, notes, refreshStatuses, addStory, updateNote, deleteStory, toggleStoryLike, viewStory]);

  return <StatusContext.Provider value={value}>{children}</StatusContext.Provider>;
};

export const useStatus = () => {
  const context = useContext(StatusContext);
  if (context === undefined) {
    throw new Error('useStatus must be used within a StatusProvider');
  }
  return context;
};
