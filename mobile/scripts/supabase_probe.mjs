import { createClient } from '@supabase/supabase-js';

// Credentials from config/env.ts
const SUPABASE_URL = 'https://xuipxbyvsawhuldopvjn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_9cVY_6oQHMZnV9CaxmMs9Q_7QlUxqlD';

console.log('--- Supabase Probe Starting ---');
console.log('URL:', SUPABASE_URL);
console.log('Key:', SUPABASE_ANON_KEY.substring(0, 15) + '...');

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function probe() {
    try {
        console.log('\n1. Testing Connection...');
        const { data: health, error: healthError } = await supabase.from('profiles').select('count', { count: 'exact', head: true });
        
        if (healthError) {
            console.error('❌ Connection failed:', healthError.message);
            if (healthError.message.includes('JWT')) {
                console.error('👉 Tip: The Anon Key appears to be invalid.');
            }
        } else {
            console.log('✅ Connection successful!');
        }

        console.log('\n2. Checking Profiles table...');
        const { error: profileError } = await supabase.from('profiles').select('*').limit(1);
        if (profileError) {
            console.error('❌ Profiles table missing or inaccessible:', profileError.message);
        } else {
            console.log('✅ Profiles table exists.');
        }

        console.log('\n3. Checking Statuses table...');
        const { error: statusError } = await supabase.from('statuses').select('*').limit(1);
        if (statusError) {
            console.error('❌ Statuses table missing or inaccessible:', statusError.message);
        } else {
            console.log('✅ Statuses table exists.');
        }

    } catch (e) {
        console.error('Unexpected error:', e.message);
    }
}

probe();
