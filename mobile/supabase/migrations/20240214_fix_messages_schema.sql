-- Fix for PGRST204: Add missing media_caption column
alter table public.messages 
add column if not exists media_caption text;

-- Also add media_url and media_type if they are missing, just in case
alter table public.messages 
add column if not exists media_url text;

alter table public.messages 
add column if not exists media_type text;

-- Refresh schema cache (implicit with alter table usually, but good to know)
notify pgrst, 'reload schema';
