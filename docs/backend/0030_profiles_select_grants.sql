-- Copyright 2026 Scrakk Studio
-- SPDX-License-Identifier: Apache-2.0
-- Licencia completa en LICENSE (Apache License 2.0).

-- 0030: el SELECT de perfiles pedía columnas SIN grant → 42501 silencioso.
-- Proyecto: scrakk-cli (Supabase)
--
-- `0004_ide_accounts.sql` dio el SELECT a `authenticated` a NIVEL COLUMNA y esa
-- lista quedó vieja: no incluye `gender`, `custom_status*` ni `verified`.
--
-- `fetchProfile` (main/account/service.ts) selecciona justamente esas columnas,
-- así que la query fallaba con 42501 y —como el error se ignora— `current()`
-- caía al SNAPSHOT local (`~/.config/scrakk-studio/account/session.bin`). De ahí
-- que tu perfil se viera bien (lo escribió el editor) pero el check de
-- verificado JAMÁS apareciera: el campo nunca llegaba del server.
--
-- El grant es aditivo: se agregan las columnas que faltan, no se quita ninguna.
-- Sigue SIN poder escribirse `verified` (el grant de UPDATE es sólo
-- handle/display_name/avatar_url/bio) y el trigger de columnas admin sigue
-- vigente.

grant select (
  id,
  email,
  handle,
  display_name,
  avatar_url,
  bio,
  plan,
  created_at,
  updated_at,
  gender,
  custom_status,
  custom_status_emoji,
  custom_status_expires_at,
  verified,
  verified_at
) on public.profiles to authenticated;
