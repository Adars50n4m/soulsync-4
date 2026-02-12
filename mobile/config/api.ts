// Supabase Configuration
export const SUPABASE_URL = 'https://xuipxbyvsawhuldopvjn.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_9cVY_6oQHMZnV9CaxmMs9Q_7QlUxqlD';

// JioSaavn API (Fallback to public instance as Supabase function is inactive)
export const SAAVN_BASE_URL = 'https://saavn.sumit.co';
export const SAAVN_API_URL = `${SAAVN_BASE_URL}/api`;

// Get the API URL
export const getSaavnApiUrl = () => SAAVN_API_URL;
