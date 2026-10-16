// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Ventana de activación de un evento SEF.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUÉ SE PRUEBA Y POR QUÉ
 *
 * Un evento no se activa "un día": se activa por una CANTIDAD de tiempo y
 * después se apaga solo. El caso real es `del 20 al 31 de octubre`, así que lo
 * que se rompe en silencio es:
 *
 *   1. el borde — el 31 a las 23:59 sigue activo y el 1 de noviembre ya no,
 *   2. el huso — una fecha pelada NO puede parsearse como UTC (correría la
 *      ventana un día según dónde viva el usuario), y
 *   3. `minEngine` — un evento de un formato nuevo no debe correr en un IDE
 *      viejo, y un build de dev (sin versión) no debe quedarse sin nada.
 */

import { describe, expect, it } from 'vitest'
import {
  compareVersions,
  evaluateWindow,
  msUntilWindowClose,
  parseScheduleBound,
  satisfiesVersion
} from '../src/shared/events/schedule'

/** Medianoche local de un día pelado. */
const day = (
  y: number,
  m: number,
  d: number,
  h = 0,
  min = 0,
  s = 0,
  ms = 0
): number => new Date(y, m - 1, d, h, min, s, ms).getTime()

describe('la ventana "del 20 al 31"', () => {
  const HALLOWEEN = { from: '2026-10-20', until: '2026-10-31' }

  it('no está activo antes del 20', () => {
    const ev = evaluateWindow(HALLOWEEN, day(2026, 10, 19, 23, 59, 59, 999), '0.1.6')
    expect(ev.status).toBe('future')
    expect(ev.active).toBe(false)
  })

  it('está activo TODO el 20, el 31 incluido', () => {
    expect(evaluateWindow(HALLOWEEN, day(2026, 10, 20), '0.1.6').active).toBe(true)
    expect(evaluateWindow(HALLOWEEN, day(2026, 10, 25, 12), '0.1.6').active).toBe(true)
    // El 31 a las 23:59:59.999 todavía está adentro.
    expect(
      evaluateWindow(HALLOWEEN, day(2026, 10, 31, 23, 59, 59, 999), '0.1.6').active
    ).toBe(true)
  })

  it('el 1 de noviembre ya se apagó', () => {
    const ev = evaluateWindow(HALLOWEEN, day(2026, 11, 1), '0.1.6')
    expect(ev.status).toBe('expired')
    expect(ev.active).toBe(false)
  })

  it('expone CUÁNDO cierra, para apagarlo en el borde', () => {
    const ev = evaluateWindow(HALLOWEEN, day(2026, 10, 21), '0.1.6')
    // Fin del 31, en hora local.
    expect(ev.closesAt).toBe(day(2026, 10, 31, 23, 59, 59, 999))
    expect(msUntilWindowClose(HALLOWEEN, day(2026, 10, 31, 23, 59))).toBe(59_999)
    // Ya vencida: quedan 0, no negativo.
    expect(msUntilWindowClose(HALLOWEEN, day(2026, 11, 5))).toBe(0)
  })
})

describe('bordes sueltos y huso', () => {
  it('sólo `from` = activo desde ese día y sin cierre', () => {
    const ev = evaluateWindow({ from: '2026-10-20' }, day(2027, 1, 1), '0.1.6')
    expect(ev.active).toBe(true)
    expect(ev.closesAt).toBeNull()
    expect(msUntilWindowClose({ from: '2026-10-20' }, day(2027, 1, 1))).toBeNull()
  })

  it('sólo `until` = activo hasta ese día (fin del día)', () => {
    expect(evaluateWindow({ until: '2026-10-31' }, day(2020, 1, 1), null).active).toBe(true)
    expect(evaluateWindow({ until: '2026-10-31' }, day(2027, 1, 1), null).active).toBe(false)
  })

  it('sin ventana NO se activa solo (queda el comando)', () => {
    const ev = evaluateWindow(undefined, day(2026, 10, 25), '0.1.6')
    expect(ev.status).toBe('manual')
    expect(ev.active).toBe(false)
  })

  it('una fecha pelada es local, no UTC', () => {
    expect(parseScheduleBound('2026-10-20', false)).toBe(day(2026, 10, 20))
    expect(parseScheduleBound('2026-10-31', true)).toBe(day(2026, 10, 31, 23, 59, 59, 999))
    // Un ISO con hora se respeta tal cual.
    expect(parseScheduleBound('2026-10-20T06:30:00Z', false)).toBe(
      Date.parse('2026-10-20T06:30:00Z')
    )
  })

  it('basura no rompe: el límite se ignora', () => {
    expect(parseScheduleBound('mañana', false)).toBeNull()
    expect(parseScheduleBound('2026-99-99', false)).toBeNull()
    expect(parseScheduleBound('', false)).toBeNull()
    expect(parseScheduleBound(undefined, false)).toBeNull()
  })
})

describe('minEngine', () => {
  it('bloquea un IDE viejo y deja pasar el que cumple', () => {
    const s = { from: '2026-10-20', until: '2026-10-31', minEngine: '>=0.1.6' }
    expect(evaluateWindow(s, day(2026, 10, 25), '0.1.5').status).toBe('unsupported-engine')
    expect(evaluateWindow(s, day(2026, 10, 25), '0.1.6').active).toBe(true)
    expect(evaluateWindow(s, day(2026, 10, 25), '0.2.0').active).toBe(true)
  })

  it('sin versión conocida no bloquea (dev)', () => {
    expect(satisfiesVersion('>=0.1.6', null)).toBe(true)
    expect(satisfiesVersion(undefined, '0.1.0')).toBe(true)
  })

  it('comparadores', () => {
    expect(satisfiesVersion('>0.1.5', '0.1.6')).toBe(true)
    expect(satisfiesVersion('<0.2.0', '0.1.9')).toBe(true)
    expect(satisfiesVersion('<=0.1.6', '0.1.6')).toBe(true)
    expect(satisfiesVersion('0.1.6', '0.1.6')).toBe(true)
    expect(satisfiesVersion('0.1.6', '0.1.7')).toBe(false)
    expect(compareVersions('v1.10.0', '1.9.9')).toBe(1)
    expect(compareVersions('0.1.6', '0.1.6.1')).toBe(0)
  })
})
