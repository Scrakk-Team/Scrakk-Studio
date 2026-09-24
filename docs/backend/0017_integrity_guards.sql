-- Copyright 2026 Scrakk Studio
-- SPDX-License-Identifier: Apache-2.0
-- Licencia completa en LICENSE (Apache License 2.0).

-- 0017: guards y validaciones en la base (integridad + límites).
-- Proyecto: scrakk-cli (Supabase)

-- ── messages: guard ─────────────────────────────────────────────────────────
create or replace function public.messages_guard() returns trigger
language plpgsql security definer set search_path = '' as $fn$
begin
  if tg_op = 'INSERT' then
    -- reply_to solo puede citar un mensaje del MISMO DM.
    if new.reply_to is not null then
      if not exists (
        select 1 from public.messages m
        where m.id = new.reply_to
          and ((m.sender_id = new.sender_id and m.recipient_id = new.recipient_id)
            or (m.sender_id = new.recipient_id and m.recipient_id = new.sender_id))
      ) then
        raise exception 'reply_not_in_dm' using errcode = '22023';
      end if;
    end if;
    return new;
  end if;

  -- sender/recipient/reply_to inmutables.
  if new.sender_id is distinct from old.sender_id
     or new.recipient_id is distinct from old.recipient_id
     or new.reply_to is distinct from old.reply_to then
    raise exception 'messages_immutable' using errcode = '42501';
  end if;

  -- Solo el EMISOR puede cambiar body/edited_at. El receptor solo read_at.
  if (new.body is distinct from old.body or new.edited_at is distinct from old.edited_at)
     and auth.uid() is not null
     and auth.uid() is distinct from old.sender_id then
    raise exception 'not_sender' using errcode = '42501';
  end if;

  return new;
end $fn$;

drop trigger if exists messages_guard on public.messages;
create trigger messages_guard before insert or update on public.messages
  for each row execute function public.messages_guard();

-- ── message_attachments: contenido verificado en la base ────────────────────
alter table public.message_attachments
  drop constraint if exists message_attachments_url_check,
  drop constraint if exists message_attachments_mime_check,
  drop constraint if exists message_attachments_path_check;
alter table public.message_attachments
  add constraint message_attachments_mime_check
    check (mime in ('image/png','image/jpeg','image/webp','image/gif','image/avif')),
  add constraint message_attachments_url_check
    check (
      char_length(url) between 1 and 512
      and url ~ '^https://(pub-[a-z0-9]+[.]r2[.]dev/|[a-z0-9]+[.]supabase[.]co/storage/v1/object/public/)'
    ),
  add constraint message_attachments_path_check
    check (char_length(path) between 1 and 512 and path !~ '[.]{2}');

-- ── profiles ────────────────────────────────────────────────────────────────
alter table public.profiles
  drop constraint if exists profiles_avatar_url_check,
  drop constraint if exists profiles_email_check;
alter table public.profiles
  add constraint profiles_avatar_url_check
    check (
      avatar_url is null
      or (
        char_length(avatar_url) <= 96000
        and (
          avatar_url ~ '^https?://'
          or avatar_url ~ '^data:image/(png|jpe?g|webp|gif|avif);base64,'
        )
      )
    );

create or replace function public.profiles_lock_email() returns trigger
language plpgsql security definer set search_path = '' as $fn$
begin
  -- El email se toma de auth.users.
  if auth.uid() is not null then
    new.email := coalesce((select u.email from auth.users u where u.id = auth.uid()), new.email);
  end if;
  return new;
end $fn$;

drop trigger if exists profiles_lock_email on public.profiles;
create trigger profiles_lock_email before insert or update on public.profiles
  for each row execute function public.profiles_lock_email();

-- ── storage: límite de tamaño y tipos por bucket ────────────────────────────
update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array['image/png','image/jpeg','image/webp','image/gif','image/avif']
where id in ('avatars','chat-images');

-- ── are_friends ─────────────────────────────────────────────────────────────
create or replace function public.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $fn$
  select auth.uid() is not null
     and (a = auth.uid() or b = auth.uid())
     and exists (
       select 1 from public.friendships f
       where f.user_a = least(a,b) and f.user_b = greatest(a,b)
     )
$fn$;

-- ── send_friend_request: tope de pendientes ─────────────────────────────────
create or replace function public.send_friend_request(target uuid)
returns text language plpgsql security definer set search_path = '' as $fn$
declare me uuid := auth.uid(); rev public.friend_requests%rowtype; pendientes int;
begin
  if me is null then raise exception 'no_auth' using errcode = '42501'; end if;
  if target is null or target = me then raise exception 'invalid_target' using errcode = '22023'; end if;
  if not exists (select 1 from public.profiles p where p.id = target) then
    raise exception 'user_not_found' using errcode = '22023';
  end if;
  if exists (select 1 from public.friendships f
             where f.user_a = least(me,target) and f.user_b = greatest(me,target)) then
    return 'already_friends';
  end if;

  select * into rev from public.friend_requests
    where requester_id = target and addressee_id = me and status = 'pending' limit 1;
  if found then
    update public.friend_requests set status = 'accepted', responded_at = now() where id = rev.id;
    insert into public.friendships(user_a,user_b) values (least(me,target), greatest(me,target))
      on conflict do nothing;
    return 'accepted';
  end if;

  select count(*) into pendientes from public.friend_requests
    where requester_id = me and status = 'pending';
  if pendientes >= 25 then
    raise exception 'rate_limited' using errcode = '22023';
  end if;

  insert into public.friend_requests(requester_id, addressee_id) values (me, target)
    on conflict do nothing;
  return 'pending';
end $fn$;
