-- CRITICAL FIX: Ensure 'id' is TEXT, not UUID
-- This is necessary because the app uses custom IDs like 'shri' and 'hari'
-- which are NOT valid UUIDs.

-- 1. Drop the table if it exists (warning: clears data)
drop table if exists public.profiles cascade;

-- 2. Re-create the table with correct types
create table public.profiles (
  id text not null primary key, -- Changed from uuid to text
  updated_at timestamp with time zone default timezone('utc'::text, now()),
  name text,
  avatar_url text,
  bio text,

  constraint name_length check (char_length(name) >= 3)
);

-- 3. Enable RLS
alter table public.profiles enable row level security;

-- 4. Create Policies (Open for now, as we use custom auth)
create policy "Enable read access for all users"
  on public.profiles for select
  using ( true );

create policy "Enable insert for all users"
  on public.profiles for insert
  with check ( true );

create policy "Enable update for all users"
  on public.profiles for update
  using ( true );

-- 5. Enable Realtime
begin;
  -- Remove if already exists to avoid error
  drop publication if exists supabase_realtime;
  create publication supabase_realtime for table public.profiles, public.call_logs, public.statuses, public.messages;
commit;
