-- Create push_tokens table for storing VoIP (iOS) and FCM (Android) push tokens
-- Used by the send-call-push Edge Function to wake devices for incoming calls

CREATE TABLE IF NOT EXISTS push_tokens (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
    token TEXT NOT NULL,
    token_type TEXT NOT NULL CHECK (token_type IN ('voip', 'fcm')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Each user can have one token per platform
    UNIQUE(user_id, platform)
);

-- Index for fast lookups by user_id
CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id ON push_tokens(user_id);

-- Enable RLS
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

-- Users can read/write their own tokens
CREATE POLICY "Users can manage their own push tokens"
    ON push_tokens
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Service role can read all tokens (for the Edge Function)
CREATE POLICY "Service role can read all push tokens"
    ON push_tokens
    FOR SELECT
    USING (auth.role() = 'service_role');

-- Also add push token columns to profiles as a fallback
ALTER TABLE profiles 
    ADD COLUMN IF NOT EXISTS push_token TEXT,
    ADD COLUMN IF NOT EXISTS push_token_type TEXT,
    ADD COLUMN IF NOT EXISTS push_platform TEXT;
