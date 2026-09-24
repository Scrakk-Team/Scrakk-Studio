-- Copyright 2026 Scrakk Studio
-- SPDX-License-Identifier: Apache-2.0
-- Licencia completa en LICENSE (Apache License 2.0).

-- 0004: perfiles del IDE (campos sociales sobre auth.users).
-- Proyecto: scrakk-cli (Supabase)
-- Aplicada vía MCP de Supabase (quedó en supabase_migrations.schema_migrations).
--
-- Reutiliza el MISMO auth.users (login compartido CLI ⇄ IDE) y extiende
-- public.profiles con los campos sociales.

alter table public.profiles
  add column if not exists handle text,
  add column if not exists display_name text,
  add column if not exists avatar_url text,
  add column if not exists bio text;

-- Handle único, case-insensitive (solo cuando está seteado).
create unique index if not exists profiles_handle_lower_key
  on public.profiles (lower(handle)) where handle is not null;

-- Perfil automático al crear el usuario (mismo patrón que el login del CLI).
create or replace function public.ensure_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

do $$
begin
  begin
    drop trigger if exists on_auth_user_created on auth.users;
    create trigger on_auth_user_created
      after insert on auth.users
      for each row execute function public.ensure_profile();
  exception when insufficient_privilege then
    raise notice 'auth.users trigger skipped (needs supabase_admin)';
  end;
end $$;

-- updated_at automático en profiles.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- RLS: el dueño lee/edita SU fila.
alter table public.profiles enable row level security;

drop policy if exists "profiles own select" on public.profiles;
create policy "profiles own select" on public.profiles
  for select to authenticated using (auth.uid() = id);

drop policy if exists "profiles own insert" on public.profiles;
create policy "profiles own insert" on public.profiles
  for insert to authenticated with check (auth.uid() = id);

drop policy if exists "profiles own update" on public.profiles;
create policy "profiles own update" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- Grants a NIVEL COLUMNA: nunca plan/device_id/email/created_at en update.
revoke all on public.profiles from anon, authenticated;
grant select (id, email, handle, display_name, avatar_url, bio, plan, created_at, updated_at)
  on public.profiles to authenticated;
grant insert (id, email, handle, display_name, avatar_url, bio)
  on public.profiles to authenticated;
grant update (handle, display_name, avatar_url, bio)
  on public.profiles to authenticated;
