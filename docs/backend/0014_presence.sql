-- Copyright 2026 Scrakk Studio
-- SPDX-License-Identifier: Apache-2.0
-- Licencia completa en LICENSE (Apache License 2.0).

-- 0014: presencia (estado + actividad) con RLS y Realtime.
-- Proyecto: scrakk-cli (Supabase)
--
-- Estados: online/away/busy/offline + actividad. La app late (heartbeat) cada
-- 45s y al cerrar deja offline. RLS: mi fila y la de mis amigos.

create table if not exists public.presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'online' check (status in ('online','away','busy','offline')),
  activity jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.presence enable row level security;

create or replace function public.are_friends(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.friendships f
    where f.user_a = least(a,b) and f.user_b = greatest(a,b)
  )
$$;
revoke execute on function public.are_friends(uuid, uuid) from anon, public;
grant execute on function public.are_friends(uuid, uuid) to authenticated;

drop policy if exists "presence read mine and friends" on public.presence;
create policy "presence read mine and friends" on public.presence
  for select to authenticated
  using (auth.uid() = user_id or public.are_friends(auth.uid(), user_id));

drop policy if exists "presence insert own" on public.presence;
create policy "presence insert own" on public.presence
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "presence update own" on public.presence;
create policy "presence update own" on public.presence
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

revoke all on public.presence from anon, authenticated;
grant select on public.presence to authenticated;
grant insert (user_id, status, activity, updated_at) on public.presence to authenticated;
grant update (status, activity, updated_at) on public.presence to authenticated;

do $$
begin
  begin
    alter publication supabase_realtime add table public.presence;
  exception when duplicate_object then null;
  end;
end $$;
alter table public.presence replica identity full;
