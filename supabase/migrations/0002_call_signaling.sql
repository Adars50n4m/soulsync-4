-- Migration to create call_signals table for robust signaling
-- Use this to bypass WebSocket blocking/clock skew issues

CREATE TABLE IF NOT EXISTS public.call_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID NOT NULL,
    recipient_id UUID NOT NULL,
    signal_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast polling by recipient and time
CREATE INDEX IF NOT EXISTS idx_call_signals_recipient_created 
    ON public.call_signals(recipient_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.call_signals ENABLE ROW LEVEL SECURITY;

-- Policies: Only sender or recipient can see the signal
DROP POLICY IF EXISTS "View own signals" ON public.call_signals;
CREATE POLICY "View own signals" ON public.call_signals 
    FOR SELECT USING (auth.uid() = recipient_id OR auth.uid() = sender_id);

DROP POLICY IF EXISTS "Insert signaling" ON public.call_signals;
CREATE POLICY "Insert signaling" ON public.call_signals 
    FOR INSERT WITH CHECK (auth.uid() = sender_id);

-- Enable Realtime for this table so we can see it in Dashboard (optional)
ALTER PUBLICATION supabase_realtime ADD TABLE public.call_signals;

-- Note: We don't add foreign keys to auth.users if the DB is in a state 
-- where that schema is protected or different. Using UUID type is enough for lookups.
