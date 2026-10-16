// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Eventos SEF — resolución de la VENTANA de activación.
 *
 * Puro y sin dependencias: se testea en node. Acá vive el requisito central:
 * un evento está activo SÓLO dentro de su ventana (`from`..`until`) y después
 * se apaga solo. `{ from: '2026-10-20', until: '2026-10-31' }` está activo del
 * 20 a las 00:00 al 31 a las 23:59 (inclusive); el 1 de noviembre ya no.
 *
 * Las fechas PELADAS (`YYYY-MM-DD`) se interpretan en hora LOCAL del usuario:
 * `new Date('2026-10-20')` sería UTC y correría la ventana un día según el
 * huso. Por eso el parseo es manual.
 */

import type { EventSchedule } from './types'

/** `YYYY-MM-DD` — fecha pelada, sin hora. */
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Convierte un límite del schedule a ms.
 *
 * `until` con fecha pelada es **fin del día** (el 31 incluye el 31 entero);
 * `from` con fecha pelada es **00:00**. Un ISO con hora se respeta tal cual.
 */
export function parseScheduleBound(
  value: string | undefined,
  endOfDay: boolean
): number | null {
  if (typeof value !== 'string' || value.trim() === '') return null
  const raw = value.trim()

  const m = DATE_ONLY.exec(raw)
  if (m) {
    const y = Number(m[1])
    const mo = Number(m[2])
    const d = Number(m[3])
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
    const ms = endOfDay
      ? new Date(y, mo - 1, d, 23, 59, 59, 999).getTime()
      : new Date(y, mo - 1, d, 0, 0, 0, 0).getTime()
    return Number.isFinite(ms) ? ms : null
  }

  const ms = Date.parse(raw)
  return Number.isFinite(ms) ? ms : null
}

/** Compara dos versiones `x.y.z` (ignora `v` inicial y pre-release). */
export function compareVersions(a: string, b: string): number {
  const pa = a.trim().replace(/^v/i, '').split('.')
  const pb = b.trim().replace(/^v/i, '').split('.')
  for (let i = 0; i < 3; i++) {
    const na = Number.parseInt(pa[i] ?? '0', 10) || 0
    const nb = Number.parseInt(pb[i] ?? '0', 10) || 0
    if (na !== nb) return na < nb ? -1 : 1
  }
  return 0
}

/**
 * ¿La versión cumple el rango? Acepta `>=`, `>`, `<=`, `<`, `=` (o nada = `=`),
 * p. ej. `>=0.1.6`. Sin rango → sí.
 *
 * Sin `version` conocida NO bloqueamos (fail-open): un build de dev no debe
 * quedarse sin eventos por no poder resolver la versión.
 */
export function satisfiesVersion(engine: string | undefined, version: string | null): boolean {
  if (typeof engine !== 'string' || engine.trim() === '') return true
  if (!version) return true
  const m = /^(>=|<=|>|<|=)?\s*(.+)$/.exec(engine.trim())
  if (!m) return true
  const cmp = compareVersions(version, m[2])
  switch (m[1] ?? '=') {
    case '>=':
      return cmp >= 0
    case '>':
      return cmp > 0
    case '<=':
      return cmp <= 0
    case '<':
      return cmp < 0
    default:
      return cmp === 0
  }
}

export type WindowStatus =
  /** Dentro de la ventana ahora mismo. */
  | 'active'
  /** Todavía no llegó `from`. */
  | 'future'
  /** Ya pasó `until`. */
  | 'expired'
  /** Sin ventana: sólo activable a mano con el comando. */
  | 'manual'
  /** La versión del IDE no cumple `minEngine`. */
  | 'unsupported-engine'

export interface WindowEvaluation {
  status: WindowStatus
  /** `true` SÓLO cuando la ventana está abierta AHORA. */
  active: boolean
  /** ms en que la ventana abre (`from`), o null si no tiene. */
  opensAt: number | null
  /** ms en que la ventana cierra (`until`), o null si no tiene. */
  closesAt: number | null
}

/**
 * Evalúa la ventana del evento en un instante dado.
 *
 * `closesAt` es lo que el runtime usa para APAGAR el evento en el borde aunque
 * la app quede abierta: al llegar a ese instante se desactiva solo.
 */
export function evaluateWindow(
  schedule: EventSchedule | undefined,
  now: number,
  appVersion: string | null
): WindowEvaluation {
  const opensAt = parseScheduleBound(schedule?.from, false)
  const closesAt = parseScheduleBound(schedule?.until, true)

  // Sin ningún límite no hay activación automática: queda el comando.
  if (opensAt === null && closesAt === null) {
    return { status: 'manual', active: false, opensAt: null, closesAt: null }
  }

  if (!satisfiesVersion(schedule?.minEngine, appVersion)) {
    return { status: 'unsupported-engine', active: false, opensAt, closesAt }
  }

  if (opensAt !== null && now < opensAt) {
    return { status: 'future', active: false, opensAt, closesAt }
  }
  if (closesAt !== null && now > closesAt) {
    return { status: 'expired', active: false, opensAt, closesAt }
  }
  return { status: 'active', active: true, opensAt, closesAt }
}

/** ms que le quedan a la ventana desde `now` (null = no cierra, 0 = cerrada). */
export function msUntilWindowClose(
  schedule: EventSchedule | undefined,
  now: number
): number | null {
  const closesAt = parseScheduleBound(schedule?.until, true)
  if (closesAt === null) return null
  return Math.max(0, closesAt - now)
}
