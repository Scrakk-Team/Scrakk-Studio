-- 0006: hardening post-advisors (IDE accounts).
-- Proyecto: scrakk-cli (Supabase, ref ufcwwigmzgmyyfauymim)
--
-- Cierra los avisos del linter de Supabase introducidos por 0004/0005:
--  * touch_updated_at: search_path mutable → fijo ('' sin deps de public).
--  * ensure_profile / auto_confirm_new_user / touch_updated_at: eran invocables
--    por anon/authenticated vía /rest/v1/rpc (SECURITY DEFINER). Se revoca
--    EXECUTE; los triggers siguen disparando sin ese privilegio.

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin new.updated_at = now(); return new; end;
$$;

revoke execute on function public.ensure_profile() from anon, authenticated, public;
revoke execute on function public.auto_confirm_new_user() from anon, authenticated, public;
revoke execute on function public.touch_updated_at() from anon, authenticated, public;

-- Pendiente (requiere dashboard, no es de este cambio):
--   auth_leaked_password_protection → Auth → Password strength → activar
--   "Check for leaked passwords".
