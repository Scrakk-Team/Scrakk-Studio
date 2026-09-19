-- 0005: auto-confirmación de email en el alta (sin SMTP / sin Resend).
-- Proyecto: scrakk-cli (Supabase)
--
-- El proyecto tiene `mailer_autoconfirm = false` y no hay SMTP, así que el
-- signup fallaba con "Error sending confirmation email". Marcar
-- `email_confirmed_at` en un trigger BEFORE INSERT evita el envío y devuelve
-- sesión de inmediato.

create or replace function public.auto_confirm_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email_confirmed_at is null then
    new.email_confirmed_at := now();
  end if;
  return new;
end;
$$;

do $$
begin
  begin
    drop trigger if exists before_auth_user_created on auth.users;
    create trigger before_auth_user_created
      before insert on auth.users
      for each row execute function public.auto_confirm_new_user();
  exception when insufficient_privilege then
    raise notice 'auto-confirm trigger skipped';
  end;
end $$;
