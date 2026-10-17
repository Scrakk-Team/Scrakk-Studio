// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Bus de eventos entre el RUNTIME del evento y los componentes que aporta la
 * extensión (overlays).
 *
 * El core NO sabe qué hace el componente: sólo le avisa "llegó el evento
 * `strike` con este payload". Así un rayo, una explosión o un efecto hecho con
 * canvas son todos lo mismo para el motor — y el pack es el que sabe.
 *
 * Patrón del resto de la app: mapa + subscribe, sin React.
 */

type OverlayHandler = (payload: unknown) => void

const handlers = new Map<string, Set<OverlayHandler>>()

/** Escucha un evento. Devuelve la baja. */
export function onOverlayEvent(name: string, handler: OverlayHandler): () => void {
  const set = handlers.get(name) ?? new Set<OverlayHandler>()
  set.add(handler)
  handlers.set(name, set)
  return () => {
    set.delete(handler)
    if (set.size === 0) handlers.delete(name)
  }
}

/** Dispara un evento a los overlays montados. */
export function emitOverlayEvent(name: string, payload?: unknown): void {
  const set = handlers.get(name)
  if (!set) return
  for (const handler of set) {
    try {
      handler(payload)
    } catch {
      // Un overlay roto no debe cortar el resto del timeline.
    }
  }
}

/** Al desactivar un evento: que no queden handlers de un componente desmontado. */
export function resetOverlayBus(): void {
  handlers.clear()
}

/** Sólo tests. */
export function getOverlayListenerCountForTests(name?: string): number {
  if (name) return handlers.get(name)?.size ?? 0
  let total = 0
  for (const set of handlers.values()) total += set.size
  return total
}
