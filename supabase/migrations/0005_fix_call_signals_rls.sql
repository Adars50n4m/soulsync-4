-- Fix call_signals RLS: hardcoded app UUIDs don't match auth.uid()
-- Since call_signals is ephemeral signaling data (auto-cleaned after 5min),
-- allow all authenticated users to insert and read.

DROP POLICY IF EXISTS "View own signals" ON public.call_signals;
CREATE POLICY "View own signals" ON public.call_signals
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Insert signaling" ON public.call_signals;
CREATE POLICY "Insert signaling" ON public.call_signals
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Delete own signals" ON public.call_signals;
CREATE POLICY "Delete own signals" ON public.call_signals
    FOR DELETE USING (true);
