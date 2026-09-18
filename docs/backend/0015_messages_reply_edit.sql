-- 0015: reply + edit/delete support for DMs
-- Proyecto: scrakk-cli (Supabase, ref ufcwwigmzgmyyfauymim)
--
-- - reply_to: citar un mensaje del mismo DM (FK on delete set null)
-- - edited_at: marca de edición
-- - RLS: el emisor puede editar/borrar sus propios mensajes; el receptor solo puede marcar leído
-- - Grants por columna para no exponer plan/device_id

alter table public.messages add column if not exists reply_to uuid references public.messages(id) on delete set null;
alter table public.messages add column if not exists edited_at timestamptz;
create index if not exists idx_messages_reply_to on public.messages(reply_to);

drop policy if exists "messages edit own" on public.messages;
create policy "messages edit own" on public.messages
  for update to authenticated
  using (auth.uid() = sender_id)
  with check (auth.uid() = sender_id);

drop policy if exists "messages delete own" on public.messages;
create policy "messages delete own" on public.messages
  for delete to authenticated
  using (auth.uid() = sender_id);

revoke all on public.messages from anon, authenticated;
grant select on public.messages to authenticated;
grant insert (sender_id, recipient_id, body, reply_to) on public.messages to authenticated;
grant update (read_at, body, edited_at) on public.messages to authenticated;
grant delete on public.messages to authenticated;
