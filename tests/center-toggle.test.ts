/**
 * Repro del bug: ocultar el slot central con un archivo abierto no funciona
 * — reconcileFileTabs lo revivía al instante (pisaba centerSuppressed).
 *
 * Se mockea el editorBus (vi.mock) para no arrastrar el engine Innerta.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

const openFilesState = new Map<string, string>()

vi.mock('@features/editor/editorBus', () => {
  const listeners = new Set<() => void>()
  return {
    openFileInEditor: vi.fn((path: string, name: string) => {
      openFilesState.set(path, name)
      for (const l of listeners) l()
    }),
    closeFile: vi.fn((path: string) => {
      openFilesState.delete(path)
      for (const l of listeners) l()
    }),
    getEditorFiles: vi.fn(() => ({
      openFiles: [...openFilesState.entries()].map(([path, name]) => ({ path, name })),
      activePath: [...openFilesState.keys()][0] ?? null
    })),
    subscribeToEditorFiles: vi.fn((l: () => void) => {
      listeners.add(l)
      return () => listeners.delete(l)
    }),
    clearActiveFile: vi.fn(),
    activateFile: vi.fn(),
    reorderOpenFilesTo: vi.fn()
  }
})

// Mock del fileSession/terminalSession (destructores no relevantes acá).
vi.mock('@features/editor/fileSession', () => ({ destroyFileSession: vi.fn() }))
vi.mock('@services/innerta/terminalSession', () => ({ destroyTerminalSession: vi.fn() }))
// El barrel @features/editor arrastra Innerta (WASM/__APP_VERSION__): fuera.
vi.mock('@features/editor', () => ({
  EditorPanel: vi.fn(),
  createEditorEngine: vi.fn(() => null),
  getStoredEngine: vi.fn(() => 'innerta'),
  EDITOR_ENGINE_STORAGE_KEY: 'x',
  FileTabView: vi.fn(),
  InnertaEngine: vi.fn(),
  openFileInEditor: vi.fn()
}))

// Mock del dnd (usa window en el import — irrelevante para este repro).
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
import { tabsStore } from '@features/tabs'
import { openFileInEditor } from '@features/editor/editorBus'
import {
  setSlotPanel,
  reconcileFileTabs,
  isCenterSuppressed,
  showCenter
} from '@features/layout/actions'

beforeEach(() => {
  openFilesState.clear()
  for (const slot of ['left', 'center', 'right', 'bottom'] as const) {
    for (const leaf of splitTreeStore.leavesOf(slot)) splitTreeStore.removeStrip(leaf)
  }
  showCenter()
})

describe('toggle slot central', () => {
  it('setSlotPanel(center, null) oculta el centro y QUEDA oculto (con archivo abierto)', () => {
    showCenter()
    openFileInEditor('/tmp/App.tsx', 'App.tsx')
    reconcileFileTabs()
    expect(splitTreeStore.isSlotOpen('center')).toBe(true)

    // Toggle off (LayoutToggles → setSlotPanel(slot, null)).
    setSlotPanel('center', null)
    expect(isCenterSuppressed()).toBe(true)
    expect(splitTreeStore.isSlotOpen('center')).toBe(false)

    // El reconcile que dispara el editorBus NO debe revivir el centro.
    reconcileFileTabs()
    expect(splitTreeStore.isSlotOpen('center')).toBe(false)

    // Toggle on vuelve a mostrarlo.
    setSlotPanel('center', 'welcome')
    expect(splitTreeStore.isSlotOpen('center')).toBe(true)
  })

  it('emisiones del editorBus no reviven el centro oculto', () => {
    showCenter()
    openFileInEditor('/tmp/index.ts', 'index.ts')
    reconcileFileTabs()

    setSlotPanel('center', null)
    // Re-open (ya abierta): solo dispara emit del bus → reconcile.
    openFileInEditor('/tmp/index.ts', 'index.ts')
    expect(splitTreeStore.isSlotOpen('center')).toBe(false)
  })

  it('mostrar de nuevo restaura el centro (no queda zombie)', () => {
    showCenter()
    openFileInEditor('/tmp/a.ts', 'a.ts')
    reconcileFileTabs()
    setSlotPanel('center', null)
    showCenter()
    expect(splitTreeStore.isSlotOpen('center')).toBe(true)
    expect(tabsStore.getStrip('center')?.tabs.some((t) => t.kind === 'welcome')).toBe(true)
  })
})
