-- Copyright 2026 Scrakk Studio
-- SPDX-License-Identifier: Apache-2.0
-- Licencia completa en LICENSE (Apache License 2.0).

-- 0027: tienda de extensiones (metadata) + verificación.
-- Proyecto: scrakk-cli (Supabase)
-- Aplicada vía MCP de Supabase.
--
-- IMPORTANTE: la tienda NO hostea los `.sef`. Guarda SOLO metadata y el link
-- del repo (GitHub/GitLab); la app resuelve la última release y baja el asset.
-- Búsqueda full-text (tsvector) — sin listas hardcodeadas.

-- ── Verificación de cuentas ────────────────────────────────────────────────
alter table public.profiles
  add column if not exists verified boolean not null default false,
  add column if not exists verified_at timestamptz;

-- ── Extensiones (metadata) ─────────────────────────────────────────────────
create table if not exists public.extensions (
  id                  uuid primary key default gen_random_uuid(),
  slug                text not null unique,
  owner               uuid not null references public.profiles(id) on delete cascade,
  name                text not null,
  summary             text,
  description         text,
  icon_url            text,
  screenshots         text[] not null default '{}',
  video_url           text,
  repo_provider       text not null check (repo_provider in ('github','gitlab')),
  repo_url            text not null,
  asset_name          text,
  categories          text[] not null default '{}',
  license             text,
  status              text not null default 'pending'
                      check (status in ('draft','pending','published','suspended')),
  verified            boolean not null default false,
  verified_at         timestamptz,
  downloads           integer not null default 0,
  rating_avg          numeric(3,2) not null default 0,
  rating_count        integer not null default 0,
  latest_version      text,
  latest_release_at   timestamptz,
  latest_checked_at   timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  search_vector       tsvector
);

create index if not exists extensions_owner_idx    on public.extensions (owner);
create index if not exists extensions_status_idx   on public.extensions (status);
create index if not exists extensions_search_idx   on public.extensions using gin (search_vector);
create index if not exists extensions_categories_idx on public.extensions using gin (categories);

-- search_vector + updated_at automáticos.
create or replace function public.extensions_touch()
returns trigger
language plpgsql
as $$
begin
  new.search_vector :=
    setweight(to_tsvector('simple', coalesce(new.name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(new.summary, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(array_to_string(new.categories, ' '), '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(new.description, '')), 'C');
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists extensions_touch on public.extensions;
create trigger extensions_touch
  before insert or update on public.extensions
  for each row execute function public.extensions_touch();

-- ── Ratings ────────────────────────────────────────────────────────────────
create table if not exists public.extension_ratings (
  id            uuid primary key default gen_random_uuid(),
  extension_id  uuid not null references public.extensions(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  stars         smallint not null check (stars between 1 and 5),
  comment       text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (extension_id, user_id)
);

create index if not exists extension_ratings_ext_idx on public.extension_ratings (extension_id);

-- Agregado rating_avg / rating_count en extensions.
create or replace function public.refresh_extension_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
begin
  target := coalesce(new.extension_id, old.extension_id);
  update public.extensions e set
    rating_avg = coalesce(
      (select round(avg(stars)::numeric, 2) from public.extension_ratings where extension_id = target), 0),
    rating_count = (select count(*) from public.extension_ratings where extension_id = target)
  where e.id = target;
  return null;
end;
$$;

drop trigger if exists extension_ratings_refresh on public.extension_ratings;
create trigger extension_ratings_refresh
  after insert or update or delete on public.extension_ratings
  for each row execute function public.refresh_extension_rating();

-- ── Reportes ───────────────────────────────────────────────────────────────
create table if not exists public.extension_reports (
  id            uuid primary key default gen_random_uuid(),
  extension_id  uuid not null references public.extensions(id) on delete cascade,
  user_id       uuid references public.profiles(id) on delete set null,
  reason        text not null,
  note          text,
  status        text not null default 'open' check (status in ('open','resolved','dismissed')),
  created_at    timestamptz not null default now()
);

-- ── Cache de releases (job la mantiene al día) ─────────────────────────────
create table if not exists public.extension_releases (
  id            uuid primary key default gen_random_uuid(),
  extension_id  uuid not null references public.extensions(id) on delete cascade,
  version       text not null,
  asset_name    text,
  asset_url     text,
  html_url      text,
  changelog     text,
  published_at  timestamptz,
  fetched_at    timestamptz not null default now(),
  unique (extension_id, version)
);

create index if not exists extension_releases_ext_idx on public.extension_releases (extension_id, published_at desc);

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table public.extensions          enable row level security;
alter table public.extension_ratings   enable row level security;
alter table public.extension_reports   enable row level security;
alter table public.extension_releases  enable row level security;

-- extensiones: lectura pública de las publicadas; el dueño ve también las suyas.
drop policy if exists "extensions_select" on public.extensions;
create policy "extensions_select"
  on public.extensions for select
  using (status = 'published' or owner = auth.uid());

drop policy if exists "extensions_insert_own" on public.extensions;
create policy "extensions_insert_own"
  on public.extensions for insert
  with check (owner = auth.uid());

drop policy if exists "extensions_update_own" on public.extensions;
create policy "extensions_update_own"
  on public.extensions for update
  using (owner = auth.uid())
  with check (owner = auth.uid());

drop policy if exists "extensions_delete_own" on public.extensions;
create policy "extensions_delete_own"
  on public.extensions for delete
  using (owner = auth.uid());

-- Blindaje de columnas admin: aunque el dueño haga `update`, no puede tocar
-- verified/verified_at/downloads/rating_* ni publicar sin revisión.
create or replace function public.extensions_admin_guard()
returns trigger
language plpgsql
as $$
declare
  is_admin boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
begin
  if is_admin then
    return new;
  end if;
  new.verified      := old.verified;
  new.verified_at   := old.verified_at;
  new.downloads     := old.downloads;
  new.rating_avg    := old.rating_avg;
  new.rating_count  := old.rating_count;
  new.latest_version := old.latest_version;
  new.latest_release_at := old.latest_release_at;
  new.latest_checked_at := old.latest_checked_at;
  if new.status not in ('draft', 'pending') then
    new.status := old.status;
  end if;
  return new;
end;
$$;

drop trigger if exists extensions_admin_guard on public.extensions;
create trigger extensions_admin_guard
  before update on public.extensions
  for each row execute function public.extensions_admin_guard();

-- ratings: todos leen; el dueño escribe el suyo; no se puede ratear la propia.
drop policy if exists "extension_ratings_select" on public.extension_ratings;
create policy "extension_ratings_select"
  on public.extension_ratings for select using (true);

drop policy if exists "extension_ratings_write_own" on public.extension_ratings;
create policy "extension_ratings_write_own"
  on public.extension_ratings for all
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and not exists (
      select 1 from public.extensions e where e.id = extension_id and e.owner = auth.uid()
    )
  );

-- reportes: cualquier logueado crea; nadie los borra desde el cliente.
drop policy if exists "extension_reports_insert" on public.extension_reports;
create policy "extension_reports_insert"
  on public.extension_reports for insert
  with check (user_id = auth.uid());

-- releases cacheadas: lectura pública.
drop policy if exists "extension_releases_select" on public.extension_releases;
create policy "extension_releases_select"
  on public.extension_releases for select using (true);

grant select on public.extensions to anon, authenticated;
grant select on public.extension_ratings to anon, authenticated;
grant select on public.extension_releases to anon, authenticated;
grant insert, update, delete on public.extensions to authenticated;
grant insert, update, delete on public.extension_ratings to authenticated;
grant insert on public.extension_reports to authenticated;

-- ── RPCs ───────────────────────────────────────────────────────────────────

-- Búsqueda full-text (name/summary/categories/description) + filtro por categoría.
create or replace function public.search_extensions(
  p_query    text default null,
  p_category text default null,
  p_limit    integer default 40,
  p_offset   integer default 0
)
returns setof public.extensions
language sql
stable
as $$
  select e.*
  from public.extensions e
  where e.status = 'published'
    and (
      p_query is null or btrim(p_query) = ''
      or e.search_vector @@ websearch_to_tsquery('simple', p_query)
    )
    and (p_category is null or btrim(p_category) = '' or p_category = any (e.categories))
  order by
    case when p_query is null or btrim(p_query) = '' then 0
         else ts_rank(e.search_vector, websearch_to_tsquery('simple', p_query)) end desc,
    e.rating_avg desc,
    e.downloads desc
  limit greatest(1, least(p_limit, 100)) offset greatest(0, p_offset);
$$;

-- Categorías existentes (no hay lista hardcodeada: salen de los datos).
create or replace function public.extension_categories()
returns setof text
language sql
stable
as $$
  select distinct unnest(e.categories)
  from public.extensions e
  where e.status = 'published'
  order by 1;
$$;

-- Bump de descargas (lo llama la app al instar).
create or replace function public.increment_extension_download(p_slug text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.extensions set downloads = downloads + 1 where slug = p_slug;
$$;

grant execute on function public.search_extensions(text, text, integer, integer) to anon, authenticated;
grant execute on function public.extension_categories() to anon, authenticated;
grant execute on function public.increment_extension_download(text) to anon, authenticated;
