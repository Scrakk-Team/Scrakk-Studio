// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * OverlayHost — monta el componente que aporta el PACK para una capa.
 *
 *   - `effects`    → encima de todo (efectos del evento).
 *   - `background` → detrás de la app (cielo, niebla).
 *
 * El core sólo resuelve el id del evento activo y le pasa al componente:
 *   `on`     → suscripción a los eventos del timeline (`overlay.emit`)
 *   `event`  → quién lo montó
 *   `props`  → props fijas declaradas por el pack
 *
 * No sabe qué dibuja: eso es 100% del pack (y por eso el rayo no vive en el
 * core).
 */

import { memo, useEffect, useMemo, useState, type ComponentType, type JSX } from 'react'
import {
  getOverlay,
  subscribeToOverlays,
  type OverlayComponentProps
} from '@services/extensions/types/overlays/logic'
import { getActiveOverlayLayer, subscribeToActiveEvent } from './runtime'
import { onOverlayEvent } from './overlayBus'

export interface OverlayHostProps {
  layer: 'effects' | 'background'
  /**
   * Fuerza un overlay concreto en vez del que aporta el evento activo. Lo usa
   * el fondo del tema: el mismo componente puede venir del pack del theme.
   */
  overlayId?: string
}

export function OverlayHost({ layer, overlayId }: OverlayHostProps): JSX.Element | null {
  const [tick, setTick] = useState(0)
  useEffect(() => subscribeToActiveEvent(() => setTick((n) => n + 1)), [])
  useEffect(() => subscribeToOverlays(() => setTick((n) => n + 1)), [])

  const active = overlayId ? null : getActiveOverlayLayer(layer)
  const [component, setComponent] = useState<ComponentType<OverlayComponentProps> | null>(null)
  const activeId = overlayId ?? active?.id ?? null
  const activeEvent = active?.eventId ?? overlayId ?? null

  useEffect(() => {
    setComponent(null)
    if (!activeId) return
    const entry = getOverlay(activeId)
    if (!entry) return
    let alive = true
    void entry
      .load()
      .then((mod) => {
        if (alive) setComponent(() => mod.default)
      })
      .catch((error) => {
        console.warn(`[events] el overlay "${activeId}" no cargó:`, error)
      })
    return () => {
      alive = false
    }
    // `tick` reevalúa cuando se registra el overlay (puede llegar después del
    // tema) o cuando cambia el evento activo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, activeEvent, tick])

  // Props ESTABLES: el overlay del pack no tiene que re-renderizarse porque el
  // motor avisó de un cambio de niebla o de shake (eso además pisaba estados
  // internos, como la opacidad del rayo).
  const eventProp = useMemo(
    () =>
      active
        ? { id: active.eventId, name: active.eventName }
        : overlayId
          ? { id: overlayId, name: overlayId }
          : undefined,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [active?.eventId, active?.eventName, overlayId]
  )
  const overlayProps = useMemo(
    () => (activeId ? getOverlay(activeId)?.props : undefined),
    [activeId, tick]
  )
  const StableOverlay = useMemo(() => (component ? memo(component) : null), [component])

  if (!activeId || !StableOverlay) return null

  return <StableOverlay on={onOverlayEvent} event={eventProp} props={overlayProps} />
}
