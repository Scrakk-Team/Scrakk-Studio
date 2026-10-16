// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Runtime de eventos — ventana, activación y (lo importante) APAGADO.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUÉ SE PRUEBA Y POR QUÉ
 *
 *   1. la VENTANA manda: dentro activa por su cuenta, fuera no, y al cerrar se
 *      apaga solo (el requisito "del 20 al 31 y después se desactiva"),
 *   2. el COMANDO ignora la ventana (es la forma de probar en julio),
 *   3. `once` — un evento vivido no vuelve, salvo que diga `once: false`, y
 *   4. el NAMESPACE de testing: probar no quema el `once` real.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeEventScene } from '../src/renderer/src/services/extensions/types/events/schema'
import { registerEvent, unregisterEvent } from '../src/renderer/src/services/extensions/types/events/logic'
import {
  activateEvent,
  deactivateEvent,
  evaluateEvents,
  getActiveEventId,
  resetEventsRuntimeForTests,
  subscribeToActiveEvent
} from '../src/renderer/src/services/events/runtime'
import {
  clearFakeNow,
  resetEventsTestingForTests,
  setFakeNow,
  setTestingEvents
} from '../src/renderer/src/services/events/testing'
import { clearEventState, getEventState } from '../src/renderer/src/services/events/state'
import { extensionStatusBar } from '../src/renderer/src/services/extensions/statusBar'
import { resetEffectsForTests } from '../src/renderer/src/services/effects/engine'
import { resetMixerForTests } from '../src/renderer/src/services/audio'

const ID = 'demo.night'
const OTHER = 'demo.other'
const OWNER = 'demo.pack'

const day = (y: number, m: number, d: number, h = 0): number =>
  new Date(y, m - 1, d, h).getTime()

function register(id: string, scene: Record<string, unknown>): void {
  const normalized = normalizeEventScene({
    specVersion: 1,
    schedule: { from: '2026-10-20', until: '2026-10-31' },
    timeline: [{ op: 'stage.fog' }],
    ...scene
  })
  if (!normalized) throw new Error('escena de prueba inválida')
  registerEvent({ id, name: id, extensionId: OWNER, isBuiltin: false, scene: normalized })
}

// `localStorage` no existe en node: el estado persistido va a un Map. Se stubean
// los dos accesos (el store usa `window.localStorage`; el flag, `localStorage`).
const mem = new Map<string, string>()

beforeEach(() => {
  mem.clear()
  const storage = {
    getItem: (k: string) => (mem.has(k) ? (mem.get(k) as string) : null),
    setItem: (k: string, v: string) => {
      mem.set(k, String(v))
    },
    removeItem: (k: string) => {
      mem.delete(k)
    },
    clear: () => mem.clear(),
    key: (i: number) => [...mem.keys()][i] ?? null,
    get length() {
      return mem.size
    }
  }
  vi.stubGlobal('localStorage', storage)
  vi.stubGlobal('window', { localStorage: storage, dispatchEvent: () => {}, addEventListener: () => {} })
})

afterEach(() => {
  unregisterEvent(ID)
  unregisterEvent(OTHER)
  resetEventsRuntimeForTests()
  clearEventState()
  resetEventsTestingForTests()
  resetEffectsForTests()
  resetMixerForTests()
  extensionStatusBar.dropExtension('scrakk.events')
  clearFakeNow()
  vi.unstubAllGlobals()
})

describe('la ventana manda', () => {
  it('dentro de la ventana se activa solo', () => {
    register(ID, { activation: { mode: 'auto' } })
    setFakeNow(day(2026, 10, 25))
    evaluateEvents()
    expect(getActiveEventId()).toBe(ID)
  })

  it('fuera de la ventana no pasa nada', () => {
    register(ID, { activation: { mode: 'auto' } })
    setFakeNow(day(2026, 10, 19))
    evaluateEvents()
    expect(getActiveEventId()).toBeNull()

    setFakeNow(day(2026, 11, 1))
    evaluateEvents()
    expect(getActiveEventId()).toBeNull()
  })

  it('se APAGA SOLO al cerrar la ventana', () => {
    register(ID, { activation: { mode: 'auto' } })
    setFakeNow(day(2026, 10, 31, 23))
    evaluateEvents()
    expect(getActiveEventId()).toBe(ID)

    // 00:00 del 1 de noviembre: cerró la ventana.
    setFakeNow(day(2026, 11, 1))
    evaluateEvents()
    expect(getActiveEventId()).toBeNull()
  })

  it('`notify` avisa pero NO lo activa solo', () => {
    register(ID, { activation: { mode: 'notify' } })
    setFakeNow(day(2026, 10, 25))
    evaluateEvents()
    expect(getActiveEventId()).toBeNull()
  })

  it('el COMANDO ignora la ventana (probar en julio)', () => {
    register(ID, { activation: { mode: 'auto' } })
    setFakeNow(day(2026, 7, 4))
    expect(activateEvent(ID, { force: true })).toBe(true)
    expect(getActiveEventId()).toBe(ID)
  })
})

describe('un evento a la vez', () => {
  it('activar otro desactiva el anterior', () => {
    register(ID, {})
    register(OTHER, {})
    activateEvent(ID, { force: true })
    activateEvent(OTHER, { force: true })
    expect(getActiveEventId()).toBe(OTHER)
  })

  it('avisa a los suscriptores', () => {
    register(ID, {})
    let hits = 0
    const off = subscribeToActiveEvent(() => {
      hits += 1
    })
    activateEvent(ID, { force: true })
    deactivateEvent()
    off()
    expect(hits).toBe(2)
  })
})

describe('`once`', () => {
  it('un evento vivido no vuelve a dispararse', () => {
    register(ID, { activation: { mode: 'auto', once: true } })
    setFakeNow(day(2026, 10, 25))
    evaluateEvents()
    expect(getActiveEventId()).toBe(ID)

    deactivateEvent()
    evaluateEvents()
    expect(getActiveEventId()).toBeNull()
    expect(getEventState(ID, false)?.count).toBe(1)
  })

  it('con `once: false` vuelve a estar disponible', () => {
    register(ID, { activation: { mode: 'auto', once: false } })
    setFakeNow(day(2026, 10, 25))
    evaluateEvents()
    deactivateEvent()
    evaluateEvents()
    expect(getActiveEventId()).toBe(ID)
  })
})

describe('modo testing', () => {
  it('no quema el `once` real: escribe en OTRO namespace', () => {
    register(ID, { activation: { mode: 'auto', once: true } })
    setTestingEvents(true)
    setFakeNow(day(2026, 10, 25))
    evaluateEvents()
    expect(getActiveEventId()).toBe(ID)
    deactivateEvent()

    // El estado REAL quedó limpio; el de testing tiene la cuenta.
    expect(getEventState(ID, false)).toBeNull()
    expect(getEventState(ID, true)?.count).toBe(1)

    // Y al volver a producción, el evento todavía está disponible.
    setTestingEvents(false)
    evaluateEvents()
    expect(getActiveEventId()).toBe(ID)
  })
})

describe('el chip de la status bar', () => {
  it('aparece al activar y se va al desactivar', () => {
    register(ID, { timeline: [{ op: 'status.add', text: 'Noche' }] })
    activateEvent(ID, { force: true })
    expect(extensionStatusBar.list('right').map((i) => i.text)).toContain('Noche')

    deactivateEvent()
    expect(extensionStatusBar.list('right')).toHaveLength(0)
  })
})
