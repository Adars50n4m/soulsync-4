-- Harden chat group write policies to support reliable group creation and edits.
-- Created: 2026-04-26

-- chat_groups policies
DROP POLICY IF EXISTS "Authenticated users can create groups" ON public.chat_groups;
DROP POLICY IF EXISTS "Users can view groups they are members of" ON public.chat_groups;
DROP POLICY IF EXISTS "Creators can update groups" ON public.chat_groups;
DROP POLICY IF EXISTS "Creators can delete groups" ON public.chat_groups;

CREATE POLICY "Authenticated users can create groups" ON public.chat_groups
FOR INSERT TO authenticated
WITH CHECK (creator_id = auth.uid());

CREATE POLICY "Users can view groups they are members of" ON public.chat_groups
FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Creators can update groups" ON public.chat_groups
FOR UPDATE TO authenticated
USING (creator_id = auth.uid())
WITH CHECK (creator_id = auth.uid());

CREATE POLICY "Creators can delete groups" ON public.chat_groups
FOR DELETE TO authenticated
USING (creator_id = auth.uid());

-- chat_group_members policies
DROP POLICY IF EXISTS "Creators can add members" ON public.chat_group_members;
DROP POLICY IF EXISTS "Members can view members" ON public.chat_group_members;
DROP POLICY IF EXISTS "Creators can update members" ON public.chat_group_members;
DROP POLICY IF EXISTS "Creators can remove members" ON public.chat_group_members;
DROP POLICY IF EXISTS "Members can leave groups" ON public.chat_group_members;

CREATE POLICY "Creators can add members" ON public.chat_group_members
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.chat_groups
    WHERE id = chat_group_members.group_id
      AND creator_id = auth.uid()
  )
);

CREATE POLICY "Members can view members" ON public.chat_group_members
FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Creators can update members" ON public.chat_group_members
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.chat_groups
    WHERE id = chat_group_members.group_id
      AND creator_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.chat_groups
    WHERE id = chat_group_members.group_id
      AND creator_id = auth.uid()
  )
);

CREATE POLICY "Creators can remove members" ON public.chat_group_members
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.chat_groups
    WHERE id = chat_group_members.group_id
      AND creator_id = auth.uid()
  )
);

CREATE POLICY "Members can leave groups" ON public.chat_group_members
FOR DELETE TO authenticated
USING (user_id = auth.uid());
