-- ============================================================
-- Migration: Complete profiles table + auth helpers + connections
-- Adds all missing columns the app code expects
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. PROFILES TABLE: Add missing columns
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username TEXT,
  ADD COLUMN IF NOT EXISTS display_name TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS birthdate DATE,
  ADD COLUMN IF NOT EXISTS last_username_change TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS note TEXT,
  ADD COLUMN IF NOT EXISTS note_timestamp TEXT,
  ADD COLUMN IF NOT EXISTS avatar_type TEXT DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS teddy_variant TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS country_code TEXT;

-- Case-insensitive unique index on username
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username_lower
  ON public.profiles (LOWER(username));

-- Drop the old name_length constraint if it exists (name column is legacy)
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS name_length;


-- ─────────────────────────────────────────────────────────────
-- 2. RPC: get_email_by_username
--    Used for password-reset-by-username flow
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_email_by_username(p_username TEXT)
RETURNS TEXT
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT au.email
  FROM auth.users au
  INNER JOIN public.profiles p ON au.id::text = p.id::text
  WHERE LOWER(p.username) = LOWER(p_username)
  LIMIT 1;
$$;


-- ─────────────────────────────────────────────────────────────
-- 3. CONNECTIONS TABLE (if not exists)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.connections (
  user_1_id TEXT NOT NULL,
  user_2_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_1_id, user_2_id)
);

ALTER TABLE public.connections ENABLE ROW LEVEL SECURITY;

-- Permissive RLS for dev (tighten for production)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'connections' AND policyname = 'connections_full_access'
  ) THEN
    CREATE POLICY connections_full_access ON public.connections
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────
-- 4. CONNECTION_REQUESTS TABLE (if not exists)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.connection_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id TEXT NOT NULL,
  receiver_id TEXT NOT NULL,
  message TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  responded_at TIMESTAMPTZ
);

ALTER TABLE public.connection_requests ENABLE ROW LEVEL SECURITY;

-- Permissive RLS for dev
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'connection_requests' AND policyname = 'connection_requests_full_access'
  ) THEN
    CREATE POLICY connection_requests_full_access ON public.connection_requests
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_conn_req_sender ON public.connection_requests (sender_id, status);
CREATE INDEX IF NOT EXISTS idx_conn_req_receiver ON public.connection_requests (receiver_id, status);


-- ─────────────────────────────────────────────────────────────
-- 5. Add tables to realtime publication
-- ─────────────────────────────────────────────────────────────

DO $$
BEGIN
  -- Add connections to realtime if not already
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.connections;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.connection_requests;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
