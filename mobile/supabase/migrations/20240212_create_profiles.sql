-- Re-runnable script to fix profiles table for 'shri'/'hari' IDs
drop table if exists profiles;

-- Create table with TEXT ID to support mock auth users like 'shri'
create table profiles (
  id text not null primary key, 
  updated_at timestamp with time zone,
  name text,
  avatar_url text,
  bio text,

  constraint name_length check (char_length(name) >= 3)
);

-- Set up Row Level Security (RLS)
alter table profiles enable row level security;

-- Allow public access since we are using custom mock auth
create policy "Enable access for all users"
  on profiles for all
  using ( true )
  with check ( true );

-- Set up Realtime!
begin;
  drop publication if exists supabase_realtime;
  create publication supabase_realtime for table public.profiles, public.call_logs, public.statuses, public.messages;
commit;
