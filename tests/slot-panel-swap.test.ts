// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tests del toggle de un panel lateral (botón de la activity bar): abrir otro
 * panel REEMPLAZA el que se está viendo, no apila una tab nueva.
 *
 * Mismos mocks que center-toggle.test.ts: las acciones del layout arrastran el
 * editor (Innerta/WASM) y el dnd (usa window en el import).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@features/editor/editorBus', () => {
  const listeners = new Set<() => void>()
  return {
    openFileInEditor: vi.fn(() => {
      for (const l of listeners) l()
    }),
    closeFile: vi.fn(),
    getEditorFiles: vi.fn(() => ({ openFiles: [], activePath: null })),
    subscribeToEditorFiles: vi.fn((l: () => void) => {
      listeners.add(l)
      return () => listeners.delete(l)
    }),
    clearActiveFile: vi.fn(),
    activateFile: vi.fn(),
    reorderOpenFilesTo: vi.fn()
  }
})

vi.mock('@features/editor/fileSession', () => ({ destroyFileSession: vi.fn() }))
vi.mock('@services/innerta/terminalSession', () => ({ destroyTerminalSession: vi.fn() }))
vi.mock('@features/editor', () => ({
  EditorPanel: vi.fn(),
  createEditorEngine: vi.fn(() => null),
  getStoredEngine: vi.fn(() => 'innerta'),
  EDITOR_ENGINE_STORAGE_KEY: 'x',
  FileTabView: vi.fn(),
  InnertaEngine: vi.fn(),
  openFileInEditor: vi.fn()
}))
vi.mock('@features/dnd', () => ({
  dndStore: { on: vi.fn(), off: vi.fn(), setTarget: vi.fn(), setResolver: vi.fn(), state: () => null },
  installDragHeaderDetection: vi.fn(),
  useDndState: vi.fn(() => ({ phase: 'idle', payload: null, target: null })),
  useDropZone: vi.fn(() => ({ ref: vi.fn() })),
  defaultDropResolver: vi.fn(),
  installDefaultDropResolver: vi.fn(),
  DragGhost: vi.fn(),
  SplitOverlay: vi.fn()
}))

import { splitTreeStore } from '@features/layout/splitTree'
import { panelTab, tabsStore, terminalTab } from '@features/tabs'
import { toggleSlotPanel } from '@features/layout/actions'
import { destroyTerminalSession } from '@services/innerta/terminalSession'

/** Ids de las tabs del strip del slot (en orden). */
function tabIds(slot: 'left' | 'right' | 'bottom'): string[] {
  return tabsStore.getStrip(slot)?.tabs.map((t) => t.id) ?? []
}

beforeEach(() => {
  vi.mocked(destroyTerminalSession).mockClear()
  // Los dos stores son singletons de módulo: se limpian los dos (si no, las
  // tabs de un test se filtran al siguiente).
  for (const stripId of Object.keys(tabsStore.getAll())) tabsStore.removeStrip(stripId)
  for (const slot of ['left', 'center', 'right', 'bottom'] as const) {
    for (const leaf of splitTreeStore.leavesOf(slot)) splitTreeStore.removeStrip(leaf)
  }
})

describe('toggle de panel lateral — un panel por slot', () => {
  it('abrir otro panel REEMPLAZA el que se está viendo (no apila tabs)', () => {
    toggleSlotPanel('left', 'explorer')
    expect(tabIds('left')).toEqual(['panel:explorer'])

    toggleSlotPanel('left', 'search')
    expect(tabIds('left')).toEqual(['panel:search'])
    expect(splitTreeStore.firstLeafOf('left')).toBe('left')
    const strip = tabsStore.getStrip('left')
    expect(strip?.activeId).toBe('panel:search')
    // Y no apareció la presentación de tabs: una sola tab.
    expect(strip?.tabs).toHaveLength(1)
  })

  it('reemplaza en el MISMO índice cuando el panel convive con otra tab', () => {
    // Stack armado a mano por el usuario (drag): [explorer, search, notes]
    // con search activa. `ensureRoot` es lo que hacen las acciones al abrir.
    splitTreeStore.ensureRoot('left')
    tabsStore.spawnTab('left', panelTab('explorer', 'Explorador'))
    tabsStore.spawnTab('left', panelTab('search', 'Búsqueda'))
    tabsStore.spawnTab('left', panelTab('notes', 'Notas'))
    tabsStore.activateTab('left', 'panel:search')
    expect(tabIds('left')).toEqual(['panel:explorer', 'panel:search', 'panel:notes'])

    toggleSlotPanel('left', 'git')
    // git ocupa el lugar de search (índice 1), no el final.
    expect(tabIds('left')).toEqual(['panel:explorer', 'panel:git', 'panel:notes'])
    expect(tabsStore.getStrip('left')?.activeId).toBe('panel:git')
  })

  it('el botón del panel abierto lo CIERRA (y si era la única, oculta el slot)', () => {
    toggleSlotPanel('left', 'explorer')
    expect(splitTreeStore.isSlotOpen('left')).toBe(true)
    toggleSlotPanel('left', 'explorer')
    expect(tabIds('left')).toEqual([])
    expect(splitTreeStore.isSlotOpen('left')).toBe(false)
  })

  it('no destruye una TERMINAL viva: si la activa no es un panel, se apila', () => {
    splitTreeStore.ensureRoot('right')
    const terminal = terminalTab('main', 'Terminal')
    tabsStore.spawnTab('right', terminal)
    tabsStore.activateTab('right', terminal.id)
    toggleSlotPanel('right', 'git')
    expect(tabIds('right')).toEqual([terminal.id, 'panel:git'])
    expect(destroyTerminalSession).not.toHaveBeenCalled()
  })

  it('reemplaza un panel aunque la tab activa sea otra tab de panel del split', () => {
    toggleSlotPanel('right', 'chat')
    toggleSlotPanel('right', 'git')
    expect(tabIds('right')).toEqual(['panel:git'])
  })
})
