-- Offline-first TTL relay migration for Soul local sync engine
-- Keeps messages ephemeral on Supabase and optimized for local-first clients.

create extension if not exists pg_cron;

alter table public.messages
  add column if not exists expires_at timestamp with time zone,
  add column if not exists delivered_to_device_at timestamp with time zone,
  add column if not exists acked_at timestamp with time zone;

update public.messages
set expires_at = coalesce(expires_at, created_at + interval '5 minutes')
where expires_at is null;

alter table public.messages
  alter column expires_at set default (timezone('utc', now()) + interval '5 minutes');

create index if not exists idx_messages_receiver_created_at
  on public.messages(receiver, created_at);

create index if not exists idx_messages_expires_at
  on public.messages(expires_at);

create index if not exists idx_messages_sender_created_at
  on public.messages(sender, created_at);

do $$
begin
  begin
    alter table public.messages
      drop constraint if exists messages_status_check;
  exception when undefined_object then
    null;
  end;

  alter table public.messages
    add constraint messages_status_check
    check (status in ('pending', 'sent', 'delivered', 'read'));
end $$;

create or replace function public.can_sender_delete_within_5_minutes(
  p_message_id bigint,
  p_sender text
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.messages m
    where m.id = p_message_id
      and m.sender = p_sender
      and timezone('utc', now()) - m.created_at < interval '5 minutes'
  );
$$;

create or replace function public.ack_and_delete_message(
  p_message_id bigint,
  p_receiver text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  update public.messages
  set delivered_to_device_at = timezone('utc', now()),
      acked_at = timezone('utc', now()),
      status = 'delivered'
  where id = p_message_id
    and receiver = p_receiver;

  delete from public.messages
  where id = p_message_id
    and receiver = p_receiver;

  get diagnostics deleted_count = row_count;
  return deleted_count > 0;
end;
$$;

create or replace function public.purge_expired_messages()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.messages
  where expires_at <= timezone('utc', now());

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

do $$
begin
  perform cron.unschedule('purge-expired-soul-messages');
exception
  when others then
    null;
end $$;

select cron.schedule(
  'purge-expired-soul-messages',
  '* * * * *',
  $$select public.purge_expired_messages();$$
);
