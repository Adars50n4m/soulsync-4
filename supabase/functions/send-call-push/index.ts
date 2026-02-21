/**
 * Supabase Edge Function: send-call-push
 * 
 * Sends push notifications to wake the callee's device for an incoming call.
 * 
 * iOS:  Sends a VoIP push via Apple Push Notification service (APNs)
 *       - Uses PushKit topic (com.soulsync4.mobile.voip)
 *       - VoIP pushes have highest priority and wake the app even when killed
 *       - Apple REQUIRES that a CallKit UI is shown upon receiving a VoIP push
 * 
 * Android: Sends a high-priority FCM data message
 *       - Data-only messages (no "notification" field) trigger the background handler
 *       - Priority "high" bypasses Doze mode
 *       - The app's background handler calls RNCallKeep.displayIncomingCall()
 * 
 * Environment Variables Required:
 *   - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-provided by Supabase)
 *   - APNS_KEY_ID: Apple Push Notification Key ID
 *   - APNS_TEAM_ID: Apple Developer Team ID
 *   - APNS_AUTH_KEY: Apple Push Notification Auth Key (.p8 contents, base64 encoded)
 *   - APNS_BUNDLE_ID: iOS app bundle identifier (com.soulsync4.mobile)
 *   - APNS_PRODUCTION: "true" for production, "false" for sandbox
 *   - FCM_SERVER_KEY: Firebase Cloud Messaging server key (legacy) OR
 *   - GOOGLE_SERVICE_ACCOUNT_JSON: Google service account JSON for FCM v1 API
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── Types ───────────────────────────────────────────────────────────────────

interface CallPushRequest {
  calleeId: string;
  callId: string;
  callerId: string;
  callerName: string;
  callType: 'audio' | 'video';
}

interface PushToken {
  user_id: string;
  platform: 'ios' | 'android';
  token: string;
  token_type: 'voip' | 'fcm';
}

// ─── Main Handler ────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // CORS headers
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const body: CallPushRequest = await req.json();
    const { calleeId, callId, callerId, callerName, callType } = body;

    if (!calleeId || !callId || !callerId) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: calleeId, callId, callerId' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch the callee's push token(s)
    // Try the dedicated push_tokens table first, fall back to profiles
    let tokens: PushToken[] = [];

    const { data: tokenData, error: tokenError } = await supabase
      .from('push_tokens')
      .select('*')
      .eq('user_id', calleeId);

    if (tokenError || !tokenData || tokenData.length === 0) {
      // Fallback: check profiles table
      const { data: profile } = await supabase
        .from('profiles')
        .select('push_token, push_token_type, push_platform')
        .eq('id', calleeId)
        .single();

      if (profile?.push_token) {
        tokens = [{
          user_id: calleeId,
          platform: profile.push_platform || 'android',
          token: profile.push_token,
          token_type: profile.push_token_type || 'fcm',
        }];
      }
    } else {
      tokens = tokenData;
    }

    if (tokens.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No push token found for callee', calleeId }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const results: any[] = [];

    for (const tokenInfo of tokens) {
      try {
        if (tokenInfo.platform === 'ios' && tokenInfo.token_type === 'voip') {
          const result = await sendAPNsVoIPPush(tokenInfo.token, {
            callId, callerId, callerName, callType,
          });
          results.push({ platform: 'ios', success: result });
        } else if (tokenInfo.platform === 'android' && tokenInfo.token_type === 'fcm') {
          const result = await sendFCMDataMessage(tokenInfo.token, {
            callId, callerId, callerName, callType,
          });
          results.push({ platform: 'android', success: result });
        }
      } catch (error) {
        console.error(`Failed to send push to ${tokenInfo.platform}:`, error);
        results.push({ platform: tokenInfo.platform, success: false, error: String(error) });
      }
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('send-call-push error:', error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

// ─── iOS: APNs VoIP Push ─────────────────────────────────────────────────────

/**
 * Send a VoIP push notification via Apple Push Notification service.
 * 
 * Uses HTTP/2 APNs provider API with JWT authentication.
 * The push topic MUST be "{bundleId}.voip" for VoIP pushes.
 */
async function sendAPNsVoIPPush(
  deviceToken: string,
  payload: { callId: string; callerId: string; callerName: string; callType: string }
): Promise<boolean> {
  const keyId = Deno.env.get('APNS_KEY_ID');
  const teamId = Deno.env.get('APNS_TEAM_ID');
  const authKeyBase64 = Deno.env.get('APNS_AUTH_KEY');
  const bundleId = Deno.env.get('APNS_BUNDLE_ID') || 'com.soulsync4.mobile';
  const isProduction = Deno.env.get('APNS_PRODUCTION') === 'true';

  if (!keyId || !teamId || !authKeyBase64) {
    console.error('APNs configuration missing');
    return false;
  }

  // Generate JWT for APNs authentication
  const jwt = await generateAPNsJWT(keyId, teamId, authKeyBase64);

  const apnsHost = isProduction
    ? 'https://api.push.apple.com'
    : 'https://api.sandbox.push.apple.com';

  const apnsPayload = {
    aps: {
      alert: {
        title: 'Incoming Call',
        body: `${payload.callerName} is calling...`,
      },
      'content-available': 1,
    },
    // Custom data for the VoIP push handler
    callId: payload.callId,
    callerId: payload.callerId,
    callerName: payload.callerName,
    callType: payload.callType,
    roomId: payload.callId,
    type: 'incoming_call',
    uuid: payload.callId,
  };

  const response = await fetch(
    `${apnsHost}/3/device/${deviceToken}`,
    {
      method: 'POST',
      headers: {
        'authorization': `bearer ${jwt}`,
        'apns-topic': `${bundleId}.voip`, // VoIP topic
        'apns-push-type': 'voip',
        'apns-priority': '10', // Immediate delivery
        'apns-expiration': '0', // Don't store if device is offline
        'content-type': 'application/json',
      },
      body: JSON.stringify(apnsPayload),
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`APNs error (${response.status}):`, errorBody);
    return false;
  }

  console.log('APNs VoIP push sent successfully');
  return true;
}

/**
 * Generate a JWT for APNs authentication using ES256.
 */
async function generateAPNsJWT(keyId: string, teamId: string, authKeyBase64: string): Promise<string> {
  // Decode the base64-encoded .p8 key
  const keyPem = atob(authKeyBase64);

  // Extract the raw key data from PEM format
  const pemHeader = '-----BEGIN PRIVATE KEY-----';
  const pemFooter = '-----END PRIVATE KEY-----';
  const pemContents = keyPem
    .replace(pemHeader, '')
    .replace(pemFooter, '')
    .replace(/\s/g, '');
  const keyData = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));

  // Import the key for ES256 signing
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyData.buffer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  // Create JWT header and payload
  const header = {
    alg: 'ES256',
    kid: keyId,
  };

  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: teamId,
    iat: now,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(claims));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  // Sign with ES256
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  // Convert DER signature to raw r||s format for JWT
  const encodedSignature = base64UrlEncode(
    String.fromCharCode(...new Uint8Array(signature))
  );

  return `${signingInput}.${encodedSignature}`;
}

// ─── Android: FCM Data Message ───────────────────────────────────────────────

/**
 * Send a high-priority FCM data message to wake the Android app.
 * 
 * Uses FCM v1 API with service account authentication.
 * Data-only messages (no "notification" field) are handled by the
 * app's background message handler even when the app is killed.
 */
async function sendFCMDataMessage(
  fcmToken: string,
  payload: { callId: string; callerId: string; callerName: string; callType: string }
): Promise<boolean> {
  const serviceAccountJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
  const legacyServerKey = Deno.env.get('FCM_SERVER_KEY');

  if (serviceAccountJson) {
    // Use FCM v1 API (recommended)
    return await sendFCMv1(fcmToken, payload, serviceAccountJson);
  } else if (legacyServerKey) {
    // Fallback to legacy FCM API
    return await sendFCMLegacy(fcmToken, payload, legacyServerKey);
  }

  console.error('No FCM credentials configured');
  return false;
}

/**
 * FCM v1 API (recommended, uses OAuth2 service account)
 */
async function sendFCMv1(
  fcmToken: string,
  payload: { callId: string; callerId: string; callerName: string; callType: string },
  serviceAccountJson: string
): Promise<boolean> {
  const serviceAccount = JSON.parse(serviceAccountJson);
  const projectId = serviceAccount.project_id;

  // Get OAuth2 access token
  const accessToken = await getGoogleAccessToken(serviceAccount);

  const message = {
    message: {
      token: fcmToken,
      // DATA-ONLY message (no "notification" field!)
      // This ensures the background handler is triggered
      data: {
        type: 'incoming_call',
        callId: payload.callId,
        callerId: payload.callerId,
        callerName: payload.callerName,
        callType: payload.callType,
        roomId: payload.callId,
        timestamp: new Date().toISOString(),
      },
      android: {
        priority: 'HIGH', // Bypasses Doze mode
        ttl: '60s', // Time to live: 60 seconds (call timeout)
      },
    },
  };

  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`FCM v1 error (${response.status}):`, errorBody);
    return false;
  }

  console.log('FCM data message sent successfully');
  return true;
}

/**
 * Legacy FCM API (deprecated but simpler)
 */
async function sendFCMLegacy(
  fcmToken: string,
  payload: { callId: string; callerId: string; callerName: string; callType: string },
  serverKey: string
): Promise<boolean> {
  const message = {
    to: fcmToken,
    // DATA-ONLY message
    data: {
      type: 'incoming_call',
      callId: payload.callId,
      callerId: payload.callerId,
      callerName: payload.callerName,
      callType: payload.callType,
      roomId: payload.callId,
      timestamp: new Date().toISOString(),
    },
    // High priority to bypass Doze
    priority: 'high',
    // TTL: 60 seconds
    time_to_live: 60,
    // Don't collapse — each call is unique
    collapse_key: `call_${payload.callId}`,
  };

  const response = await fetch('https://fcm.googleapis.com/fcm/send', {
    method: 'POST',
    headers: {
      'Authorization': `key=${serverKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(message),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`FCM legacy error (${response.status}):`, errorBody);
    return false;
  }

  const result = await response.json();
  console.log('FCM legacy result:', result);
  return result.success === 1;
}

/**
 * Get a Google OAuth2 access token from a service account.
 */
async function getGoogleAccessToken(serviceAccount: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedClaims = base64UrlEncode(JSON.stringify(claims));
  const signingInput = `${encodedHeader}.${encodedClaims}`;

  // Import RSA private key
  const keyPem = serviceAccount.private_key;
  const pemContents = keyPem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');
  const keyData = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyData.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const encodedSignature = base64UrlEncode(
    String.fromCharCode(...new Uint8Array(signature))
  );

  const jwt = `${signingInput}.${encodedSignature}`;

  // Exchange JWT for access token
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function base64UrlEncode(str: string): string {
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
