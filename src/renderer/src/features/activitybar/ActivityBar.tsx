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

import { useEffect, useMemo, useState, type JSX } from 'react'
import { preloadPanel, useLayout } from '@features/layout'
import { ExtensionRegistry } from '@services/extensions'
import { sanitizeSvgIcon } from '@services/extensions/svgIcon'
import {
  getExtensionContextKey,
  setExtensionContextKey,
  subscribeToExtensionContextKeys
} from '@services/extensions/hostBridge'
import { evaluateWhen } from '@services/extensions/when'
import { bindTabsDockedContext } from '@features/tabs'
import type { ActivityBarButton, ActivityBarSide } from './types'
import { getOrderedButtons, subscribeToButtonLayout } from './layout'
import { consumeDragClick, startButtonDrag } from './buttonDrag'
import { DragGhost } from './DragGhost'
import { getActivityBadge, subscribeToActivityBadges } from './badges'
import styles from './ActivityBar.module.css'

import { t } from '@core/i18n'

export function ActivityBar({ side }: { side: ActivityBarSide }): JSX.Element {
  const { slots, toggleSlotPanel } = useLayout()
  const [version, setVersion] = useState(0)
  // Fantasma que sigue al cursor durante el drag (null = sin drag).
  const [ghost, setGhost] = useState<{ id: string; x: number; y: number } | null>(null)

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

  // El estado "tabs acopladas" publica su clave de contexto con el hostBridge.
  // Se conecta ACÁ (la barra ya depende del hostBridge) y no en el store, para
  // que `@features/tabs` no arrastre servicios: `persistence` lo importa y sería
  // un ciclo. El botón `tabs` (when: 'tabsDocked') queda visible solo en modo
  // acoplado. Va en un efecto (no en el módulo) porque el hostBridge puede
  // estar a mitad de inicializar durante un ciclo de imports.
  useEffect(() => {
    bindTabsDockedContext((key, value) => setExtensionContextKey(key, value))
  }, [])

  const buttons = useMemo<ActivityBarButton[]>(
    () =>
      getOrderedButtons(side).filter((button) =>
        evaluateWhen(button.when, getExtensionContextKey)
      ),
    [side, version]
  )

  /** Arranca el drag del botón (el controlador compartido mueve el layout). */
  function onButtonPointerDown(event: React.PointerEvent, id: string): void {
    startButtonDrag(event, id, {
      onStart: (draggedId) => setGhost({ id: draggedId, x: event.clientX, y: event.clientY }),
      onMove: (x, y) => setGhost((current) => (current ? { ...current, x, y } : { id, x, y })),
      onEnd: () => setGhost(null)
    })
  }

  return (
    <nav
      className={styles.bar}
      data-side={side}
      aria-label={side === 'left' ? t('activitybar.barra.lateral.izquierda') : t('activitybar.barra.lateral.derecha')}
    >
      {buttons.map((button) => {
        // El panel sigue al botón: si se mudó de barra, abre en ese slot.
        const active = slots[side] === button.panelId
        const isGhost = ghost?.id === button.id
        const badge = getActivityBadge(button.id)
        return (
          <button
            key={button.id}
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
              // El click que dispara el pointerup del drag no abre el panel.
              if (consumeDragClick(button.id)) return
              toggleSlotPanel(side, button.panelId)
            }}
          >
            {typeof button.icon === 'string' ? (
              <span className={styles.svg} dangerouslySetInnerHTML={{ __html: sanitizeSvgIcon(button.icon) ?? '' }} />
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
