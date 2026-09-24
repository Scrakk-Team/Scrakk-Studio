// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * tabsStore — store externo (patrón subscribe) del sistema de tabs.
 *
 * Fuente única de verdad de los strips: qué tabs hay, en qué orden y cuál
 * está activa. Cualquier componente puede spawnear / cerrar / activar /
 * mover tabs; los que renderizan (TabStrip) se suscriben y se re-renderizan.
 *
 * El store es AGNÓSTICO del layout: los strips son strings. El layout usa
 * los ids de sus slots como strips; el provider hidrata los defaults.
 */

import type { StripId, StripState, TabSpec } from './types'

/** Evento de mutación (para bridges que reaccionan a cambios puntuales). */
export type TabsEvent =
  | { type: 'hydrate' }
  | { type: 'spawn'; stripId: string; tabId: string; index: number }
  | { type: 'close'; stripId: string; tabId: string }
  | { type: 'activate'; stripId: string; tabId: string }
  | { type: 'reorder'; stripId: string; tabId: string; from: number; to: number }
  | { type: 'move'; fromStrip: string; toStrip: string; tabId: string; index: number }
  | { type: 'clear'; stripId: string }
  | { type: 'split'; stripId: string; dir: 'row' | 'column' | null }

type TabsListener = (event: TabsEvent) => void

class TabsStore {
  private strips = new Map<StripId, StripState>()
  private listeners = new Set<TabsListener>()

  // ── Estado ─────────────────────────────────────────────────────────────

  getStrip(stripId: StripId): StripState | null {
    const strip = this.strips.get(stripId)
    if (!strip) return null
    return {
      stripId: strip.stripId,
      tabs: [...strip.tabs],
      activeId: strip.activeId,
      splitDir: strip.splitDir
    }
  }

  /** Snapshot de TODOS los strips (para persistir / inspeccionar). */
  getAll(): Record<StripId, StripState> {
    const out: Record<StripId, StripState> = {}
    for (const [id, strip] of this.strips) {
      out[id] = {
        stripId: id,
        tabs: [...strip.tabs],
        activeId: strip.activeId,
        splitDir: strip.splitDir
      }
    }
    return out
  }

  /**
   * Reemplaza el estado completo (hidratación inicial / restore). Devuelve
   * la lista de strips que quedaron con tabs (los vacíos se descartan).
   */
  hydrate(next: Record<StripId, StripState>): void {
    this.strips.clear()
    for (const [id, state] of Object.entries(next)) {
      const tabs = state.tabs.filter((tab) => tab && typeof tab.id === 'string')
      const alive = tabs.map((tab) => ({ ...tab }))
      let activeId = tabs.some((t) => t.id === state.activeId) ? state.activeId : null
      if (!activeId && alive.length > 0) activeId = alive[0].id
      this.strips.set(id, { stripId: id, tabs: alive, activeId, splitDir: state.splitDir })
    }
    this.emit({ type: 'hydrate' })
  }

  /** Desmonta un strip completo (devuelve true si existía). */
  removeStrip(stripId: StripId): boolean {
    if (!this.strips.delete(stripId)) return false
    this.emit({ type: 'clear', stripId })
    return true
  }

  /** Crea un strip VACÍO (no-op si ya existe). Para splits: el leaf nuevo
   *  existe aunque todavía no tenga tabs. Devuelve true si lo creó. */
  createStrip(stripId: StripId): boolean {
    if (this.strips.has(stripId)) return false
    this.strips.set(stripId, { stripId, tabs: [], activeId: null })
    this.emit({ type: 'clear', stripId })
    return true
  }

  // ── Búsquedas ──────────────────────────────────────────────────────────

  /** Strip + índice donde vive una tab (null si no está en ningún strip). */
  findTab(tabId: string): { stripId: string; index: number } | null {
    for (const [stripId, strip] of this.strips) {
      const index = strip.tabs.findIndex((t) => t.id === tabId)
      if (index !== -1) return { stripId, index }
    }
    return null
  }

  /** Spec de una tab por id (null si no existe). */
  getTab(tabId: string): TabSpec | null {
    for (const strip of this.strips.values()) {
      const tab = strip.tabs.find((t) => t.id === tabId)
      if (tab) return { ...tab }
    }
    return null
  }

  // ── Mutaciones ─────────────────────────────────────────────────────────

  /**
   * Spawnea una tab en un strip. Si ya existe una tab con ese id, solo la
   * activa (sin duplicar). Con `index` opcional define la posición
   * (default: al final). Con `activate: false` no cambia la activa.
   */
  spawnTab(
    stripId: StripId,
    spec: TabSpec,
    opts?: { index?: number; activate?: boolean }
  ): TabSpec | null {
    const current = this.strips.get(stripId)
    if (current) {
      const existing = current.tabs.findIndex((t) => t.id === spec.id)
      if (existing !== -1) {
        if (opts?.activate !== false && current.activeId !== spec.id) {
          this.activateTab(stripId, spec.id)
        }
        return current.tabs[existing]
      }
    }
    const tab: TabSpec = { ...spec }
    const tabs = current ? [...current.tabs] : []
    const index = Math.min(opts?.index ?? tabs.length, tabs.length)
    tabs.splice(index, 0, tab)
    const activeId = opts?.activate === false ? current?.activeId ?? null : tab.id
    this.strips.set(stripId, {
      stripId,
      tabs,
      activeId,
      splitDir: current?.splitDir
    })
    this.emit({ type: 'spawn', stripId, tabId: tab.id, index })
    return tab
  }

  /** Activa una tab del strip (no-op si no existe). */
  activateTab(stripId: StripId, tabId: string): boolean {
    const strip = this.strips.get(stripId)
    if (!strip || strip.activeId === tabId) return false
    if (!strip.tabs.some((t) => t.id === tabId)) return false
    this.strips.set(stripId, { ...strip, activeId: tabId })
    this.emit({ type: 'activate', stripId, tabId })
    return true
  }

  /**
   * Cierra una tab. Si era la activa, activa el vecino (el que le sigue, o
   * el anterior si era la última). Devuelve la tab removida (null si no
   * existía). Si el strip queda vacío, activeId pasa a null.
   */
  closeTab(stripId: StripId, tabId: string): TabSpec | null {
    const strip = this.strips.get(stripId)
    if (!strip) return null
    const index = strip.tabs.findIndex((t) => t.id === tabId)
    if (index === -1) return null
    const [removed] = strip.tabs.splice(index, 1)
    let activeId = strip.activeId
    if (activeId === tabId) {
      activeId = strip.tabs[Math.min(index, strip.tabs.length - 1)]?.id ?? null
    }
    // Con UNA sola tab el contenido dividido no tiene sentido: la strip
    // vuelve a la presentación clásica (frame / tab única).
    const splitDir = strip.tabs.length < 2 ? undefined : strip.splitDir
    this.strips.set(stripId, { stripId, tabs: strip.tabs, activeId, splitDir })
    this.emit({ type: 'close', stripId, tabId })
    return removed
  }

  /**
   * Reordena dentro del mismo strip. `to` es la POSICIÓN FINAL de la tab en
   * el array resultante (0 = primera). Coincide con el índice que calcula el
   * indicador de drop entre tabs, que ignora la tab arrastrada.
   */
  reorderTab(stripId: StripId, from: number, to: number): boolean {
    const strip = this.strips.get(stripId)
    if (!strip) return false
    if (from < 0 || from >= strip.tabs.length) return false
    if (from === to) return false
    const [moved] = strip.tabs.splice(from, 1)
    const rest = strip.tabs
    const final = Math.max(0, Math.min(to, rest.length))
    rest.splice(final, 0, moved)
    this.strips.set(stripId, { ...strip })
    this.emit({ type: 'reorder', stripId, tabId: moved.id, from, to: final })
    return true
  }

  /**
   * Mueve una tab a OTRO strip (la saca del origen y la inserta en destino).
   * Devuelve true si se movió. La tab pasa a ser la activa del destino;
   * en el origen, si era la activa, se activa el vecino.
   */
  moveTabToStrip(
    fromStripId: StripId,
    tabId: string,
    toStripId: StripId,
    toIndex?: number
  ): boolean {
    const from = this.strips.get(fromStripId)
    if (!from) return false
    const index = from.tabs.findIndex((t) => t.id === tabId)
    if (index === -1) return false
    if (fromStripId === toStripId) return this.reorderTab(fromStripId, index, toIndex ?? index)
    const [moved] = from.tabs.splice(index, 1)
    let activeId = from.activeId
    if (activeId === tabId) {
      activeId = from.tabs[Math.min(index, from.tabs.length - 1)]?.id ?? null
    }
    // Si el origen queda con una sola tab, el split deja de tener sentido.
    const fromSplit = from.tabs.length < 2 ? undefined : from.splitDir
    this.strips.set(fromStripId, { stripId: fromStripId, tabs: from.tabs, activeId, splitDir: fromSplit })

    const to = this.strips.get(toStripId)
    const tabs = to ? [...to.tabs] : []
    const insertAt = Math.max(0, Math.min(toIndex ?? tabs.length, tabs.length))
    tabs.splice(insertAt, 0, moved)
    this.strips.set(toStripId, {
      stripId: toStripId,
      tabs,
      activeId: moved.id,
      splitDir: to?.splitDir
    })
    this.emit({ type: 'move', fromStrip: fromStripId, toStrip: toStripId, tabId, index: insertAt })
    return true
  }

  /** Cierra todas las tabs de un strip (devuelve las removidas). */
  clearStrip(stripId: StripId): TabSpec[] {
    const strip = this.strips.get(stripId)
    if (!strip) return []
    const removed = [...strip.tabs]
    this.strips.set(stripId, { stripId, tabs: [], activeId: null, splitDir: undefined })
    this.emit({ type: 'clear', stripId })
    return removed
  }

  /**
   * Activa / desactiva el contenido DIVIDIDO del strip (estilo split): con
   * splitDir el contenido muestra un panel por tab (la barra de tabs queda
   * compartida arriba). Devuelve true si cambió.
   */
  setSplit(stripId: StripId, dir: 'row' | 'column' | null): boolean {
    const strip = this.strips.get(stripId)
    if (!strip) return false
    if (strip.splitDir === dir) return false
    this.strips.set(stripId, { ...strip, splitDir: dir ?? undefined })
    this.emit({ type: 'split', stripId, dir })
    return true
  }

  // ── Suscripción ────────────────────────────────────────────────────────

  subscribe(listener: TabsListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit(event: TabsEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch {
        // Un suscriptor roto no debe tumbar a los demás.
      }
    }
  }
}

export const tabsStore = new TabsStore()

// ── Helpers de specs ────────────────────────────────────────────────────────

/**
 * Tab "Bienvenida" del centro: fija (sin X, no drageable) y no persistida
 * (se deriva en runtime). El label/ícono los pone TabStrip por kind.
 */
export function welcomeTab(): TabSpec {
  return { id: 'welcome', kind: 'welcome', fixed: true, closable: false, persist: false }
}

/** Tab de un panel registrado (PANEL_REGISTRY o ExtensionRegistry). */
export function panelTab(panelId: string, label?: string): TabSpec {
  return {
    id: `panel:${panelId}`,
    kind: 'panel',
    panelId,
    label,
    closable: true,
    persist: true
  }
}

/** Tab de un archivo abierto en el editor (multi-sesión por path). */
export function fileTab(filePath: string, name: string): TabSpec {
  return {
    id: `file:${filePath}`,
    kind: 'file',
    filePath,
    label: name,
    closable: true,
    persist: true
  }
}

/** Tab de una sesión viva (terminal Innerta). */
export function terminalTab(sessionId: string, label?: string): TabSpec {
  return {
    id: `term:${sessionId}`,
    kind: 'terminal',
    sessionId,
    label: label ?? 'Terminal',
    closable: true,
    persist: true
  }
}

/** Tab del explorador sobre una carpeta arbitraria (una instancia por raíz). */
export function explorerTab(rootPath: string, name?: string): TabSpec {
  const label = name ?? rootPath.split(/[/\\]/).filter(Boolean).pop() ?? 'Explorador'
  return {
    id: `explorer:${rootPath}`,
    kind: 'explorer',
    rootPath,
    label,
    closable: true,
    persist: true
  }
}

/** Reglas de persistencia por kind. */
export function tabPersistsByDefault(tab: TabSpec, stripId: string): boolean {
  switch (tab.kind) {
    case 'welcome':
      return false
    case 'file':
      // En el centro los archivos derivan de editorBus (evita doble verdad
      // de orden/estado); fuera del centro se persisten (archivo movido).
      return stripId !== 'center'
    case 'panel':
    case 'terminal':
    case 'explorer':
      return true
  }
}
