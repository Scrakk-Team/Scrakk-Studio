// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { tabsStore } from '@features/tabs'
import { dndStore, defaultDropResolver } from '@features/dnd'
import type { DragPayload, DropTarget } from '@features/dnd'
import { splitTreeStore } from './splitTree'

/**
 * Resolver de drop del layout: el default de tabs (reordenar / mover entre
 * grupos) + los SPLITS reales del árbol (estilo VS Code).
 *
 * Un drop sobre un borde con `target.split` PARTE la hoja (grupo) apuntada:
 * `splitTreeStore.splitStrip` reemplaza esa hoja por un split con un GRUPO
 * NUEVO en el lado indicado, y la tab arrastrada se muda ahí. Cada grupo
 * tiene su propia barra de tabs; el ResizeHandle del árbol ajusta el ratio
 * entre los dos lados (y anida sin límite).
 *
 * El indicador de split (SplitOverlay) se ve durante el drag; la partición
 * se ejecuta SOLO al soltar.
 */
export function layoutDropResolver(payload: DragPayload, target: DropTarget): void {
  if (payload.type !== 'tab' || !target.split) {
    defaultDropResolver(payload, target)
    return
  }
  const found = tabsStore.findTab(payload.tabId)
  const targetStrip = tabsStore.getStrip(target.stripId)
  if (!found || !targetStrip) return

  // Partir un grupo de UNA sola tab contra sí mismo no aporta nada.
  if (found.stripId === target.stripId && targetStrip.tabs.length < 2) return

  // Un grupo vacío se LLENA (no se parte): no tiene sentido crear otro al lado.
  if (targetStrip.tabs.length === 0) {
    tabsStore.moveTabToStrip(found.stripId, payload.tabId, target.stripId, 0)
    return
  }

  // Grupo NUEVO real: se parte la hoja del árbol y la tab se muda a la hoja
  // nueva. Si la hoja no está en el árbol (layout no hidratado), no se toca.
  const newStripId = splitTreeStore.splitStrip(target.stripId, target.split)
  if (!newStripId) return
  tabsStore.moveTabToStrip(found.stripId, payload.tabId, newStripId, 0)
}

/** Instala el resolver del layout (una sola vez, en el arranque). */
let installed = false
export function installLayoutDropResolver(): void {
  if (installed) return
  installed = true
  dndStore.setResolver(layoutDropResolver)
}
