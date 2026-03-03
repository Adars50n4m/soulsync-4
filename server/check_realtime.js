const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://xuipxbyvsawhuldopvjn.supabase.co';
const PROXY_URL = 'https://soulsync-supabase-proxy.adarshark.workers.dev';
const SUPABASE_ANON_KEY = 'sb_publishable_9cVY_6oQHMZnV9CaxmMs9Q_7QlUxqlD';

const supabase = createClient(PROXY_URL, SUPABASE_ANON_KEY);
async function run() {
    const { data, error } = await supabase.from('statuses').select('*');
    console.log("Statuses in DB:", JSON.stringify(data, null, 2));
}
run();
