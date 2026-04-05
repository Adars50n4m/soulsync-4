/**
 * DisappearingMessageService
 *
 * Signal-style disappearing messages. Messages auto-delete after a configurable
 * timer. Timer starts when the message is read (for received) or sent (for sent).
 *
 * Timer options: 0 (off), 30s, 5m, 1h, 8h, 24h, 7d
 */
import { offlineService } from './LocalDBService';

export const DISAPPEARING_TIMER_OPTIONS = [
  { label: 'Off', value: 0 },
  { label: '30 seconds', value: 30 },
  { label: '5 minutes', value: 300 },
  { label: '1 hour', value: 3600 },
  { label: '8 hours', value: 28800 },
  { label: '24 hours', value: 86400 },
  { label: '7 days', value: 604800 },
] as const;

class DisappearingMessageService {
  private cleanupTimer: NodeJS.Timeout | null = null;
  private readonly CLEANUP_INTERVAL = 30000; // Check every 30 seconds

  start(): void {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => this.cleanup(), this.CLEANUP_INTERVAL);
    // Run immediately on start
    this.cleanup();
  }

  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  private tableReady = false;

  /** Delete all expired messages from local DB */
  async cleanup(): Promise<number> {
    if (!this.tableReady) {
      try {
        const count = await offlineService.deleteExpiredMessages();
        this.tableReady = true;
        return count;
      } catch {
        return 0; // Column doesn't exist yet — migration hasn't run
      }
    }
    try {
      return await offlineService.deleteExpiredMessages();
    } catch (e) {
      console.warn('[DisappearingMsg] Cleanup error:', e);
      return 0;
    }
  }

  /** Get the timer setting for a chat */
  async getTimer(chatId: string): Promise<number> {
    return offlineService.getDisappearingTimer(chatId);
  }

  /** Set the timer for a chat (0 = off) */
  async setTimer(chatId: string, timerSeconds: number): Promise<void> {
    await offlineService.setDisappearingTimer(chatId, timerSeconds);
  }

  /**
   * Start the expiry countdown for a message.
   * - For sent messages: call after send
   * - For received messages: call when read (opened in chat)
   */
  async startExpiry(messageId: string, timerSeconds: number): Promise<void> {
    if (timerSeconds <= 0) return;
    await offlineService.startMessageExpiry(messageId, timerSeconds);
  }

  /** Format a timer value for display */
  formatTimer(seconds: number): string {
    if (seconds <= 0) return 'Off';
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    return `${Math.floor(seconds / 86400)}d`;
  }
}

export const disappearingMessageService = new DisappearingMessageService();
