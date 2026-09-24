-- Copyright 2026 Scrakk Studio
-- SPDX-License-Identifier: Apache-2.0
-- Licencia completa en LICENSE (Apache License 2.0).

-- 0018: rate limit de mensajes (backstop del slowmode del cliente).
-- Proyecto: scrakk-cli (Supabase)
--
-- El cliente ya bloquea con una ventana deslizante (5 mensajes / 5 s, como
-- Discord). Esto es el BACKSTOP: un trigger que corta ráfagas abusivas aunque
-- el cliente esté modificado. Es más holgado a propósito (7 en 5 s) para no
-- dar falsos positivos contra la ventana del cliente.

create or replace function public.enforce_message_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  recientes int;
begin
  select count(*) into recientes
  from public.messages
  where sender_id = new.sender_id
    and created_at > now() - interval '5 seconds';
  if recientes >= 7 then
    raise exception 'msg_ratelimited' using errcode = '22023';
  end if;
  return new;
end
$fn$;

drop trigger if exists messages_rate_limit on public.messages;
create trigger messages_rate_limit
  before insert on public.messages
  for each row
  execute function public.enforce_message_rate_limit();
