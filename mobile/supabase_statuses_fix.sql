-- Create statuses table if it doesn't exist
create table if not exists public.statuses (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  user_name text,
  user_avatar text,
  media_url text not null,
  media_type text default 'image',
  caption text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  expires_at timestamp with time zone not null,
  views text[] default array[]::text[],
  likes text[] default array[]::text[]
);

-- Enable RLS
alter table public.statuses enable row level security;

-- Policies
create policy "Public statuses are viewable by everyone"
  on public.statuses for select
  using ( true );

create policy "Users can insert their own statuses"
  on public.statuses for insert
  with check ( auth.uid() = user_id );

create policy "Users can update their own statuses"
  on public.statuses for update
  using ( auth.uid() = user_id );

create policy "Users can delete their own statuses"
  on public.statuses for delete
  using ( auth.uid() = user_id );

-- Allow public read for storage bucket 'status-media' if not already set
-- (This part usually requires storage policies, assuming they exist or need to be checked via dashboard, 
-- but we'll include a logical check here if we were running it directly on supabase, 
-- for now this file is for the user to run or for me to reference persistence logic).
