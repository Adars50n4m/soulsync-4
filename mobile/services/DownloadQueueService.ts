/**
 * DownloadQueueService
 *
 * Manages media downloads with concurrency control, priority ordering,
 * and WiFi-only policy — WhatsApp-style download queue.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isOnlineCached, subscribeToNetwork } from './NetworkMonitor';
import { offlineService } from './LocalDBService';
import NetInfo from '@react-native-community/netinfo';

const MAX_CONCURRENT = 3;
const STORAGE_KEY = 'soul_auto_download_policy';

export type AutoDownloadPolicy = 'always' | 'wifi_only' | 'never';

export interface DownloadQueueResult {
  success: boolean;
  localUri?: string;
  error?: string;
}

interface QueueItem {
  messageId: string;
  remoteUrl: string;
  mediaType?: string;
  isSent: boolean;
  priority: number; // 1 = foreground (visible chat), 2 = background pre-fetch
  manual: boolean;  // true = user tapped download, bypasses policy
  resolve: (result: DownloadQueueResult) => void;
  reject: (error: Error) => void;
}

class DownloadQueueService {
  private queue: QueueItem[] = [];
  private activeCount = 0;
  private activeIds = new Set<string>();
  private policy: AutoDownloadPolicy = 'always';
  private initialized = false;
  private networkUnsub: (() => void) | null = null;

  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    // Load saved policy
    try {
      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      if (saved === 'always' || saved === 'wifi_only' || saved === 'never') {
        this.policy = saved;
      }
    } catch {}

    // Listen for network changes — flush deferred items when WiFi connects
    this.networkUnsub = subscribeToNetwork((state) => {
      if (state.isOnline && state.type === 'wifi') {
        this.flush();
      }
    });
  }

  getPolicy(): AutoDownloadPolicy {
    return this.policy;
  }

  async setPolicy(policy: AutoDownloadPolicy): Promise<void> {
    this.policy = policy;
    try {
      await AsyncStorage.setItem(STORAGE_KEY, policy);
    } catch {}
    // If switching to 'always', flush any deferred items
    if (policy === 'always') this.flush();
  }

  /**
   * Enqueue a media download. Returns a promise that resolves when the download completes.
   * @param priority 1 = foreground (user is viewing), 2 = background pre-fetch
   * @param manual true if user explicitly tapped download (bypasses wifi-only policy)
   */
  enqueue(
    messageId: string,
    remoteUrl: string,
    mediaType?: string,
    isSent: boolean = false,
    priority: number = 2,
    manual: boolean = false,
  ): Promise<DownloadQueueResult> {
    // Deduplicate — if already queued or active, return existing promise
    if (this.activeIds.has(messageId)) {
      return Promise.resolve({ success: false, error: 'Already downloading' });
    }
    const existing = this.queue.find(item => item.messageId === messageId);
    if (existing) {
      return new Promise((resolve, reject) => {
        // Chain onto existing item's resolution
        const origResolve = existing.resolve;
        existing.resolve = (result) => { origResolve(result); resolve(result); };
        const origReject = existing.reject;
        existing.reject = (err) => { origReject(err); reject(err); };
      });
    }

    return new Promise<DownloadQueueResult>((resolve, reject) => {
      this.queue.push({
        messageId, remoteUrl, mediaType, isSent, priority, manual, resolve, reject,
      });
      // Sort: priority 1 first, then by insertion order (stable sort)
      this.queue.sort((a, b) => a.priority - b.priority);
      this.flush();
    });
  }

  /** Try to start queued downloads up to MAX_CONCURRENT */
  private flush(): void {
    while (this.activeCount < MAX_CONCURRENT && this.queue.length > 0) {
      const next = this.findNextEligible();
      if (!next) break;

      this.activeCount++;
      this.activeIds.add(next.messageId);
      this.processItem(next);
    }
  }

  private findNextEligible(): QueueItem | null {
    for (let i = 0; i < this.queue.length; i++) {
      const item = this.queue[i];
      if (item.manual || this.canAutoDownload()) {
        this.queue.splice(i, 1);
        return item;
      }
    }
    return null;
  }

  private canAutoDownload(): boolean {
    if (this.policy === 'never') return false;
    if (this.policy === 'always') return isOnlineCached();
    // wifi_only
    return this.isOnWifi();
  }

  private isOnWifi(): boolean {
    // Synchronous check — NetInfo state is cached by NetworkMonitor
    try {
      // We'll do an async check in flush, but for the sync guard use cached state
      return isOnlineCached(); // Will refine with actual type below
    } catch {
      return false;
    }
  }

  private async processItem(item: QueueItem): Promise<void> {
    try {
      // Double-check network for wifi-only policy
      if (!item.manual && this.policy === 'wifi_only') {
        const netState = await NetInfo.fetch();
        if (netState.type !== 'wifi') {
          // Re-queue as deferred — will be picked up when WiFi connects
          this.queue.push(item);
          this.activeCount--;
          this.activeIds.delete(item.messageId);
          return;
        }
      }

      // Use storageService (lazy import to avoid circular deps)
      const { storageService } = require('./StorageService');
      const localUri = await storageService.getMediaUrl(
        item.remoteUrl,
        item.messageId,
        item.mediaType,
      );

      if (localUri) {
        // Ensure the DB is updated with the local path
        await offlineService.updateMessageLocalUri(item.messageId, localUri);
        item.resolve({ success: true, localUri });
      } else {
        item.resolve({ success: false, error: 'Failed to resolve media' });
      }
    } catch (error) {
      item.resolve({ success: false, error: error instanceof Error ? error.message : 'Download failed' });
    } finally {
      this.activeCount--;
      this.activeIds.delete(item.messageId);
      this.flush(); // Start next in queue
    }
  }

  cancelAll(): void {
    const pending = this.queue.splice(0);
    for (const item of pending) {
      item.resolve({ success: false, error: 'Cancelled' });
    }
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  getActiveCount(): number {
    return this.activeCount;
  }

  isQueued(messageId: string): boolean {
    return this.activeIds.has(messageId) || this.queue.some(i => i.messageId === messageId);
  }

  cleanup(): void {
    this.cancelAll();
    if (this.networkUnsub) {
      this.networkUnsub();
      this.networkUnsub = null;
    }
    this.initialized = false;
  }
}

export const downloadQueue = new DownloadQueueService();
