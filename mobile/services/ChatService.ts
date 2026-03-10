// mobile/services/ChatService.ts
// ─────────────────────────────────────────────────────────────────────────────
// CHAT SERVICE  (Network + Sync Layer)
//
// RESPONSIBILITY:
//   - Manages the Supabase Realtime subscription (listen for incoming messages)
//   - Manages the outgoing message queue (send pending messages to Supabase)
//   - Checks network connectivity
//   - Bridges the local SQLite DB (via offlineService) with the remote server
//
// WHAT THIS FILE DOES NOT DO:
//   - Does NOT touch SQLite directly — that is LocalDBService's job
//   - Does NOT render anything — that is the screen/component's job
//
// BUGS FIXED vs original:
//   [BUG 1] AbortError logic was inverted — timeout was treated as "online"
//   [BUG 2] Schema mismatch — `receiver` column missing from INSERT payload
//   [BUG 3] Realtime listener had no filter — was receiving ALL users' messages
//   [BUG 4] Queue polled every 2s even when empty — wasted battery
//   [BUG 5] `senderName` hardcoded as 'Someone' in push notification call
//   [BUG 6] `substr` deprecated — replaced with `substring`
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '../config/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';
import * as Crypto from 'expo-crypto';
import NetInfo from '@react-native-community/netinfo';
import { SUPABASE_ENDPOINT } from '../config/api';
import { offlineService, type QueuedMessage, type MessageStatus } from './LocalDBService';
import { storageService } from './StorageService';
import { AppState, AppStateStatus } from 'react-native';

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  text: string;
  timestamp: string;
  status: MessageStatus;
  media?: {
    type: 'image' | 'video' | 'audio' | 'file' | 'status_reply'; // 'image' | 'video' | 'audio' | 'file' | 'status_reply';
    url: string;
    name?: string;
    caption?: string;
    thumbnail?: string;
  };
  reply_to?: string;
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
const INITIAL_RETRY_DELAY  = 1_000;   // 1 second
const MAX_RETRY_DELAY      = 60_000;  // 1 minute cap

// Queue polling intervals:
//   - ACTIVE: used when there ARE pending messages  (check often)
//   - IDLE:   used when queue is empty              (save battery)
const ACTIVE_POLL_INTERVAL = 2_000;   // 2 seconds  [FIX for BUG 4]
const IDLE_POLL_INTERVAL   = 15_000;  // 15 seconds [FIX for BUG 4]

// ─────────────────────────────────────────────────────────────────────────────
// CHAT SERVICE
// ─────────────────────────────────────────────────────────────────────────────

class ChatService {
  private channel:              ReturnType<typeof supabase.channel> | null = null;
  private userId:               string | null = null;
  private partnerId:            string | null = null;
  private senderName:           string = 'Someone'; // Updated in initialize()

  private onNewMessage:         MessageCallback       | null = null;
  private onStatusUpdate:       StatusCallback        | null = null;
  private onNetworkStatusChange:NetworkStatusCallback | null = null;
  private onUploadProgressCb:   UploadProgressCallback| null = null;

  private isInitialized      = false;
  private isDeviceOnline     = true;   // Physical network connection
  private isServerReachable  = true;   // Can we actually ping our server?
  private isRealtimeConnected = false;  // WebSocket channel status
  private isQueuePaused      = false;

  private get isActuallyOnline(): boolean {
    return this.isDeviceOnline && this.isServerReachable;
  }
  private realtimeRetryCount:   number = 0;
  private realtimeRetryTimer:   ReturnType<typeof setTimeout> | null = null;

  // Queue management
  private processQueueTimer:    ReturnType<typeof setInterval> | null = null;
  private sendingIds:           Set<string> = new Set();
  private networkListenerCleanup: (() => void) | null = null;

  // Polling fallback (when Realtime WebSocket is blocked by ISP)
  private pollTimer:            ReturnType<typeof setInterval> | null = null;
  private lastPollAt:           string | null = null;
  private isPolling:            boolean = false;   // guard against concurrent polls
  private appStateListener:     any = null;

  // ── PUBLIC: initialize() ────────────────────────────────────────────────
  //
  // Call this when the user opens a chat screen.
  //
  // Parameters:
  //   userId     — the logged-in user's ID
  //   partnerId  — the other person's ID
  //   senderName — the logged-in user's display name (used in push notifications)
  //   onMessage  — callback: new/incoming message received
  //   onStatus   — callback: a message's status changed (sent/delivered/read/failed)
  //   onNetworkStatus — optional callback: connectivity changed
  //   onUploadProgress - optional callback: file upload progress
  async initialize(
    userId: string,
    partnerId: string,
    senderName: string,
    onMessage: MessageCallback,
    onStatus: StatusCallback,
    onNetworkStatus?: NetworkStatusCallback,
    onUploadProgress?: UploadProgressCallback
  ): Promise<void> {
    // Idempotent — don't re-subscribe if already on this exact chat
    if (this.isInitialized && this.userId === userId && this.partnerId === partnerId) {
      return;
    }

    // Tear down any previous subscription first
    this.cleanup();

    this.userId      = userId;
    this.partnerId   = partnerId;
    this.senderName  = senderName;   // [FIX BUG 5] no longer hardcoded

    this.onNewMessage          = onMessage;
    this.onStatusUpdate        = onStatus;
    this.onNetworkStatusChange = onNetworkStatus ?? null;

    await this.setupNetworkListener();
    await this.fetchMissedMessages();
    this.subscribeToRealtime();
    this.startMessagePolling();
  }

  // ── PRIVATE: subscribeToRealtime() ──────────────────────────────────────
  private subscribeToRealtime(): void {
    if (!this.userId) return;

    // Each user gets their own channel so filters work correctly
    const channelName = `chat_${this.userId}`;
    this.channel = supabase.channel(channelName);

    this.channel
      // ── New message arriving FOR ME ──────────────────────────────────────
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'messages',
          // [HARDENING] Removing filter=receiver=eq.X to avoid binding mismatch.
          // We filter locally in the callback instead.
        },
        async (payload) => {
          const incoming = this.mapDbRowToChatMessage(payload.new);
          
          // Verify it's actually for ME
          if (incoming.receiver_id !== this.userId) return;

          // WhatsApp rule: ALWAYS write to SQLite before touching the UI
          await offlineService.saveMessage(incoming.sender_id, {
            id:        incoming.id,
            sender:    'them',
            text:      incoming.text,
            timestamp: incoming.timestamp,
            status:    'delivered',
            media:     incoming.media,
            replyTo:   incoming.reply_to,
          });

          // Only fire the UI callback if this chat is currently open
          if (incoming.sender_id === this.partnerId) {
            this.onNewMessage?.(incoming);
            // Let the server know the message was delivered
            this.updateMessageStatusOnServer(incoming.id, 'delivered');
          }
        }
      )

      // ── Status update on one of MY sent messages ──────────────────────────
      .on(
        'postgres_changes',
        {
          event:  'UPDATE',
          schema: 'public',
          table:  'messages',
          // Removing filter to avoid binding mismatch. Local filter below.
        },
        async (payload) => {
          const updated = payload.new as any;
          
          // Verify I am the sender of this message
          if (updated.sender !== this.userId) return;
          if (updated.status) {
            // Sync the new status to local DB
            await offlineService.updateMessageStatus(
              updated.id.toString(),
              updated.status as MessageStatus
            );
            this.onStatusUpdate?.(updated.id.toString(), updated.status);
          }
        }
      )

      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          this.isInitialized = true;
          this.isRealtimeConnected = true;
          this.realtimeRetryCount = 0;
          this.syncConnectivityState();
          console.log(`[ChatService] Messages Realtime SUBSCRIBED for userId=${this.userId} (Channel: ${channelName})`);
          this.startQueueProcessing();
          // Re-fetch missed messages now that the Supabase connection is confirmed live.
          // The initial fetchMissedMessages() at init may have failed if the connection
          // wasn't ready yet (visible as "CONNECTING..." in the header).
          this.fetchMissedMessages();
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          this.isRealtimeConnected = false;
          console.warn(`[ChatService] Realtime status: ${status} for channel: ${channelName}. Attempting reconnect...`);
          this.syncConnectivityState();
          this.handleRealtimeReconnect();
        }
        if (err) {
            console.warn(`[ChatService] Subscription warning (Channel: ${channelName}):`, err);
            // If we get a binding mismatch, it's often because the filter value is unexpected
            if (err.message?.includes('mismatch between server and client bindings')) {
                console.warn(`[ChatService] Filter binding check (non-fatal): userId=${this.userId} (type=${typeof this.userId})`);
            }
        }
      });
  }

  private handleRealtimeReconnect() {
    if (this.realtimeRetryTimer) clearTimeout(this.realtimeRetryTimer);
    
    // [FIX] Clean up existing channel completely before retrying to avoid multiple active watchers
    if (this.channel) {
        console.log('[ChatService] Removing old channel before reconnect');
        supabase.removeChannel(this.channel);
        this.channel = null;
    }

    // Exponential backoff: 2s, 4s, 8s, 16s, max 30s
    const delay = Math.min(Math.pow(2, this.realtimeRetryCount) * 1000, 30_000);
    this.realtimeRetryCount++;

    console.log(`[ChatService] Reconnecting Realtime in ${delay}ms (attempt ${this.realtimeRetryCount})...`);
    this.realtimeRetryTimer = setTimeout(() => {
      this.subscribeToRealtime();
    }, delay);
  }

  // ── PUBLIC STATE GETTERS ────────────────────────────────────────────────
  
  public getConnectivityState() {
    return {
      isDeviceOnline: this.isDeviceOnline,
      isServerReachable: this.isServerReachable,
      isRealtimeConnected: this.isRealtimeConnected
    };
  }

  // ── PRIVATE: Network monitoring ─────────────────────────────────────────

  private async setupNetworkListener(): Promise<void> {
    await this.checkConnectivity();

    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        console.log('[ChatService] App foregrounded — checking connectivity');
        this.checkConnectivity();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppState);

    // Ping every 15 seconds — not too aggressive, not too lazy
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

      // Use GET instead of HEAD for better proxy compatibility
      const response = await fetch(SUPABASE_ENDPOINT, {
        method: 'GET',
        signal: controller.signal,
        mode:   'no-cors',
        headers: {
          'Cache-Control': 'no-cache'
        }
      });

      clearTimeout(timeoutId);

      // If we got ANY response (even opaque), the server is reachable
      this.isDeviceOnline = true;
      this.isServerReachable = true;
      this.syncConnectivityState();
      this.startQueueProcessing();
      return true;

    } catch (error: any) {
      this.isServerReachable = false;
      if (error?.name === 'AbortError') {
        console.warn('[ChatService] Connectivity check timed out → false');
      }
      this.syncConnectivityState();
      this.stopQueueProcessing();
      return false;
    }
  }

  private syncConnectivityState(): void {
    const isActuallyOnline = this.isDeviceOnline && this.isServerReachable;
    
    // [FIX] Consider WebSocket state too. If device is online but WS is CLOSED, we are not fully synced.
    const isFullyConnected = isActuallyOnline && this.isRealtimeConnected;
    
    // We notify listeners of general "online" status 
    this.onNetworkStatusChange?.(isActuallyOnline);

    if (isActuallyOnline) {
      this.processQueue();
    }
  }

  // [NEW] Call this whenever any REAL supabase call succeeds to force-clear 'Connecting...'
  private syncConnected(): void {
    if (!this.isServerReachable || !this.isDeviceOnline) {
      this.isDeviceOnline = true;
      this.isServerReachable = true;
      this.syncConnectivityState();
    }
  }

  // ── PRIVATE: Queue processing ────────────────────────────────────────────

  private startQueueProcessing(): void {
    if (this.processQueueTimer || !this.isActuallyOnline) return;

    // Run once immediately when we (re-)connect
    this.processQueue();

    // Then schedule repeating — interval adapts to queue size [FIX BUG 4]
    this.scheduleNextPoll();
  }

  private scheduleNextPoll(): void {
    if (this.processQueueTimer) {
      clearTimeout(this.processQueueTimer);
      this.processQueueTimer = null;
    }
    if (!this.isActuallyOnline) return;

    // Will be called after processQueue() finishes each cycle
    // (see processQueue's finally block)
  }

  private stopQueueProcessing(): void {
    if (this.processQueueTimer) {
      clearInterval(this.processQueueTimer as any);
      clearTimeout(this.processQueueTimer  as any);
      this.processQueueTimer = null;
    }
    this.sendingIds.clear();
  }

  private isProcessingQueue:          boolean = false;

  private async processQueue(): Promise<void> {
    if (!this.isActuallyOnline) return;
    if (this.isProcessingQueue) return;

    this.isProcessingQueue = true;

    try {
      const pendingMessages = await offlineService.getPendingMessages();

      // [FIX BUG 4] If queue is empty, poll slowly to save battery.
      //             If there are pending messages, poll aggressively.
      const nextInterval = pendingMessages.length > 0
        ? ACTIVE_POLL_INTERVAL
        : IDLE_POLL_INTERVAL;

      const now = Date.now();

      for (const message of pendingMessages) {
        // Skip if already in-flight
        if (this.sendingIds.has(message.id)) continue;

        // If a message was previously marked as 'failed', and we are back online processing the queue,
        // it means we caught it on a reconnect. We should reset its retry state and treat it as 'pending'
        // so it has a fresh chance to send.
        if (message.status === 'failed') {
          console.log(`[ChatService] Auto-retrying previously failed message: ${message.id}`);
          message.status = 'pending';
          message.retryCount = 0;
          await offlineService.updateMessageRetry(message.id, 0);
          await offlineService.updateMessageStatus(message.id, 'pending');
        }

        // Permanently failed — mark and notify UI (Only triggers if it fails max times *during this active session*)
        if (message.retryCount >= MAX_RETRY_COUNT) {
          await offlineService.markMessageAsFailed(
            message.id,
            `Failed after ${MAX_RETRY_COUNT} attempts`
          );
          this.onStatusUpdate?.(message.id, 'failed');
          continue;
        }

        // Exponential backoff check
        if (message.lastRetryAt && message.retryCount > 0) {
          const delay       = Math.min(
            INITIAL_RETRY_DELAY * Math.pow(2, message.retryCount),
            MAX_RETRY_DELAY
          );
          const lastRetryMs = new Date(message.lastRetryAt).getTime();

          if (now - lastRetryMs < delay) {
            continue; // Not time yet
          }
        }

        // Await each message to ensure sequential processing and avoid overwhelming SQLite
        // with concurrent reads/writes that trigger "shared object already released" bugs.
        await this.sendMessageToSupabase(message);
      }

      // Schedule the next poll cycle now that we know the queue size
      if (this.isActuallyOnline) {
        this.processQueueTimer = setTimeout(
          () => this.processQueue(),
          nextInterval
        ) as any;
      }

    } catch (error) {
      console.error('[ChatService] processQueue error:', error);
      // Still schedule next poll even after an unexpected error
      if (this.isActuallyOnline) {
        this.processQueueTimer = setTimeout(
          () => this.processQueue(),
          IDLE_POLL_INTERVAL
        ) as any;
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  private async sendMessageToSupabase(message: QueuedMessage): Promise<void> {
    if (!this.userId) return;
    this.sendingIds.add(message.id);

    try {
      let finalMediaUrl = message.media?.url;

      // 1. Upload media if we have a localFileUri and no remote URL yet.
      if (message.localFileUri && !finalMediaUrl && message.media) {
        try {
           finalMediaUrl = await storageService.uploadImage(
             message.localFileUri, 
             'chat-media', 
             this.userId,
             (progress) => {
               if (this.onUploadProgressCb) {
                 this.onUploadProgressCb(message.id, progress);
               }
             }
           ) || undefined;
           
           if (!finalMediaUrl) throw new Error('Upload failed: Server returned an empty URL/Key');
           
           console.log(`[ChatService] Media uploaded successfully. Key: ${finalMediaUrl}`);

           // PERSIST IMMEDIATELY so we don't re-upload if the message INSERT fails
           await offlineService.updateMessageMediaUrl(message.id, finalMediaUrl);
        } catch (uploadErr: any) {
           // We use console.warn here to avoid the React Native "Red Box" crash overlay in DEV mode.
           // The error is still thrown to trigger the queue retry mechanism.
           console.warn('[ChatService] Media upload failed:', uploadErr.message);
           if (uploadErr.message?.includes('R2 Service not configured')) {
              console.warn('CRITICAL: Your server R2 credentials are not set in server/.env!');
           }
           throw uploadErr; // Caught in processQueue to trigger retry mechanism
        }
      }

      // [FIX BUG 2] Added `receiver` column — it was missing from the original
      // INSERT which caused a Supabase constraint error at runtime.
      const { data, error } = await supabase
        .from('messages')
        .insert({
          id:            message.id,       // Provide our client-side UUID for idempotency
          sender:        this.userId,
          receiver:      message.chatId,
          text:          message.text,
          media_type:    message.media?.type    ?? null,
          media_url:     finalMediaUrl          ?? null,
          media_caption: message.media?.caption ?? null,
          media_thumbnail: message.media?.thumbnail ?? null,
          reply_to_id:   message.replyTo        ?? null,
          created_at:    message.timestamp,
        })
        .select()
        .single();

      if (error) throw error;
      this.syncConnected();

      const serverId = data.id.toString();

      // Swap temp ID → real server ID (ON UPDATE CASCADE handles media_downloads)
      if (message.id !== serverId) {
        await offlineService.updateMessageId(message.id, serverId);
      }
      
      // Update local db with final remote url so we have it if cache gets cleared
      if (finalMediaUrl && finalMediaUrl !== message.media?.url) {
        await offlineService.updateMessageMediaUrl(serverId, finalMediaUrl);
      }
      
      await offlineService.updateMessageStatus(serverId, 'sent');
      // Pass the original client ID as message.id, and the new server ID as the third param
      this.onStatusUpdate?.(message.id, 'sent', serverId);

      // Push notification — best-effort, non-critical
      try {
        await supabase.functions.invoke('send-message-push', {
          body: {
            receiverId: message.chatId,
            senderId:   this.userId,
            senderName: this.senderName,   // [FIX BUG 5] real name, not 'Someone'
            text:       message.text,
            messageId:  serverId,
          },
        });
      } catch (_) {
        // Edge function failure is non-fatal — message is already saved
      }

    } catch (error: any) {
      const newRetryCount = message.retryCount + 1;
      await offlineService.updateMessageRetry(
        message.id,
        newRetryCount,
        error?.message ?? 'Network error'
      );

      if (newRetryCount >= MAX_RETRY_COUNT) {
        await offlineService.markMessageAsFailed(
          message.id,
          error?.message ?? 'Max retries exceeded'
        );
        this.onStatusUpdate?.(message.id, 'failed');
      }
    } finally {
      this.sendingIds.delete(message.id);
    }
  }

  // ── PRIVATE: Fetch history on chat open ──────────────────────────────────
  //
  // Loads the last 50 messages from Supabase and saves any missing ones
  // to the local DB.  This fills gaps that happened while offline.
  private async fetchMissedMessages(): Promise<void> {
    if (!this.userId || !this.partnerId) return;

    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .or(
          // [FIX BUG 2] Using `receiver` column which now actually exists
          `and(sender.eq.${this.partnerId},receiver.eq.${this.userId}),` +
          `and(sender.eq.${this.userId},receiver.eq.${this.partnerId})`
        )
        .order('created_at', { ascending: true })
        .limit(50);

      if (error || !data) return;
      this.syncConnected();

      for (const row of data) {
        const msg = this.mapDbRowToChatMessage(row);
        await offlineService.saveMessage(
          msg.sender_id === this.userId ? msg.receiver_id : msg.sender_id,
          {
            id:        msg.id,
            sender:    msg.sender_id === this.userId ? 'me' : 'them',
            text:      msg.text,
            timestamp: msg.timestamp,
            status:    msg.status,
            media:     msg.media,
            replyTo:   msg.reply_to,
          }
        );
        this.onNewMessage?.(msg);
      }
    } catch (e) {
      console.warn('[ChatService] fetchMissedMessages error:', e);
    }
  }

  // ── PUBLIC: sendMessage() ────────────────────────────────────────────────
  //
  // The 3-step WhatsApp pattern:
  //   1. Save to SQLite (so the message survives an app kill)
  //   2. Show in UI immediately (optimistic render)
  //   3. Queue for Supabase sync in the background
  async sendMessage(
    chatId: string,
    text: string,
    media?: ChatMessage['media'],
    replyTo?: string,
    localUri?: string
  ): Promise<ChatMessage | null> {
    const targetChatId = chatId || this.partnerId;
    if (!this.userId || !targetChatId) return null;

    const messageId = Crypto.randomUUID();
    const timestamp = new Date().toISOString();

    const queuedMsg: QueuedMessage = {
      id:         messageId,
      chatId:     targetChatId,
      sender:     'me',
      text,
      timestamp,
      status:     'pending',
      media:      media ? { ...media } : undefined,
      replyTo,
      retryCount: 0,
      localFileUri: localUri,
    };

    // Step 1: SQLite first
    await offlineService.savePendingMessage(targetChatId, queuedMsg);

    const uiMessage: ChatMessage = {
      id:          messageId,
      sender_id:   this.userId,
      receiver_id: targetChatId,
      text,
      timestamp,
      status:      'pending',
      media,
      reply_to:    replyTo,
      localFileUri: localUri,
    };

    // Step 2: Render
    this.onNewMessage?.(uiMessage);

    // Step 3: Sync (non-blocking — don't await, let the queue handle it)
    if (this.isActuallyOnline) {
      // Push to the queue instead of bypassing it to prevent concurrent SQLite DB queries
      // that trigger "Shared object released" crashes.
      this.processQueue();
    }

    return uiMessage;
  }

  // ── PUBLIC: updateMessageStatusOnServer() ───────────────────────────────
  //
  // Called after we receive a message to tell the server it's delivered/read.
  async updateMessageStatusOnServer(
    messageId: string,
    status: 'delivered' | 'read'
  ): Promise<void> {
    try {
      await supabase.from('messages').update({ status }).eq('id', messageId);
      this.syncConnected();
    } catch (_) {}
  }

  // ── PUBLIC: markMessagesAsRead() ─────────────────────────────────────────
  async markMessagesAsRead(messageIds: string[]): Promise<void> {
    if (!messageIds.length) return;
    try {
      await supabase.from('messages').update({ status: 'read' }).in('id', messageIds);
      this.syncConnected();
      for (const id of messageIds) {
        await offlineService.updateMessageStatus(id, 'read');
      }
    } catch (_) {}
  }

  // ── PUBLIC: retryMessage() ───────────────────────────────────────────────
  //
  // Called when the user taps the "!" retry button on a failed message.
  async retryMessage(messageId: string): Promise<void> {
    const message = await offlineService.getMessageById(messageId);
    if (!message) return;

    // Reset retry count so backoff starts fresh
    await offlineService.updateMessageRetry(messageId, 0);
    await offlineService.updateMessageStatus(messageId, 'pending');

    if (this.isActuallyOnline) {
      this.processQueue();
    }
  }

  // ── PUBLIC: getNetworkStatus() ───────────────────────────────────────────
  getNetworkStatus(): boolean {
    return this.isActuallyOnline;
  }

  // ── PUBLIC: getPendingMessageCount() ─────────────────────────────────────
  async getPendingMessageCount(chatId: string): Promise<number> {
    const pending = await offlineService.getPendingMessages();
    return pending.filter(m => m.chatId === chatId).length;
  }

  // ── PUBLIC: clearServerMessages() ───────────────────────────────────────
  //
  // DANGER: Permanently deletes messages from Supabase.
  // Also clears the local SQLite records for this chat.
  async clearServerMessages(userId: string, partnerId: string): Promise<void> {
    await supabase
      .from('messages')
      .delete()
      .or(
        `and(sender.eq.${userId},receiver.eq.${partnerId}),` +
        `and(sender.eq.${partnerId},receiver.eq.${userId})`
      );
    await offlineService.clearChat(partnerId);
  }

  // ── PRIVATE: mapDbRowToChatMessage() ────────────────────────────────────
  private mapDbRowToChatMessage(row: any): ChatMessage {
    return {
      id:          row.id.toString(),
      sender_id:   row.sender,
      receiver_id: row.receiver,
      text:        row.text ?? '',
      timestamp:   row.created_at,
      status:      (row.status as ChatMessage['status']) ?? 'sent',
      media:       row.media_url
        ? {
            type:    row.media_type ?? 'image',
            url:     row.media_url,
            caption: row.media_caption,
            thumbnail: row.media_thumbnail,
          }
        : undefined,
      reply_to:    row.reply_to_id ? row.reply_to_id.toString() : undefined,
      reactions:   row.reaction ? [row.reaction] : undefined,
    };
  }

  // Socket.io removed in favor of Supabase Broadcast

  // ── PRIVATE: Message polling fallback ───────────────────────────────────
  //
  // When Supabase Realtime WebSocket is blocked by ISP (Jio/Airtel),
  // poll for new messages every 10 seconds via REST (goes through Cloudflare proxy).
  private startMessagePolling(): void {
    if (this.pollTimer) return;
    this.lastPollAt = new Date().toISOString();
    // 30s interval — less aggressive, avoids hammering RCTNetworking
    this.pollTimer = setInterval(() => {
      // Only poll when app is in foreground to avoid RCTNetworking crashes
      if (AppState.currentState === 'active') {
        this.pollForNewMessages();
      }
    }, 30_000) as any;

    // Resume poll immediately when app comes back to foreground
    this.appStateListener = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        this.pollForNewMessages();
      }
    });
  }

  private stopMessagePolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer as any);
      this.pollTimer = null;
    }
    if (this.appStateListener) {
      this.appStateListener.remove();
      this.appStateListener = null;
    }
  }

  private async pollForNewMessages(): Promise<void> {
    if (!this.userId || !this.partnerId || !this.lastPollAt) return;
    // Guard: skip if a poll is already in-flight
    if (this.isPolling) return;
    if (!this.isActuallyOnline) return;
    this.isPolling = true;

    const since = this.lastPollAt;
    this.lastPollAt = new Date().toISOString();
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .or(
          `and(sender.eq.${this.partnerId},receiver.eq.${this.userId}),` +
          `and(sender.eq.${this.userId},receiver.eq.${this.partnerId})`
        )
        .gt('created_at', since)
        .order('created_at', { ascending: true });

      if (error || !data || data.length === 0) return;

      for (const row of data) {
        const msg = this.mapDbRowToChatMessage(row);
        await offlineService.saveMessage(
          msg.sender_id === this.userId ? msg.receiver_id : msg.sender_id,
          {
            id:        msg.id,
            sender:    msg.sender_id === this.userId ? 'me' : 'them',
            text:      msg.text,
            timestamp: msg.timestamp,
            status:    msg.status,
            media:     msg.media,
            replyTo:   msg.reply_to,
          }
        );
        this.onNewMessage?.(msg);
        if (msg.sender_id === this.partnerId) {
          this.updateMessageStatusOnServer(msg.id, 'delivered');
        }
      }
    } catch (_) {
    } finally {
      this.isPolling = false;
    }
  }

  // ── PUBLIC: cleanup() ────────────────────────────────────────────────────
  //
  // Call this when the user leaves the chat screen.
  cleanup(): void {
    this.stopQueueProcessing();
    this.stopMessagePolling();

    if (this.networkListenerCleanup) {
      this.networkListenerCleanup();
      this.networkListenerCleanup = null;
    }

    if (this.channel) {
      this.channel.unsubscribe();
      this.channel = null;
    }

    this.isInitialized = false;
    this.userId        = null;
    this.partnerId     = null;
    this.isDeviceOnline = true;
    this.isServerReachable = true;
    this.lastPollAt    = null;

    console.log('[ChatService] Cleaned up.');
  }
}

// Single shared instance — same pattern as before
export const chatService = new ChatService();
