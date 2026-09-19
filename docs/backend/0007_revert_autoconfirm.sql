-- 0007: revertir la auto-confirmación (0005) — el login vuelve a ser OTP.
-- Proyecto: scrakk-cli (Supabase)
--
-- Decisión: el IDE reutiliza el MISMO login que el CLI (email → código OTP vía
-- la API de Scrakk con Resend). Ese flujo ya confirma el email con
-- `admin.createUser({ email_confirm: true })`, así que el trigger de
-- auto-confirmación era innecesario y debilitaba la verificación. Se elimina.
--
-- 0005_autoconfirm.sql queda como histórico; su efecto se revirtió acá.

drop trigger if exists before_auth_user_created on auth.users;
drop function if exists public.auto_confirm_new_user();
