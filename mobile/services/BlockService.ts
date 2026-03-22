// mobile/services/BlockService.ts
import { SERVER_URL } from '../config/api';
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

      const response = await fetch(`${SERVER_URL}/api/blocks`, {
        headers: {
          'x-user-id': session.user.id,
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      const data = await response.json() as { success: boolean; blocks: BlockedUser[]; error?: string };
      if (!data.success) throw new Error(data.error || 'Failed to fetch blocks');
      return data.blocks;
    } catch (error) {
      console.error('[BlockService] getBlockedUsers error:', error);
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

      const response = await fetch(`${SERVER_URL}/api/blocks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': session.user.id,
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ blockedId }),
      });

      const data = await response.json() as { success: boolean; error?: string };
      if (!data.success) throw new Error(data.error || 'Failed to block user');
      return true;
    } catch (error) {
      console.error('[BlockService] blockUser error:', error);
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

      const response = await fetch(`${SERVER_URL}/api/blocks/${blockedId}`, {
        method: 'DELETE',
        headers: {
          'x-user-id': session.user.id,
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      const data = await response.json() as { success: boolean; error?: string };
      if (!data.success) throw new Error(data.error || 'Failed to unblock user');
      return true;
    } catch (error) {
      console.error('[BlockService] unblockUser error:', error);
      return false;
    }
  }
}

export const blockService = new BlockService();
