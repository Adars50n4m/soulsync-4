// mobile/services/BlockService.ts
import { SERVER_URL, safeFetchJson } from '../config/api';
import { supabase } from '../config/supabase';

export interface BlockedUser {
  id: string;
  blocked_at: string;
  blocked: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
  };
}

class BlockService {
  /**
   * Get list of users blocked by the current user
   */
  async getBlockedUsers(): Promise<BlockedUser[]> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return [];

      const response = await safeFetchJson<{ success: boolean; blocks: BlockedUser[]; error?: string }>(
        `${SERVER_URL}/api/blocks`,
        {
          headers: {
            'x-user-id': session.user.id,
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (!response.success || !response.data?.success) {
        console.warn('[BlockService] getBlockedUsers failed:', response.error || response.data?.error);
        return [];
      }
      return response.data.blocks || [];
    } catch (error) {
      console.error('[BlockService] getBlockedUsers exception:', error);
      return [];
    }
  }

  /**
   * Block a user
   */
  async blockUser(blockedId: string): Promise<boolean> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await safeFetchJson<{ success: boolean; error?: string }>(
        `${SERVER_URL}/api/blocks`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': session.user.id,
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ blockedId }),
        }
      );

      if (!response.success || !response.data?.success) {
        console.warn('[BlockService] blockUser failed:', response.error || response.data?.error);
        return false;
      }
      return true;
    } catch (error) {
      console.error('[BlockService] blockUser exception:', error);
      return false;
    }
  }

  /**
   * Unblock a user
   */
  async unblockUser(blockedId: string): Promise<boolean> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await safeFetchJson<{ success: boolean; error?: string }>(
        `${SERVER_URL}/api/blocks/${blockedId}`,
        {
          method: 'DELETE',
          headers: {
            'x-user-id': session.user.id,
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (!response.success || !response.data?.success) {
        console.warn('[BlockService] unblockUser failed:', response.error || response.data?.error);
        return false;
      }
      return true;
    } catch (error) {
      console.error('[BlockService] unblockUser exception:', error);
      return false;
    }
  }
}

export const blockService = new BlockService();
