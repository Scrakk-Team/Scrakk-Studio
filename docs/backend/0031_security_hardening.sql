-- Copyright 2026 Scrakk Studio
-- SPDX-License-Identifier: Apache-2.0
-- Licencia completa en LICENSE (Apache License 2.0).

-- 0031: endurecimiento del market, Storage y consentimiento legal.
-- Proyecto: scrakk-cli (Supabase)
--
-- Hallazgos de la auditoría 0.1.5:
--  1. El guard de `extensions` era solo BEFORE UPDATE: un INSERT podía nacer
--     `published` + `verified` + downloads inflados.
--  2. Cambiar `repo_url` después de la revisión no volvía a `pending`: una
--     extensión aprobada podía apuntar a un repo malicioso.
--  3. Las policies "public read" de Storage también habilitaban el LISTADO
--     anónimo (UUIDs de usuarios + nombres de archivos de DMs).
--  4. `accept_legal` era SECURITY INVOKER y `authenticated` no tiene UPDATE
--     sobre las columnas legales: la aceptación nunca se persistía.
--  5. `extension_releases` era `using (true)` incluso para releases de
--     extensiones pendientes/suspendidas.
--  6. `anon` tenía TRUNCATE a nivel tabla (no pasa por RLS).

-- ── 1+2. Guard de extensiones: INSERT y cambios materiales ────────────────
create or replace function public.extensions_admin_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  is_admin boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
begin
  if is_admin then
    return new;
  end if;

  -- INSERT: nada de nacer publicado/verificado ni con métricas infladas.
  if tg_op = 'INSERT' then
    new.verified := false;
    new.verified_at := null;
    new.downloads := 0;
    new.rating_avg := 0;
    new.rating_count := 0;
    new.latest_version := null;
    new.latest_release_at := null;
    new.latest_checked_at := null;
    if new.status not in ('draft', 'pending') then
      new.status := 'pending';
    end if;
    return new;
  end if;

  -- UPDATE: columnas admin intocables para el dueño.
  new.verified      := old.verified;
  new.verified_at   := old.verified_at;
  new.downloads     := old.downloads;
  new.rating_avg    := old.rating_avg;
  new.rating_count  := old.rating_count;
  if new.status not in ('draft', 'pending') then
    new.status := old.status;
  end if;

  -- Un cambio de repo/proveedor/asset es material: vuelve a revisión y se
  -- limpia la verificación (en la 0.1.5 se podía aprobar y luego cambiar).
  if new.repo_url is distinct from old.repo_url
     or new.repo_provider is distinct from old.repo_provider
     or new.asset_name is distinct from old.asset_name then
    new.status := 'pending';
    new.verified := false;
    new.verified_at := null;
    new.latest_version := null;
    new.latest_release_at := null;
    new.latest_checked_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists extensions_admin_guard on public.extensions;
create trigger extensions_admin_guard
  before insert or update on public.extensions
  for each row execute function public.extensions_admin_guard();

-- ── 3. Storage: el listado deja de ser público (la descarga por URL sigue) ─
drop policy if exists "avatars public read" on storage.objects;
create policy "avatars read own folder"
  on storage.objects for select
  using (
    bucket_id = 'avatars'
    and (
      -- El dueño lista su carpeta. El bucket sigue siendo `public`, así que
      -- las URLs públicas de los avatares se descargan sin RLS.
      (storage.foldername(name))[1] = auth.uid()::text
      or auth.role() = 'service_role'
    )
  );

drop policy if exists "chat-images public read" on storage.objects;
create policy "chat-images read own folder"
  on storage.objects for select
  using (
    bucket_id = 'chat-images'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or auth.role() = 'service_role'
    )
  );

-- ── 4. accept_legal: SECURITY DEFINER acotado a la propia fila ────────────
create or replace function public.accept_legal(p_version text, p_locale text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'auth_requerida';
  end if;
  if p_version is null or length(trim(p_version)) = 0 then
    raise exception 'legal_version_requerida';
  end if;
  update public.profiles
     set legal_version = p_version,
         legal_accepted_at = now(),
         legal_locale = p_locale
   where id = auth.uid();
end;
$$;

revoke execute on function public.accept_legal(text, text) from public, anon;
grant execute on function public.accept_legal(text, text) to authenticated;

-- ── 5. Releases: solo de extensiones publicadas (o propias) ───────────────
drop policy if exists "extension_releases_select" on public.extension_releases;
create policy "extension_releases_select"
  on public.extension_releases for select
  using (
    exists (
      select 1
      from public.extensions e
      where e.id = extension_id
        and (e.status = 'published' or e.owner = auth.uid())
    )
  );

-- ── 6. Privilegios de tabla: sin TRUNCATE para clientes ───────────────────
revoke truncate on public.extensions, public.extension_ratings,
  public.extension_releases, public.extension_reports
  from anon, authenticated;

-- El contador de descargas lo inflaba cualquiera (RPC SECURITY DEFINER
-- ejecutable por anon, sin rate limit). Lo actualiza el servidor/ETL.
revoke execute on function public.increment_extension_download(text) from public, anon;
