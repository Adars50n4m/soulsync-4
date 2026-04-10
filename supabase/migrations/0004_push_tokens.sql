-- Push token storage for wake-up notifications (incoming calls/messages).
-- Supports dedicated token table and profile fallback columns.

CREATE TABLE IF NOT EXISTS public.push_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
    token TEXT NOT NULL,
    token_type TEXT NOT NULL CHECK (token_type IN ('voip', 'fcm')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON public.push_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_push_tokens_token ON public.push_tokens(token);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View own push tokens" ON public.push_tokens;
CREATE POLICY "View own push tokens" ON public.push_tokens
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Insert own push tokens" ON public.push_tokens;
CREATE POLICY "Insert own push tokens" ON public.push_tokens
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Update own push tokens" ON public.push_tokens;
CREATE POLICY "Update own push tokens" ON public.push_tokens
    FOR UPDATE USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Delete own push tokens" ON public.push_tokens;
CREATE POLICY "Delete own push tokens" ON public.push_tokens
    FOR DELETE USING (auth.uid() = user_id);

-- Profile fallback columns used by legacy token write path.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS push_token TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS push_platform TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS push_token_type TEXT;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.push_tokens;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
