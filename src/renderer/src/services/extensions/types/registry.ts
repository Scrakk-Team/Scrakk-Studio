// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * ExtensionTypeRegistry — registro interno de TIPOS de extensión.
 *
 * Cada tipo de contribución ('panels', 'activityBar', 'centerTabs',
 * 'themes', …) registra aquí su handler. El loader genérico pregunta por
 * kind y delega: así un tipo nuevo se agrega sin tocar la capa extensions.
 *
 * Patrón idéntico al resto de stores de la app: clase única + subscribe.
 */

import type { AnyExtensionTypeHandler } from './handler'

class ExtensionTypeRegistryClass {
  private handlers = new Map<string, AnyExtensionTypeHandler>()
  /** Qué contribuciones registró cada extensión, por kind (desinstalación). */
  private ownedBy = new Map<string, { kind: string; value: unknown }[]>()
  private listeners = new Set<() => void>()

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit(): void {
    for (const listener of this.listeners) {
      try {
        listener()
      } catch {
        // Un suscriptor roto no debe tumbar a los demás.
      }
    }
  }

  /** Registra (o reemplaza) el handler de un tipo. */
  registerType(handler: AnyExtensionTypeHandler): void {
    this.handlers.set(handler.kind, handler)
    this.emit()
  }

  getHandler(kind: string): AnyExtensionTypeHandler | null {
    return this.handlers.get(kind) ?? null
  }

  getKinds(): string[] {
    return [...this.handlers.keys()]
  }

  hasHandler(kind: string): boolean {
    return this.handlers.has(kind)
  }

  // ── Ownership (desinstalación por extensión) ────────────────────────────

  /** Registra una contribución como propiedad de una extensión. */
  track(extensionId: string, kind: string, value: unknown): void {
    const owned = this.ownedBy.get(extensionId) ?? []
    owned.push({ kind, value })
    this.ownedBy.set(extensionId, owned)
  }

  /** Desregistra TODAS las contribuciones de tipos de una extensión. */
  unregisterExtension(extensionId: string): void {
    const owned = this.ownedBy.get(extensionId)
    if (!owned) return
    this.ownedBy.delete(extensionId)
    for (const { kind, value } of owned) {
      const handler = this.handlers.get(kind)
      if (!handler) continue
      try {
        handler.unregister([value])
      } catch (error) {
        console.warn(`[extensions] error desregistrando ${kind} de "${extensionId}":`, error)
      }
    }
    this.emit()
  }
}

export const ExtensionTypeRegistry = new ExtensionTypeRegistryClass()
