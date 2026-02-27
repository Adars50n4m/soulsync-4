// Supabase Configuration
export const SUPABASE_URL = 'https://xuipxbyvsawhuldopvjn.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_9cVY_6oQHMZnV9CaxmMs9Q_7QlUxqlD';

// Smart Gateway: Use a proxy if EXPO_PUBLIC_SUPABASE_PROXY_URL is set to bypass ISP blocks (Jio/Airtel)
const PROXY_URL = process.env.EXPO_PUBLIC_SUPABASE_PROXY_URL;
export const SUPABASE_ENDPOINT = (PROXY_URL && typeof PROXY_URL === 'string' && PROXY_URL.trim().length > 0) 
    ? PROXY_URL 
    : SUPABASE_URL;

export const getSupabaseUrl = () => SUPABASE_ENDPOINT;

// JioSaavn API (Fallback to public instance as Supabase function is inactive)
export const SAAVN_BASE_URL = 'https://saavn.sumit.co';
export const SAAVN_API_URL = `${SAAVN_BASE_URL}/api`;

// Get the API URL
export const getSaavnApiUrl = () => SAAVN_API_URL;
