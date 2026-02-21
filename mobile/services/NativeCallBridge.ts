/**
 * NativeCallBridge.ts
 * 
 * The glue layer that connects:
 *   NativeCallService (CallKit/ConnectionService events)
 *     ↕
 *   CallService (Supabase Realtime signaling)
 *     ↕
 *   WebRTCService (peer connection, media streams)
 * 
 * This bridge listens to native "Answer" and "Decline" button presses
 * from the lock screen / native call UI and triggers the corresponding
 * functions in the existing WebRTCService and CallService.
 * 
 * It also listens to CallService signals to update the native UI
 * (e.g., when the remote user ends the call).
 */

import { Platform } from 'react-native';
import { nativeCallService, NativeCallAction, IncomingCallPayload } from './NativeCallService';
import { callService, CallSignal } from './CallService';
import { voipPushService, VoIPPushToken } from './VoIPPushService';
import { supabase } from '../config/supabase';

// Lazy-load WebRTCService to prevent crashes in Expo Go
const getWebRTCService = () => {
  try {
    return require('./WebRTCService').webRTCService;
  } catch (e) {
    console.warn('[NativeCallBridge] WebRTCService not available');
    return null;
  }
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface BridgeCallbacks {
  /** Called when the user answers from the native UI — navigate to call screen */
  onCallAnswered: (callId: string, payload: IncomingCallPayload) => void;
  /** Called when the user declines from the native UI */
  onCallDeclined: (callId: string) => void;
  /** Called when the call connects (media flowing) */
  onCallConnected: (callId: string) => void;
  /** Called when the call ends (from either side) */
  onCallEnded: (callId: string) => void;
  /** Called when mute is toggled from native UI */
  onMuteToggled: (muted: boolean) => void;
}

// ─── Bridge ──────────────────────────────────────────────────────────────────

class NativeCallBridge {
  private initialized = false;
  private callbacks: BridgeCallbacks | null = null;
  private currentUserId: string | null = null;

  /**
   * Initialize the bridge. Call this after the user is authenticated.
   * 
   * @param userId - The current user's ID
   * @param callbacks - Handlers for call state changes (used by AppContext)
   */
  async initialize(userId: string, callbacks: BridgeCallbacks): Promise<void> {
    if (this.initialized) return;

    this.currentUserId = userId;
    this.callbacks = callbacks;

    // 1. Initialize the native call UI service (CallKit/ConnectionService)
    await nativeCallService.initialize();

    // 2. Initialize VoIP push notifications
    await voipPushService.initialize();

    // 3. Register for push token updates → save to Supabase
    voipPushService.onTokenReceived(this.handleTokenReceived);

    // 4. Listen for native call UI events (Answer/Decline from lock screen)
    nativeCallService.addEventHandler(this.handleNativeCallEvent);

    // 5. Listen for CallService signals to update native UI
    callService.addListener(this.handleCallSignal);

    this.initialized = true;
    console.log('[NativeCallBridge] Initialized for user:', userId);
  }

  // ─── Native Call Event Handler ─────────────────────────────────────────

  /**
   * Handles events from the native call UI (CallKit / ConnectionService).
   * This is where "Answer" and "Decline" button presses arrive.
   */
  private handleNativeCallEvent = async (
    action: NativeCallAction,
    callId: string,
    payload?: any
  ) => {
    console.log(`[NativeCallBridge] Native event: ${action} for call ${callId}`);

    switch (action) {
      case 'answer': {
        // User tapped "Answer" on the native incoming call UI
        const incomingPayload = payload as IncomingCallPayload | undefined;
        const pendingCall = incomingPayload || nativeCallService.getPendingIncomingCall();

        if (!pendingCall) {
          console.error('[NativeCallBridge] No pending call data for answer event');
          return;
        }

        console.log(`[NativeCallBridge] ✅ Answering call from ${pendingCall.callerName}`);

        // Build the CallSignal to accept via CallService
        const acceptSignal: CallSignal = {
          type: 'call-accept',
          callId: pendingCall.callId,
          callerId: pendingCall.callerId,
          calleeId: this.currentUserId || '',
          callType: pendingCall.callType,
          roomId: pendingCall.roomId,
          timestamp: new Date().toISOString(),
        };

        // Accept via CallService (joins room, sends accept signal)
        await callService.acceptCall(acceptSignal);

        // Notify the app to navigate to the call screen
        this.callbacks?.onCallAnswered(callId, pendingCall);

        // Clear the pending call
        nativeCallService.clearPendingIncomingCall();
        break;
      }

      case 'end': {
        // User tapped "Decline" or "End Call" on the native UI
        const pendingCall = nativeCallService.getPendingIncomingCall();

        if (pendingCall) {
          // This was a decline of an incoming call (not yet answered)
          console.log(`[NativeCallBridge] ❌ Declining call from ${pendingCall.callerName}`);

          const rejectSignal: CallSignal = {
            type: 'call-reject',
            callId: pendingCall.callId,
            callerId: pendingCall.callerId,
            calleeId: this.currentUserId || '',
            callType: pendingCall.callType,
            roomId: pendingCall.roomId,
            timestamp: new Date().toISOString(),
          };

          await callService.rejectCall(rejectSignal);
          nativeCallService.clearPendingIncomingCall();
          this.callbacks?.onCallDeclined(callId);
        } else {
          // This was an end of an active call
          console.log(`[NativeCallBridge] 📴 Ending active call: ${callId}`);

          const webRTCService = getWebRTCService();
          if (webRTCService) {
            webRTCService.endCall();
          }
          await callService.endCall();
          this.callbacks?.onCallEnded(callId);
        }
        break;
      }

      case 'mute': {
        const webRTCService = getWebRTCService();
        if (webRTCService) {
          webRTCService.toggleMute();
        }
        this.callbacks?.onMuteToggled(true);
        break;
      }

      case 'unmute': {
        const webRTCService = getWebRTCService();
        if (webRTCService) {
          webRTCService.toggleMute();
        }
        this.callbacks?.onMuteToggled(false);
        break;
      }

      case 'hold':
      case 'unhold':
        // Hold is not directly supported by WebRTC, but we can mute
        console.log(`[NativeCallBridge] Hold state: ${action}`);
        break;

      case 'dtmf':
        // DTMF not needed for VoIP calls
        console.log(`[NativeCallBridge] DTMF: ${payload?.digits}`);
        break;
    }
  };

  // ─── CallService Signal Handler ────────────────────────────────────────

  /**
   * Handles signals from CallService (Supabase Realtime).
   * Updates the native call UI based on remote events.
   */
  private handleCallSignal = (signal: CallSignal) => {
    console.log(`[NativeCallBridge] CallService signal: ${signal.type}`);

    switch (signal.type) {
      case 'call-accept':
        // Remote user accepted our outgoing call
        // Report the call as connected in the native UI
        nativeCallService.reportCallConnected(signal.callId);
        this.callbacks?.onCallConnected(signal.callId);
        break;

      case 'call-reject':
        // Remote user rejected our outgoing call
        nativeCallService.endNativeCall(signal.callId);
        this.callbacks?.onCallEnded(signal.callId);
        break;

      case 'call-end':
        // Remote user ended the call
        nativeCallService.endNativeCall(signal.callId);
        this.callbacks?.onCallEnded(signal.callId);
        break;

      case 'call-ringing':
        // Remote phone is ringing (optional: update UI)
        console.log('[NativeCallBridge] Remote phone is ringing');
        break;

      // WebRTC signals (offer, answer, ice-candidate) are handled by WebRTCService
      // We don't need to intercept them here
    }
  };

  // ─── Push Token Handler ────────────────────────────────────────────────

  /**
   * Save the push token to Supabase so the server can send pushes.
   */
  private handleTokenReceived = async (tokenInfo: VoIPPushToken) => {
    if (!this.currentUserId) return;

    console.log(`[NativeCallBridge] Saving ${tokenInfo.type} token for user ${this.currentUserId}`);

    try {
      // Upsert the push token into the profiles table or a dedicated tokens table
      const { error } = await supabase
        .from('push_tokens')
        .upsert(
          {
            user_id: this.currentUserId,
            platform: tokenInfo.platform,
            token: tokenInfo.token,
            token_type: tokenInfo.type,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'user_id,platform',
          }
        );

      if (error) {
        console.error('[NativeCallBridge] Failed to save push token:', error);
        // Fallback: try updating the profile directly
        await supabase
          .from('profiles')
          .update({
            push_token: tokenInfo.token,
            push_token_type: tokenInfo.type,
            push_platform: tokenInfo.platform,
          })
          .eq('id', this.currentUserId);
      } else {
        console.log('[NativeCallBridge] Push token saved successfully');
      }
    } catch (error) {
      console.error('[NativeCallBridge] Error saving push token:', error);
    }
  };

  // ─── Outgoing Call Support ─────────────────────────────────────────────

  /**
   * Report an outgoing call to the native system.
   * Call this when the user initiates a call from within the app.
   */
  reportOutgoingCall(callId: string, contactName: string, callType: 'audio' | 'video'): void {
    nativeCallService.startOutgoingCall(callId, contactName, callType);
  }

  /**
   * Report that the call media is now connected.
   */
  reportCallConnected(callId?: string): void {
    nativeCallService.reportCallConnected(callId);
  }

  /**
   * Report that the call has ended.
   */
  reportCallEnded(callId?: string): void {
    nativeCallService.endNativeCall(callId);
  }

  /**
   * Send a push notification to the callee to wake their device.
   * This calls the Supabase Edge Function that sends the actual push.
   */
  async sendCallPush(calleeId: string, callId: string, callerName: string, callType: 'audio' | 'video'): Promise<void> {
    try {
      console.log(`[NativeCallBridge] Sending call push to ${calleeId}`);

      const { data, error } = await supabase.functions.invoke('send-call-push', {
        body: {
          calleeId,
          callId,
          callerId: this.currentUserId,
          callerName,
          callType,
        },
      });

      if (error) {
        console.error('[NativeCallBridge] Failed to send call push:', error);
      } else {
        console.log('[NativeCallBridge] Call push sent:', data);
      }
    } catch (error) {
      console.error('[NativeCallBridge] Error sending call push:', error);
    }
  }

  // ─── Cleanup ───────────────────────────────────────────────────────────

  cleanup(): void {
    nativeCallService.removeEventHandler(this.handleNativeCallEvent);
    callService.removeListener(this.handleCallSignal);
    voipPushService.removeTokenHandler(this.handleTokenReceived);
    nativeCallService.cleanup();
    voipPushService.cleanup();
    this.callbacks = null;
    this.currentUserId = null;
    this.initialized = false;
  }
}

export const nativeCallBridge = new NativeCallBridge();
