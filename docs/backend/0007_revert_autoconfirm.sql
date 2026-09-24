-- Copyright 2026 Scrakk Studio
-- SPDX-License-Identifier: Apache-2.0
-- Licencia completa en LICENSE (Apache License 2.0).

-- 0007: revierte la auto-confirmación de 0005 (el login vuelve a ser OTP).
-- Proyecto: scrakk-cli (Supabase)
--
-- 0005_autoconfirm.sql queda como histórico; su efecto se revirtió aquí.

drop trigger if exists before_auth_user_created on auth.users;
drop function if exists public.auto_confirm_new_user();
