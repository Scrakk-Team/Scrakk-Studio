-- 0012: search_users tolera el "@" inicial.
-- Proyecto: scrakk-cli (Supabase)
--
-- Normaliza el "@" inicial y los espacios, y matchea handle/display_name
-- case-insensitive.

create or replace function public.search_users(q text)
returns table (id uuid, handle text, display_name text, avatar_url text)
language sql stable security definer set search_path = ''
as $$
  with norm as (select btrim(ltrim(btrim(coalesce(q, '')), '@')) as needle)
  select p.id, p.handle, p.display_name, p.avatar_url
  from public.profiles p, norm
  where auth.uid() is not null
    and p.id <> auth.uid()
    and p.handle is not null
    and char_length(norm.needle) >= 2
    and (
      p.handle ilike '%' || norm.needle || '%'
      or coalesce(p.display_name, '') ilike '%' || norm.needle || '%'
    )
  order by p.handle
  limit 10
$$;

revoke execute on function public.search_users(text) from anon, public;
grant execute on function public.search_users(text) to authenticated;
