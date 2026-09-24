// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Badges de los botones de la ActivityBar — store global.
 *
 * Los botones son data estática; el número (no leídos, pendientes) es dinámico
 * y vive en features que no conocen la barra. Acá se publica por botón + fuente
 * y la barra los SUMA: varios paneles sociales (multi-cuenta) aportan al mismo
 * botón sin pisarse.
 */

const byButton = new Map<string, Map<string, number>>()
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of [...listeners]) {
    try {
      listener()
    } catch {
      // Un suscriptor roto no tumba al resto.
    }
  }
}

/** Publica el número de una fuente para un botón (0 lo limpia). */
export function setActivityBadge(buttonId: string, sourceId: string, count: number): void {
  if (!buttonId || !sourceId) return
  let bucket = byButton.get(buttonId)
  if (!bucket) {
    bucket = new Map()
    byButton.set(buttonId, bucket)
  }
  const next = Math.max(0, Math.floor(count))
  if (next === 0) bucket.delete(sourceId)
  else bucket.set(sourceId, next)
  if (bucket.size === 0) byButton.delete(buttonId)
  emit()
}

/** Baja la aportación de una fuente (panel desmontado). */
export function clearActivityBadge(buttonId: string, sourceId: string): void {
  const bucket = byButton.get(buttonId)
  if (!bucket?.delete(sourceId)) return
  if (bucket.size === 0) byButton.delete(buttonId)
  emit()
}

/** Total a mostrar en el botón (suma de todas las fuentes). */
export function getActivityBadge(buttonId: string): number {
  const bucket = byButton.get(buttonId)
  if (!bucket) return 0
  let total = 0
  for (const count of bucket.values()) total += count
  return total
}

export function subscribeToActivityBadges(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Solo tests. */
export function _resetActivityBadgesForTests(): void {
  byButton.clear()
  listeners.clear()
}
