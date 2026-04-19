// mobile/services/ChatService.ts
// ─────────────────────────────────────────────────────────────────────────────
// CHAT SERVICE  (Network + Sync Layer)
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '../config/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';
import * as Crypto from 'expo-crypto';
import { proxySupabaseUrl, SUPABASE_ENDPOINT } from '../config/api';
import { offlineService, getDb, type QueuedMessage, type MessageStatus } from './LocalDBService';
import { storageService } from './StorageService';
import { AppState, AppStateStatus } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { soulFolderService } from './SoulFolderService';

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  group_id?: string;
  text: string;
  timestamp: string;
  status: MessageStatus;
  media?: {
    type: 'image' | 'video' | 'audio' | 'file' | 'status_reply';
    url: string;
    name?: string;
    caption?: string;
    thumbnail?: string;
    duration?: number;
  };
  reply_to?: string;
  senderName?: string;
  reactions?: string[];
  localFileUri?: string;
}

type MessageCallback      = (message: ChatMessage) => void;
type StatusCallback       = (messageId: string, status: ChatMessage['status'], newId?: string) => void;
type NetworkStatusCallback = (isOnline: boolean) => void;
type UploadProgressCallback = (messageId: string, progress: number) => void;

// ─────────────────────────────────────────────────────────────────────────────
// RETRY CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

const MAX_RETRY_COUNT      = 5;
const MAX_TOTAL_RETRIES    = 10;
const MAX_REALTIME_RETRIES = 5;
const POLLING_INTERVAL_NORMAL = 30000;
const POLLING_INTERVAL_FALLBACK = 12000;
const INITIAL_RETRY_DELAY  = 1_000;   // 1 second
const MAX_RETRY_DELAY      = 60_000;  // 1 minute cap

const ACTIVE_POLL_INTERVAL = 2_000;   // 2 seconds
const IDLE_POLL_INTERVAL   = 3_000;   // 3 seconds
const REALTIME_POLL_INTERVAL = 30_000; // 30 seconds
const MEDIA_GROUP_MARKER = '__MEDIA_GROUP_V1__:';
const SUPABASE_INSERT_TIMEOUT_MS = 20_000;

const createTimeoutError = (label: string, timeoutMs: number) => {
  const seconds = Math.round(timeoutMs / 1000);
  const error = new Error(`${label} timed out after ${seconds}s`);
  (error as Error & { code?: string }).code = 'ETIMEDOUT';
  return error;
};

const withTimeout = async <T>(promise: PromiseLike<T>, timeoutMs: number, label: string): Promise<T> => {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(createTimeoutError(label, timeoutMs)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
};

type GroupMediaItem = {
  type: 'image' | 'video' | 'audio' | 'file' | 'status_reply';
  url?: string;
  localFileUri?: string;
  caption?: string;
  thumbnail?: string;
  name?: string;
  duration?: number;
};

const decodeGroupedItems = (thumbnail?: string): GroupMediaItem[] => {
  if (!thumbnail || !thumbnail.startsWith(MEDIA_GROUP_MARKER)) return [];
  try {
    const raw = thumbnail.slice(MEDIA_GROUP_MARKER.length);
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const encodeGroupedItems = (items: GroupMediaItem[]): string =>
  `${MEDIA_GROUP_MARKER}${JSON.stringify(items)}`;

class ChatService {
  private channel:              ReturnType<typeof supabase.channel> | null = null;
  private userId:               string | null = null;
  private partnerId:            string | null = null;
  private isGroup:              boolean = false;
  private senderName:           string = 'Someone';

  private onNewMessage:         MessageCallback       | null = null;
  private onStatusUpdate:       StatusCallback        | null = null;
  private onNetworkStatusChange:NetworkStatusCallback | null = null;
  private onUploadProgressCb:   UploadProgressCallback| null = null;
  private onAcknowledgment:      ((messageId: string, status: 'delivered' | 'read', timestamp: string) => void) | null = null;
  private onDeleteMessage:       ((messageId: string) => void) | null = null;

  private isInitialized      = false;
  private isDeviceOnline     = true;
  private isServerReachable  = true;
  private isRealtimeConnected = false;

  private get isActuallyOnline(): boolean {
    return this.isDeviceOnline && this.isServerReachable;
  }
  private realtimeRetryCount:   number = 0;
  private realtimeRetryTimer:   ReturnType<typeof setTimeout> | null = null;
  private isReconnecting:       boolean = false;

  private processQueueTimer:    ReturnType<typeof setInterval> | null = null;
  private sendingIds:           Set<string> = new Set();
  private networkListenerCleanup: (() => void) | null = null;

  private pollTimer:            ReturnType<typeof setInterval> | null = null;
  private lastPollAt:           string | null = null;
  private lastFetchTimestamps:  Map<string, number> = new Map();
  private isPolling:            boolean = false;
  private appStateListener:     any = null;
  private isRealtimeConnecting: boolean = false;

  async initialize(
    userId: string,
    partnerId: string,
    senderName: string,
    isGroup: boolean = false,
    onMessage: MessageCallback,
    onStatus: StatusCallback,
    onNetworkStatus?: NetworkStatusCallback,
    onUploadProgress?: UploadProgressCallback,
    onAcknowledgment?: (messageId: string, status: 'delivered' | 'read', timestamp: string) => void,
    onDeleteMessage?: (messageId: string) => void
  ): Promise<void> {
    if (this.isInitialized && this.userId === userId && this.partnerId === partnerId && this.isGroup === isGroup) {
      // Same session — just refresh callback references to avoid stale closures
      this.onNewMessage          = onMessage;
      this.onStatusUpdate        = onStatus;
      this.onNetworkStatusChange = onNetworkStatus ?? null;
      this.onUploadProgressCb    = onUploadProgress ?? null;
      this.onAcknowledgment      = onAcknowledgment ?? null;
      this.onDeleteMessage       = onDeleteMessage ?? null;
      await this.repairGroupedMediaThumbnails();
      return;
    }

    this.cleanup();

    this.userId      = userId;
    this.partnerId   = partnerId;
    this.isGroup     = isGroup;
    this.senderName  = senderName;

    this.onNewMessage          = onMessage;
    this.onStatusUpdate        = onStatus;
    this.onNetworkStatusChange = onNetworkStatus ?? null;
    this.onUploadProgressCb    = onUploadProgress ?? null;
    this.onAcknowledgment      = onAcknowledgment ?? null;
    this.onDeleteMessage       = onDeleteMessage ?? null;

    this.isInitialized         = true;

    // Reset any previously-failed media messages so they get retried with current code
    try {
      const resetCount = await offlineService.resetFailedMediaMessages();
      if (resetCount > 0) console.log(`[ChatService] ♻️ Reset ${resetCount} failed media messages for retry`);
    } catch (_) {}

    try {
      const repairedPendingCount = await offlineService.resetIncompleteOutgoingMediaMessages();
      if (repairedPendingCount > 0) {
        console.log(`[ChatService] ♻️ Re-queued ${repairedPendingCount} incomplete outgoing media messages`);
      }
    } catch (_) {}

    await this.setupNetworkListener();
    await this.fetchMissedMessages();
    await this.repairGroupedMediaThumbnails();
    await this.subscribeToRealtime();
    this.startMessagePolling();
  }

  private isPreviewOnlyGroupedThumbnail(thumbnail?: string | null): boolean {
    const items = decodeGroupedItems(thumbnail ?? undefined);
    if (!items.length) return false;

    return items.some((item) => !!item.thumbnail) && items.every((item) => !item.url && !item.localFileUri);
  }

  private hasRecoverableGroupedMedia(thumbnail?: string | null): boolean {
    const items = decodeGroupedItems(thumbnail ?? undefined);
    if (!items.length) return false;

    return items.some((item) => !!item.url || !!item.localFileUri);
  }

  /** Repair old grouped-media rows that still point to tiny preview-only thumbnails. */
  private async repairGroupedMediaThumbnails(): Promise<void> {
    if (!this.userId || !this.partnerId) return;

    try {
      const db = await getDb();
      const rows = await db.getAllAsync<{ id: string; media_thumbnail: string | null }>(
        `SELECT id, media_thumbnail
           FROM messages
          WHERE chat_id = ?
            AND media_thumbnail LIKE ?
          ORDER BY timestamp DESC
          LIMIT 40;`,
        [this.partnerId, `${MEDIA_GROUP_MARKER}%`]
      );

      const candidates = rows.filter((row) => this.isPreviewOnlyGroupedThumbnail(row.media_thumbnail));
      if (!candidates.length) return;

      const localThumbnailById = new Map(candidates.map((row) => [row.id, row.media_thumbnail ?? '']));
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .in('id', candidates.map((row) => row.id));

      if (error || !data?.length) return;

      let repairedCount = 0;
      for (const row of data) {
        const localThumbnail = localThumbnailById.get(row.id?.toString?.() ?? String(row.id));
        if (!localThumbnail) continue;
        if (!this.hasRecoverableGroupedMedia(row.media_thumbnail)) continue;
        if (row.media_thumbnail === localThumbnail) continue;

        const message = this.mapDbRowToChatMessage(row);
        const isCurrentChat =
          (message.sender_id === this.userId && message.receiver_id === this.partnerId)
          || (message.sender_id === this.partnerId && message.receiver_id === this.userId);

        await this.persistRemoteMessageRow(row, isCurrentChat ? 'always' : 'never');
        repairedCount += 1;
      }

      if (repairedCount > 0) {
        console.log(`[ChatService] 🔧 Repaired ${repairedCount} historical grouped media message(s)`);
      }
    } catch (error) {
      console.warn('[ChatService] Grouped media repair failed:', error);
    }
  }

  private async subscribeToRealtime(): Promise<void> {
    if (!this.userId) return;
    if (this.isRealtimeConnecting) return;

    this.isRealtimeConnecting = true;
    const channelName = this.isGroup ? `group_chat_${this.partnerId}` : `chat_${this.userId}`;

    if (this.channel) {
      try {
        await supabase.removeChannel(this.channel);
      } catch (e) {}
      this.channel = null;
    }

    this.channel = supabase.channel(channelName);

    this.channel
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        async (payload) => {
          const incoming = this.mapDbRowToChatMessage(payload.new);
          if (incoming.receiver_id !== this.userId) return;

          await this.persistRemoteMessageRow(
            payload.new,
            incoming.sender_id === this.partnerId ? 'if_new' : 'never'
          );

          if (incoming.sender_id === this.partnerId) {
            this.updateMessageStatusOnServer(incoming.id, 'delivered');
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        async (payload) => {
          const updated = payload.new as any;
          const messageId = updated.id?.toString?.() ?? String(updated.id);

          if (updated.sender === this.userId) {
            if (updated.status) {
              await offlineService.updateMessageStatus(messageId, updated.status as MessageStatus);
              this.onStatusUpdate?.(messageId, updated.status);
              if (updated.status === 'delivered' || updated.status === 'read') {
                const timestamp = updated.status === 'delivered'
                  ? (updated.delivered_at || new Date().toISOString())
                  : (updated.read_at || new Date().toISOString());
                this.onAcknowledgment?.(messageId, updated.status, timestamp);
              }
            }

            if (updated.media_url || updated.media_thumbnail) {
              const existing = await offlineService.getMessageById(messageId);
              const nextMediaUrl = typeof updated.media_url === 'string' ? proxySupabaseUrl(updated.media_url) : '';
              const nextThumbnail = typeof updated.media_thumbnail === 'string' ? updated.media_thumbnail : '';
              const needsMediaRefresh =
                (!!nextMediaUrl && nextMediaUrl !== (existing?.media?.url ?? '')) ||
                (!!nextThumbnail && nextThumbnail !== (existing?.media?.thumbnail ?? ''));

              if (needsMediaRefresh) {
                const outgoing = this.mapDbRowToChatMessage(updated);
                await offlineService.saveMessage(outgoing.receiver_id, {
                  id: outgoing.id,
                  sender: 'me',
                  text: outgoing.text,
                  timestamp: outgoing.timestamp,
                  status: outgoing.status,
                  media: outgoing.media,
                  replyTo: outgoing.reply_to,
                });

                if (outgoing.receiver_id === this.partnerId) {
                  this.onNewMessage?.(outgoing);
                }
              }
            }

            return;
          }

          if (updated.receiver !== this.userId) return;

          const incoming = this.mapDbRowToChatMessage(updated);
          await this.persistRemoteMessageRow(
            updated,
            incoming.sender_id === this.partnerId ? 'always' : 'never'
          );

          if (incoming.sender_id === this.partnerId) {
            this.updateMessageStatusOnServer(incoming.id, 'delivered');
          }
        }
      )
      .on(
        'broadcast',
        { event: 'delete-message' },
        async (payload) => {
          const { messageId } = payload.payload;
          console.log(`[ChatService] Received delete broadcast for ${messageId}`);
          await offlineService.deleteMessage(messageId);
          this.onDeleteMessage?.(messageId);
        }
      )
      .subscribe((status, err) => {
        this.isRealtimeConnecting = false;
        if (status === 'SUBSCRIBED') {
          this.isRealtimeConnected = true;
          this.realtimeRetryCount = 0;
          this.syncConnectivityState();
          this.startQueueProcessing();
          this.fetchMissedMessages();
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          this.isRealtimeConnected = false;
          this.syncConnectivityState();
          this.handleRealtimeReconnect();
        }
      });
  }

  private handleRealtimeReconnect() {
    if (this.isReconnecting) return;
    if (this.realtimeRetryCount >= MAX_REALTIME_RETRIES) {
      this.isRealtimeConnected = false;
      this.isReconnecting = false;
      this.startMessagePolling();
      return;
    }

    this.isReconnecting = true;
    if (this.realtimeRetryTimer) clearTimeout(this.realtimeRetryTimer);

    if (this.channel) {
      const oldChannel = this.channel;
      this.channel = null;
      supabase.removeChannel(oldChannel).catch(() => {});
    }

    const delay = Math.min(Math.pow(2, this.realtimeRetryCount) * 1000, 30000);
    this.realtimeRetryCount++;

    this.realtimeRetryTimer = setTimeout(async () => {
      this.isReconnecting = false;
      await this.subscribeToRealtime();
    }, delay);
  }

  public getConnectivityState() {
    return {
      isDeviceOnline: this.isDeviceOnline,
      isServerReachable: this.isServerReachable,
      isRealtimeConnected: this.isRealtimeConnected
    };
  }

  private async setupNetworkListener(): Promise<void> {
    await this.checkConnectivity();
    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        this.checkConnectivity();
        if (this.isInitialized) this.fetchMissedMessages();
      }
    };
    const subscription = AppState.addEventListener('change', handleAppState);
    const intervalId = setInterval(() => this.checkConnectivity(), 15_000);
    this.networkListenerCleanup = () => {
      subscription.remove();
      clearInterval(intervalId);
    };
  }

  private async checkConnectivity(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId  = setTimeout(() => controller.abort(), 8_000);
      await fetch(SUPABASE_ENDPOINT, { method: 'GET', signal: controller.signal, mode: 'no-cors', headers: { 'Cache-Control': 'no-cache' } });
      clearTimeout(timeoutId);
      this.isDeviceOnline = true;
      this.isServerReachable = true;
      this.syncConnectivityState();
      this.startQueueProcessing();
      return true;
    } catch (error: any) {
      this.isServerReachable = false;
      this.syncConnectivityState();
      this.stopQueueProcessing();
      return false;
    }
  }

  private syncConnectivityState(): void {
    const isActuallyOnline = this.isDeviceOnline && this.isServerReachable;
    this.onNetworkStatusChange?.(isActuallyOnline);
    if (isActuallyOnline) this.startQueueProcessing();
  }

  private syncConnected(): void {
    if (!this.isServerReachable || !this.isDeviceOnline) {
      this.isDeviceOnline = true;
      this.isServerReachable = true;
      this.syncConnectivityState();
    }
  }

  private startQueueProcessing(): void {
    if (!this.isActuallyOnline) return;
    this.clearQueueTimer();
    if (this.isProcessingQueue) {
      this.hasPendingProcessQueueTrigger = true;
      return;
    }
    void this.processQueue();
  }

  private stopQueueProcessing(): void {
    this.clearQueueTimer();
    this.sendingIds.clear();
  }

  private isProcessingQueue: boolean = false;
  private hasPendingProcessQueueTrigger: boolean = false;

  private clearQueueTimer(): void {
    if (this.processQueueTimer) {
      clearTimeout(this.processQueueTimer as any);
      this.processQueueTimer = null;
    }
  }

  private scheduleQueueProcessing(delayMs: number): void {
    this.clearQueueTimer();
    if (!this.isActuallyOnline) return;

    this.processQueueTimer = setTimeout(() => {
      this.processQueueTimer = null;
      void this.processQueue();
    }, delayMs) as any;
  }

  private messageNeedsLocalUpload(message: QueuedMessage): boolean {
    const groupedItems = decodeGroupedItems(message.media?.thumbnail);
    if (groupedItems.some((item) => !!item.localFileUri && !item.url)) {
      return true;
    }

    return !!(
      message.localFileUri &&
      message.media &&
      message.media.type !== 'status_reply' &&
      !message.media.url
    );
  }

  private getPrioritizedPendingMessages(messages: QueuedMessage[]): QueuedMessage[] {
    return [...messages].sort((a, b) => {
      const aNeedsUpload = this.messageNeedsLocalUpload(a);
      const bNeedsUpload = this.messageNeedsLocalUpload(b);

      if (aNeedsUpload !== bNeedsUpload) {
        return aNeedsUpload ? 1 : -1;
      }

      return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    });
  }

  private async findServerMessageById(messageId: string): Promise<ChatMessage | null> {
    try {
      const result = await withTimeout<{ data: any; error: any }>(
        supabase.from('messages').select('*').eq('id', messageId).maybeSingle() as PromiseLike<{ data: any; error: any }>,
        SUPABASE_INSERT_TIMEOUT_MS,
        `Message lookup ${messageId}`
      );
      const { data, error } = result;
      if (error || !data) return null;
      return this.mapDbRowToChatMessage(data);
    } catch {
      return null;
    }
  }

  private async persistRemoteMessageRow(
    row: any,
    emitMode: 'never' | 'if_new' | 'always' = 'if_new'
  ): Promise<{ message: ChatMessage; existed: boolean }> {
    const message = this.mapDbRowToChatMessage(row);
    const chatId = message.group_id || (message.sender_id === this.userId ? message.receiver_id : message.sender_id);
    const existing = await offlineService.getMessageById(message.id);

    await offlineService.saveMessage(chatId, {
      id: message.id,
      sender: message.sender_id === this.userId ? 'me' : 'them',
      text: message.text,
      timestamp: message.timestamp,
      status: message.status,
      media: message.media,
      replyTo: message.reply_to,
      senderName: message.senderName,
      groupId: message.group_id,
    });

    if (emitMode === 'always' || (emitMode === 'if_new' && !existing)) {
      this.onNewMessage?.(message);
    }

    return { message, existed: !!existing };
  }

  private async repairIncompleteIncomingMediaMessages(): Promise<void> {
    if (!this.userId || !this.partnerId) return;

    try {
      const incompleteIds = await offlineService.getIncompleteIncomingMediaMessageIds(this.partnerId, 25);
      if (!incompleteIds.length) return;

      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .in('id', incompleteIds);

      if (error || !data?.length) return;

      const rows = [...data].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );

      for (const row of rows) {
        if (!this.isGroup && row.receiver !== this.userId) continue;
        if (this.isGroup && row.group_id !== this.partnerId) continue;
        if (!row.media_url && !row.media_thumbnail) continue;
        await this.persistRemoteMessageRow(
          row,
          row.sender === this.partnerId ? 'always' : 'never'
        );
      }
    } catch (error) {
      console.warn('[ChatService] Incomplete incoming media repair failed:', error);
    }
  }

  private async finalizeSentMessage(message: QueuedMessage, row: any, finalMediaUrl?: string, mediaThumbnail?: string): Promise<void> {
    this.syncConnected();

    const serverId = row.id.toString();
    if (message.id !== serverId) {
      await offlineService.updateMessageId(message.id, serverId);
    }
    if (finalMediaUrl && finalMediaUrl !== message.media?.url) {
      await offlineService.updateMessageMediaUrl(serverId, finalMediaUrl);
    }
    // For grouped media: update thumbnail JSON with uploaded URLs in local SQLite
    if (mediaThumbnail && mediaThumbnail.includes('__MEDIA_GROUP')) {
      try {
        const db = await getDb();
        await db.runAsync(`UPDATE messages SET media_thumbnail = ? WHERE id = ?`, [mediaThumbnail, serverId]);
      } catch (_) {}
    }

    await offlineService.updateMessageStatus(serverId, 'sent');
    await offlineService.removePendingSyncOpsForEntity('message', message.id);
    this.onStatusUpdate?.(message.id, 'sent', serverId);
  }

  private async repairServerMessageMedia(
    messageId: string,
    payload: {
      mediaUrl: string;
      mediaType?: string | null;
      mediaThumbnail?: string | null;
      mediaDuration?: number | null;
    }
  ): Promise<void> {
    if (!payload.mediaUrl) return;

    const { error } = await withTimeout(
      supabase
        .from('messages')
        .update({
          media_url: payload.mediaUrl,
          media_type: payload.mediaType ?? null,
          media_thumbnail: payload.mediaThumbnail ?? null,
          media_duration: payload.mediaDuration ?? null,
        })
        .eq('id', messageId),
      SUPABASE_INSERT_TIMEOUT_MS,
      `Media repair ${messageId}`
    );

    if (error) {
      throw error;
    }
  }

  private isDuplicateInsertError(error: any): boolean {
    const message = typeof error?.message === 'string' ? error.message.toLowerCase() : '';
    return error?.code === '23505'
      || message.includes('duplicate key')
      || message.includes('unique constraint')
      || message.includes('already exists');
  }

  private async processQueue(): Promise<void> {
    this.clearQueueTimer();
    if (!this.isActuallyOnline || this.isProcessingQueue) {
      if (this.isProcessingQueue) this.hasPendingProcessQueueTrigger = true;
      return;
    }

    this.isProcessingQueue = true;
    this.hasPendingProcessQueueTrigger = false;

    try {
      const pendingMessages = this.getPrioritizedPendingMessages(await offlineService.getPendingMessages());
      const pollInterval = this.isRealtimeConnected ? REALTIME_POLL_INTERVAL : IDLE_POLL_INTERVAL;
      const nextInterval = pendingMessages.length > 0 ? ACTIVE_POLL_INTERVAL : pollInterval;

      for (const message of pendingMessages) {
        if (this.sendingIds.has(message.id)) continue;
        await this.sendMessageToSupabase(message);
      }

      if (this.isActuallyOnline) {
        this.scheduleQueueProcessing(nextInterval);
      }
    } catch (error) {
      if (this.isActuallyOnline) {
        this.scheduleQueueProcessing(REALTIME_POLL_INTERVAL);
      }
    } finally {
      this.isProcessingQueue = false;
      if (this.hasPendingProcessQueueTrigger && this.isActuallyOnline) {
        this.hasPendingProcessQueueTrigger = false;
        this.scheduleQueueProcessing(0);
      }
    }
  }

  private async sendMessageToSupabase(message: QueuedMessage): Promise<void> {
    const senderId = this.userId;
    if (!senderId) return;
    this.sendingIds.add(message.id);
    let finalMediaUrl = message.media?.url;
    let mediaType = message.media?.type ?? null;
    let mediaThumbnail = message.media?.thumbnail ?? null;
    let mediaDuration = message.media?.duration ?? null;

    try {
      // Hard stop: don't retry forever — mark as permanently failed
      if (message.retryCount >= MAX_TOTAL_RETRIES) {
        console.warn(`[ChatService] Message ${message.id} exceeded max retries (${MAX_TOTAL_RETRIES}), marking permanently failed`);
        await offlineService.markMessageAsFailed(message.id, 'Max retries exceeded');
        this.onStatusUpdate?.(message.id, 'failed');
        this.sendingIds.delete(message.id);
        return;
      }

      // Idempotency guard: skip if this message was already sent (e.g. Realtime arrived first)
      const existing = await offlineService.getMessageById(message.id);
      if (existing && (existing.status === 'sent' || existing.status === 'delivered' || existing.status === 'read')) {
        this.sendingIds.delete(message.id);
        return;
      }

      const groupedItems = decodeGroupedItems(message.media?.thumbnail);
      let uploadSucceeded = !this.messageNeedsLocalUpload(message);

      if (groupedItems.length > 0) {
        const uploadedItems: GroupMediaItem[] = [];
        const totalItems = groupedItems.length;
        let allGroupedUploadsSucceeded = true;
        for (let gi = 0; gi < totalItems; gi++) {
          const item = groupedItems[gi];
          let uploadedUrl = item.url || '';
          if (!uploadedUrl && item.localFileUri) {
            try {
              uploadedUrl = await storageService.uploadImage(item.localFileUri, 'chat-media', senderId, (progress) => {
                try {
                  const overallProgress = (gi + progress) / totalItems;
                  this.onUploadProgressCb?.(message.id, overallProgress);
                } catch (_) {}
              }) || '';
            } catch (uploadErr: any) {
              allGroupedUploadsSucceeded = false;
              console.warn(`[ChatService] Group media upload failed for ${message.id}:`, uploadErr?.message || uploadErr);
            }
          }

          if (!uploadedUrl && item.localFileUri) {
            allGroupedUploadsSucceeded = false;
          }

          uploadedItems.push({
            ...item,
            url: uploadedUrl || '',
            localFileUri: uploadedUrl ? undefined : item.localFileUri,
          });
        }

        if (!allGroupedUploadsSucceeded) {
          // Save partial progress so already-uploaded items aren't re-uploaded on retry
          const partialThumbnail = encodeGroupedItems(uploadedItems.map(i => ({
            ...i,
            localFileUri: i.url ? undefined : i.localFileUri,
          })));
          try {
            const db = await getDb();
            await db.runAsync(`UPDATE messages SET media_thumbnail = ? WHERE id = ?`, [partialThumbnail, message.id]);
          } catch (_) {}
          throw new Error('Media upload incomplete');
        }

        uploadSucceeded = true;
        finalMediaUrl = uploadedItems.find(i => !!i.url)?.url || finalMediaUrl;
        mediaType = uploadedItems[0]?.type || mediaType;
        mediaDuration = uploadedItems[0]?.duration || mediaDuration;
        mediaThumbnail = encodeGroupedItems(uploadedItems.map(i => ({
          ...i,
          localFileUri: undefined,
        })));

        if (!finalMediaUrl) {
          throw new Error('Media upload completed without a storage key');
        }
      } else if (message.localFileUri && !finalMediaUrl && message.media) {
        // Verify local file still exists before attempting upload
        try {
          const fileCheck = await FileSystem.getInfoAsync(message.localFileUri);
          if (!fileCheck.exists) {
            console.warn(`[ChatService] ⚠️ Source file missing: ${message.localFileUri} — marking permanently failed`);
            await offlineService.markMessageAsFailed(message.id, 'Source file deleted');
            this.onStatusUpdate?.(message.id, 'failed');
            this.sendingIds.delete(message.id);
            return;
          }
        } catch (_) {}

        console.log(`[ChatService] 📸 Uploading single media: ${message.localFileUri.substring(0, 60)}...`);
        finalMediaUrl = await storageService.uploadImage(message.localFileUri, 'chat-media', senderId, (progress) => {
          try { this.onUploadProgressCb?.(message.id, progress); } catch (_) {}
        }) || undefined;
        if (!finalMediaUrl) {
          throw new Error('Media upload returned no storage key');
        }
        uploadSucceeded = true;
        console.log(`[ChatService] ✅ Upload success: ${finalMediaUrl}`);
      }

      if (finalMediaUrl) await offlineService.updateMessageMediaUrl(message.id, finalMediaUrl);

      console.log(`[ChatService] 📤 Inserting message ${message.id} to Supabase | media_url: ${finalMediaUrl ? 'YES' : 'NO'} | media_type: ${mediaType} | uploadOk: ${uploadSucceeded}`);
      const result = await withTimeout<{ data: any; error: any }>(
        supabase
          .from('messages')
          .insert({
            id:            message.id.startsWith('temp_') ? undefined : message.id,
            sender:        senderId,
            receiver:      this.isGroup ? null : message.chatId,
            group_id:      this.isGroup ? message.chatId : null,
            text:          message.text,
            media_type:    mediaType,
            media_url:     finalMediaUrl          ?? null,
            media_caption: message.media?.caption ?? null,
            media_thumbnail: mediaThumbnail,
            reply_to_id:   message.replyTo        ?? null,
            created_at:    message.timestamp,
            media_duration: mediaDuration,
          })
          .select()
          .single() as PromiseLike<{ data: any; error: any }>,
        SUPABASE_INSERT_TIMEOUT_MS,
        `Message insert ${message.id}`
      );
      const { data, error } = result;

      if (error) {
        console.warn(`[ChatService] ❌ Supabase INSERT failed for ${message.id}:`, error.message);
        throw error;
      }
      console.log(`[ChatService] ✅ Message ${message.id} inserted as ${data.id}`);
      await this.finalizeSentMessage(message, data, finalMediaUrl, mediaThumbnail ?? undefined);

      try {
        await supabase.functions.invoke('send-message-push', {
          body: { receiverId: message.chatId, senderId: senderId, senderName: this.senderName, text: message.text, messageId: data.id?.toString?.() || message.id },
        });
      } catch (_) {}

    } catch (error: any) {
      if (this.isDuplicateInsertError(error)) {
        const existingServerMessage = await this.findServerMessageById(message.id);
        if (existingServerMessage) {
          const existingMediaUrl = existingServerMessage.media?.url?.trim();
          if (finalMediaUrl && !existingMediaUrl) {
            await this.repairServerMessageMedia(existingServerMessage.id, {
              mediaUrl: finalMediaUrl,
              mediaType,
              mediaThumbnail,
              mediaDuration,
            });
          }
          await this.finalizeSentMessage(message, { id: existingServerMessage.id }, finalMediaUrl || existingServerMessage.media?.url);
          return;
        }
      }

      const errMsg = error?.message ?? 'Network error';
      console.warn(`[ChatService] Message ${message.id} send failed (attempt ${message.retryCount + 1}):`, errMsg);
      const newRetryCount = message.retryCount + 1;
      await offlineService.updateMessageRetry(message.id, newRetryCount, errMsg);
      if (newRetryCount >= MAX_RETRY_COUNT) {
        await offlineService.markMessageAsFailed(message.id, errMsg);
        this.onStatusUpdate?.(message.id, 'failed');
      }
    } finally {
      this.sendingIds.delete(message.id);
    }
  }

  private isFetchingMissed = false;
  private async fetchMissedMessages(): Promise<void> {
    if (this.isFetchingMissed) return;
    if (!this.userId || !this.partnerId) return;

    // 🛡️ THROTTLE: Don't sync more than once every 10 seconds per chat
    const now = Date.now();
    const lastFetch = this.lastFetchTimestamps.get(this.partnerId) || 0;
    if (now - lastFetch < 10000) {
        // console.log(`[ChatService] Skipping redundant sync for ${this.partnerId} (last fetch was ${Math.round((now - lastFetch) / 1000)}s ago)`);
        return;
    }

    this.isFetchingMissed = true;
    this.lastFetchTimestamps.set(this.partnerId, now);
    try {
      // 1. Get the latest message timestamp from local DB to avoid redundant fetching
      const latestLocalTimestamp = await offlineService.getLatestMessageTimestamp(this.partnerId);
      
      let query = supabase
        .from('messages')
        .select('*');

      if (this.isGroup) {
        query = query.eq('group_id', this.partnerId);
      } else {
        query = query.or(`and(sender.eq.${this.partnerId},receiver.eq.${this.userId}),and(sender.eq.${this.userId},receiver.eq.${this.partnerId})`);
      }

      if (latestLocalTimestamp) {
        // Only fetch messages NEWER than what we already have
        console.log(`[ChatService] Fetching missed messages since: ${latestLocalTimestamp}`);
        query = query.gt('created_at', latestLocalTimestamp);
      } else {
        // First sync for this chat, get last 50
        console.log('[ChatService] First sync, fetching last 50 messages');
        query = query.order('created_at', { ascending: false }).limit(50);
      }

      const { data, error } = await query;

      if (error || !data) {
        console.warn(`[ChatService] fetchMissedMessages query failed:`, error?.message || 'no data');
        if (!this.lastPollAt) this.lastPollAt = new Date().toISOString();
        return;
      }

      console.log(`[ChatService] fetchMissedMessages returned ${data.length} rows for ${this.userId} <-> ${this.partnerId}`);
      this.syncConnected();

      const messages = [...data];
      if (!latestLocalTimestamp) {
        messages.reverse(); // If we used limit(50) with desc order, reverse for storage
      } else {
        // If we queried with gt, ensure ascending order for processing
        messages.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      }

      if (messages.length > 0) {
        this.lastPollAt = messages[messages.length - 1].created_at;
      } else if (!this.lastPollAt) {
        this.lastPollAt = new Date().toISOString();
      }

      for (const row of messages) {
        const msg = this.mapDbRowToChatMessage(row);
        if (msg.sender_id === this.userId && this.sendingIds.has(msg.id)) continue;

        await this.persistRemoteMessageRow(row, 'if_new');
      }

      await this.repairIncompleteIncomingMediaMessages();
      await this.repairGroupedMediaThumbnails();
    } catch (e) {
      console.warn('[ChatService] fetchMissedMessages error:', e);
    } finally {
      this.isFetchingMissed = false;
    }
  }

  public async requestDeleteForEveryone(messageId: string): Promise<boolean> {
    if (!this.userId || !this.partnerId || !this.channel) return false;
    this.channel.send({ type: 'broadcast', event: 'delete-message', payload: { messageId } });
    const { error } = await supabase.from('messages').delete().eq('id', messageId);
    if (error) return false;
    return true;
  }

  async sendMessage(chatId: string, text: string, media?: ChatMessage['media'], replyTo?: string, localUri?: string, id?: string): Promise<ChatMessage | null> {
    if (!this.userId) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        this.userId = user.id;
        this.senderName = user.user_metadata?.name ?? user.user_metadata?.display_name ?? this.senderName;
      }
    }

    const targetChatId = chatId || this.partnerId;
    if (!this.userId || !targetChatId) return null;

    const messageId = id || Crypto.randomUUID();
    const timestamp = new Date().toISOString();

    // WHATSAPP PATTERN: Move media to 'Sent' folder immediately for local-first persistence
    let finalLocalUri = localUri;
    if (localUri && media) {
        try {
            // Use getDestinationPath with isSent = true to get the correct Soul/Media/.../Sent/ path
            const destPath = soulFolderService.getDestinationPath(media.type as any, true, localUri);
            await FileSystem.copyAsync({ from: localUri, to: destPath });
            finalLocalUri = destPath;
            console.log(`[ChatService] Media moved to local Sent folder: ${destPath}`);
        } catch (e) {
            console.warn('[ChatService] Failed to move media to Sent folder:', e);
        }
    }

    const queuedMsg: QueuedMessage = {
      id: messageId, chatId: targetChatId, sender: 'me', text, timestamp, status: 'pending', media: media ? { ...media } : undefined, replyTo, senderName: this.senderName, retryCount: 0, localFileUri: finalLocalUri,
    };

    try {
      await offlineService.savePendingMessage(targetChatId, queuedMsg);
      const idempotencyKey = `${this.userId}:${targetChatId}:${Date.now()}:${Crypto.randomUUID()}`;
      await offlineService.updateMessageIdempotencyKey(messageId, idempotencyKey);
    } catch (e) {}

    const uiMessage: ChatMessage = {
      id: messageId, sender_id: this.userId, receiver_id: targetChatId, text, timestamp, status: 'pending', media, reply_to: replyTo, senderName: this.senderName, localFileUri: finalLocalUri,
    };

    this.onNewMessage?.(uiMessage);
    if (this.isActuallyOnline) this.startQueueProcessing();
    return uiMessage;
  }

  async updateMessageStatusOnServer(messageId: string, status: 'delivered' | 'read'): Promise<void> {
    try {
      await supabase.from('messages').update({ status }).eq('id', messageId);
      this.syncConnected();
    } catch (_) {}
  }

  async markMessagesAsRead(messageIds: string[]): Promise<void> {
    if (!messageIds.length) return;
    try {
      await supabase.from('messages').update({ status: 'read' }).in('id', messageIds);
      this.syncConnected();
      for (const id of messageIds) await offlineService.updateMessageStatus(id, 'read');
    } catch (_) {}
  }

  async retryMessage(messageId: string): Promise<void> {
    const message = await offlineService.getMessageById(messageId);
    if (!message) return;
    await offlineService.updateMessageRetry(messageId, 0);
    await offlineService.updateMessageStatus(messageId, 'pending');
    if (this.isActuallyOnline) this.startQueueProcessing();
  }

  getNetworkStatus(): boolean {
    return this.isActuallyOnline;
  }

  async getPendingMessageCount(chatId: string): Promise<number> {
    const pending = await offlineService.getPendingMessages();
    return pending.filter(m => m.chatId === chatId).length;
  }

  async deleteMessageFromServer(messageId: string): Promise<void> {
    try {
      // 1. Get the message to see if it has media
      const { data: msg } = await supabase.from('messages').select('media_url').eq('id', messageId).single();
      if (msg?.media_url) {
        // Extract key and delete from storage
        const mediaKey = msg.media_url.split('/').pop();
        if (mediaKey) {
          await storageService.deleteMedia(mediaKey);
        }
      }
      // 2. Delete from Supabase
      await supabase.from('messages').delete().eq('id', messageId);
      // 3. Delete from Local DB
      await offlineService.deleteMessage(messageId);
    } catch (e) {
      console.warn('[ChatService] Failed to delete message from server/storage:', e);
      // Fallback: at least try to delete from local DB if not already
      await offlineService.deleteMessage(messageId);
    }
  }

  async clearServerMessages(userId: string, partnerId: string): Promise<void> {
    try {
      // 1. Fetch messages with media to clean up storage
      const { data: mediaMessages } = await supabase
        .from('messages')
        .select('media_url')
        .or(`and(sender.eq.${userId},receiver.eq.${partnerId}),and(sender.eq.${partnerId},receiver.eq.${userId})`)
        .not('media_url', 'is', null);

      if (mediaMessages && mediaMessages.length > 0) {
        for (const msg of mediaMessages) {
          if (msg.media_url) {
            const mediaKey = msg.media_url.split('/').pop();
            if (mediaKey) {
              await storageService.deleteMedia(mediaKey).catch(() => {});
            }
          }
        }
      }

      // 2. Delete from Supabase
      await supabase
        .from('messages')
        .delete()
        .or(`and(sender.eq.${userId},receiver.eq.${partnerId}),and(sender.eq.${partnerId},receiver.eq.${userId})`);

      // 3. Clear Local Chat
      await offlineService.clearChat(partnerId);
    } catch (e) {
      console.error('[ChatService] clearServerMessages failed:', e);
    }
  }

  private mapDbRowToChatMessage(row: any): ChatMessage {
    return {
      id: row.id.toString(), sender_id: row.sender, receiver_id: row.receiver, group_id: row.group_id, text: row.text ?? '', timestamp: row.created_at, status: (row.status as ChatMessage['status']) ?? 'sent',
      media: (row.media_url || row.media_type || row.media_thumbnail) ? { type: row.media_type ?? 'image', url: proxySupabaseUrl(row.media_url ?? ''), caption: row.media_caption, thumbnail: row.media_thumbnail, duration: row.media_duration } : undefined,
      reply_to: row.reply_to_id ? row.reply_to_id.toString() : undefined, 
      senderName: row.sender_name ?? undefined,
      reactions: row.reaction ? [row.reaction] : undefined,
    };
  }

  private startMessagePolling(): void {
    const currentFrequency = this.isRealtimeConnected ? POLLING_INTERVAL_NORMAL : POLLING_INTERVAL_FALLBACK;
    if (this.pollTimer) return;
    if (!this.lastPollAt) this.lastPollAt = new Date().toISOString();

    this.pollTimer = setInterval(() => { if (AppState.currentState === 'active') this.pollForNewMessages(); }, currentFrequency) as any;

    if (!this.appStateListener) {
      this.appStateListener = AppState.addEventListener('change', (state) => {
        if (state === 'active') { this.pollForNewMessages(); this.checkConnectivity(); }
      });
    }
  }

  private stopMessagePolling(): void {
    if (this.pollTimer) { clearInterval(this.pollTimer as any); this.pollTimer = null; }
    if (this.appStateListener) { this.appStateListener.remove(); this.appStateListener = null; }
  }

  private async pollForNewMessages(): Promise<void> {
    if (!this.userId || !this.partnerId || !this.lastPollAt || this.isPolling || !this.isActuallyOnline) return;
    this.isPolling = true;
    try {
      let query = supabase.from('messages').select('*');
      if (this.isGroup) {
        query = query.eq('group_id', this.partnerId);
      } else {
        query = query.or(`and(sender.eq.${this.partnerId},receiver.eq.${this.userId}),and(sender.eq.${this.userId},receiver.eq.${this.partnerId})`);
      }
      const { data, error } = await query.gt('created_at', this.lastPollAt).order('created_at', { ascending: true });
      if (error) return;
      this.lastPollAt = data?.[data.length - 1]?.created_at || new Date().toISOString();
      if (!data) return;
      for (const row of data) {
        const msg = this.mapDbRowToChatMessage(row);
        await this.persistRemoteMessageRow(row, 'if_new');
        if (msg.sender_id === this.partnerId) this.updateMessageStatusOnServer(msg.id, 'delivered');
      }
    } catch (_) {} finally { this.isPolling = false; }
  }

  cleanup(): void {
    this.stopQueueProcessing();
    this.stopMessagePolling();
    if (this.networkListenerCleanup) { this.networkListenerCleanup(); this.networkListenerCleanup = null; }
    if (this.channel) { const oldChannel = this.channel; this.channel = null; supabase.removeChannel(oldChannel).catch(() => {}); }
    this.onNewMessage = null; this.onStatusUpdate = null; this.onNetworkStatusChange = null; this.onUploadProgressCb = null; this.onAcknowledgment = null; this.onDeleteMessage = null;
    this.isInitialized = false; this.userId = null; this.partnerId = null; this.isDeviceOnline = true; this.isServerReachable = true; this.lastPollAt = null;
    this.realtimeRetryCount = 0; this.isReconnecting = false; this.isRealtimeConnecting = false;
    if (this.realtimeRetryTimer) { clearTimeout(this.realtimeRetryTimer); this.realtimeRetryTimer = null; }
    this.sendingIds.clear();
  }
}

export const chatService = new ChatService();
