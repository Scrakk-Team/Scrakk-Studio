-- 0016: imágenes en DMs + avatares (Supabase Storage).
-- Proyecto: scrakk-cli (Supabase)
--
-- - Buckets públicos `avatars` y `chat-images`.
-- - Tabla `message_attachments`: una fila por imagen de un DM.
--   El `body` del mensaje sigue siendo el texto/caption (límite 4000).
-- - Realtime: la tabla se agrega a la publicación.
--
-- Aplicar este SQL (los buckets también se pueden crear desde
-- Dashboard > Storage con los mismos nombres y "Public: on").

-- Buckets (idempotente)
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true), ('chat-images', 'chat-images', true)
on conflict (id) do update set public = true;

-- Tabla de adjuntos
create table if not exists public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  path text not null,
  url text not null,
  mime text not null,
  size_bytes int not null check (size_bytes > 0 and size_bytes <= 10485760),
  width int,
  height int,
  created_at timestamptz not null default now()
);
create index if not exists idx_attachments_message on public.message_attachments(message_id);

alter table public.message_attachments enable row level security;

-- Ver adjuntos: solo si participo del DM (emisor o receptor del mensaje padre).
drop policy if exists "attachments participant select" on public.message_attachments;
create policy "attachments participant select" on public.message_attachments
  for select to authenticated
  using (
    exists (
      select 1 from public.messages m
      where m.id = message_id
        and (m.sender_id = auth.uid() or m.recipient_id = auth.uid())
    )
  );

-- Subir adjuntos: solo el emisor del mensaje padre, y solo si son amigos
-- (misma regla que "messages send to friend").
drop policy if exists "attachments sender insert" on public.message_attachments;
create policy "attachments sender insert" on public.message_attachments
  for insert to authenticated
  with check (
    exists (
      select 1 from public.messages m
      where m.id = message_id
        and m.sender_id = auth.uid()
        and exists (
          select 1 from public.friendships f
          where f.user_a = least(m.sender_id, m.recipient_id)
            and f.user_b = greatest(m.sender_id, m.recipient_id)
        )
    )
  );

-- Borrar adjuntos: el emisor (el borrado del mensaje cae en cascada igual).
drop policy if exists "attachments sender delete" on public.message_attachments;
create policy "attachments sender delete" on public.message_attachments
  for delete to authenticated
  using (
    exists (
      select 1 from public.messages m
      where m.id = message_id and m.sender_id = auth.uid()
    )
  );

revoke all on public.message_attachments from anon, authenticated;
grant select on public.message_attachments to authenticated;
grant insert (message_id, path, url, mime, size_bytes, width, height)
  on public.message_attachments to authenticated;
grant delete on public.message_attachments to authenticated;

-- Storage RLS: cualquiera autenticado sube a su propia carpeta
-- (`<uid>/...`); lectura pública (buckets públicos).
drop policy if exists "avatars auth insert own" on storage.objects;
create policy "avatars auth insert own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "chat-images auth insert own" on storage.objects;
create policy "chat-images auth insert own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'chat-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars public read" on storage.objects;
create policy "avatars public read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'avatars');

drop policy if exists "chat-images public read" on storage.objects;
create policy "chat-images public read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'chat-images');

drop policy if exists "avatars auth delete own" on storage.objects;
create policy "avatars auth delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "chat-images auth delete own" on storage.objects;
create policy "chat-images auth delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'chat-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- Realtime para adjuntos
do $$
begin
  begin
    alter publication supabase_realtime add table public.message_attachments;
  exception when duplicate_object then null;
  end;
end $$;
