import { getDB } from '../database';
import { Message, Contact } from '../types';

export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed';

export interface QueuedMessage {
  id: string;
  chatId: string;
  sender: 'me' | 'them';
  text: string;
  timestamp: string;
  status: MessageStatus;
  media?: {
    type: 'image' | 'video' | 'audio' | 'file' | 'status_reply';
    url: string;
    name?: string;
    caption?: string;
  };
  replyTo?: string;
  retryCount: number;
  lastRetryAt?: string;
  errorMessage?: string;
}

export const offlineService = {
  // --- Messages ---
  async saveMessage(chatId: string, msg: Message, isUnsent: boolean = false) {
    const db = await getDB();
    if (!db) return;
    await db.runAsync(
      `INSERT OR REPLACE INTO messages (id, chat_id, sender, text, media_type, media_url, media_caption, reply_to_id, timestamp, status, is_unsent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        msg.id,
        chatId,
        msg.sender,
        msg.text,
        msg.media?.type ?? null,
        msg.media?.url ?? null,
        msg.media?.caption ?? null,
        msg.replyTo ?? null,
        msg.timestamp,
        msg.status ?? 'sent',
        isUnsent ? 1 : 0
      ]
    );
  },

  /**
   * Save a message with pending status for offline-first queue
   */
  async savePendingMessage(chatId: string, msg: QueuedMessage): Promise<void> {
    const db = await getDB();
    if (!db) return;
    await db.runAsync(
      `INSERT OR REPLACE INTO messages (id, chat_id, sender, text, media_type, media_url, media_caption, reply_to_id, timestamp, status, is_unsent, retry_count, last_retry_at, error_message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?);`,
      [
        msg.id,
        chatId,
        msg.sender,
        msg.text,
        msg.media?.type ?? null,
        msg.media?.url ?? null,
        msg.media?.caption ?? null,
        msg.replyTo ?? null,
        msg.timestamp,
        'pending',
        msg.retryCount ?? 0,
        msg.lastRetryAt ?? null,
        msg.errorMessage ?? null
      ]
    );
  },

  /**
   * Get all messages including pending ones
   */
  async getMessages(chatId: string): Promise<Message[]> {
    const db = await getDB();
    if (!db) return [];
    const rows = await db.getAllAsync(
      `SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC;`,
      [chatId]
    );

    return rows.map((row: any) => ({
      id: row.id,
      sender: row.sender as 'me' | 'them',
      text: row.text,
      timestamp: row.timestamp,
      status: row.status as MessageStatus,
      media: row.media_url ? {
        type: row.media_type as any,
        url: row.media_url,
        caption: row.media_caption
      } : undefined,
      replyTo: row.reply_to_id
    }));
  },

  /**
   * Get all pending messages across all chats for queue processing
   */
  async getPendingMessages(): Promise<QueuedMessage[]> {
    const db = await getDB();
    if (!db) return [];
    const rows = await db.getAllAsync(
      `SELECT * FROM messages WHERE status = 'pending' ORDER BY created_at ASC;`
    );

    return rows.map((row: any) => ({
      id: row.id,
      chatId: row.chat_id,
      sender: row.sender as 'me' | 'them',
      text: row.text,
      timestamp: row.timestamp,
      status: 'pending' as MessageStatus,
      media: row.media_url ? {
        type: row.media_type,
        url: row.media_url,
        caption: row.media_caption
      } : undefined,
      replyTo: row.reply_to_id,
      retryCount: row.retry_count ?? 0,
      lastRetryAt: row.last_retry_at,
      errorMessage: row.error_message
    }));
  },

  /**
   * Update message status after successful sync
   */
  async updateMessageStatus(messageId: string, status: MessageStatus): Promise<void> {
    const db = await getDB();
    if (!db) return;
    await db.runAsync(
      `UPDATE messages SET status = ?, is_unsent = 0 WHERE id = ?;`,
      [status, messageId]
    );
  },

  /**
   * Reconcile local optimistic ID with server-generated ID
   */
  async updateMessageId(oldId: string, newId: string): Promise<void> {
    const db = await getDB();
    if (!db) return;
    await db.runAsync(
      `UPDATE messages SET id = ? WHERE id = ?;`,
      [newId, oldId]
    );
  },

  /**
   * Update retry count and last retry timestamp for a message
   */
  async updateMessageRetry(
    messageId: string,
    retryCount: number,
    errorMessage?: string
  ): Promise<void> {
    const db = await getDB();
    if (!db) return;
    await db.runAsync(
      `UPDATE messages SET retry_count = ?, last_retry_at = ?, error_message = ? WHERE id = ?;`,
      [retryCount, new Date().toISOString(), errorMessage ?? null, messageId]
    );
  },

  /**
   * Mark a message as failed after max retries
   */
  async markMessageAsFailed(messageId: string, errorMessage: string): Promise<void> {
    const db = await getDB();
    if (!db) return;
    await db.runAsync(
      `UPDATE messages SET status = 'failed', error_message = ?, is_unsent = 0 WHERE id = ?;`,
      [errorMessage, messageId]
    );
  },

  /**
   * Get a specific message by ID
   */
  async getMessageById(messageId: string): Promise<QueuedMessage | null> {
    const db = await getDB();
    if (!db) return null;
    const row = await db.getFirstAsync(
      `SELECT * FROM messages WHERE id = ?;`,
      [messageId]
    );

    if (!row) return null;

    return {
      id: row.id,
      chatId: row.chat_id,
      sender: row.sender as 'me' | 'them',
      text: row.text,
      timestamp: row.timestamp,
      status: row.status as MessageStatus,
      media: row.media_url ? {
        type: row.media_type,
        url: row.media_url,
        caption: row.media_caption
      } : undefined,
      replyTo: row.reply_to_id,
      retryCount: row.retry_count ?? 0,
      lastRetryAt: row.last_retry_at,
      errorMessage: row.error_message
    };
  },

  // --- Contacts ---
  async saveContact(contact: Contact) {
    const db = await getDB();
    if (!db) return;
    await db.runAsync(
      `INSERT OR REPLACE INTO contacts (id, name, avatar, bio, status, last_message, unread_count)
       VALUES (?, ?, ?, ?, ?, ?, ?);`,
      [
        contact.id, 
        contact.name, 
        contact.avatar, 
        contact.about ?? '', 
        contact.status ?? 'offline', 
        contact.lastMessage ?? '', 
        contact.unreadCount ?? 0
      ]
    );
  },

  async getContacts(): Promise<Contact[]> {
    const db = await getDB();
    if (!db) return [];
    const rows = await db.getAllAsync(`SELECT * FROM contacts;`);
    return rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      avatar: row.avatar,
      about: row.bio,
      status: row.status as 'online' | 'offline',
      lastMessage: row.last_message,
      unreadCount: row.unread_count
    }));
  },

  // --- Sync Queue ---
  async addToSyncQueue(actionType: string, payload: any) {
    const db = await getDB();
    if (!db) return;
    await db.runAsync(
      `INSERT INTO sync_queue (action_type, payload) VALUES (?, ?);`,
      [actionType, JSON.stringify(payload)]
    );
  },

  async getSyncQueue() {
    const db = await getDB();
    if (!db) return [];
    return await db.getAllAsync(`SELECT * FROM sync_queue ORDER BY created_at ASC;`);
  },

  async removeFromSyncQueue(id: number) {
    const db = await getDB();
    if (!db) return;
    await db.runAsync(`DELETE FROM sync_queue WHERE id = ?;`, [id]);
  }
};
