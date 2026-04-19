const { createClient } = require('@supabase/supabase-js');
const PROXY_URL = 'https://soul-supabase-proxy.adarshark.workers.dev';
const SUPABASE_ANON_KEY = 'sb_publishable_9cVY_6oQHMZnV9CaxmMs9Q_7QlUxqlD';

const supabase = createClient(PROXY_URL, SUPABASE_ANON_KEY);
async function run() {
    const { data, error } = await supabase.from('statuses').select('id, media_url, media_type, likes');
    console.log("Statuses:", JSON.stringify(data, null, 2));
}
run();
