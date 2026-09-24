// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Registry de proveedores — en memoria, alimentado por el catálogo (models.dev).
 *
 * Antes era un `import.meta.glob` de carpetas hardcodeadas; ahora la lista
 * llega async desde el main. Este módulo es el punto único de lectura y
 * suscripción: cualquier consumidor lee `getProviders()` y escucha
 * `subscribeProviderCatalog()` para re-renderizar cuando el catálogo carga o
 * se refresca.
 */

import type { ProviderConfig } from './types'

let list: ProviderConfig[] = []
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of [...listeners]) {
    try {
      listener()
    } catch {
      // Un suscriptor roto no debe tumbar a los demás.
    }
  }
}

/** Proveedores actuales (vacío hasta que el catálogo carga). */
export function getProviders(): ProviderConfig[] {
  return list
}

export function getProvider(id: string): ProviderConfig | null {
  return list.find((provider) => provider.id === id) ?? null
}

/** Reemplaza la lista (lo llama el loader del catálogo). */
export function setProviderCatalog(next: ProviderConfig[]): void {
  list = next
  emit()
}

export function subscribeProviderCatalog(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
