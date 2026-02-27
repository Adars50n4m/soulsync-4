import { supabase } from '../../config/supabase';
import localDBService, {
  type MediaKind,
  type NewLocalMessageInput,
  type LocalMessageRecord,
} from './LocalDBService';

type IncomingServerMessage = {
  id: string;
  sender: string;
  receiver: string;
  text: string | null;
  status: 'pending' | 'sent' | 'delivered' | 'read' | null;
  created_at: string;
  media_type: MediaKind | null;
  media_url: string | null;
  media_caption: string | null;
};

export interface SendMessageInput {
  localId: string;
  chatId: string;
  senderId: string;
  receiverId: string;
  text?: string;
  media?: {
    type: MediaKind;
    localUri?: string;
    remoteUrl?: string;
    mimeType?: string;
  };
}

const POLL_INTERVAL_MS = 12000;
const BATCH_LIMIT = 50;

class SyncEngine {
  private activeUserId: string | null = null;
  private running = false;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private channel: ReturnType<typeof supabase.channel> | null = null;

  async init(userId: string): Promise<void> {
    this.activeUserId = userId;
    await localDBService.init();
  }

  async start(userId: string): Promise<void> {
    await this.init(userId);
    if (this.running) return;

    this.running = true;
    this.subscribeRealtime(userId);
    await this.syncNow();
    this.intervalHandle = setInterval(() => {
      this.syncNow().catch((error) => {
        console.warn('[SyncEngine] periodic sync failed', error);
      });
    }, POLL_INTERVAL_MS);
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    if (this.channel) {
      await supabase.removeChannel(this.channel);
      this.channel = null;
    }
  }

  async sendMessage(input: SendMessageInput): Promise<LocalMessageRecord> {
    const nowIso = new Date().toISOString();
    const localMessage: NewLocalMessageInput = {
      id: input.localId,
      chatId: input.chatId,
      senderId: input.senderId,
      receiverId: input.receiverId,
      text: input.text ?? '',
      status: 'pending',
      createdAt: nowIso,
      mediaType: input.media?.type ?? null,
      mediaLocalUri: input.media?.localUri ?? null,
      mediaRemoteUrl: input.media?.remoteUrl ?? null,
      mediaMimeType: input.media?.mimeType ?? null,
    };

    // Immediate local insert for instant UI.
    await localDBService.upsertChat({
      id: input.chatId,
      peerId: input.receiverId,
      lastMessageText: input.text ?? '',
      lastMessageAt: nowIso,
    });
    await localDBService.insertMessage(localMessage);

    if (input.media?.localUri) {
      await localDBService.saveMediaToCache({
        id: `cache-${input.localId}`,
        messageId: input.localId,
        mediaType: input.media.type,
        sourceUri: input.media.localUri,
        remoteUrl: input.media.remoteUrl ?? null,
        mimeType: input.media.mimeType ?? null,
      });
    }

    await this.syncPendingMessages();
    const saved = (await localDBService.getMessagesByChat(input.chatId)).find(
      (message) => message.id === input.localId
    );
    if (!saved) {
      throw new Error(`Unable to load locally inserted message: ${input.localId}`);
    }
    return saved;
  }

  async syncNow(): Promise<void> {
    if (!this.activeUserId) return;
    await this.syncPendingMessages();
    await this.pullIncomingMessages(this.activeUserId);
  }

  private subscribeRealtime(userId: string): void {
    if (this.channel) return;

    this.channel = supabase
      .channel(`local-sync-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `receiver=eq.${userId}`,
        },
        async (payload) => {
          await this.persistIncomingAndAck(payload.new as IncomingServerMessage);
        }
      )
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') {
          console.warn('[SyncEngine] realtime status:', status);
        }
      });
  }

  private async syncPendingMessages(): Promise<void> {
    const pending = await localDBService.getPendingMessages(BATCH_LIMIT);
    if (pending.length === 0) return;

    for (const message of pending) {
      try {
        const { data, error } = await supabase
          .from('messages')
          .insert({
            sender: message.senderId,
            receiver: message.receiverId,
            text: message.text,
            status: 'sent',
            created_at: message.createdAt,
            media_type: message.mediaType ?? null,
            media_url: message.mediaRemoteUrl ?? null,
          })
          .select('id')
          .single();

        if (error) throw error;
        await localDBService.markMessageSynced(message.id, data.id);

        // Trigger TTL relay registration (edge function can enforce 5-minute window).
        await supabase.functions.invoke('ttl-relay-touch', {
          body: {
            messageId: data.id,
            createdAt: message.createdAt,
          },
        });
      } catch (error: any) {
        await localDBService.setMessageSyncError(
          message.id,
          error?.message ?? 'Failed to sync pending message'
        );
      }
    }
  }

  private async pullIncomingMessages(userId: string): Promise<void> {
    const { data, error } = await supabase
      .from('messages')
      .select('id,sender,receiver,text,status,created_at,media_type,media_url,media_caption')
      .eq('receiver', userId)
      .order('created_at', { ascending: true })
      .limit(BATCH_LIMIT);

    if (error || !data?.length) return;

    for (const row of data as IncomingServerMessage[]) {
      await this.persistIncomingAndAck(row);
    }
  }

  private async persistIncomingAndAck(row: IncomingServerMessage): Promise<void> {
    const chatId = [row.sender, row.receiver].sort().join(':');
    await localDBService.upsertChat({
      id: chatId,
      peerId: row.sender,
      lastMessageText: row.text ?? '',
      lastMessageAt: row.created_at,
    });

    await localDBService.upsertRemoteMessage({
      remoteId: row.id,
      chatId,
      senderId: row.sender,
      receiverId: row.receiver,
      text: row.text ?? '',
      status: row.status ?? 'delivered',
      createdAt: row.created_at,
      mediaType: row.media_type ?? null,
      mediaRemoteUrl: row.media_url ?? null,
      mediaLocalUri: null,
    });

    if (row.media_url && row.media_type) {
      await localDBService.saveMediaToCache({
        id: `cache-${row.id}`,
        messageId: `local-${row.id}`,
        mediaType: row.media_type,
        sourceUri: row.media_url,
        remoteUrl: row.media_url,
      });
    }

    await this.acknowledgeRemoteReceipt(row.id);
  }

  private async acknowledgeRemoteReceipt(messageId: string): Promise<void> {
    const edgeAck = await supabase.functions.invoke('message-ack', {
      body: { messageId },
    });

    if (edgeAck.error) {
      // Fallback deletion if edge function is not deployed yet.
      await supabase.from('messages').delete().eq('id', messageId);
    }
  }
}

export const syncEngine = new SyncEngine();
export default syncEngine;
