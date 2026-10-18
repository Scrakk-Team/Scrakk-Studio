// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * i18n del renderer: puente entre el motor compartido (`@shared/i18n`) y la
 * app React.
 *
 * - `useT()` devuelve `t` y re-renderiza al cambiar el idioma.
 * - `initI18n()` aplica la preferencia persistida al arrancar.
 * - `setLocalePreference()` persiste y aplica (selector de Ajustes).
 *
 * El estado del idioma vive en el módulo compartido (sin React): así los
 * servicios no-React también pueden traducir con `t`.
 */

import { useSyncExternalStore } from 'react'
import {
  catalogs,
  getLocale,
  resolveLocale,
  setLocale,
  subscribeToLocale,
  t,
  type Locale,
  type LocalePreference,
  type MessageKey,
  type Vars
} from '@shared/i18n'
import { getPersistedLocalePreference, persistLocalePreference } from '@services/storage'
import { api } from '@services/api'

export type TFunction = (key: MessageKey, vars?: Vars) => string

const knownKeys = new Set(Object.keys(catalogs.es))

/**
 * Resuelve un texto que puede ser una CLAVE i18n o un literal.
 *
 * Pensado para datos que se registran una sola vez (p. ej. los comandos del
 * palette): guardan la clave y el consumidor la resuelve en render, así el
 * texto sigue al idioma activo sin re-registrar nada. Un literal que no sea
 * clave se devuelve tal cual (compatible con lo no migrado).
 */
export function msg(keyOrText: string): string {
  return knownKeys.has(keyOrText) ? t(keyOrText as MessageKey) : keyOrText
}

/** Aplica `document.lang` (accesibilidad y correctores del navegador). */
function applyPreference(preference: LocalePreference): void {
  setLocale(resolveLocale(preference))
  if (typeof document !== 'undefined') document.documentElement.lang = getLocale()
  // El proceso main también traduce (errores, diálogos): se lo avisamos.
  api?.i18n?.setLocale(getLocale())
}

/** Hook de traducción: `const t = useT()` → `t('clave')`. */
export function useT(): TFunction {
  useSyncExternalStore(subscribeToLocale, getLocale, getLocale)
  return t
}

/** Idioma activo como hook (para casos que necesitan el código, no el texto). */
export function useLocale(): Locale {
  return useSyncExternalStore(subscribeToLocale, getLocale, getLocale)
}

/** Preferencia guardada ('system' | 'es' | 'en'). */
export function getLocalePreference(): LocalePreference {
  return getPersistedLocalePreference()
}

/** Cambia y persiste la preferencia de idioma. */
export function setLocalePreference(preference: LocalePreference): void {
  persistLocalePreference(preference)
  applyPreference(preference)
}

/** Aplica el idioma persistido. Se llama UNA vez al arrancar la app. */
export function initI18n(): void {
  applyPreference(getLocalePreference())
}

export { t, getLocale, subscribeToLocale }
export type { Locale, LocalePreference, MessageKey, Vars }
