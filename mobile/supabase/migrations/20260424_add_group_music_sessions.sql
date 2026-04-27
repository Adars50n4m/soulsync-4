CREATE TABLE IF NOT EXISTS public.group_music_sessions (
    group_id UUID PRIMARY KEY REFERENCES public.groups(id) ON DELETE CASCADE,
    host_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    current_song JSONB,
    is_playing BOOLEAN NOT NULL DEFAULT FALSE,
    position_ms BIGINT NOT NULL DEFAULT 0,
    scheduled_start_time_ms BIGINT,
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_group_music_sessions_updated_at
    ON public.group_music_sessions(updated_at DESC);

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.group_music_sessions;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
  END;
END $$;

ALTER TABLE public.group_music_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view group music sessions" ON public.group_music_sessions;
CREATE POLICY "Members can view group music sessions"
ON public.group_music_sessions
FOR SELECT
USING (
    group_id IN (
        SELECT group_id FROM public.group_members WHERE user_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "Members can upsert group music sessions" ON public.group_music_sessions;
CREATE POLICY "Members can upsert group music sessions"
ON public.group_music_sessions
FOR INSERT
WITH CHECK (
    group_id IN (
        SELECT group_id FROM public.group_members WHERE user_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "Members can update group music sessions" ON public.group_music_sessions;
CREATE POLICY "Members can update group music sessions"
ON public.group_music_sessions
FOR UPDATE
USING (
    group_id IN (
        SELECT group_id FROM public.group_members WHERE user_id = auth.uid()
    )
)
WITH CHECK (
    group_id IN (
        SELECT group_id FROM public.group_members WHERE user_id = auth.uid()
    )
);
