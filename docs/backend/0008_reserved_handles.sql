-- Copyright 2026 Scrakk Studio
-- SPDX-License-Identifier: Apache-2.0
-- Licencia completa en LICENSE (Apache License 2.0).

-- 0008: reserva de handles en la base.
-- Proyecto: scrakk-cli (Supabase)
--
-- Valida formato y reserva del lado del servidor.
-- Nota: 0009 ajusta la función para exceptuar cuentas oficiales.

create or replace function public.handle_is_reserved(h text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when h is null or btrim(h) = '' then false
    else
      lower(h) = any (array['scrakk','admin','root','support','system','official','help','mod','moderator','staff','scrakkteam'])
      -- cualquier handle que contenga "scrakk" (scrakk, scrakkteam, iamscrakk…)
      or lower(h) like '%scrakk%'
      -- palabras de rol con sufijo opcional (admin, admin_oficial, support-bot…)
      or lower(h) ~ '^(admin|root|support|system|official|mod|moderator|staff|help)([._-].*)?$'
  end
$$;

create or replace function public.validate_handle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare h text := new.handle;
begin
  if h is null or btrim(h) = '' then
    return new;
  end if;
  h := lower(btrim(h));
  if h !~ '^[a-z0-9_]{3,24}$' then
    raise exception 'handle_invalido' using errcode = '23514';
  end if;
  if public.handle_is_reserved(h) then
    raise exception 'handle_reservado' using errcode = '23514';
  end if;
  new.handle := h;
  return new;
end;
$$;

drop trigger if exists profiles_validate_handle on public.profiles;
create trigger profiles_validate_handle
  before insert or update of handle on public.profiles
  for each row execute function public.validate_handle();

revoke execute on function public.validate_handle() from anon, authenticated, public;
revoke execute on function public.handle_is_reserved(text) from anon, authenticated, public;
