// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Layout de la activity bar — overrides de lado/orden por botón.
 *
 * Los botones se declaran en `buttons/<id>/index.ts` (lado y orden default)
 * o los aportan extensiones; ESTE módulo guarda lo que el usuario cambió
 * drageando (persistido en localStorage). Sin overrides, todo es default.
 *
 * Patrón idéntico al resto de stores: Map + Set<Listener> + emit().
 */

import { ExtensionRegistry } from '@services/extensions'
import { activityBarButtons } from './registry'
import type { ActivityBarButton, ActivityBarSide } from './types'

export interface ButtonOverride {
  side: ButtonSide
  order: number
}

/**
 * Lados posibles de un botón: las dos barras laterales o el ToolDock
 * (dock horizontal flotante que cualquier panel puede montar). El valor
 * 'toolDock' solo lo consumen el ToolDock y el drag (la ActivityBar nunca
 * lista botones con side 'toolDock').
 */
export type ButtonSide = ActivityBarSide | 'toolDock'

const STORAGE_KEY = 'scrakk-studio:activitybar-layout'
const ORDER_STEP = 10

type Listener = () => void

let overrides: Record<string, ButtonOverride> = {}
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
        const v = value as Partial<ButtonOverride>
        if (
          (v.side === 'left' || v.side === 'right' || v.side === 'toolDock') &&
          typeof v.order === 'number'
        ) {
          overrides[id] = { side: v.side, order: v.order }
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

export function subscribeToButtonLayout(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Todos los botones conocidos (builtin + extensiones). */
export function allActivityButtons(): ActivityBarButton[] {
  return [...activityBarButtons, ...ExtensionRegistry.getActivityButtons()]
}

function effectiveOf(button: ActivityBarButton): { side: ButtonSide; order: number } {
  const override = overrides[button.id]
  return {
    side: override?.side ?? button.side,
    order: override?.order ?? button.order ?? 0
  }
}

/** Botones de un lado con overrides aplicados, ordenados. */
export function getOrderedButtons(side: ActivityBarSide): ActivityBarButton[] {
  return allActivityButtons()
    .filter((button) => effectiveOf(button).side === side)
    .sort((a, b) => effectiveOf(a).order - effectiveOf(b).order)
}

/** Botones dockeados en el ToolDock (side override = 'toolDock'), ordenados. */
export function getToolDockedButtons(): ActivityBarButton[] {
  return allActivityButtons()
    .filter((button) => effectiveOf(button).side === 'toolDock')
    .sort((a, b) => effectiveOf(a).order - effectiveOf(b).order)
}

/** Posición efectiva actual de un botón (lado + índice). Null si no existe. */
export function buttonPosition(id: string): { side: ButtonSide; index: number } | null {
  const docked = getToolDockedButtons().findIndex((button) => button.id === id)
  if (docked !== -1) return { side: 'toolDock', index: docked }
  for (const side of ['left', 'right'] as ActivityBarSide[]) {
    const index = getOrderedButtons(side).findIndex((button) => button.id === id)
    if (index !== -1) return { side, index }
  }
  return null
}

/**
 * Mueve un botón (reorden en vivo durante el drag): lo saca de su lado y lo
 * inserta en `toIndex` de `toSide`, renumerando los lados afectados
 * (10, 20, 30…). Persiste y emite. No-op si no cambia nada o el id no existe.
 */
export function moveButton(id: string, toSide: ButtonSide, toIndex: number): void {
  const left = getOrderedButtons('left').filter((button) => button.id !== id)
  const right = getOrderedButtons('right').filter((button) => button.id !== id)
  const dock = getToolDockedButtons().filter((button) => button.id !== id)
  const moving =
    getOrderedButtons('left').find((button) => button.id === id) ??
    getOrderedButtons('right').find((button) => button.id === id) ??
    getToolDockedButtons().find((button) => button.id === id)
  if (!moving) return

  const target = toSide === 'left' ? left : toSide === 'right' ? right : dock
  const clamped = Math.max(0, Math.min(toIndex, target.length))
  const current = buttonPosition(id)
  if (current && current.side === toSide && current.index === clamped) return

  target.splice(clamped, 0, moving)
  // Renumera cada lado con su lado real.
  const applySide = (side: ButtonSide, list: ActivityBarButton[]): void => {
    list.forEach((button, index) => {
      overrides[button.id] = { side, order: (index + 1) * ORDER_STEP }
    })
  }
  applySide('left', toSide === 'left' ? target : left)
  applySide('right', toSide === 'right' ? target : right)
  applySide('toolDock', toSide === 'toolDock' ? target : dock)
  persist()
  emit()
}

/** Limpia los overrides (vuelve al layout declarado). */
export function resetButtonLayout(): void {
  overrides = {}
  persist()
  emit()
}

/** Solo tests: resetea memoria + listeners. */
export function _resetButtonLayoutForTests(): void {
  overrides = {}
  memoryFallback = '{}'
  listeners.clear()
  writeStorage('{}')
}

/** Snapshot opaco para cancelar un drag (Escape restaura). */
export function snapshotButtonLayout(): string {
  return JSON.stringify(overrides)
}

/** Restaura un snapshot (solo si es válido). */
export function restoreButtonLayout(snapshot: string): void {
  try {
    const parsed: unknown = JSON.parse(snapshot)
    if (!parsed || typeof parsed !== 'object') return
    overrides = {}
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue
      const v = value as Partial<ButtonOverride>
      if (
        (v.side === 'left' || v.side === 'right' || v.side === 'toolDock') &&
        typeof v.order === 'number'
      ) {
        overrides[id] = { side: v.side, order: v.order }
      }
    }
  } catch {
    return
  }
  persist()
  emit()
}
