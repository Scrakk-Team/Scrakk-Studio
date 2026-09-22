/**
 * Tests del resolver de drop del layout: un drop sobre un borde (split)
 * PARTE la hoja del árbol (estilo VS Code) creando un GRUPO REAL con su
 * propia barra de tabs, y mueve la tab arrastrada ahí. Nunca se duplica.
 * El resto de los drops delega en el resolver default.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { tabsStore, panelTab } from '../src/renderer/src/features/tabs/store'
import { splitTreeStore } from '../src/renderer/src/features/layout/splitTree'
import { layoutDropResolver } from '../src/renderer/src/features/layout/dropResolver'

beforeEach(() => {
  tabsStore.hydrate({})
  // Raíces por defecto: cada slot es una hoja (strip).
  splitTreeStore.hydrate(splitTreeStore.defaultRoots())
})

/** Hoja nueva del split (el lado que NO es el strip original). */
function newLeafStripId(originalStripId: string): string {
  const root = splitTreeStore.getRoot('right')
  if (!root || root.type !== 'split') throw new Error('no se partió el árbol')
  const leaf = root.children.find(
    (child) => child.type === 'leaf' && child.stripId !== originalStripId
  )
  if (!leaf || leaf.type !== 'leaf') throw new Error('sin hoja nueva')
  return leaf.stripId
}

describe('layoutDropResolver (grupos reales)', () => {
  it('borde derecho: parte el grupo y mueve la tab al grupo NUEVO (al final)', () => {
    tabsStore.spawnTab('right', panelTab('chat', 'Chat'))
    tabsStore.spawnTab('center', panelTab('history', 'Historial'))

    layoutDropResolver(
      { type: 'tab', stripId: 'center', tabId: 'panel:history' },
      { stripId: 'right', index: 0, split: 'right' }
    )

    // La tab salió del origen (no se duplica).
    expect(tabsStore.getStrip('center')!.tabs).toHaveLength(0)
    // El árbol de 'right' quedó partido en fila: [right, nuevo].
    const root = splitTreeStore.getRoot('right')!
    expect(root.type).toBe('split')
    if (root.type !== 'split') return
    expect(root.dir).toBe('row')
    expect(root.children[0]).toEqual({ type: 'leaf', stripId: 'right' })
    // La tab vive en la hoja nueva.
    const nueva = newLeafStripId('right')
    expect(tabsStore.getStrip(nueva)!.tabs.map((t) => t.id)).toEqual(['panel:history'])
    expect(tabsStore.getStrip(nueva)!.activeId).toBe('panel:history')
    // Ya no hay "contenido dividido" legacy.
    expect(tabsStore.getStrip('right')!.splitDir).toBeUndefined()
  })

  it('borde izquierdo: la hoja nueva va PRIMERO', () => {
    tabsStore.spawnTab('right', panelTab('chat', 'Chat'))
    tabsStore.spawnTab('center', panelTab('history', 'Historial'))

    layoutDropResolver(
      { type: 'tab', stripId: 'center', tabId: 'panel:history' },
      { stripId: 'right', index: 0, split: 'left' }
    )

    const root = splitTreeStore.getRoot('right')!
    if (root.type !== 'split') throw new Error('no se partió')
    expect(root.children[0].type).toBe('leaf')
    const first = root.children[0] as { type: 'leaf'; stripId: string }
    expect(first.stripId).not.toBe('right')
    expect(tabsStore.getStrip(first.stripId)!.tabs.map((t) => t.id)).toEqual(['panel:history'])
  })

  it('borde bottom: split column (apilado)', () => {
    tabsStore.spawnTab('right', panelTab('chat', 'Chat'))
    tabsStore.spawnTab('center', panelTab('history', 'Historial'))

    layoutDropResolver(
      { type: 'tab', stripId: 'center', tabId: 'panel:history' },
      { stripId: 'right', index: 0, split: 'bottom' }
    )

    const root = splitTreeStore.getRoot('right')!
    if (root.type !== 'split') throw new Error('no se partió')
    expect(root.dir).toBe('column')
  })

  it('si la tab ya vive en el grupo, se parte y se muda a la hoja nueva', () => {
    tabsStore.spawnTab('right', panelTab('chat', 'Chat'))
    tabsStore.spawnTab('right', panelTab('history', 'Historial'), { activate: false })

    layoutDropResolver(
      { type: 'tab', stripId: 'right', tabId: 'panel:chat' },
      { stripId: 'right', index: 0, split: 'right' }
    )

    const nueva = newLeafStripId('right')
    // La tab drageada se mudó al grupo nuevo; la otra quedó en el original.
    expect(tabsStore.getStrip(nueva)!.tabs.map((t) => t.id)).toEqual(['panel:chat'])
    expect(tabsStore.getStrip('right')!.tabs.map((t) => t.id)).toEqual(['panel:history'])
  })

  it('partir un grupo de una sola tab contra sí mismo es no-op', () => {
    tabsStore.spawnTab('right', panelTab('chat', 'Chat'))

    layoutDropResolver(
      { type: 'tab', stripId: 'right', tabId: 'panel:chat' },
      { stripId: 'right', index: 0, split: 'left' }
    )

    expect(tabsStore.getStrip('right')!.tabs.map((t) => t.id)).toEqual(['panel:chat'])
    expect(splitTreeStore.getRoot('right')).toEqual({ type: 'leaf', stripId: 'right' })
  })

  it('sin split delega en el resolver default (reorden en el mismo grupo)', () => {
    tabsStore.spawnTab('left', panelTab('explorer', 'Explorador'))
    tabsStore.spawnTab('left', panelTab('chat', 'Chat'), { activate: false })

    layoutDropResolver(
      { type: 'tab', stripId: 'left', tabId: 'panel:chat' },
      { stripId: 'left', index: 0 }
    )
    expect(tabsStore.getStrip('left')!.tabs.map((t) => t.id)).toEqual([
      'panel:chat',
      'panel:explorer'
    ])
    // El árbol no se toca.
    expect(splitTreeStore.getRoot('left')).toEqual({ type: 'leaf', stripId: 'left' })
  })

  it('no-op si la tab no existe', () => {
    tabsStore.spawnTab('right', panelTab('chat', 'Chat'))
    layoutDropResolver(
      { type: 'tab', stripId: 'left', tabId: 'ghost' },
      { stripId: 'right', index: 0, split: 'left' }
    )
    expect(tabsStore.getStrip('right')!.tabs.map((t) => t.id)).toEqual(['panel:chat'])
    expect(splitTreeStore.getRoot('right')).toEqual({ type: 'leaf', stripId: 'right' })
  })
})
