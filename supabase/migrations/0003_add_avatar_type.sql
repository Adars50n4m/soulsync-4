-- Add avatar_type and teddy_variant columns to profiles table
-- This enables users to choose between default, teddy, or custom avatars

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS avatar_type TEXT DEFAULT 'default' CHECK (avatar_type IN ('default', 'teddy', 'custom'));

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS teddy_variant TEXT DEFAULT 'boy' CHECK (teddy_variant IN ('boy', 'girl'));
