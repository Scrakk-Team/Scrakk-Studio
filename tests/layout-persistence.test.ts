/**
 * Tests de la persistencia del layout v2 y su migración desde el formato v1
 * (un `PanelId` por slot) guardado por versiones anteriores.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// Stub de localStorage ANTES de tocar el storage (los accesos son en runtime).
const mem = new Map<string, string>()
vi.stubGlobal('window', {
  localStorage: {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
    key: (i: number) => [...mem.keys()][i] ?? null,
    get length() {
      return mem.size
    }
  }
})

import { tabsStore } from '../src/renderer/src/features/tabs/store'
import {
  serializeSlots,
  parsePersistedSlots,
  isV2Layout,
  defaultSlots,
  MAIN_TERMINAL_SESSION,
  toStripId,
  migrateContentSplits
} from '../src/renderer/src/features/layout/persistence'
import type { StripState } from '../src/renderer/src/features/tabs/types'

const KEY = 'scrakk:layout.slots'

function setRaw(value: unknown): void {
  mem.set(KEY, JSON.stringify(value))
}

beforeEach(() => {
  mem.clear()
  tabsStore.hydrate({})
})

describe('layout v1 → v2 (migración)', () => {
  it('convierte slots de panel único en strips de una tab', () => {
    setRaw({ left: 'explorer', center: 'welcome', right: 'chat', bottom: 'innerta-terminal' })
    const slots = parsePersistedSlots()!
    // left: 1 tab panel
    expect(slots.left!.tabs.map((t) => t.kind)).toEqual(['panel'])
    expect(slots.left!.tabs[0].panelId).toBe('explorer')
    // center: welcome (el editor legacy se resuelve a bienvenida)
    expect(slots.center!.tabs[0].kind).toBe('welcome')
    // bottom: la terminal legacy pasa a ser sesión de terminal
    expect(slots.bottom!.tabs[0].kind).toBe('terminal')
    expect(slots.bottom!.tabs[0].sessionId).toBe(MAIN_TERMINAL_SESSION)
  })

  it('respeta slots ocultos (null) del formato v1', () => {
    setRaw({ left: null, center: null, right: 'chat', bottom: null })
    const slots = parsePersistedSlots()!
    expect(slots.left).toBeNull()
    // center null: se respeta (el usuario lo ocultó).
    expect(slots.center).toBeNull()
    expect(slots.right!.tabs[0].panelId).toBe('chat')
    // bottom null (oculto en v1) también se respeta.
    expect(slots.bottom).toBeNull()
  })

  it('serializa y deserializa multi-tab (round trip)', () => {
    const defaults = defaultSlots()
    // Centro con welcome + tab de panel + archivo.
    defaults.center!.tabs.push({ id: 'panel:clock', kind: 'panel', panelId: 'clock', label: 'Clock', closable: true })
    defaults.center!.activeId = 'panel:clock'
    // Bottom con terminal + chat (multi-tab).
    defaults.bottom!.tabs.push({ id: 'panel:chat', kind: 'panel', panelId: 'chat', label: 'Chat', closable: true })
    defaults.bottom!.activeId = 'panel:chat'

    const data = serializeSlots({ left: defaults.left!, center: defaults.center!, right: defaults.right!, bottom: defaults.bottom! })
    expect(isV2Layout(data)).toBe(true)

    setRaw(data)
    const parsed = parsePersistedSlots()!
    expect(parsed.left!.tabs.map((t) => t.id)).toEqual(['panel:explorer'])
    // Centro: welcome derivado + panel persistido; archivos NO se persisten (editorBus).
    expect(parsed.center!.tabs.map((t) => t.id)).toEqual(['welcome', 'panel:clock'])
    expect(parsed.center!.activeId).toBe('panel:clock')
    // Bottom multi-tab.
    expect(parsed.bottom!.tabs.map((t) => t.id)).toEqual(['term:main', 'panel:chat'])
    expect(parsed.bottom!.activeId).toBe('panel:chat')
  })

  it('stripId mapea slot → strip (helper)', () => {
    expect(toStripId('bottom')).toBe('bottom')
  })
})

describe('split del contenido (splitDir)', () => {
  it('round trip: splitDir sobrevive a serializar/parsear', () => {
    const defaults = defaultSlots()
    // Right con chat + historial divididos (row).
    defaults.right!.tabs.push({
      id: 'panel:history',
      kind: 'panel',
      panelId: 'history',
      label: 'Historial',
      closable: true
    })
    defaults.right!.activeId = 'panel:chat'
    defaults.right!.splitDir = 'row'

    const data = serializeSlots({
      left: defaults.left!,
      center: defaults.center!,
      right: defaults.right!,
      bottom: defaults.bottom!
    })
    setRaw(data)
    const parsed = parsePersistedSlots()!
    expect(parsed.right!.tabs.map((t) => t.id)).toEqual(['panel:chat', 'panel:history'])
    expect(parsed.right!.splitDir).toBe('row')
  })

  it('eleva el contenido dividido legacy a GRUPOS REALES del árbol', () => {
    // Estado del modelo viejo: un strip con `splitDir` (barra compartida,
    // un panel por tab).
    const slots: Record<string, StripState | null> = {
      right: {
        stripId: 'right',
        tabs: [
          { id: 'panel:chat', kind: 'panel', panelId: 'chat', label: 'Chat' },
          { id: 'term:main', kind: 'terminal', sessionId: 'main', label: 'Terminal' }
        ],
        activeId: 'term:main',
        splitDir: 'row'
      }
    }
    const tree = {
      left: null,
      center: null,
      right: { type: 'leaf' as const, stripId: 'right' },
      bottom: null
    }

    const { slots: migrated, tree: migratedTree, migrated: changed } = migrateContentSplits(
      slots,
      tree
    )
    expect(changed).toBe(true)
    // Dos grupos REALES: la primera tab en el primer lado, el resto en el otro.
    expect(migrated.right!.tabs.map((t) => t.id)).toEqual(['panel:chat'])
    expect(migrated['right:split-1']!.tabs.map((t) => t.id)).toEqual(['term:main'])
    expect(migrated['right:split-1']!.activeId).toBe('term:main')
    // El árbol quedó partido con la MISMA dirección.
    expect(migratedTree.right).toMatchObject({ type: 'split', dir: 'row' })
    // Ya no queda "contenido dividido" legacy.
    expect(migrated.right!.splitDir).toBeUndefined()

    // Idempotente: volver a migrar un árbol ya partido no cambia nada.
    const again = migrateContentSplits(migrated, migratedTree)
    expect(again.migrated).toBe(false)
    expect(again.tree.right).toEqual(migratedTree.right)
  })
})
