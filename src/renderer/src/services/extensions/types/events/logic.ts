// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Eventos SEF — registro en memoria de los eventos declarados.
 *
 * Sólo guarda metadata + escena ya validada. Quién los ACTIVA y cómo se
 * ejecutan vive en `@services/events` (el runtime). Así el tipo de contribución
 * queda igual que `themes`: data hasta acá, comportamiento allá.
 *
 * Patrón del resto de la app: mapa único + subscribe/emit.
 */

import type { EventScene } from '@shared/events'

/** Un evento registrado por una extensión. */
export interface RegisteredEvent {
  id: string
  name: string
  extensionId: string
  isBuiltin: boolean
  scene: EventScene
}

const events = new Map<string, RegisteredEvent>()
const listeners = new Set<() => void>()

export function subscribeToEvents(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function emit(): void {
  for (const listener of listeners) {
    try {
      listener()
    } catch {
      // Un suscriptor roto no debe tumbar a los demás.
    }
  }
}

export function registerEvent(entry: RegisteredEvent): void {
  events.set(entry.id, entry)
  emit()
}

export function unregisterEvent(id: string): void {
  if (events.delete(id)) emit()
}

export function getEvent(id: string): RegisteredEvent | null {
  return events.get(id) ?? null
}

export function listEvents(): RegisteredEvent[] {
  return [...events.values()]
}

/** Ids globales: el id de la extensión dueña, para desinstalar limpio. */
export function getEventExtensionId(id: string): string | null {
  return events.get(id)?.extensionId ?? null
}
