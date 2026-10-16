// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Modo TESTING de eventos + reloj falso.
 *
 * Dos piezas para poder probar un evento sin esperar a su ventana:
 *
 *  1. el FLAG `testing-events` (mismo patrón que `low-end-mode`): con él los
 *     eventos no se activan solos, se listan TODOS (incluso vencidos/futuros) y
 *     el estado va a otro namespace (`./state`), y
 *  2. el RELOJ FALSO: mover "ahora" en días para probar la ventana sin tocar el
 *     reloj del sistema operativo.
 */

const TESTING_KEY = 'scrakk:testing-events'

type Listener = () => void

const testingListeners = new Set<Listener>()
const clockListeners = new Set<Listener>()

function emitAll(listeners: Set<Listener>): void {
  for (const listener of listeners) {
    try {
      listener()
    } catch {
      // Un suscriptor roto no debe tumbar a los demás.
    }
  }
}

function loadTesting(): boolean {
  try {
    return localStorage.getItem(TESTING_KEY) === '1'
  } catch {
    return false
  }
}

let testing = loadTesting()

export function isTestingEvents(): boolean {
  return testing
}

export function subscribeTestingEvents(listener: Listener): () => void {
  testingListeners.add(listener)
  return () => {
    testingListeners.delete(listener)
  }
}

export function setTestingEvents(value: boolean): void {
  if (testing === value) return
  testing = value
  try {
    localStorage.setItem(TESTING_KEY, value ? '1' : '0')
  } catch {
    // Sin almacenamiento: el flag vive lo que dure la sesión.
  }
  emitAll(testingListeners)
}

export function toggleTestingEvents(): void {
  setTestingEvents(!testing)
}

// ── Reloj ──────────────────────────────────────────────────────────────────

let fakeNow: number | null = null

/**
 * "Ahora" según el runtime de eventos. TODO el runtime pregunta por acá (y no
 * por `Date.now()`) para que el reloj falso alcance a la ventana, al estado y
 * al apagado automático.
 */
export function getEventNow(): number {
  return fakeNow ?? Date.now()
}

export function getFakeNow(): number | null {
  return fakeNow
}

export function setFakeNow(ms: number | null): void {
  fakeNow = ms
  emitAll(clockListeners)
}

/** Mueve el reloj `days` días (positivo = adelante). Base: el falso o el real. */
export function shiftFakeNow(days: number): void {
  setFakeNow((fakeNow ?? Date.now()) + days * 24 * 60 * 60 * 1000)
}

export function clearFakeNow(): void {
  setFakeNow(null)
}

export function subscribeEventClock(listener: Listener): () => void {
  clockListeners.add(listener)
  return () => {
    clockListeners.delete(listener)
  }
}

/** Sólo para tests: vuelve a apagado y sin reloj falso. */
export function resetEventsTestingForTests(): void {
  testing = false
  fakeNow = null
  try {
    localStorage.removeItem(TESTING_KEY)
  } catch {
    // Sin almacenamiento no hay nada que limpiar.
  }
  emitAll(testingListeners)
  emitAll(clockListeners)
}
