// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Overlays SEF — registro de los componentes que aportan las extensiones.
 *
 * Guarda el LOADER (import perezoso) y las props del pack; el que monta es el
 * host (`@services/events/OverlayHost`). Nada de esto sabe qué dibuja.
 */

import type { ComponentType } from 'react'
import type { OverlayLayer } from './schema'

export interface OverlayComponentProps {
  /** Escucha los eventos que el timeline manda con `overlay.emit`. */
  on: (name: string, handler: (payload: unknown) => void) => () => void
  /** El evento que lo montó (id/nombre del pack). */
  event?: { id: string; name: string }
  /** Props fijas declaradas por el pack en `contributes.overlays[].props`. */
  props?: Record<string, unknown>
}

export interface RegisteredOverlay {
  id: string
  name: string
  layer: OverlayLayer
  extensionId: string
  isBuiltin: boolean
  /** Import perezoso del componente. */
  load: () => Promise<{ default: ComponentType<OverlayComponentProps> }>
  props?: Record<string, unknown>
}

const overlays = new Map<string, RegisteredOverlay>()
const listeners = new Set<() => void>()

export function subscribeToOverlays(listener: () => void): () => void {
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

export function registerOverlay(entry: RegisteredOverlay): void {
  overlays.set(entry.id, entry)
  emit()
}

export function unregisterOverlay(id: string): void {
  if (overlays.delete(id)) emit()
}

export function getOverlay(id: string): RegisteredOverlay | null {
  return overlays.get(id) ?? null
}

export function listOverlays(): RegisteredOverlay[] {
  return [...overlays.values()]
}
