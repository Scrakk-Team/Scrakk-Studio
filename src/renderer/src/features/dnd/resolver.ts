import { tabsStore } from '@features/tabs'
import { dndStore } from './store'
import type { DropTarget, DragPayload } from './types'

/**
 * Resolver por defecto: un drag de tab aterriza en un strip.
 *
 * - Misma strip → reorder a la posición final del indicador.
 * - Otra strip   → moveTabToStrip (la tab se mueve, nunca se duplica).
 *
 * El layout puede instalar otro resolver vía dndStore.setResolver() para
 * soportar payloads nuevos (p. ej. spawnear una tab desde un launcher).
 */
export function defaultDropResolver(payload: DragPayload, target: DropTarget): void {
  if (payload.type !== 'tab') return
  const found = tabsStore.findTab(payload.tabId)
  if (!found) return

  // El strip de ORIGEN real es el que reporta findTab: los headers genéricos
  // ([data-drag-header]) pueden traer un stripId stale si la tab se movió en
  // un drag previo — nunca confiar en el payload para la fuente.
  const sourceStrip = found.stripId
  if (target.stripId === sourceStrip) {
    // Reorder dentro del mismo strip (evitar no-op).
    if (found.index === target.index) return
    tabsStore.reorderTab(sourceStrip, found.index, target.index)
    return
  }
  tabsStore.moveTabToStrip(sourceStrip, payload.tabId, target.stripId, target.index)
}

/** Instala el resolver por defecto (una sola vez, en el arranque del layout). */
let installed = false
export function installDefaultDropResolver(): void {
  if (installed) return
  installed = true
  dndStore.setResolver(defaultDropResolver)
}
