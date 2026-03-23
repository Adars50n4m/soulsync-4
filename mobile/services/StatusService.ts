import { supabase } from '../config/supabase';
import { type StatusUpdate } from '../types';
import { getPublicStorageUrl, SERVER_URL, safeFetchJson } from '../config/api';

export interface PostStatusParams {
  userId: string;
  userName: string;
  userAvatar: string;
  mediaUrl: string;
  mediaType: 'image' | 'video';
  caption?: string;
  music?: {
    name: string;
    artist: string;
    image: string;
  };
}

class StatusService {
  async getMutualFriendIds(userId: string): Promise<string[]> {
    try {
      const { data, error } = await supabase
        .from('connections')
        .select('user_1_id, user_2_id')
        .or(`user_1_id.eq.${userId},user_2_id.eq.${userId}`);

      if (error) throw error;

      return (data || []).map(conn => 
        conn.user_1_id === userId ? conn.user_2_id : conn.user_1_id
      );
    } catch (error) {
      console.error('[StatusService] Error fetching mutual friends:', error);
      return [];
    }
  }

  /**
   * Fetches active stories from mutual friends.
   * Filters for expires_at > now.
   */
  async fetchActiveStories(userId: string): Promise<StatusUpdate[]> {
    try {
      const friendIds = await this.getMutualFriendIds(userId);
      const allIds = [userId, ...friendIds];
      
      const { data, error } = await supabase
        .from('statuses')
        .select('*')
        .in('user_id', allIds)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data || []).map(s => ({
        id: s.id,
        userId: s.user_id,
        contactName: s.user_name,
        avatar: s.user_avatar,
        mediaUrl: getPublicStorageUrl('status-media', s.media_url),
        mediaType: s.media_type,
        caption: s.caption,
        timestamp: s.created_at,
        expiresAt: s.expires_at,
        views: s.views || [],
        likes: s.likes || [],
        music: s.music
      }));
    } catch (error) {
      console.error('[StatusService] Error fetching stories:', error);
      return [];
    }
  }

  /**
   * Fetches active "Soul Notes" from mutual friends.
   * Logic: note_timestamp is within last 24 hours.
   */
  async fetchActiveNotes(userId: string): Promise<any[]> {
    let friendIds: string[] = [];
    try {
      friendIds = await this.getMutualFriendIds(userId);
      if (friendIds.length === 0) return [];

      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, avatar_url, note, note_timestamp')
        .in('id', friendIds)
        .gt('note_timestamp', twentyFourHoursAgo);

      if (error) throw error;

      return data || [];
    } catch (error: any) {
      if (error.code === '42703') {
        console.warn('[StatusService] Profiles table missing note columns. Fetching basic profile data.');
        const { data } = await supabase
          .from('profiles')
          .select('id, name, avatar_url')
          .in('id', friendIds);
        return data || [];
      }
      console.error('[StatusService] Error fetching notes:', error);
      return [];
    }
  }

  /**
   * Post a new media story.
   * Automatically sets expiry to 24 hours from now.
   */
  async postStory(params: PostStatusParams): Promise<string | null> {
    try {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from('statuses')
        .insert({
          user_id: params.userId,
          user_name: params.userName,
          user_avatar: params.userAvatar,
          media_url: params.mediaUrl,
          media_type: params.mediaType,
          caption: params.caption,
          music: params.music,
          expires_at: expiresAt
        })
        .select('id');

      if (error) throw error;
      return data?.[0]?.id || null;
    } catch (error) {
      console.error('[StatusService] Error posting story:', error);
      return null;
    }
  }

  /**
   * Post/Update a Soul Note (text status).
   */
  async postNote(userId: string, text: string | null): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          note: text,
          note_timestamp: text ? new Date().toISOString() : null
        })
        .eq('id', userId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('[StatusService] Error updating note:', error);
      return false;
    }
  }

  async deleteStory(storyId: string, userId: string): Promise<boolean> {
    try {
      const response = await safeFetchJson<{ success: boolean }>(`${SERVER_URL}/api/status/delete`, {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              'x-user-id': userId
          },
          body: JSON.stringify({ statusId: storyId })
      });
      
      if (!response.success || !response.data?.success) {
          throw new Error(response.error || 'Server delete failed');
      }
      return true;
    } catch (error) {
      console.error('[StatusService] Error deleting story:', error);
      // Fallback to direct Supabase if server fails
      const { error: dbError } = await supabase
        .from('statuses')
        .delete()
        .eq('id', storyId)
        .eq('user_id', userId);
      return !dbError;
    }
  }

  async likeStory(storyId: string, userId: string): Promise<void> {
    try {
      // Fetch current likes
      const { data } = await supabase
        .from('statuses')
        .select('likes')
        .eq('id', storyId);

      let likes = data?.[0]?.likes || [];
      if (likes.includes(userId)) {
        likes = likes.filter((id: string) => id !== userId);
      } else {
        likes.push(userId);
      }

      await supabase
        .from('statuses')
        .update({ likes })
        .eq('id', storyId);
    } catch (e) {
      console.warn('[StatusService] likeStory failed:', e);
    }
  }

  async viewStory(storyId: string, userId: string): Promise<void> {
    try {
      const { data } = await supabase
        .from('statuses')
        .select('views')
        .eq('id', storyId);

      let views = data?.[0]?.views || [];
      if (!views.includes(userId)) {
        views.push(userId);
        await supabase
          .from('statuses')
          .update({ views })
          .eq('id', storyId);
      }
    } catch (e) {
      console.warn('[StatusService] viewStory failed:', e);
    }
  }
}

export const statusService = new StatusService();
