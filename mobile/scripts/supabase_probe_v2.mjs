import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://xuipxbyvsawhuldopvjn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_9cVY_6oQHMZnV9CaxmMs9Q_7QlUxqlD';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function probe() {
    console.log('--- Checking Profiles Table Schema & Permissions ---');

    // 1. Check for columns
    const { data: cols, error: colError } = await supabase.from('profiles').select('*').limit(1);
    if (colError) {
        console.error('❌ Error reading profiles:', colError.message);
    } else {
        console.log('✅ Successfully read profiles table.');
        if (cols && cols.length > 0) {
            console.log('Columns found:', Object.keys(cols[0]));
        } else {
            console.log('Table is empty, cannot easily see columns via select.');
        }
    }

    // 2. Try an INSERT (This will likely fail due to RLS if the user isn't auth'd, 
    //    but it tells us if the table is even there to receive inserts)
    console.log('\n--- Testing INSERT ---');
    const dummyId = '00000000-0000-0000-0000-000000000000';
    const { error: insertError } = await supabase.from('profiles').insert({
        id: dummyId,
        username: 'test_probe_' + Date.now(),
        display_name: 'Test Probe'
    });

    if (insertError) {
        console.log('❌ Insert failed (expected if RLS is on):', insertError.message);
        if (insertError.message.includes('permission denied')) {
            console.log('👉 RLS is likely ON and blocking anonymous inserts.');
        } else if (insertError.message.includes('not find') || insertError.message.includes('not exist')) {
            console.log('👉 Table might actually be missing or named differently.');
        }
    } else {
        console.log('✅ INSERT SUCCESSFUL! (WARNING: RLS might be OFF)');
        // Cleanup
        await supabase.from('profiles').delete().eq('id', dummyId);
    }
}

probe();
