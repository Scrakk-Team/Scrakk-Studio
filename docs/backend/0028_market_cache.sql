-- Copyright 2026 Scrakk Studio
-- SPDX-License-Identifier: Apache-2.0
-- Licencia completa en LICENSE (Apache License 2.0).

-- 0028: cache de releases — el dueño puede refrescar su propia extensión.
-- Proyecto: scrakk-cli (Supabase)

-- El guard deja de pisar el cache de release (latest_*): son datos de solo
-- lectura pública, no columnas admin. verified/status/downloads/rating siguen
-- bloqueados para el dueño.
create or replace function public.extensions_admin_guard()
returns trigger
language plpgsql
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    return new;
  end if;
  new.verified      := old.verified;
  new.verified_at   := old.verified_at;
  new.downloads     := old.downloads;
  new.rating_avg    := old.rating_avg;
  new.rating_count  := old.rating_count;
  if new.status not in ('draft', 'pending') then
    new.status := old.status;
  end if;
  return new;
end;
$$;

-- El dueño puede mantener el cache de releases de SU extensión.
drop policy if exists "extension_releases_write_owner" on public.extension_releases;
create policy "extension_releases_write_owner"
  on public.extension_releases for all
  using (exists (
    select 1 from public.extensions e where e.id = extension_id and e.owner = auth.uid()))
  with check (exists (
    select 1 from public.extensions e where e.id = extension_id and e.owner = auth.uid()));

grant insert, update, delete on public.extension_releases to authenticated;
