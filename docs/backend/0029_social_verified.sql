-- Copyright 2026 Scrakk Studio
-- SPDX-License-Identifier: Apache-2.0
-- Licencia completa en LICENSE (Apache License 2.0).

-- 0029: la marca de VERIFICADO en los RPCs sociales.
-- Proyecto: scrakk-cli (Supabase)
--
-- Los tres RPCs que devuelven perfiles (buscar, amigos, solicitudes) devolvían
-- un set mínimo de columnas SIN `verified`, así que el IDE no podía pintar el
-- check de una cuenta verificada. Se agrega `verified boolean` a cada uno.
--
-- OJO: `create or replace` NO puede cambiar el tipo de retorno (ERROR 42P13
-- "cannot change return type of existing function"), así que hay que DROP + CREATE
-- y volver a aplicar los GRANT (el drop se lleva los permisos).

-- ── search_users ──────────────────────────────────────────────────────────
drop function if exists public.search_users(text);
create function public.search_users(q text)
returns table (id uuid, handle text, display_name text, avatar_url text, verified boolean)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.handle, p.display_name, p.avatar_url, p.verified
  from public.profiles p
  where auth.uid() is not null
    and p.id <> auth.uid()
    and p.handle is not null
    and char_length(btrim(q)) >= 2
    and (p.handle ilike '%' || btrim(q) || '%' or coalesce(p.display_name,'') ilike '%' || btrim(q) || '%')
  order by p.handle
  limit 10
$$;
revoke execute on function public.search_users(text) from anon, public;
grant execute on function public.search_users(text) to authenticated;

-- ── list_friends ──────────────────────────────────────────────────────────
drop function if exists public.list_friends();
create function public.list_friends()
returns table (id uuid, handle text, display_name text, avatar_url text, verified boolean, since timestamptz)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.handle, p.display_name, p.avatar_url, p.verified, f.created_at
  from public.friendships f
  join public.profiles p
    on p.id = case when f.user_a = auth.uid() then f.user_b else f.user_a end
  where auth.uid() is not null and (f.user_a = auth.uid() or f.user_b = auth.uid())
  order by p.handle nulls last
$$;
revoke execute on function public.list_friends() from anon, public;
grant execute on function public.list_friends() to authenticated;

-- ── list_requests ─────────────────────────────────────────────────────────
drop function if exists public.list_requests();
create function public.list_requests()
returns table (
  id uuid,
  direction text,
  other_id uuid,
  handle text,
  display_name text,
  avatar_url text,
  verified boolean,
  created_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select r.id,
         case when r.requester_id = auth.uid() then 'outgoing' else 'incoming' end,
         case when r.requester_id = auth.uid() then r.addressee_id else r.requester_id end,
         p.handle, p.display_name, p.avatar_url, p.verified, r.created_at
  from public.friend_requests r
  join public.profiles p
    on p.id = case when r.requester_id = auth.uid() then r.addressee_id else r.requester_id end
  where auth.uid() is not null and r.status = 'pending'
    and (r.requester_id = auth.uid() or r.addressee_id = auth.uid())
  order by r.created_at desc
$$;
revoke execute on function public.list_requests() from anon, public;
grant execute on function public.list_requests() to authenticated;
