// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Activity Bar — barra vertical de botones para activar/desactivar paneles.
 * Estados replicados del ActivityBar de Scrakk Code Editor:
 *  - Inactivo: ícono en tono muted, sin fondo.
 *  - Hover: color de texto + fondo sutil.
 *  - Activo: color acento + tinte del acento de fondo + indicador lateral
 *    de 3px que escala verticalmente.
 *
 * Mergea los botones registrados (registry estático) con los que aportan
 * las extensiones en runtime (ExtensionRegistry) — se re-renderiza al
 * instalarse o quitarse extensiones.
 */

import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { preloadPanel, useLayout } from '@features/layout'
import { ExtensionRegistry } from '@services/extensions'
import {
  getExtensionContextKey,
  subscribeToExtensionContextKeys
} from '@services/extensions/hostBridge'
import { evaluateWhen } from '@services/extensions/when'
import type { ActivityBarButton, ActivityBarSide } from './types'
import {
  getOrderedButtons,
  moveButton,
  restoreButtonLayout,
  snapshotButtonLayout,
  subscribeToButtonLayout,
  allActivityButtons
} from './layout'
import { getActivityBadge, subscribeToActivityBadges } from './badges'
import styles from './ActivityBar.module.css'

/** Umbral en px antes de promover a drag (un click simple no dragea). */
const DRAG_THRESHOLD = 6

export function ActivityBar({ side }: { side: ActivityBarSide }): JSX.Element {
  const { slots, toggleSlotPanel } = useLayout()
  const [version, setVersion] = useState(0)
  // Fantasma que sigue al cursor durante el drag (null = sin drag).
  const [ghost, setGhost] = useState<{ id: string; x: number; y: number } | null>(null)
  const buttonEls = useRef(new Map<string, HTMLButtonElement>())
  const dragRef = useRef<{
    id: string
    startX: number
    startY: number
    dragging: boolean
    snapshot: string
  } | null>(null)
  // Click tras drag: se suprime una vez (el pointerup precede al click).
  const suppressClickRef = useRef(false)

  // Re-render cuando se instalan/remueven extensiones (botones de runtime).
  useEffect(() => {
    return ExtensionRegistry.subscribe(() => setVersion((v) => v + 1))
  }, [])
  useEffect(() => subscribeToButtonLayout(() => setVersion((v) => v + 1)), [])
  // Y cuando una feature publica un badge (no leídos, pendientes) para un botón.
  useEffect(() => subscribeToActivityBadges(() => setVersion((v) => v + 1)), [])
  // Y cuando una extensión cambia una clave de contexto: los botones con
  // `when` (vistas que se esconden según el estado) aparecen o se van.
  useEffect(() => subscribeToExtensionContextKeys(() => setVersion((v) => v + 1)), [])

  const buttons = useMemo<ActivityBarButton[]>(
    () =>
      getOrderedButtons(side).filter((button) =>
        evaluateWhen(button.when, getExtensionContextKey)
      ),
    [side, version]
  )

  function cleanupDragListeners(): void {
    window.removeEventListener('pointermove', onDragMove)
    window.removeEventListener('pointerup', onDragUp)
    window.removeEventListener('pointercancel', onDragUp)
    window.removeEventListener('keydown', onDragKey, true)
    document.body.style.cursor = ''
  }

  function endDrag(restore: boolean): void {
    const drag = dragRef.current
    dragRef.current = null
    cleanupDragListeners()
    if (restore && drag) restoreButtonLayout(drag.snapshot)
    setGhost(null)
  }

  /** Índice de inserción bajo el cursor en una barra (por mitades). */
  function indexAt(bar: HTMLElement, y: number, skipId: string): number {
    let index = 0
    for (const [, el] of buttonEls.current) {
      if (!bar.contains(el)) continue
      const id = el.dataset.buttonId
      if (!id || id === skipId) continue
      const rect = el.getBoundingClientRect()
      if (rect.height <= 0) continue
      if (y > rect.top + rect.height / 2) index++
      else break
    }
    return index
  }

  /** Índice de inserción en un ToolDock horizontal (por mitades de X). */
  function toolDockIndexAt(dock: HTMLElement, x: number, skipId: string): number {
    const btns = Array.from(dock.querySelectorAll<HTMLElement>('[data-button-id]'))
    let index = 0
    for (const el of btns) {
      const id = el.dataset.buttonId
      if (!id || id === skipId) continue
      const rect = el.getBoundingClientRect()
      if (rect.width <= 0) continue
      if (x > rect.left + rect.width / 2) index++
      else break
    }
    return index
  }

  function onDragMove(event: PointerEvent): void {
    const drag = dragRef.current
    if (!drag) return
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (!drag.dragging) {
      if (Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return
      drag.dragging = true
      suppressClickRef.current = true
      document.body.style.cursor = 'grabbing'
    }
    setGhost({ id: drag.id, x: event.clientX, y: event.clientY })
    // Reorden EN VIVO: la lista se mueve con el cursor (estilo VS Code).
    const under = document.elementFromPoint(event.clientX, event.clientY)
    // Drop sobre un ToolDock: el botón se mueve a la ubicación 'toolDock'
    // (el índice lo calcula el dock por X; -1 = soltar al final).
    const dock = under?.closest?.('[data-tool-dock]') as HTMLElement | null
    if (dock) {
      moveButton(drag.id, 'toolDock', toolDockIndexAt(dock, event.clientX, drag.id))
      return
    }
    const bar = under?.closest?.('nav[data-side]') as HTMLElement | null
    if (!bar) return
    const toSide = bar.dataset.side === 'right' ? 'right' : 'left'
    moveButton(drag.id, toSide as ActivityBarSide, indexAt(bar, event.clientY, drag.id))
  }

  function onDragUp(): void {
    if (dragRef.current?.dragging) suppressClickRef.current = true
    endDrag(false)
  }

  function onDragKey(event: KeyboardEvent): void {
    if (event.key === 'Escape' && dragRef.current) {
      event.preventDefault()
      suppressClickRef.current = true
      endDrag(true)
    }
  }

  function onButtonPointerDown(event: React.PointerEvent, id: string): void {
    if (event.button !== 0) return
    dragRef.current = {
      id,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
      snapshot: snapshotButtonLayout()
    }
    window.addEventListener('pointermove', onDragMove)
    window.addEventListener('pointerup', onDragUp)
    window.addEventListener('pointercancel', onDragUp)
    window.addEventListener('keydown', onDragKey, true)
  }

  return (
    <nav
      className={styles.bar}
      data-side={side}
      aria-label={side === 'left' ? 'Barra lateral izquierda' : 'Barra lateral derecha'}
    >
      {buttons.map((button) => {
        // El panel sigue al botón: si se mudó de barra, abre en ese slot.
        const active = slots[side] === button.panelId
        const isGhost = ghost?.id === button.id
        const badge = getActivityBadge(button.id)
        return (
          <button
            key={button.id}
            ref={(el) => {
              if (el) buttonEls.current.set(button.id, el)
              else buttonEls.current.delete(button.id)
            }}
            type="button"
            data-button-id={button.id}
            className={[styles.button, active ? styles.active : null, isGhost ? styles.dragging : null]
              .filter(Boolean)
              .join(' ')}
            title={button.label}
            aria-label={button.label}
            aria-pressed={active}
            // Precalienta el módulo del panel en cuanto hay intención (hover o
            // apretar): el click abre sin descargar nada ni ver el fallback.
            onPointerEnter={() => preloadPanel(button.panelId)}
            onFocus={() => preloadPanel(button.panelId)}
            onPointerDown={(event) => {
              preloadPanel(button.panelId)
              onButtonPointerDown(event, button.id)
            }}
            onClick={() => {
              if (suppressClickRef.current) {
                suppressClickRef.current = false
                return
              }
              toggleSlotPanel(side, button.panelId)
            }}
          >
            {typeof button.icon === 'string' ? (
              <span className={styles.svg} dangerouslySetInnerHTML={{ __html: button.icon }} />
            ) : (
              <button.icon size={20} />
            )}
            {badge > 0 ? (
              <span className={styles.badge}>{badge > 99 ? '99+' : badge}</span>
            ) : null}
          </button>
        )
      })}
      {ghost ? <DragGhost id={ghost.id} x={ghost.x} y={ghost.y} /> : null}
    </nav>
  )
}

/** Fantasma que sigue al cursor (mismo icono, sin interactividad). */
function DragGhost({ id, x, y }: { id: string; x: number; y: number }): JSX.Element {
  const button = allActivityButtons().find((candidate) => candidate.id === id)
  return (
    <div
      className={styles.ghost}
      style={{ left: x, top: y }}
      aria-hidden="true"
    >
      {button ? (
        typeof button.icon === 'string' ? (
          <span className={styles.svg} dangerouslySetInnerHTML={{ __html: button.icon }} />
        ) : (
          <button.icon size={20} />
        )
      ) : null}
    </div>
  )
}
