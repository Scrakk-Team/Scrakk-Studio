-- 0011: RPCs del social real.
-- Proyecto: scrakk-cli (Supabase, ref ufcwwigmzgmyyfauymim)
--
-- security definer + search_path fijo + validación; EXECUTE solo para
-- authenticated (nunca anon/public). Así la amistad y la búsqueda no pueden
-- saltearse desde el cliente.

create or replace function public.search_users(q text)
returns table (id uuid, handle text, display_name text, avatar_url text)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.handle, p.display_name, p.avatar_url
  from public.profiles p
  where auth.uid() is not null
    and p.id <> auth.uid()
    and p.handle is not null
    and char_length(btrim(q)) >= 2
    and (p.handle ilike '%' || btrim(q) || '%' or coalesce(p.display_name,'') ilike '%' || btrim(q) || '%')
  order by p.handle
  limit 10
$$;

create or replace function public.list_friends()
returns table (id uuid, handle text, display_name text, avatar_url text, since timestamptz)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.handle, p.display_name, p.avatar_url, f.created_at
  from public.friendships f
  join public.profiles p
    on p.id = case when f.user_a = auth.uid() then f.user_b else f.user_a end
  where auth.uid() is not null and (f.user_a = auth.uid() or f.user_b = auth.uid())
  order by p.handle nulls last
$$;

create or replace function public.list_requests()
returns table (id uuid, direction text, other_id uuid, handle text, display_name text, avatar_url text, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select r.id,
         case when r.requester_id = auth.uid() then 'outgoing' else 'incoming' end,
         case when r.requester_id = auth.uid() then r.addressee_id else r.requester_id end,
         p.handle, p.display_name, p.avatar_url, r.created_at
  from public.friend_requests r
  join public.profiles p
    on p.id = case when r.requester_id = auth.uid() then r.addressee_id else r.requester_id end
  where auth.uid() is not null and r.status = 'pending'
    and (r.requester_id = auth.uid() or r.addressee_id = auth.uid())
  order by r.created_at desc
$$;

create or replace function public.send_friend_request(target uuid)
returns text language plpgsql security definer set search_path = ''
as $$
declare me uuid := auth.uid(); rev public.friend_requests%rowtype;
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
  insert into public.friend_requests(requester_id, addressee_id) values (me, target)
    on conflict do nothing;
  return 'pending';
end; $$;

create or replace function public.respond_friend_request(req uuid, accept boolean)
returns text language plpgsql security definer set search_path = ''
as $$
declare me uuid := auth.uid(); r public.friend_requests%rowtype;
begin
  if me is null then raise exception 'no_auth' using errcode = '42501'; end if;
  select * into r from public.friend_requests
    where id = req and status = 'pending' and addressee_id = me;
  if not found then raise exception 'request_not_found' using errcode = '22023'; end if;
  if accept then
    update public.friend_requests set status = 'accepted', responded_at = now() where id = req;
    insert into public.friendships(user_a,user_b)
      values (least(r.requester_id, me), greatest(r.requester_id, me)) on conflict do nothing;
    return 'accepted';
  end if;
  update public.friend_requests set status = 'rejected', responded_at = now() where id = req;
  return 'rejected';
end; $$;

create or replace function public.remove_friend(other uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'no_auth' using errcode = '42501'; end if;
  delete from public.friendships
    where user_a = least(me,other) and user_b = greatest(me,other);
  return found;
end; $$;

revoke execute on function public.search_users(text) from anon, public;
revoke execute on function public.list_friends() from anon, public;
revoke execute on function public.list_requests() from anon, public;
revoke execute on function public.send_friend_request(uuid) from anon, public;
revoke execute on function public.respond_friend_request(uuid, boolean) from anon, public;
revoke execute on function public.remove_friend(uuid) from anon, public;
grant execute on function public.search_users(text) to authenticated;
grant execute on function public.list_friends() to authenticated;
grant execute on function public.list_requests() to authenticated;
grant execute on function public.send_friend_request(uuid) to authenticated;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;
