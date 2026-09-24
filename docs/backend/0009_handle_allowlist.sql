-- Copyright 2026 Scrakk Studio
-- SPDX-License-Identifier: Apache-2.0
-- Licencia completa en LICENSE (Apache License 2.0).

-- 0009: allowlist de cuentas oficiales para handles reservados.
-- Proyecto: scrakk-cli (Supabase)
--
-- Solo las cuentas listadas aquí pueden usar handles reservados. Se decide por
-- dueño del perfil (new.id).

create table if not exists public.handle_allowlist (
  user_id uuid primary key references auth.users(id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);
alter table public.handle_allowlist enable row level security;
revoke all on public.handle_allowlist from anon, authenticated;

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
  -- Cuentas oficiales: pueden tomar handles reservados.
  if exists (select 1 from public.handle_allowlist a where a.user_id = new.id) then
    new.handle := h;
    return new;
  end if;
  if public.handle_is_reserved(h) then
    raise exception 'handle_reservado' using errcode = '23514';
  end if;
  new.handle := h;
  return new;
end;
$$;

revoke execute on function public.validate_handle() from anon, authenticated, public;

-- Cuenta oficial de Scrakk (founder@scrakk.art) → puede usar "scrakk".
insert into public.handle_allowlist(user_id, note)
select id, 'cuenta oficial Scrakk' from public.profiles where email = 'founder@scrakk.art'
on conflict (user_id) do nothing;
