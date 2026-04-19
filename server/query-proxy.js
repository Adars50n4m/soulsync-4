require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Connect to Supabase THROUGH THE PROXY
const proxyUrl = 'https://soul-supabase-proxy.adarshark.workers.dev';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'sb_publishable_9cVY_6oQHMZnV9CaxmMs9Q_7QlUxqlD'; // Must use anon key since it's proxy

console.log('Querying via Proxy URL:', proxyUrl);

async function run() {
  try {
    const res = await fetch(`${proxyUrl}/rest/v1/messages?select=*&order=created_at.desc&limit=5`, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    });
    const data = await res.json();
    console.log('Data from Proxy:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
  }
}
run();
