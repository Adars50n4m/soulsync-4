/**
 * JobManager — Signal-inspired persistent job queue
 *
 * All async operations (send message, download media, sync contacts, etc.)
 * go through this queue. Jobs are persisted to SQLite so they survive
 * app crashes and restarts. Each job has:
 *   - Priority (higher runs first)
 *   - Retry with exponential backoff + jitter
 *   - Constraints (e.g., requires network)
 *   - Deduplication by ID
 */
import { offlineService } from './LocalDBService';
import { isOnlineCached, subscribeToNetwork } from './NetworkMonitor';
import { AppState } from 'react-native';

const MAX_CONCURRENT = 3;
const POLL_INTERVAL = 5000; // Check for new jobs every 5s
const BACKOFF_BASE = 1000; // 1s, 2s, 4s, 8s, 16s... capped at 5 min

export type JobHandler = (payload: any) => Promise<void>;

class JobManager {
  private handlers = new Map<string, JobHandler>();
  private activeCount = 0;
  private pollTimer: NodeJS.Timeout | null = null;
  private networkUnsub: (() => void) | null = null;
  private started = false;

  /** Register a handler for a job type */
  register(type: string, handler: JobHandler): void {
    this.handlers.set(type, handler);
  }

  /** Enqueue a new job */
  async enqueue(type: string, payload: any, options?: {
    id?: string;
    priority?: number;
    maxRetries?: number;
  }): Promise<string> {
    const id = options?.id || `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await offlineService.enqueueJob(
      id, type, payload,
      options?.priority ?? 0,
      options?.maxRetries ?? 5
    );
    // Kick processing immediately
    this.process();
    return id;
  }

  /** Start the job manager — call on app boot */
  start(): void {
    if (this.started) return;
    this.started = true;

    // Poll for pending jobs
    this.pollTimer = setInterval(() => this.process(), POLL_INTERVAL);

    // Process immediately when network comes back
    this.networkUnsub = subscribeToNetwork((state) => {
      if (state.isOnline) this.process();
    });

    // Process when app comes to foreground
    AppState.addEventListener('change', (state) => {
      if (state === 'active') this.process();
    });

    // Delay initial run to let DB migrations complete first
    setTimeout(() => {
      this.process();
      offlineService.cleanCompletedJobs().catch(() => {});
    }, 5000);
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.networkUnsub) {
      this.networkUnsub();
      this.networkUnsub = null;
    }
    this.started = false;
  }

  private tableReady = false;

  /** Process pending jobs up to MAX_CONCURRENT */
  private async process(): Promise<void> {
    if (!this.tableReady) {
      // Check if table exists before querying
      try {
        await offlineService.getPendingJobs(1);
        this.tableReady = true;
      } catch {
        return; // Table doesn't exist yet — silently skip
      }
    }
    if (this.activeCount >= MAX_CONCURRENT) return;
    if (!isOnlineCached()) return;

    try {
      const slots = MAX_CONCURRENT - this.activeCount;
      const jobs = await offlineService.getPendingJobs(slots);

      for (const job of jobs) {
        if (this.activeCount >= MAX_CONCURRENT) break;
        this.activeCount++;
        this.executeJob(job);
      }
    } catch {}
  }

  private async executeJob(job: any): Promise<void> {
    const handler = this.handlers.get(job.type);
    if (!handler) {
      console.warn(`[JobManager] No handler for job type: ${job.type}`);
      await offlineService.updateJobState(job.id, 'failed', `No handler for type: ${job.type}`);
      this.activeCount--;
      return;
    }

    try {
      await offlineService.updateJobState(job.id, 'processing');
      const payload = typeof job.payload === 'string' ? JSON.parse(job.payload) : job.payload;
      await handler(payload);
      await offlineService.updateJobState(job.id, 'completed');
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      const retryCount = (job.retry_count || 0) + 1;

      if (retryCount >= (job.max_retries || 5)) {
        await offlineService.updateJobState(job.id, 'failed', errorMsg);
        console.warn(`[JobManager] Job ${job.id} failed permanently after ${retryCount} retries`);
      } else {
        // Exponential backoff with jitter: base * 2^retry + random(0-1s)
        const delay = Math.min(BACKOFF_BASE * Math.pow(2, retryCount) + Math.random() * 1000, 300000);
        await offlineService.rescheduleJob(job.id, retryCount, delay);
        console.log(`[JobManager] Job ${job.id} rescheduled (attempt ${retryCount}, delay ${Math.round(delay / 1000)}s)`);
      }
    } finally {
      this.activeCount--;
      // Check if more jobs are waiting
      if (this.activeCount < MAX_CONCURRENT) {
        this.process();
      }
    }
  }
}

export const jobManager = new JobManager();
