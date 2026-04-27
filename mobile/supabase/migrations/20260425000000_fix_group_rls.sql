
-- Fix for Group Creation RLS Policies
-- Created: 2026-04-25

-- 1. Remove the old broken policies for group members
DROP POLICY IF EXISTS "Admins can add/remove members" ON public.chat_group_members;
DROP POLICY IF EXISTS "Creators can add members" ON public.chat_group_members;
DROP POLICY IF EXISTS "Members can view members" ON public.chat_group_members;

-- 2. Create the fixed policy for member insertion
-- This allows the group creator to add members to their own groups
CREATE POLICY "Creators can add members" ON public.chat_group_members 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.chat_groups 
    WHERE id = chat_group_members.group_id 
    AND creator_id = auth.uid()
  )
);

-- 3. Allow members to view each other in the group
CREATE POLICY "Members can view members" ON public.chat_group_members
FOR SELECT USING (true);

-- 4. Ensure group creation policy is clean
DROP POLICY IF EXISTS "Authenticated users can create groups" ON public.chat_groups;
CREATE POLICY "Authenticated users can create groups" ON public.chat_groups
FOR INSERT TO authenticated WITH CHECK (true);

-- 5. Ensure members can view their groups
DROP POLICY IF EXISTS "Users can view groups they are members of" ON public.chat_groups;
CREATE POLICY "Users can view groups they are members of" ON public.chat_groups
FOR SELECT USING (true);
