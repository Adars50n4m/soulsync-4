import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { statusService } from '../services/StatusService';
import { storageService } from '../services/StorageService';
import { offlineService, type LocalStatus } from '../services/LocalDBService';
import { mediaDownloadService } from '../services/MediaDownloadService';
import { socketService } from '../services/SocketService';
import { useAuth } from './AuthContext';
import { type StatusUpdate, type UploadStatus } from '../types';

interface StatusContextType {
  stories: StatusUpdate[];
  notes: any[];
  refreshStatuses: () => Promise<void>;
  addStory: (params: { mediaUrl?: string; localUri?: string; mediaType: 'image' | 'video'; caption?: string; music?: any }) => Promise<void>;
  updateNote: (text: string | null) => Promise<boolean>;
  deleteStory: (id: string) => Promise<void>;
  toggleStoryLike: (id: string) => Promise<void>;
  viewStory: (id: string) => Promise<void>;
  activeUploads: UploadStatus[];
}

export const StatusContext = createContext<StatusContextType | undefined>(undefined);

export const StatusProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const [stories, setStories] = useState<StatusUpdate[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [activeUploads, setActiveUploads] = useState<UploadStatus[]>([]);

  const loadLocalStatuses = useCallback(async () => {
    if (!currentUser) return;
    try {
      const dbStatuses = await offlineService.getLocalStatuses();
      const mappedStories: StatusUpdate[] = dbStatuses.map(s => ({
        id: s.id,
        userId: s.userId,
        contactName: s.userName || 'User',
        avatar: s.userAvatar || '',
        mediaUrl: s.localUri || s.mediaUrl || '',
        mediaType: s.mediaType,
        caption: s.caption,
        timestamp: s.createdAt,
        expiresAt: s.expiresAt,
        views: s.views || [],
        likes: s.likes || [],
        music: s.music,
        syncStatus: s.syncStatus
      }));
      setStories(mappedStories);
    } catch (e) {
      console.error('[StatusContext] Error loading local statuses:', e);
    }
  }, [currentUser]);

  const refreshStatuses = useCallback(async () => {
    if (!currentUser) return;
    
    try {
      // 1. Fetch remote changes
      const [fetchedStories, fetchedNotes] = await Promise.all([
        statusService.fetchActiveStories(currentUser.id),
        statusService.fetchActiveNotes(currentUser.id)
      ]);
      
      // 2. Save remote stories to SQLite
      for (const story of fetchedStories) {
          await offlineService.saveLocalStatus({
              id: story.id,
              userId: story.userId,
              userName: story.contactName,
              userAvatar: story.avatar,
              mediaUrl: story.mediaUrl,
              mediaType: story.mediaType,
              caption: story.caption,
              music: story.music,
              createdAt: story.timestamp,
              expiresAt: story.expiresAt,
              isMine: story.userId === currentUser.id,
              syncStatus: 'synced',
              views: story.views,
              likes: story.likes
          });

          // 3. Trigger background download if not cached
          mediaDownloadService.ensureStatusCached(story.id, story.mediaUrl)
            .then(res => {
                if (res.success && res.localUri) {
                    offlineService.updateLocalStatusSyncStatus(story.id, 'synced', story.mediaUrl);
                    // Reload to show cached version
                    loadLocalStatuses();
                }
            });
      }

      await offlineService.purgeExpiredStatuses();
      
      console.log(`[StatusContext] Fetched ${fetchedStories?.length || 0} stories and ${fetchedNotes?.length || 0} notes`);
      setNotes(fetchedNotes || []);
      
      // 4. Reload all from SQLite (merges local pending + remote synced)
      await loadLocalStatuses();
    } catch (e) {
      console.error('[StatusContext] Error refreshing statuses:', e);
      // Fallback to local only on error
      await loadLocalStatuses();
    }
  }, [currentUser, loadLocalStatuses]);

  useEffect(() => {
    if (currentUser) {
        loadLocalStatuses();
        refreshStatuses();
        
        // Register Socket Listeners
        const handleSocketEvent = async (event: string, data: any) => {
            if (event === 'status:new') {
                console.log('[StatusContext] Socket status:new received, refreshing...');
                await refreshStatuses();
            } else if (event === 'status:delete') {
                console.log('[StatusContext] Socket status:delete received for', data.statusId);
                await offlineService.deleteLocalStatus(data.statusId);
                await loadLocalStatuses();
            }
        };

        socketService.addListener(handleSocketEvent);
        
        // Refresh every 5 minutes to catch expiry while app is open
        const interval = setInterval(refreshStatuses, 5 * 60 * 1000);
        
        // Handle AppState changes (refresh when coming to foreground)
        const handleAppStateChange = (nextAppState: AppStateStatus) => {
            if (nextAppState === 'active') {
                console.log('[StatusContext] App foregrounded, refreshing statuses...');
                refreshStatuses();
            }
        };
        const appStateSubscription = AppState.addEventListener('change', handleAppStateChange);

        return () => {
            socketService.removeListener(handleSocketEvent);
            clearInterval(interval);
            appStateSubscription.remove();
        };
    }
  }, [currentUser, loadLocalStatuses, refreshStatuses]);

  const addStory = useCallback(async (params: { mediaUrl?: string; localUri?: string; mediaType: 'image' | 'video'; caption?: string; music?: any }) => {
    if (!currentUser) return;
    
    const tempId = `temp_${Date.now()}`;
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // 1. Save to SQLite immediately (Optimistic UI)
    const newStatus: LocalStatus = {
        id: tempId,
        userId: currentUser.id,
        userName: currentUser.name || currentUser.username || 'User',
        userAvatar: currentUser.avatar || '',
        mediaUrl: params.mediaUrl || '',
        localUri: params.localUri || '',
        mediaType: params.mediaType,
        caption: params.caption,
        music: params.music,
        createdAt,
        expiresAt,
        isMine: true,
        syncStatus: 'pending'
    };

    await offlineService.saveLocalStatus(newStatus);
    await loadLocalStatuses();

    // 2. Handle background upload
    (async () => {
        try {
            let finalMediaUrl = params.mediaUrl;
            
            if (!finalMediaUrl && params.localUri) {
                // Upload to storage
                finalMediaUrl = await storageService.uploadImage(params.localUri, 'status-media', currentUser.id);
            }

            if (!finalMediaUrl) throw new Error('Upload failed');

            // 3. Post to server
            console.log(`[StatusContext] Syncing temp story ${tempId} to server`);
            const realId = await statusService.postStory({
                userId: currentUser.id,
                userName: currentUser.name || currentUser.username || 'User',
                userAvatar: currentUser.avatar || '',
                mediaUrl: finalMediaUrl,
                mediaType: params.mediaType,
                caption: params.caption,
                music: params.music
            });

            if (realId) {
                // Atomic swap: tempId -> realId in SQLite
                await offlineService.updateLocalStatusSyncStatus(tempId, 'synced', finalMediaUrl, realId);
                await refreshStatuses();
            } else {
                throw new Error('Server post failed');
            }
        } catch (error: any) {
            console.error('[StatusContext] Background upload/sync failed:', error);
            await offlineService.updateLocalStatusSyncStatus(tempId, 'failed');
            await loadLocalStatuses();
        }
    })();
  }, [currentUser, loadLocalStatuses, refreshStatuses]);

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
    await offlineService.deleteLocalStatus(id);
    await loadLocalStatuses(); // Immediate UI update
    
    // Call server to delete
    try {
        await statusService.deleteStory(id, currentUser.id);
    } catch (e) {
        console.error('[StatusContext] Server deletion failed:', e);
    }
  }, [currentUser, loadLocalStatuses]);

  const toggleStoryLike = useCallback(async (id: string) => {
    if (!currentUser) return;
    await statusService.likeStory(id, currentUser.id);
    await refreshStatuses();
  }, [currentUser, refreshStatuses]);

  const viewStory = useCallback(async (id: string) => {
    if (!currentUser) return;
    await offlineService.markStatusAsSeen(id, currentUser.id);
    await loadLocalStatuses(); // Instant UI update (remove red ring)
    
    await statusService.viewStory(id, currentUser.id);
  }, [currentUser, loadLocalStatuses]);

  const value = useMemo(() => ({
    stories,
    notes,
    refreshStatuses,
    addStory,
    updateNote,
    deleteStory,
    toggleStoryLike,
    viewStory,
    activeUploads
  }), [stories, notes, refreshStatuses, addStory, updateNote, deleteStory, toggleStoryLike, viewStory, activeUploads]);

  return <StatusContext.Provider value={value}>{children}</StatusContext.Provider>;
};

export const useStatus = () => {
  const context = useContext(StatusContext);
  if (context === undefined) {
    throw new Error('useStatus must be used within a StatusProvider');
  }
  return context;
};
