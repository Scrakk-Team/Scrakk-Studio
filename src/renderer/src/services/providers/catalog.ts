/**
 * Carga del catálogo de proveedores desde models.dev.
 *
 * `startProviderCatalog()` se llama UNA vez al abrir el editor: primero pinta
 * el cache en disco (instantáneo) y después dispara el fetch remoto (el
 * catálogo se refresca en cada apertura). El resto de la app escucha el
 * registry y no sabe de dónde vinieron los datos.
 */

import { setProviderCatalog } from './registry'

let started = false

/** Carga el catálogo cacheado (memoria → disco) sin tocar la red. */
export async function loadCachedProviderCatalog(): Promise<void> {
  try {
    const cached = await window.api.modelsDev.catalog()
    if (cached && cached.providers.length > 0) setProviderCatalog(cached.providers)
  } catch {
    // Sin bridge (tests/web): se sigue con la lista vacía.
  }
}

/** Fuerza el fetch remoto y actualiza la lista. */
export async function refreshProviderCatalog(): Promise<void> {
  try {
    const fresh = await window.api.modelsDev.refresh()
    if (fresh && fresh.providers.length > 0) setProviderCatalog(fresh.providers)
  } catch {
    // Sin red: queda el cache.
  }
}

/** Arranque del catálogo (idempotente): cache → fetch. */
export function startProviderCatalog(): void {
  if (started) return
  started = true
  void loadCachedProviderCatalog().then(() => refreshProviderCatalog())
}
