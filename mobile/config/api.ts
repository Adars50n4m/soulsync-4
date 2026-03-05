import { Platform } from 'react-native';

// Supabase Configuration
export const SUPABASE_URL = 'https://xuipxbyvsawhuldopvjn.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_9cVY_6oQHMZnV9CaxmMs9Q_7QlUxqlD';

// Smart Gateway: Always use the Cloudflare Workers proxy to bypass ISP blocks (Jio/Airtel)
// The proxy forwards requests to Supabase but is accessible without VPN
const PROXY_URL = process.env.EXPO_PUBLIC_SUPABASE_PROXY_URL || 'https://soulsync-supabase-proxy.adarshark.workers.dev';
console.log('[API Config] PROXY_URL:', PROXY_URL);
export const SUPABASE_ENDPOINT = PROXY_URL;

console.log('[API Config] Using Supabase endpoint:', SUPABASE_ENDPOINT);

export function getSupabaseUrl(): string {
    return SUPABASE_ENDPOINT;
}

// Node.js sync server (for R2 and real-time Socket.io)
const LOCAL_IP = '192.168.1.38';

const getFinalServerUrl = () => {
    // iOS Simulator is on the same Mac → always use localhost directly (bypass tunnel)
    if (__DEV__ && Platform.OS === 'ios') {
        console.log('[API Config] iOS Simulator detected — using localhost:3000');
        return 'http://localhost:3000';
    }

    // Android Emulator: 10.0.2.2 maps to Mac's localhost
    if (__DEV__ && Platform.OS === 'android') {
        const envUrl = process.env.EXPO_PUBLIC_SERVER_URL;
        if (envUrl) return envUrl;
        
        console.log('[API Config] Android detected — using 10.0.2.2/LAN IP');
        return `http://10.0.2.2:3000`; // Standard for Android Emulator
    }

    // Physical devices (production or Expo Go on real phone): use tunnel
    return process.env.EXPO_PUBLIC_SERVER_URL || `http://${LOCAL_IP}:3000`;
};

export const SERVER_URL = getFinalServerUrl();
console.log('[API Config] Final SERVER_URL:', SERVER_URL);

// Cloudflare Tunnel bypass — Cloudflare doesn't require headers for quick tunnels, 
// but we'll keep the structure clean
const isTunnel = SERVER_URL.includes('trycloudflare.com') || SERVER_URL.includes('.loca.lt');
export const serverFetch = (url: string, init?: RequestInit): Promise<Response> =>
    fetch(url, {
        ...init,
        headers: {
            ...(isTunnel ? { 'bypass-tunnel-reminder': 'true' } : {}),
            ...init?.headers,
        },
    });

// JioSaavn API (Fallback to public instance as Supabase function is inactive)
export const SAAVN_BASE_URL = 'https://saavn.sumit.co';
export const SAAVN_API_URL = `${SAAVN_BASE_URL}/api`;

// Get the API URL
export const getSaavnApiUrl = () => SAAVN_API_URL;

/**
 * Smart URL Proxy: Rewrites direct Supabase Storage URLs to use the Cloudflare Workers proxy.
 * This bypasses ISP-level blocks on the .supabase.co domain for images/videos.
 */
export function proxySupabaseUrl(url: string | null | undefined): string {
    if (!url) return '';
    if (url.startsWith('data:')) return url;
    if (url.includes('xuipxbyvsawhuldopvjn.supabase.co/storage/v1/object/public/')) {
        return url.replace(
            'https://xuipxbyvsawhuldopvjn.supabase.co',
            SUPABASE_ENDPOINT
        );
    }
    return url;
}
