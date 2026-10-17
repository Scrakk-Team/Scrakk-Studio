-- Copyright 2026 Scrakk Studio
-- SPDX-License-Identifier: Apache-2.0
-- Licencia completa en LICENSE (Apache License 2.0).

-- 0032: search_path fijo y EXECUTE mínimo en funciones.
-- Proyecto: scrakk-cli (Supabase)
--
-- Los advisors de Supabase marcaban cuatro funciones con `search_path`
-- mutable (un esquema controlado por el atacante podría resolver `profiles`,
-- `messages`… a nombres ajenos) y cuatro funciones de trigger SECURITY DEFINER
-- ejecutables por `anon` vía /rest/v1/rpc. Un trigger no necesita EXECUTE del
-- cliente: se revoca sin cambiar su comportamiento.

alter function public.extensions_touch() set search_path = public;
alter function public.extension_categories() set search_path = public;
alter function public.is_codefile_body(text) set search_path = public;
alter function public.search_extensions(text, text, integer, integer) set search_path = public;

revoke execute on function public.enforce_message_rate_limit() from public, anon, authenticated;
revoke execute on function public.messages_guard() from public, anon, authenticated;
revoke execute on function public.profiles_lock_email() from public, anon, authenticated;
revoke execute on function public.refresh_extension_rating() from public, anon, authenticated;
