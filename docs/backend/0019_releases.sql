-- Copyright 2026 Scrakk Studio
-- SPDX-License-Identifier: Apache-2.0
-- Licencia completa en LICENSE (Apache License 2.0).

-- 0019: releases — aviso de actualizaciones del IDE en tiempo real.
--
-- El IDE se suscribe por Realtime a esta tabla; el workflow de release
-- (release.yml) inserta una fila por versión publicada. La lectura es
-- pública (avisar de una versión nueva no requiere cuenta); la escritura
-- la hace el workflow con service_role, que salta RLS.
--
-- `body` lleva las notas de la versión (el `changelog-<x.y.z>.md`), así el
-- anuncio del IDE y la página de la release muestran lo mismo.

create table if not exists public.releases (
    tag          text primary key,                 -- v0.1.1
    version      text not null,                    -- 0.1.1
    name         text,
    body         text,                             -- notas (markdown)
    html_url     text,
    prerelease   boolean not null default false,
    published_at timestamptz not null default now(),
    created_at   timestamptz not null default now()
);

create index if not exists releases_published_at_idx
    on public.releases (published_at desc);

alter table public.releases enable row level security;

-- Lectura pública: cualquiera ve qué versiones existen.
drop policy if exists "releases_select_public" on public.releases;
create policy "releases_select_public"
    on public.releases for select
    using (true);

-- Sin policies de insert/update/delete: solo service_role escribe.
grant select on public.releases to anon, authenticated;

-- Realtime: el push al IDE (una sola vez; si ya estaba, no falla).
do $$
begin
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'releases'
    ) then
        alter publication supabase_realtime add table public.releases;
    end if;
end $$;
