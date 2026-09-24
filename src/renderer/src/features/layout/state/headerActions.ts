// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Orden de los botones del header de un panel — overrides por acción.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * MISMO SISTEMA QUE LA ACTIVITY BAR, EN HORIZONTAL
 *
 * La ActivityBar y el ToolDock ya tienen un drag real: los botones son DATA
 * (`{id, side, order}`), el usuario los arrastra y este tipo de store guarda
 * lo que cambió (ver `features/activitybar/layout.ts`). El header de un panel
 * es la misma situación en miniatura: una fila de botones donde el usuario
 * quiere decidir el orden.
 *
 * Diferencias deliberadas con el de la activity bar:
 *  - Aquí NO hay "lado": el header es una sola fila, así que la posición es el
 *    único eje y el drag sólo reordena DENTRO del header (nunca se muda un
 *    botón a otro header).
 *  - Los ids de las acciones son globales y namespaced (`explorer.new-file`,
 *    `git.refresh`…), así que un override no necesita saber a qué header
 *    pertenece: el mismo panel montado en dos hosts (sidebar y ToolDock)
 *    comparte el mismo orden, que es lo que el usuario espera.
 *
 * El store NO conoce React: recibe listas de ids y devuelve listas ordenadas.
 * Quien pinta (PanelFrame) traduce sus hijos a `{id, order, node}`.
 *
 * Patrón idéntico al resto de stores: Map + Set<Listener> + emit().
 */

/** Lo mínimo que el store necesita saber de un botón para poder ordenarlo. */
export interface HeaderActionLike {
  /** Id global y namespaced de la acción (`explorer.refresh`). */
  id: string
  /** Orden declarado por el panel (default: posición declarada × 10). */
  order?: number
}

interface ActionOverride {
  order: number
}

const STORAGE_KEY = 'scrakk-studio:header-actions'
const ORDER_STEP = 10

type Listener = () => void

let overrides: Record<string, ActionOverride> = {}
let memoryFallback = '{}'
const listeners = new Set<Listener>()

function emit(): void {
  for (const listener of [...listeners]) {
    try {
      listener()
    } catch {
      // Suscriptor roto no tumba a los demás.
    }
  }
}

function readStorage(): string | null {
  try {
    if (typeof localStorage === 'undefined') return memoryFallback
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return memoryFallback
  }
}

function writeStorage(value: string): void {
  memoryFallback = value
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(STORAGE_KEY, value)
  } catch {
    // Sin almacenamiento: queda en memoria.
  }
}

function load(): void {
  overrides = {}
  try {
    const parsed: unknown = JSON.parse(readStorage() ?? '{}')
    if (parsed && typeof parsed === 'object') {
      for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (!value || typeof value !== 'object') continue
        const v = value as Partial<ActionOverride>
        if (typeof v.order === 'number' && Number.isFinite(v.order)) {
          overrides[id] = { order: v.order }
        }
      }
    }
  } catch {
    // JSON corrupto: se arranca sin overrides.
  }
}

function persist(): void {
  writeStorage(JSON.stringify(overrides))
}

load()

export function subscribeToHeaderActions(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Orden efectivo de una acción: el override del usuario, o el declarado. */
function effectiveOrder(action: HeaderActionLike, index: number): number {
  return overrides[action.id]?.order ?? action.order ?? (index + 1) * ORDER_STEP
}

/**
 * Aplica los overrides del usuario a una lista declarada por el panel.
 *
 * Sin overrides devuelve la lista tal cual (respetando `order` explícito).
 * El sort es estable (desempate por posición declarada), así que dos acciones
 * con el mismo `order` mantienen el orden en que el panel las escribió.
 */
export function orderHeaderActions<T extends HeaderActionLike>(actions: readonly T[]): T[] {
  return actions
    .map((action, index) => ({ action, index, order: effectiveOrder(action, index) }))
    .sort((a, b) => a.order - b.order || a.index - b.index)
    .map((entry) => entry.action)
}

/**
 * Mueve una acción a `toIndex` (reorden EN VIVO durante el drag).
 *
 * `orderedIds` es el orden ACTUAL del header (lo que hay en el DOM): el store
 * no puede derivarlo solo porque las acciones no viven en un registry global
 * como los botones de la activity bar. Renumera TODAS las acciones del header
 * (10, 20, 30…) para que el orden quede explícito y no dependa de los defaults.
 * Persiste y emite. No-op si el id no está o la posición no cambia.
 */
export function moveHeaderAction(
  id: string,
  toIndex: number,
  orderedIds: readonly string[]
): void {
  if (!orderedIds.includes(id)) return
  const rest = orderedIds.filter((candidate) => candidate !== id)
  const clamped = Math.max(0, Math.min(toIndex, rest.length))
  const next = [...rest.slice(0, clamped), id, ...rest.slice(clamped)]
  if (next.length === orderedIds.length && next.every((value, index) => value === orderedIds[index])) {
    return
  }
  next.forEach((candidate, index) => {
    overrides[candidate] = { order: (index + 1) * ORDER_STEP }
  })
  persist()
  emit()
}

/** Limpia los overrides (vuelve al orden declarado por cada panel). */
export function resetHeaderActions(): void {
  overrides = {}
  persist()
  emit()
}

/** Snapshot opaco para cancelar un drag (Escape restaura). */
export function snapshotHeaderActions(): string {
  return JSON.stringify(overrides)
}

/** Restaura un snapshot (solo si es válido). */
export function restoreHeaderActions(snapshot: string): void {
  try {
    const parsed: unknown = JSON.parse(snapshot)
    if (!parsed || typeof parsed !== 'object') return
    overrides = {}
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue
      const v = value as Partial<ActionOverride>
      if (typeof v.order === 'number' && Number.isFinite(v.order)) {
        overrides[id] = { order: v.order }
      }
    }
  } catch {
    return
  }
  persist()
  emit()
}

/** Solo tests: resetea memoria + listeners. */
export function _resetHeaderActionsForTests(): void {
  overrides = {}
  memoryFallback = '{}'
  listeners.clear()
  writeStorage('{}')
}
