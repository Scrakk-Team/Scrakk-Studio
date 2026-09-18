-- 0013: Realtime de amistades.
-- Proyecto: scrakk-cli (Supabase, ref ufcwwigmzgmyyfauymim)
--
-- Dos causas de que "no llegara en vivo":
--  1. `friendships` NO estaba en la publicación supabase_realtime → aceptar
--     una solicitud no propagaba al otro lado (ni card de amigo, ni chat).
--  2. La replica identity era DEFAULT: Realtime no puede filtrar UPDATE/DELETE
--     por columnas que no sean la PK. FULL lo habilita (friend_requests UPDATE
--     con filtro requester_id/addressee_id y friendships INSERT con filtro
--     user_a/user_b).

do $$
begin
  begin
    alter publication supabase_realtime add table public.friendships;
  exception when duplicate_object then null;
  end;
end $$;

alter table public.friend_requests replica identity full;
alter table public.friendships replica identity full;
alter table public.messages replica identity full;
