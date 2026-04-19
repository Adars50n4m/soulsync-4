
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const TARGETS = [
    'bef2332f-4d4c-4303-bba7-a413a3b6b234', // Test Temp
    '7bf14625-5b4b-42fa-b5eb-88218c5754b7'  // hari.internal@soul.dev
];

async function deleteUsers() {
    console.log(`Starting permanent deletion for ${TARGETS.length} users...`);

    for (const userId of TARGETS) {
        console.log(`Processing ID: ${userId}...`);
        
        // 1. Delete from Auth (this usually cascades to public profiles via triggers/FKs,
        // but we'll be thorough and check both if needed).
        const { error: authError } = await supabase.auth.admin.deleteUser(userId);

        if (authError) {
            console.error(`- Error deleting from auth: ${authError.message}`);
        } else {
            console.log(`- Successfully deleted from auth.users`);
        }

        // 2. Explicitly delete from profiles just in case cascade didn't happen
        const { error: profileError } = await supabase
            .from('profiles')
            .delete()
            .eq('id', userId);

        if (profileError) {
            console.error(`- Error deleting from profiles: ${profileError.message}`);
        } else {
            console.log(`- Profile record removed (if it existed)`);
        }
        
        console.log('---');
    }

    console.log('Cleanup complete.');
}

deleteUsers();
