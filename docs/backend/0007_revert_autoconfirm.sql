-- 0007: revierte la auto-confirmación de 0005 (el login vuelve a ser OTP).
-- Proyecto: scrakk-cli (Supabase)
--
-- 0005_autoconfirm.sql queda como histórico; su efecto se revirtió acá.

drop trigger if exists before_auth_user_created on auth.users;
drop function if exists public.auto_confirm_new_user();
