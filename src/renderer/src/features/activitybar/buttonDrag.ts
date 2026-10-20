// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Drag & drop de botones entre la ActivityBar y el ToolDock.
 *
 * Un solo controlador para las dos barras: el botón se mueve EN VIVO con el
 * cursor (estilo VS Code). Al soltar manda siempre la posición del
 * `pointerup`: si cae sobre una barra o sobre el dock, se aplica ahí; si cae
 * fuera, se RESTAURA el layout del inicio del drag — así ningún botón queda
 * en un lado que el usuario no está viendo ("perdido").
 *
 * También cubre los finales de drag que no llegan como `pointerup` (soltar
 * fuera de la ventana, perder el foco): un `pointermove` con el botón ya
 * suelto, `pointercancel` o `blur` cierra el drag y limpia el fantasma.
 */

import type { PointerEvent as ReactPointerEvent } from 'react'
import {
  buttonPosition,
  moveButton,
  restoreButtonLayout,
  snapshotButtonLayout,
  type ButtonSide
} from './layout'

/** Píxeles a recorrer antes de considerarlo drag (un click simple no dragea). */
const DRAG_THRESHOLD = 6

/** Click que dispara el `pointerup` del drag: se suprime UNA vez. */
let pendingClick: { id: string; at: number } | null = null

/**
 * ¿Este click es el que cierra el último drag del mismo botón? El `pointerup`
 * precede al `click` por milisegundos, así que la ventana es corta: un click
 * normal posterior nunca se come.
 */
export function consumeDragClick(id: string): boolean {
  const pending = pendingClick
  pendingClick = null
  if (!pending || pending.id !== id) return false
  return performance.now() - pending.at < 500
}

export interface ButtonDragHandlers {
  /** Se superó el umbral: el botón entra en modo drag (mostrar fantasma). */
  onStart: (id: string) => void
  /** Nueva posición del cursor (mover el fantasma). */
  onMove: (x: number, y: number) => void
  /** Drag terminado (ocultar el fantasma y restaurar el cursor). */
  onEnd: () => void
}

interface DropTarget {
  side: ButtonSide
  index: number
}

/** Índice de inserción vertical en una ActivityBar (por mitades). */
function barIndexAt(bar: HTMLElement, y: number, skipId: string): number {
  let index = 0
  for (const el of bar.querySelectorAll<HTMLElement>('[data-button-id]')) {
    const id = el.dataset.buttonId
    if (!id || id === skipId) continue
    const rect = el.getBoundingClientRect()
    if (rect.height <= 0) continue
    if (y > rect.top + rect.height / 2) index++
    else break
  }
  return index
}

/** Índice de inserción horizontal en el ToolDock (por mitades). */
function dockIndexAt(dock: HTMLElement, x: number, skipId: string): number {
  let index = 0
  for (const el of dock.querySelectorAll<HTMLElement>('[data-button-id]')) {
    const id = el.dataset.buttonId
    if (!id || id === skipId) continue
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0) continue
    if (x > rect.left + rect.width / 2) index++
    else break
  }
  return index
}

/** Destino del drop bajo el cursor (null = fuera de las barras). */
function targetAt(x: number, y: number, skipId: string): DropTarget | null {
  const under = document.elementFromPoint(x, y)
  if (!under) return null
  const dock = under.closest('[data-tool-dock]') as HTMLElement | null
  if (dock) return { side: 'toolDock', index: dockIndexAt(dock, x, skipId) }
  const bar = under.closest('nav[data-side]') as HTMLElement | null
  if (bar) {
    const side: ButtonSide = bar.dataset.side === 'right' ? 'right' : 'left'
    return { side, index: barIndexAt(bar, y, skipId) }
  }
  return null
}

/**
 * Arranca el drag de un botón desde su `pointerdown`. Los listeners viven en
 * `window` hasta que el usuario suelta (no bloquea el render).
 */
export function startButtonDrag(
  event: ReactPointerEvent<Element>,
  id: string,
  handlers: ButtonDragHandlers
): void {
  if (event.button !== 0) return

  const startX = event.clientX
  const startY = event.clientY
  const snapshot = snapshotButtonLayout()
  // Lado en el que vivía el botón al empezar: sirve para distinguir "reordené
  // dentro de la barra" de "lo llevé a otro lado". La barra mide 48px, así que
  // el puntero se sale con facilidad; soltar fuera NO debe deshacer un reorden
  // interno (era la causa de que el botón volviera a su sitio "a veces").
  const startSide = buttonPosition(id)?.side ?? null
  let dragging = false
  let changed = false

  const finish = (restore: boolean): void => {
    if (dragging) pendingClick = { id, at: performance.now() }
    dragging = false
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onCancel)
    window.removeEventListener('keydown', onKey, true)
    window.removeEventListener('blur', onBlur)
    document.body.style.cursor = ''
    if (restore && changed) restoreButtonLayout(snapshot)
    handlers.onEnd()
  }

  const applyTarget = (x: number, y: number): void => {
    const target = targetAt(x, y, id)
    if (!target) return
    moveButton(id, target.side, target.index)
    changed = true
  }

  function onMove(moveEvent: PointerEvent): void {
    if (!dragging) {
      const dx = Math.abs(moveEvent.clientX - startX)
      const dy = Math.abs(moveEvent.clientY - startY)
      if (dx + dy < DRAG_THRESHOLD) return
      dragging = true
      document.body.style.cursor = 'grabbing'
      handlers.onStart(id)
    }
    // Soltado fuera de la ventana (no llegó el `pointerup`): se cierra con la
    // última posición válida que el usuario YA vio. Evita el drag fantasma
    // que seguía moviendo botones sin el botón del mouse apretado.
    if ((moveEvent.buttons & 1) === 0) {
      finish(false)
      return
    }
    handlers.onMove(moveEvent.clientX, moveEvent.clientY)
    applyTarget(moveEvent.clientX, moveEvent.clientY)
  }

  function onUp(upEvent: PointerEvent): void {
    if (!dragging) {
      finish(false)
      return
    }
    // Manda el punto de suelta (el último `pointermove` puede haber quedado
    // antes del destino en un gesto rápido).
    const target = targetAt(upEvent.clientX, upEvent.clientY, id)
    if (target) {
      moveButton(id, target.side, target.index)
      changed = true
      finish(false)
      return
    }
    // Fuera de las barras: si el botón sigue en el lado donde nació, el
    // reorden interno se queda como se vio; si ya había saltado a otra barra o
    // al dock, se cancela el cambio de lado.
    const currentSide = buttonPosition(id)?.side ?? null
    finish(startSide !== null && currentSide !== startSide)
  }

  function onCancel(): void {
    finish(false)
  }

  function onBlur(): void {
    finish(false)
  }

  function onKey(keyEvent: KeyboardEvent): void {
    if (keyEvent.key !== 'Escape' || !dragging) return
    keyEvent.preventDefault()
    finish(true)
  }

  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onCancel)
  window.addEventListener('keydown', onKey, true)
  window.addEventListener('blur', onBlur)
}
