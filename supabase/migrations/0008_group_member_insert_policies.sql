-- Add missing INSERT RLS policies for chat_groups and chat_group_members.
-- 0006 created these tables but only defined SELECT/UPDATE policies, so every
-- create-group flow was blocked by default-deny on INSERT.

-- Allow any authenticated user to create a group they own.
DROP POLICY IF EXISTS "Users can create their own groups" ON public.chat_groups;
CREATE POLICY "Users can create their own groups" ON public.chat_groups
    FOR INSERT WITH CHECK (creator_id = auth.uid());

-- Allow:
--   (a) the group's creator to add any member (initial member seeding), and
--   (b) existing admins to add members later, and
--   (c) a user to insert themselves (self-join for creator's own admin row).
DROP POLICY IF EXISTS "Creators and admins can add members" ON public.chat_group_members;
CREATE POLICY "Creators and admins can add members" ON public.chat_group_members
    FOR INSERT WITH CHECK (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.chat_groups g
            WHERE g.id = group_id AND g.creator_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.chat_group_members m
            WHERE m.group_id = chat_group_members.group_id
              AND m.user_id = auth.uid()
              AND m.role = 'admin'
        )
    );

-- Allow admins and the creator to update group metadata (name/description/avatar).
DROP POLICY IF EXISTS "Admins and creators can update group info" ON public.chat_groups;
CREATE POLICY "Admins and creators can update group info" ON public.chat_groups
    FOR UPDATE
    USING (
        creator_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.chat_group_members m
            WHERE m.group_id = chat_groups.id
              AND m.user_id = auth.uid()
              AND m.role = 'admin'
        )
    )
    WITH CHECK (
        creator_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.chat_group_members m
            WHERE m.group_id = chat_groups.id
              AND m.user_id = auth.uid()
              AND m.role = 'admin'
        )
    );

-- Allow the creator to delete the group.
DROP POLICY IF EXISTS "Creators can delete their groups" ON public.chat_groups;
CREATE POLICY "Creators can delete their groups" ON public.chat_groups
    FOR DELETE USING (creator_id = auth.uid());

-- Allow admins (and the creator) to remove members.
DROP POLICY IF EXISTS "Admins can remove members" ON public.chat_group_members;
CREATE POLICY "Admins can remove members" ON public.chat_group_members
    FOR DELETE USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.chat_groups g
            WHERE g.id = group_id AND g.creator_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.chat_group_members m
            WHERE m.group_id = chat_group_members.group_id
              AND m.user_id = auth.uid()
              AND m.role = 'admin'
        )
    );
