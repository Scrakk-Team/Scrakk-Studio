-- Copyright 2026 Scrakk Studio
-- SPDX-License-Identifier: Apache-2.0
-- Licencia completa en LICENSE (Apache License 2.0).

-- 0013: Realtime de amistades.
-- Proyecto: scrakk-cli (Supabase)
--
-- Agrega `friendships` a la publicación supabase_realtime y pone replica
-- identity full para poder filtrar UPDATE/DELETE por columnas que no son PK.

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
