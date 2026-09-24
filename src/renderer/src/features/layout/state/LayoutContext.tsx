// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react'
import { tabsStore } from '@features/tabs'
import type { TabSpec } from '@features/tabs'
import { bootLayoutStrips, persistLayoutSnapshot } from '../persistence'
import { splitTreeStore } from '../splitTree'
import {
  openPanelTab,
  openTerminalTab,
  reconcileFileTabs,
  setSlotPanel as legacySetSlotPanel,
  toggleSlotPanel as legacyToggleSlotPanel,
  activateTabSmart,
  closeTabSmart
} from '../actions'
import { installLayoutDropResolver } from '../dropResolver'
import { preloadAllPanels } from '../registry'
import type { PanelId, SlotId } from '../types'

import { installDragHeaderDetection } from '@features/dnd'

// Persistencia DEBOUNCEADA (trailing 200ms) a nivel módulo — no dentro del
// efecto — para poder forzarla con flushLayoutPersist() al soltar un resize
// ghost (un solo write inmediato en vez de ~60/s durante el drag; antes el
// debounce solo existía porque cada pointermove emitía al store).
let persistTimer: ReturnType<typeof setTimeout> | null = null

function schedulePersist(): void {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persistTimer = null
    persistLayoutSnapshot()
  }, 200)
}

function cancelScheduledPersist(): void {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = null
}

/**
 * Escribe el snapshot AHORA y cancela el trailing pendiente (evita el doble
 * write). Lo llama el commit de un resize ghost: corrige la pérdida si se
 * cierra la app <200ms tras soltar.
 */
export function flushLayoutPersist(): void {
  cancelScheduledPersist()
  persistLayoutSnapshot()
}

// Boot UNA vez (módulo): hidrata los strips + el árbol de splits desde
// storage (con migración v1→v2→v3), instala el resolver del layout (mover/
// reordenar tabs + splits direccionales) y el detector global de headers
// drageables ([data-drag-header]).
{
  const g = globalThis as unknown as { __boreal_layout_booted__?: boolean }
  if (!g.__boreal_layout_booted__) {
    bootLayoutStrips()
    installLayoutDropResolver()
    installDragHeaderDetection()
    g.__boreal_layout_booted__ = true
  }
}

export type LayoutSlots = Record<SlotId, PanelId | null>

interface LayoutContextValue {
  /** Proyección LEGACY: panel representativo de la tab activa por slot
   *  ('welcome' | 'editor' | panelId). null = slot vacío/oculto. */
  slots: LayoutSlots
  /** LEGACY: monta/desmonta paneles como antes (un panel por slot). */
  setSlotPanel: (slot: SlotId, panelId: PanelId | null) => void
  /** LEGACY: alterna un panel en un slot. */
  toggleSlotPanel: (slot: SlotId, panelId: PanelId) => void
  /** API nueva: abre (spawnea o activa) la tab de un panel en un slot. */
  openPanelTab: (slot: SlotId, panelId: PanelId) => void
  /** API nueva: abre (spawnea o activa) una terminal viva en un slot. */
  openTerminalTab: (slot: SlotId) => void
  /** Tab activa de un slot (para render, si la necesitan). */
  getActiveTab: (slot: SlotId) => TabSpec | null
  /** ¿El slot está visible (strip existe, aunque esté vacío)? */
  isSlotOpen: (slot: SlotId) => boolean
}

const LayoutContext = (() => {
  const g = globalThis as unknown as { __boreal_layout_context__?: ReturnType<typeof createContext<LayoutContextValue | null>> }
  if (g.__boreal_layout_context__) return g.__boreal_layout_context__
  const ctx = createContext<LayoutContextValue | null>(null)
  g.__boreal_layout_context__ = ctx
  return ctx
})()

/** Proyección legacy de un strip → PanelId representativo. */
function projectTab(tab: TabSpec | null | undefined): PanelId | null {
  if (!tab) return null
  switch (tab.kind) {
    case 'welcome':
      return 'welcome'
    case 'file':
      return 'editor'
    case 'terminal':
      return 'innerta-terminal'
    case 'panel':
      return tab.panelId ?? null
    case 'explorer':
      return 'explorer'
  }
}

function computeLegacySlots(): LayoutSlots {
  const slots: LayoutSlots = { left: null, center: null, right: null, bottom: null }
  for (const slot of ['left', 'center', 'right', 'bottom'] as SlotId[]) {
    // La tab representativa del slot = la activa de su PRIMERA hoja viva
    // (el slot puede estar partido en splits).
    const stripId = splitTreeStore.firstLeafOf(slot)
    const strip = stripId ? tabsStore.getStrip(stripId) : null
    const active = strip?.tabs.find((t) => t.id === strip.activeId)
    slots[slot] = projectTab(active)
  }
  return slots
}

export function LayoutProvider({ children }: { children: ReactNode }) {
  // Re-render ante cada mutación del tabsStore o del árbol de splits +
  // persistencia del layout v3 (strips + árbol).
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const unsubTabs = tabsStore.subscribe(() => {
      setTick((t) => t + 1)
      schedulePersist()
    })
    const unsubTree = splitTreeStore.subscribe(() => {
      setTick((t) => t + 1)
      schedulePersist()
    })
    return () => {
      unsubTabs()
      unsubTree()
      cancelScheduledPersist()
    }
  }, [])
  void tick

  // PRECARGA de paneles en IDLE (después del primer paint). En Electron los
  // chunks son archivos locales, así que calentarlos no cuesta red y la
  // primera apertura de CUALQUIER panel pasa a ser un cache hit (sin fallback
  // de carga). Se puede abrir un panel antes de que termine el idle: para eso
  // los botones de la activity bar precalientan también en hover.
  useEffect(() => {
    const run = (): void => preloadAllPanels()
    const idle = (
      globalThis as {
        requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
        cancelIdleCallback?: (handle: number) => void
      }
    ).requestIdleCallback
    if (typeof idle === 'function') {
      const handle = idle(run, { timeout: 3000 })
      return () => {
        ;(globalThis as { cancelIdleCallback?: (handle: number) => void }).cancelIdleCallback?.(handle)
      }
    }
    // Sin requestIdleCallback: un timer corto tras el arranque.
    const timer = setTimeout(run, 1500)
    return () => clearTimeout(timer)
  }, [])

  const setSlotPanel = useCallback((slot: SlotId, panelId: PanelId | null): void => {
    legacySetSlotPanel(slot, panelId)
    reconcileFileTabs()
  }, [])

  const toggleSlotPanel = useCallback((slot: SlotId, panelId: PanelId): void => {
    legacyToggleSlotPanel(slot, panelId)
  }, [])

  const openPanelTabCb = useCallback((slot: SlotId, panelId: PanelId): void => {
    openPanelTab(slot, panelId)
  }, [])

  const openTerminalTabCb = useCallback((slot: SlotId): void => {
    openTerminalTab(slot)
  }, [])

  const isSlotOpenCb = useCallback((slot: SlotId): boolean => {
    return splitTreeStore.isSlotOpen(slot)
  }, [])

  const value = useMemo<LayoutContextValue>(() => {
    return {
      slots: computeLegacySlots(),
      setSlotPanel,
      toggleSlotPanel,
      openPanelTab: openPanelTabCb,
      openTerminalTab: openTerminalTabCb,
      getActiveTab(slot) {
        const strip = tabsStore.getStrip(slot)
        if (!strip) return null
        return strip.tabs.find((t) => t.id === strip.activeId) ?? null
      },
      isSlotOpen: isSlotOpenCb
    }
  }, [tick, setSlotPanel, toggleSlotPanel, openPanelTabCb, openTerminalTabCb, isSlotOpenCb])

  return <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>
}

export function useLayout(): LayoutContextValue {
  const context = useContext(LayoutContext)
  if (!context) {
    throw new Error('useLayout debe usarse dentro de <LayoutProvider>')
  }
  return context
}

export { activateTabSmart, closeTabSmart }
