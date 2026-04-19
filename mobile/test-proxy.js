const fetch = require('node-fetch');
const URL = 'https://soul-supabase-proxy.adarshark.workers.dev/rest/v1/profiles?id=eq.shri';
const API_KEY = 'sb_publishable_9cVY_6oQHMZnV9CaxmMs9Q_7QlUxqlD';

async function test() {
  try {
    const res = await fetch(URL, {
      headers: {
        'apikey': API_KEY,
        'Authorization': `Bearer ${API_KEY}`
      }
    });
    console.log('Status:', res.status);
    const data = await res.json();
    console.log('Data:', data);
  } catch (e) {
    console.error('Fetch failed:', e);
  }
}

test();
