const { createClient } = require('@supabase/supabase-js');
const PROXY_URL = 'https://soulsync-supabase-proxy.adarshark.workers.dev';
const SUPABASE_ANON_KEY = 'sb_publishable_9cVY_6oQHMZnV9CaxmMs9Q_7QlUxqlD';

const supabase = createClient(PROXY_URL, SUPABASE_ANON_KEY);

async function run() {
    console.log("Subscribing...");
    const channel = supabase.channel('public:statuses')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'statuses' }, (payload) => {
            console.log("UPDATE payload received:", JSON.stringify(payload, null, 2));
            process.exit(0);
        })
        .subscribe(async (status) => {
            console.log("Subscription status:", status);
            if (status === 'SUBSCRIBED') {
                const { data } = await supabase.from('statuses').select('id, likes').limit(1);
                if (data && data.length > 0) {
                    console.log("Triggering update on", data[0].id);
                    await supabase.from('statuses').update({ likes: ['test'] }).eq('id', data[0].id);
                } else {
                    console.log("No statuses to update");
                    process.exit(0);
                }
            }
        });
}
run();
