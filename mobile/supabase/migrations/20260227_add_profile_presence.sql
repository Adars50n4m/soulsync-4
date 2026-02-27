alter table public.profiles
  add column if not exists is_online boolean not null default false,
  add column if not exists last_seen timestamp with time zone;

create index if not exists idx_profiles_is_online on public.profiles(is_online);
create index if not exists idx_profiles_last_seen on public.profiles(last_seen);
