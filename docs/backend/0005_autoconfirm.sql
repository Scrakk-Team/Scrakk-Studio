-- 0005: auto-confirmación de email en el alta (sin SMTP / sin Resend).
-- Proyecto: scrakk-cli (Supabase)
--
-- Motivo: el proyecto tiene `mailer_autoconfirm = false` y NO hay SMTP, así que
-- el signup fallaba con "Error sending confirmation email". GoTrue decide con
-- el valor que devuelve el INSERT (RETURNING), por lo que marcar
-- `email_confirmed_at` en un trigger BEFORE INSERT hace que:
--   1) no intente enviar el correo, y
--   2) devuelva sesión inmediatamente (login email+password client-side).
--
-- ⚠️ Trade-off: cualquier alta queda con el email confirmado SIN verificación.
-- Es el precio de "sin mails". Alternativas si se quiere verificar:
--   a) desactivar "Confirm email" en Supabase y usar OTP con Resend, o
--   b) crear el usuario server-side con admin.createUser({ email_confirm: true }).
--
-- No afecta al CLI: sus usuarios se crean con admin.createUser({ email_confirm: true }),
-- que ya deja email_confirmed_at seteado (el trigger solo lo setea si es null).

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
