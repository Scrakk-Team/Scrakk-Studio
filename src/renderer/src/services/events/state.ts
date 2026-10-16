// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Estado persistido de los eventos (local, en el perfil).
 *
 * Dos NAMESPACES: el real y el de testing. Probar un evento en modo testing no
 * debe "quemar" su `once` — si no, el día que llegue la ventana de verdad ya
 * figura como visto y no vuelve a aparecer.
 */

import { lsGet, lsSet } from '@services/storage/localStorage'

export interface EventStateRecord {
  /** Primera activación (ms). */
  activatedAt?: number
  /** Última vez que terminó (ms). */
  completedAt?: number
  /** Cuántas veces se activó. */
  count?: number
}

type EventStateMap = Record<string, EventStateRecord>

/** Clave del namespace. */
export function eventStateKey(testing: boolean): string {
  return testing ? 'events:test:state' : 'events:state'
}

export function loadEventState(testing: boolean): EventStateMap {
  return lsGet<EventStateMap>(eventStateKey(testing)) ?? {}
}

function saveEventState(testing: boolean, map: EventStateMap): void {
  lsSet(eventStateKey(testing), map)
}

export function getEventState(id: string, testing: boolean): EventStateRecord | null {
  return loadEventState(testing)[id] ?? null
}

/** ¿Ya se vivió? Es lo que decide el `once`. */
export function isEventDone(id: string, testing: boolean): boolean {
  const record = getEventState(id, testing)
  return (record?.count ?? 0) > 0
}

export function markEventActivated(id: string, testing: boolean): void {
  const map = loadEventState(testing)
  const prev = map[id] ?? {}
  map[id] = {
    activatedAt: prev.activatedAt ?? Date.now(),
    completedAt: prev.completedAt,
    count: (prev.count ?? 0) + 1
  }
  saveEventState(testing, map)
}

export function markEventCompleted(id: string, testing: boolean): void {
  const map = loadEventState(testing)
  const prev = map[id] ?? { count: 0 }
  map[id] = { ...prev, completedAt: Date.now() }
  saveEventState(testing, map)
}

/** Borra el namespace (los dos si no se especifica). */
export function clearEventState(testing?: boolean): void {
  if (testing === undefined) {
    saveEventState(true, {})
    saveEventState(false, {})
    return
  }
  saveEventState(testing, {})
}
