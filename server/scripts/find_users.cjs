
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function findUsers() {
    console.log('Fetching all profiles to find matches...');
    
    const { data: profiles, error: pError } = await supabase
        .from('profiles')
        .select('id, username, display_name');

    if (pError) {
        console.error('Error fetching profiles:', pError);
        return;
    }

    console.log('--- SCANNING ALL PROFILES ---');
    const targets = profiles.filter(p => {
        const str = `${p.username} ${p.display_name}`.toLowerCase();
        return str.includes('test') || str.includes('temp') || str.includes('internal') || str.includes('@soul.dev');
    });

    targets.forEach(p => {
        console.log(`[TARGET] ID: ${p.id} | User: ${p.username} | Name: ${p.display_name}`);
    });
    console.log(`Total found: ${targets.length}`);
    console.log('-----------------------------');
}

findUsers();
