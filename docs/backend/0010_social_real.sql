-- Copyright 2026 Scrakk Studio
-- SPDX-License-Identifier: Apache-2.0
-- Licencia completa en LICENSE (Apache License 2.0).

-- 0010: amigos + mensajes directos (sin servidores/comunidades).
-- Proyecto: scrakk-cli (Supabase)
--
-- Realtime entrega mensajes y solicitudes en vivo.

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint friendships_order check (user_a < user_b),
  constraint friendships_unique unique (user_a, user_b)
);
create index if not exists idx_friendships_a on public.friendships(user_a);
create index if not exists idx_friendships_b on public.friendships(user_b);

create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','rejected','cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint friend_requests_not_self check (requester_id <> addressee_id)
);
create unique index if not exists friend_requests_pending_unique
  on public.friend_requests (requester_id, addressee_id) where status = 'pending';
create index if not exists idx_friend_requests_addressee on public.friend_requests(addressee_id, status);
create index if not exists idx_friend_requests_requester on public.friend_requests(requester_id, status);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint messages_not_self check (sender_id <> recipient_id)
);
create index if not exists idx_messages_recipient on public.messages(recipient_id, created_at desc);
create index if not exists idx_messages_sender on public.messages(sender_id, created_at desc);

alter table public.friendships enable row level security;
alter table public.friend_requests enable row level security;
alter table public.messages enable row level security;

drop policy if exists "friendships own select" on public.friendships;
create policy "friendships own select" on public.friendships
  for select to authenticated using (auth.uid() = user_a or auth.uid() = user_b);

drop policy if exists "friend_requests own select" on public.friend_requests;
create policy "friend_requests own select" on public.friend_requests
  for select to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

drop policy if exists "messages participant select" on public.messages;
create policy "messages participant select" on public.messages
  for select to authenticated
  using (auth.uid() = sender_id or auth.uid() = recipient_id);

drop policy if exists "messages send to friend" on public.messages;
create policy "messages send to friend" on public.messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.friendships f
      where f.user_a = least(sender_id, recipient_id)
        and f.user_b = greatest(sender_id, recipient_id)
    )
  );

drop policy if exists "messages read own" on public.messages;
create policy "messages read own" on public.messages
  for update to authenticated
  using (auth.uid() = recipient_id)
  with check (auth.uid() = recipient_id);

revoke all on public.friendships from anon, authenticated;
revoke all on public.friend_requests from anon, authenticated;
revoke all on public.messages from anon, authenticated;
grant select on public.friendships to authenticated;
grant select on public.friend_requests to authenticated;
grant select on public.messages to authenticated;
grant insert (sender_id, recipient_id, body) on public.messages to authenticated;
grant update (read_at) on public.messages to authenticated;

do $$
begin
  begin
    alter publication supabase_realtime add table public.messages;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.friend_requests;
  exception when duplicate_object then null;
  end;
end $$;
