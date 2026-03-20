import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://xuipxbyvsawhuldopvjn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_9cVY_6oQHMZnV9CaxmMs9Q_7QlUxqlD';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testSignup() {
  console.log('1. Trying to sign up...');
  const { data, error } = await supabase.auth.signUp({
    email: 'test_signup_temp_99@soul.com',
    password: 'password123',
    options: {
      data: { username: 'test_temp_99' }
    }
  });

  if (error) {
    console.error('Sign up error:', error);
    return;
  }
  
  console.log('User created:', data.user?.id);
  
  console.log('2. Trying to upsert profile...');
  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({
      id: data.user.id,
      username: 'test_temp_99',
      display_name: 'Test Temp',
      avatar_url: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

  if (profileError) {
    console.error('Profile Upsert Error:', profileError);
  } else {
    console.log('Profile created successfully!');
  }
}

testSignup();
