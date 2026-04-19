-- ============================================================
-- Seed: Ensure dev bypass users have complete profiles
-- ============================================================

-- Hari (iPhone dev user)
INSERT INTO public.profiles (id, username, display_name, name, avatar_url, created_at)
VALUES (
  'f00f00f0-0000-0000-0000-000000000001',
  'hari',
  'Hari',
  'Hari',
  NULL,
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  username = COALESCE(public.profiles.username, EXCLUDED.username),
  display_name = COALESCE(NULLIF(public.profiles.display_name, ''), EXCLUDED.display_name);

-- Shri (Android dev user)
INSERT INTO public.profiles (id, username, display_name, name, avatar_url, created_at)
VALUES (
  'f00f00f0-0000-0000-0000-000000000002',
  'shri',
  'Shri',
  'Shri',
  NULL,
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  username = COALESCE(public.profiles.username, EXCLUDED.username),
  display_name = COALESCE(NULLIF(public.profiles.display_name, ''), EXCLUDED.display_name);
