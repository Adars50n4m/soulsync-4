-- Migration: Add Groups and Group Members
-- Created: 2026-04-15

-- 1. Create GROUPS table
CREATE TABLE IF NOT EXISTS public.groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    avatar_url TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create GROUP_MEMBERS table
CREATE TABLE IF NOT EXISTS public.group_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member', -- 'admin', 'member'
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(group_id, user_id)
);

-- 3. Modify MESSAGES table
-- Add group_id column to existing messages table
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'messages' AND COLUMN_NAME = 'group_id') THEN
        ALTER TABLE public.messages ADD COLUMN group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 4. Enable Realtime
-- Use the older syntax since we don't know the exact Supabase version/extension state, 
-- but this is the standard way to add tables to the 'supabase_realtime' publication.
BEGIN;
  -- Remove if already exists to avoid errors
  ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.groups;
  ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.group_members;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.groups;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.group_members;
COMMIT;

-- 5. RLS Policies

-- Groups Policies
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view groups they are members of"
ON public.groups FOR SELECT
TO authenticated
USING (
    id IN (
        SELECT group_id FROM public.group_members WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Authenticated users can create groups"
ON public.groups FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Admins can update their groups"
ON public.groups FOR UPDATE
TO authenticated
USING (
    id IN (
        SELECT group_id FROM public.group_members WHERE user_id = auth.uid() AND role = 'admin'
    )
);

-- Group Members Policies
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view other members in their groups"
ON public.group_members FOR SELECT
TO authenticated
USING (
    group_id IN (
        SELECT group_id FROM public.group_members WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Admins can add/remove members"
ON public.group_members FOR ALL
TO authenticated
USING (
    group_id IN (
        SELECT group_id FROM public.group_members WHERE user_id = auth.uid() AND role = 'admin'
    )
);

-- Messages Policies (Update existing if needed, or ensure the current one allows group_id)
-- Assuming existing policy is based on receiver_id or sender_id.
-- We need to add group access.
DROP POLICY IF EXISTS "Users can view group messages" ON public.messages;
CREATE POLICY "Users can view group messages"
ON public.messages FOR SELECT
TO authenticated
USING (
    group_id IS NULL OR 
    group_id IN (
        SELECT group_id FROM public.group_members WHERE user_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "Users can send group messages" ON public.messages;
CREATE POLICY "Users can send group messages"
ON public.messages FOR INSERT
TO authenticated
WITH CHECK (
    group_id IS NULL OR
    group_id IN (
        SELECT group_id FROM public.group_members WHERE user_id = auth.uid()
    )
);

-- 6. Trigger for updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_group_updated
    BEFORE UPDATE ON public.groups
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();
