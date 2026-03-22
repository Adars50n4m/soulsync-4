import { Platform } from 'react-native';
import * as Env from './env';

// Configuration from centralized env.ts
export const SUPABASE_URL = Env.SUPABASE_URL;
export const SUPABASE_ANON_KEY = Env.SUPABASE_ANON_KEY;
export const SUPABASE_ENDPOINT = Env.SUPABASE_PROXY_URL;
export const SERVER_URL = Env.SERVER_URL;
const USE_R2 = Env.USE_R2;
const R2_PUBLIC_URL = Env.R2_PUBLIC_URL;

console.log('[API Config] SUPABASE_ENDPOINT:', SUPABASE_ENDPOINT);
console.log('[API Config] SERVER_URL:', SERVER_URL);

export function getSupabaseUrl(): string {
    return SUPABASE_ENDPOINT;
}

// Tunnel bypass — include all common tunnel providers
const isTunnel = 
    SERVER_URL.includes('trycloudflare.com') || 
    SERVER_URL.includes('.loca.lt') || 
    SERVER_URL.includes('.localtunnel.me') || 
    SERVER_URL.includes('.ngrok-free.app');

export const serverFetch = (url: string, init?: RequestInit): Promise<Response> =>
    smartFetch(url, {
        ...init,
        headers: {
            ...(isTunnel ? { 'bypass-tunnel-reminder': 'true' } : {}),
            ...init?.headers,
        },
    });

/**
 * Enhanced fetch with automatic retries and exponential backoff.
 * Essential for mobile apps on flaky networks (WiFi -> LTE transitions).
 */
export async function smartFetch(
    url: string,
    init?: RequestInit,
    retries = 3,
    backoff = 1000
): Promise<Response> {
    try {
        const response = await fetch(url, init);
        
        // Retry on 5xx server errors or 429 rate limits, but NOT on 503 from a dead tunnel
        // (retrying a "Tunnel Unavailable" response won't help and adds ~7s of unnecessary delay)
        const isTunnelDown = response.status === 503 && isTunnel;
        if (retries > 0 && !isTunnelDown && (response.status >= 500 || response.status === 429)) {
            console.warn(`[Network] Retrying ${url} (${response.status})... ${retries} attempts left`);
            await new Promise(resolve => setTimeout(resolve, backoff));
            return smartFetch(url, init, retries - 1, backoff * 2);
        }
        
        return response;
    } catch (error) {
        // Retry on network-level errors (DNS, timeout, connection lost)
        if (retries > 0) {
            console.warn(`[Network] Connection error for ${url}. Retrying in ${backoff}ms...`, error);
            await new Promise(resolve => setTimeout(resolve, backoff));
            return smartFetch(url, init, retries - 1, backoff * 2);
        }
        throw error;
    }
}

/**
 * Robust JSON fetcher that safely handles:
 * 1. Non-200 responses
 * 2. Non-JSON payloads (proxy errors, HTML)
 * 3. Network timeouts/failures
 */
export async function safeFetchJson<T>(
    url: string,
    init?: RequestInit
): Promise<{ success: boolean; data?: T; error?: string }> {
    try {
        const response = await serverFetch(url, init);
        
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            console.warn(`[API] Expected JSON, got ${contentType}:`, text.substring(0, 100));
            return {
                success: false,
                error: `Server returned non-JSON response (${response.status}). Please check if the server is running.`
            };
        }

        const data = await response.json();
        
        if (!response.ok) {
            return { 
                success: false, 
                data: data as T, 
                error: (data as any).error || `Request failed with status ${response.status}`
            };
        }

        return { success: true, data: data as T };
    } catch (error: any) {
        console.warn(`[API] safeFetchJson failed for ${url}:`, error);
        
        let errorMessage = error.message || 'Network request failed';
        
        // Add helpful context for local development connection failures
        if (url.includes('localhost') || url.match(/192\.168\.\d+\.\d+/) || url.includes('10.0.2.2')) {
            errorMessage = `Could not connect to local server at ${url}. Please ensure your Node.js server is running and reachable from your mobile device.`;
        }
        
        return {
            success: false,
            error: errorMessage
        };
    }
}

// JioSaavn API
export const SAAVN_API_URL = Env.MUSIC_API_URL;

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

/**
 * Constructs a full, proxied public URL for a Supabase Storage object.
 * Handles relative paths stored in the database.
 */
export function getPublicStorageUrl(bucket: string, path: string | null | undefined): string {
    if (!path) return '';
    
    // If it's already a full URL or data URI, just proxy it if needed
    if (path.startsWith('http') || path.startsWith('data:')) {
        return proxySupabaseUrl(path);
    }
    
    // Direct R2 check - If key starts with uploads/, it's almost certainly R2 
    // especially since our storage.objects in Supabase is empty.
    if (USE_R2 && R2_PUBLIC_URL && !R2_PUBLIC_URL.includes('XXXXXXXXXXXX')) {
        const fullR2Url = `${R2_PUBLIC_URL}/${path}`;
        // Note: R2 URLs might also be blocked by some ISPs, but for now we try direct
        return fullR2Url;
    }
    
    // Fallback to Supabase Storage
    const fullUrl = `https://xuipxbyvsawhuldopvjn.supabase.co/storage/v1/object/public/${bucket}/${path}`;
    return proxySupabaseUrl(fullUrl);
}
