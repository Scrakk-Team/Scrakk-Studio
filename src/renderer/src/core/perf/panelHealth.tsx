// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Salud de paneles — atribución y contención del trabajo pesado.
 *
 * El renderer tiene UN hilo: si un panel renderiza muy lento, todo se siente
 * trabado. Acá:
 *  - `PanelProfiler` mide el render de cada panel (React `<Profiler>`) y lleva
 *    una ventana móvil de duraciones.
 *  - Si un panel se mantiene lento, se marca con `data-panel-slow` para pausar
 *    sus animaciones (lo que más CPU/paint consume de forma continua) y se
 *    recupera solo cuando sus renders vuelven a la normalidad.
 *  - `getPanelHealth()` expone las métricas (para un overlay de dev).
 *
 * Marcar el atributo es DOM directo (no `setState`): evita que medir cambie el
 * render que se está midiendo.
 */

import { Profiler, useRef, type JSX, type ReactNode } from 'react'
import styles from './panelHealth.module.css'

export interface PanelHealth {
  /** Peor render visto (ms). */
  worstMs: number
  /** Cantidad de renders medidos. */
  renders: number
  /** Si el panel está marcado como lento. */
  slow: boolean
}

/** Ventana de renders para promediar (no reaccionar a un pico puntual). */
const WINDOW = 6
/** Promedio por encima del cual se considera lento (ms). */
const SLOW_AVG_MS = 50
/** Promedio por debajo del cual se recupera (ms). */
const RECOVER_AVG_MS = 20

const health = new Map<string, PanelHealth>()
const samplesById = new Map<string, number[]>()

function record(id: string, durationMs: number): boolean {
  const current = health.get(id) ?? { worstMs: 0, renders: 0, slow: false }
  current.worstMs = Math.max(current.worstMs, durationMs)
  current.renders += 1
  health.set(id, current)

  const samples = samplesById.get(id) ?? []
  samples.push(durationMs)
  if (samples.length > WINDOW) samples.shift()
  samplesById.set(id, samples)

  const average = samples.reduce((total, value) => total + value, 0) / samples.length
  const enoughSamples = samples.length >= WINDOW
  if (enoughSamples && average > SLOW_AVG_MS) current.slow = true
  else if (average < RECOVER_AVG_MS) current.slow = false
  return current.slow
}

/** Métricas por panel (para dev/overlay). */
export function getPanelHealth(): ReadonlyMap<string, PanelHealth> {
  return health
}

/**
 * Envuelve el contenido de un panel: mide su render y, si se mantiene lento,
 * le pausa las animaciones vía `data-panel-slow` (sin re-render).
 */
export function PanelProfiler({ id, children }: { id: string; children: ReactNode }): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)

  return (
    <div ref={hostRef} className={styles.host} data-panel-id={id}>
      <Profiler
        id={id}
        onRender={(_id, _phase, actualDuration) => {
          const slow = record(id, actualDuration)
          const host = hostRef.current
          if (host) host.toggleAttribute('data-panel-slow', slow)
          if (import.meta.env.DEV && actualDuration > SLOW_AVG_MS) {
            // eslint-disable-next-line no-console
            console.warn(`[panelPerf] ${id}: render ${actualDuration.toFixed(1)}ms`)
          }
        }}
      >
        {children}
      </Profiler>
    </div>
  )
}
