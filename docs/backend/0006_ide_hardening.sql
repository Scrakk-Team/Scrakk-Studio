-- 0006: search_path fijo y EXECUTE revocado en las funciones de trigger.
-- Proyecto: scrakk-cli (Supabase)
--
-- ensure_profile / auto_confirm_new_user / touch_updated_at quedan invocables
-- solo como triggers (los triggers disparan sin ese privilegio).

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
