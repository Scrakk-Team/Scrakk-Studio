import { tabsStore } from '@features/tabs'
import { dndStore, defaultDropResolver } from '@features/dnd'
import type { DragPayload, DropTarget } from '@features/dnd'

/**
 * Resolver de drop del layout: el default de tabs (reordenar / mover entre
 * strips) + los SPLITS del CONTENIDO de un strip.
 *
 * Un drop sobre un borde con `target.split` NO parte en strips nuevas: la
 * tab se mueve por la API NORMAL de tabs a la MISMA strip (la barra de tabs
 * queda compartida arriba, p. ej. Chat ⇄ Terminal) y el contenido de esa
 * strip pasa a mostrarse DIVIDIDO (un panel por tab) con `splitDir`. Nunca
 * se duplica: la tab sale de su origen. El indicador de split (SplitOverlay)
 * se ve durante el drag; la partición se ejecuta SOLO al soltar.
 */
export function layoutDropResolver(payload: DragPayload, target: DropTarget): void {
  if (payload.type !== 'tab' || !target.split) {
    defaultDropResolver(payload, target)
    return
  }
  const found = tabsStore.findTab(payload.tabId)
  const targetStrip = tabsStore.getStrip(target.stripId)
  if (!found || !targetStrip) return

  // 'row' = paneles lado a lado (bordes izquierda/derecha);
  // 'column' = apilados (bordes arriba/abajo).
  const dir: 'row' | 'column' =
    target.split === 'left' || target.split === 'right' ? 'row' : 'column'
  // El lado NUEVO (la tab drageada) va primero si cae a izquierda/arriba;
  // si cae a derecha/abajo, se agrega al final (derecha del contenido).
  const atStart = target.split === 'left' || target.split === 'top'
  const toIndex = atStart ? 0 : targetStrip.tabs.length

  if (found.stripId === target.stripId) {
    // Ya vive en la strip: solo reordenar a su lado + activar el split.
    if (found.index !== toIndex) {
      tabsStore.reorderTab(target.stripId, found.index, toIndex)
    }
  } else {
    tabsStore.moveTabToStrip(found.stripId, payload.tabId, target.stripId, toIndex)
  }
  tabsStore.setSplit(target.stripId, dir)
}

/** Instala el resolver del layout (una sola vez, en el arranque). */
let installed = false
export function installLayoutDropResolver(): void {
  if (installed) return
  installed = true
  dndStore.setResolver(layoutDropResolver)
}