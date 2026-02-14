-- Fix for PGRST204: Add missing media_type & media_url columns
-- Some older schemas might have missed these.

alter table public.messages 
add column if not exists media_type text;

alter table public.messages 
add column if not exists media_url text;

-- Refresh schema cache again
notify pgrst, 'reload schema';
