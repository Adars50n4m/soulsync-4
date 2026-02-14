-- Fix for PGRST204: Add missing reply_to_id column
alter table public.messages
add column if not exists reply_to_id bigint;

-- Optionally add a foreign key constraint if you want replies to reference actual messages
-- alter table public.messages
-- add constraint fk_reply_to_id foreign key (reply_to_id) references public.messages(id) on delete cascade;

-- Refresh schema cache
notify pgrst, 'reload schema';
