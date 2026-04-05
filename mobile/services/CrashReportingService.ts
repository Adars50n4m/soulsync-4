/**
 * CrashReportingService
 *
 * Captures unhandled errors, promise rejections, and component crashes.
 * Stores them locally and can flush to a backend endpoint.
 *
 * Signal uses their own crash reporting via Signal's servers.
 * We store locally + log, ready to integrate with Sentry/Crashlytics later.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const STORAGE_KEY = 'soul_crash_reports';
const MAX_STORED = 50;

interface CrashReport {
  id: string;
  timestamp: string;
  type: 'error' | 'unhandled_rejection' | 'component_error';
  message: string;
  stack?: string;
  componentStack?: string;
  metadata?: Record<string, any>;
}

class CrashReportingService {
  private reports: CrashReport[] = [];
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    // Load existing reports
    try {
      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      if (saved) this.reports = JSON.parse(saved);
    } catch {}

    // Global error handler
    const originalHandler = ErrorUtils.getGlobalHandler();
    ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
      this.capture({
        type: 'error',
        message: `${isFatal ? '[FATAL] ' : ''}${error.message}`,
        stack: error.stack,
        metadata: { isFatal, platform: Platform.OS },
      });
      originalHandler?.(error, isFatal);
    });

    // Unhandled promise rejections
    const rejection = (id: number, error: any) => {
      this.capture({
        type: 'unhandled_rejection',
        message: error?.message || String(error),
        stack: error?.stack,
        metadata: { promiseId: id },
      });
    };

    // @ts-ignore — React Native internal
    if (global?.HermesInternal?.enablePromiseRejectionTracker) {
      // @ts-ignore
      global.HermesInternal.enablePromiseRejectionTracker({
        allRejections: true,
        onUnhandled: rejection,
      });
    }

    console.log('[CrashReporting] Initialized');
  }

  /** Capture an error */
  capture(params: Omit<CrashReport, 'id' | 'timestamp'>): void {
    const report: CrashReport = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      ...params,
    };

    this.reports.push(report);
    // Keep only last N reports
    if (this.reports.length > MAX_STORED) {
      this.reports = this.reports.slice(-MAX_STORED);
    }

    // Persist async (best-effort)
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.reports)).catch(() => {});

    console.error(`[CrashReporting] ${report.type}: ${report.message}`);
  }

  /** Capture a React component error (from ErrorBoundary) */
  captureComponentError(error: Error, componentStack?: string): void {
    this.capture({
      type: 'component_error',
      message: error.message,
      stack: error.stack,
      componentStack,
    });
  }

  /** Get all stored reports */
  getReports(): CrashReport[] {
    return [...this.reports];
  }

  /** Clear stored reports */
  async clearReports(): Promise<void> {
    this.reports = [];
    await AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
  }

  /** Get report count for diagnostics UI */
  getReportCount(): number {
    return this.reports.length;
  }
}

export const crashReporting = new CrashReportingService();
