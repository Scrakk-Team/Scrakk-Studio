// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Ajustes de proveedores — acceso SIN React.
 *
 * El estado vive en `ProvidersContext` (React) y se persiste en localStorage.
 * Este módulo es la puerta para subsistemas que no son React (comandos,
 * extensiones, el chat): lee el estado persistido y, para escribir, actualiza
 * el storage y avisa por evento al provider, que re-sincroniza su estado.
 */

export const PROVIDERS_STORAGE_KEY = 'scrakk-studio:providers'

export interface StoredProviderSettings {
  activeProviderId: string | null
  apiKeys: Record<string, string>
  models: Record<string, string>
  thinkingModes: Record<string, string>
  /** Variante de razonamiento elegida por proveedor (`/variants`). */
  variants: Record<string, string>
}

const EMPTY: StoredProviderSettings = {
  activeProviderId: null,
  apiKeys: {},
  models: {},
  thinkingModes: {},
  variants: {}
}

/** Lee el estado persistido de proveedores (tolerante a JSON roto). */
export function readProviderSettings(): StoredProviderSettings {
  try {
    const raw = localStorage.getItem(PROVIDERS_STORAGE_KEY)
    if (!raw) return { ...EMPTY }
    const parsed = JSON.parse(raw) as Partial<StoredProviderSettings>
    return {
      activeProviderId: typeof parsed.activeProviderId === 'string' ? parsed.activeProviderId : null,
      apiKeys: parsed.apiKeys ?? {},
      models: parsed.models ?? {},
      thinkingModes: parsed.thinkingModes ?? {},
      variants: parsed.variants ?? {}
    }
  } catch {
    return { ...EMPTY }
  }
}

/** Proveedor activo y modelo elegido (o el default del catálogo). */
export function activeProviderSelection(): { providerId: string | null; model: string } {
  const state = readProviderSettings()
  const providerId = state.activeProviderId
  if (!providerId) return { providerId: null, model: '' }
  return { providerId, model: state.models[providerId] ?? '' }
}

/** Escribe la variante de un proveedor y avisa al provider React. */
export function setProviderVariant(providerId: string, variant: string | null): void {
  const state = readProviderSettings()
  const variants = { ...state.variants }
  if (variant) variants[providerId] = variant
  else delete variants[providerId]
  try {
    localStorage.setItem(PROVIDERS_STORAGE_KEY, JSON.stringify({ ...state, variants }))
  } catch {
    // Sin storage: el aviso igual actualiza el estado en memoria del provider.
  }
  window.dispatchEvent(
    new CustomEvent('providers:set-variant', { detail: { providerId, variant } })
  )
}
