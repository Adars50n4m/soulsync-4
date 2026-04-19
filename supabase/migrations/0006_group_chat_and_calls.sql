-- Migration: Support Group Chats and Multi-party Signaling
-- This migration adds group management tables and updates the messages table for group support.

-- 1. Create chat_groups table
CREATE TABLE IF NOT EXISTS public.chat_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    avatar_url TEXT,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create chat_group_members table
CREATE TABLE IF NOT EXISTS public.chat_group_members (
    group_id UUID REFERENCES public.chat_groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    role TEXT DEFAULT 'member', -- 'admin', 'member'
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (group_id, user_id)
);

-- 3. Update messages table to support group_id
-- We use TEXT to match the existing sender/receiver columns in 0000_ephemeral_schema.sql
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS group_id TEXT;
CREATE INDEX IF NOT EXISTS idx_messages_group_id ON public.messages(group_id);

-- 4. Enable RLS on new tables
ALTER TABLE public.chat_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_group_members ENABLE ROW LEVEL SECURITY;

-- 5. Helper Function for Group Membership (Better Performance in RLS)
CREATE OR REPLACE FUNCTION public.is_group_member(group_id_param UUID, user_id_param UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.chat_group_members 
        WHERE group_id = group_id_param AND user_id = user_id_param
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. RLS Policies for chat_groups
DROP POLICY IF EXISTS "Members can view group info" ON public.chat_groups;
CREATE POLICY "Members can view group info" ON public.chat_groups
    FOR SELECT USING (
        is_group_member(id, auth.uid()) OR created_by = auth.uid()
    );

DROP POLICY IF EXISTS "Admins can update group info" ON public.chat_groups;
CREATE POLICY "Admins can update group info" ON public.chat_groups
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.chat_group_members 
            WHERE group_id = id AND user_id = auth.uid() AND role = 'admin'
        ) OR created_by = auth.uid()
    );

-- 7. RLS Policies for chat_group_members
DROP POLICY IF EXISTS "Members can see each other" ON public.chat_group_members;
CREATE POLICY "Members can see each other" ON public.chat_group_members
    FOR SELECT USING (
        is_group_member(group_id, auth.uid())
    );

-- 8. Update RLS Policies for messages
-- We need to allow reading if the message is part of a group the user is in.
-- Existing policies in 0000_ephemeral_schema.sql were broad (auth.role() = 'authenticated' OR true).
-- We will replace them with more secure ones if needed, but for now, we add the group check.

DROP POLICY IF EXISTS "Group members can read messages" ON public.messages;
CREATE POLICY "Group members can read messages" ON public.messages
    FOR SELECT USING (
        group_id IS NULL OR is_group_member(group_id::UUID, auth.uid())
    );

-- 9. Enable Realtime for new tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_groups;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_group_members;

-- 10. Update updated_at trigger for chat_groups
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_chat_groups_updated_at
    BEFORE UPDATE ON public.chat_groups
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();
