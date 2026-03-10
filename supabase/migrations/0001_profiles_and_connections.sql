-- 1. PROFILES TABLE (Required for Soul ID)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL DEFAULT '',
    avatar_url TEXT,
    bio TEXT,
    is_online BOOLEAN DEFAULT false,
    last_seen TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Case-insensitive search on username
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username_lower ON profiles (LOWER(username));

-- 2. CONNECTION REQUESTS (Pending Invites)
CREATE TABLE IF NOT EXISTS public.connection_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    receiver_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    message TEXT,
    status TEXT CHECK (status IN ('pending', 'accepted', 'rejected')) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    responded_at TIMESTAMPTZ,
    UNIQUE(sender_id, receiver_id)
);

-- 3. CONNECTIONS (Established Bonds)
CREATE TABLE IF NOT EXISTS public.connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_1_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    user_2_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    is_favorite BOOLEAN DEFAULT false,
    custom_name TEXT,
    mute_notifications BOOLEAN DEFAULT false,
    connected_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_1_id, user_2_id),
    CHECK (user_1_id < user_2_id) -- Prevent duplicates
);

-- 4. RPC: Get Email by Username (Secure Login)
-- This allows signing in with a username without making email public in 'profiles'
CREATE OR REPLACE FUNCTION public.get_email_by_username(p_username text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER -- Runs as system to access auth.users
AS $$
BEGIN
  RETURN (
    SELECT u.email 
    FROM auth.users u
    JOIN public.profiles p ON u.id = p.id
    WHERE LOWER(p.username) = LOWER(p_username)
    LIMIT 1
  );
END;
$$;

-- 5. RLS POLICIES
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE connection_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;

-- Profiles: Anyone can search, owner can edit
CREATE POLICY "Public profiles" ON profiles FOR SELECT USING (true);
CREATE POLICY "Own profile" ON profiles FOR ALL USING (auth.uid() = id);

-- Requests: Involved parties only
CREATE POLICY "Involved in request" ON connection_requests FOR SELECT 
USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "Send requests" ON connection_requests FOR INSERT 
WITH CHECK (auth.uid() = sender_id);

-- Connections: Both parties only
CREATE POLICY "View my connections" ON connections FOR SELECT 
USING (auth.uid() = user_1_id OR auth.uid() = user_2_id);

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE connection_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE connections;
