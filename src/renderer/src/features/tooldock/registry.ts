// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * ToolDock — registro de items.
 *
 * Patrón idéntico al resto de stores del repo: Map + Set<Listener> + emit().
 * Los items builtin se registran desde `items/index.ts` (importado por el
 * propio registry para que el registro exista sin wiring extra); paneles y
 * botones de otros features (o de extensiones más adelante) usan la misma
 * API pública: registerToolDockItem / unregisterToolDockItem.
 */

import type { ToolDockHostInfo, ToolDockItem } from './types'

type Listener = () => void

const items = new Map<string, ToolDockItem>()
const listeners = new Set<Listener>()

export function registerToolDockItem(item: ToolDockItem): () => void {
  items.set(item.id, item)
  emit()
  return () => unregisterToolDockItem(item.id)
}

export function unregisterToolDockItem(id: string): void {
  if (items.delete(id)) emit()
}

function emit(): void {
  for (const listener of [...listeners]) {
    try {
      listener()
    } catch {
      // Suscriptor roto no tumba a los demás.
    }
  }
}

export function subscribeToToolDockItems(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function matchesHost(item: ToolDockItem, ctx: ToolDockHostInfo): boolean {
  if (typeof item.hosts === 'function') return item.hosts(ctx)
  if (Array.isArray(item.hosts)) return item.hosts.includes(ctx.hostId)
  return false
}

/**
 * Items visibles en un host, ordenados. Los items con `order` explícito
 * ganan; el resto se ordena alfabéticamente después de esos (estable).
 */
export function getToolDockItemsForHost(ctx: ToolDockHostInfo): ToolDockItem[] {
  return [...items.values()]
    .filter((item) => matchesHost(item, ctx))
    .sort((a, b) => {
      const oa = a.order ?? 100
      const ob = b.order ?? 100
      if (oa !== ob) return oa - ob
      return a.id.localeCompare(b.id)
    })
}

/** Solo tests: limpia memoria + listeners. */
export function _resetToolDockRegistryForTests(): void {
  items.clear()
  listeners.clear()
}
