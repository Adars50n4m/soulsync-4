import { getDB } from '../database';
import { Message, Contact } from '../types';

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
      status: row.status as 'sent' | 'delivered' | 'read',
      media: row.media_url ? {
        type: row.media_type as any,
        url: row.media_url,
        caption: row.media_caption
      } : undefined,
      replyTo: row.reply_to_id
    }));
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
        contact.bio ?? '', 
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
      bio: row.bio,
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
