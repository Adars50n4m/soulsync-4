/**
 * ScreenSecurityService
 *
 * Signal-style screen security — prevents screenshots and screen recording
 * in sensitive areas. Uses expo-screen-capture when available, falls back
 * to no-op gracefully.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'soul_screen_security_enabled';

let ScreenCapture: any = null;
try {
  ScreenCapture = require('expo-screen-capture');
} catch {
  console.log('[ScreenSecurity] expo-screen-capture not available');
}

class ScreenSecurityService {
  private enabled = true; // Default: on (like Signal)
  private active = false;

  async init(): Promise<void> {
    try {
      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      if (saved !== null) {
        this.enabled = saved === 'true';
      }
    } catch {}

    if (this.enabled) {
      this.activate();
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async setEnabled(enabled: boolean): Promise<void> {
    this.enabled = enabled;
    try {
      await AsyncStorage.setItem(STORAGE_KEY, String(enabled));
    } catch {}

    if (enabled) {
      this.activate();
    } else {
      this.deactivate();
    }
  }

  activate(): void {
    if (this.active || !ScreenCapture) return;
    try {
      ScreenCapture.preventScreenCaptureAsync();
      this.active = true;
    } catch (e) {
      console.warn('[ScreenSecurity] Failed to activate:', e);
    }
  }

  deactivate(): void {
    if (!this.active || !ScreenCapture) return;
    try {
      ScreenCapture.allowScreenCaptureAsync();
      this.active = false;
    } catch (e) {
      console.warn('[ScreenSecurity] Failed to deactivate:', e);
    }
  }

  /** Call when entering a sensitive screen (chat, media viewer) */
  enterSensitiveScreen(): void {
    if (this.enabled) this.activate();
  }

  /** Call when leaving a sensitive screen */
  leaveSensitiveScreen(): void {
    // Keep active globally if enabled — Signal keeps it on everywhere
  }
}

export const screenSecurityService = new ScreenSecurityService();
