-- Migration to add missing columns to profiles table
-- Fixes crashes in StatusService and supports the new Teddy Avatar feature

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS note_timestamp TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_type TEXT DEFAULT 'default';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS teddy_variant TEXT;

-- Update RLS if necessary (usually ALTER TABLE preserves policies, but ensure columns are visible)
-- Profiles is already public read, so no new policies needed for SELECT.

-- Enable Realtime for statuses if not already done (re-confirming)
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.statuses; 
-- (This was in 0000_ephemeral_schema.sql)
