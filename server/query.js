require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { count, error } = await supabase.from('messages').select('*', { count: 'exact', head: true });
  console.log('Total messages:', count);
  
  // Get latest 5
  const { data: latest } = await supabase.from('messages').select('id, sender, receiver, created_at, text').order('created_at', { ascending: false }).limit(5);
  console.log('Latest:', latest);
}
run();
