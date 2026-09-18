/**
 * Tests del resolver de drop del layout: un drop sobre un borde (split del
 * CONTENIDO) MUEVE la tab a la MISMA strip (la barra queda compartida,
 * Chat ⇄ Terminal) y marca el contenido como DIVIDIDO (`splitDir`): un panel
 * por tab. Nunca se duplica y nunca crea strips/árboles nuevos. El resto de
 * los drops delega en el resolver default.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { tabsStore, panelTab } from '../src/renderer/src/features/tabs/store'
import { layoutDropResolver } from '../src/renderer/src/features/layout/dropResolver'

beforeEach(() => {
  tabsStore.hydrate({})
})

describe('layoutDropResolver (split del contenido)', () => {
  it('borde izquierdo: mueve la tab a la MISMA strip (al inicio) y marca split row', () => {
    tabsStore.spawnTab('right', panelTab('chat', 'Chat'))
    tabsStore.spawnTab('center', panelTab('history', 'Historial'))

    layoutDropResolver(
      { type: 'tab', stripId: 'center', tabId: 'panel:history', label: 'Historial' },
      { stripId: 'right', index: 0, split: 'left' }
    )

    // La tab NO se duplica: salió del origen...
    expect(tabsStore.getStrip('center')!.tabs).toHaveLength(0)
    // ...y quedó en la MISMA strip (barra compartida), al inicio (lado nuevo
    // a la izquierda).
    const right = tabsStore.getStrip('right')!
    expect(right.tabs.map((t) => t.id)).toEqual(['panel:history', 'panel:chat'])
    expect(right.activeId).toBe('panel:history')
    // El contenido queda dividido: un panel por tab.
    expect(right.splitDir).toBe('row')
  })

  it('borde derecho: la tab se agrega al final y el split queda row', () => {
    tabsStore.spawnTab('right', panelTab('chat', 'Chat'))
    tabsStore.spawnTab('center', panelTab('history', 'Historial'))

    layoutDropResolver(
      { type: 'tab', stripId: 'center', tabId: 'panel:history' },
      { stripId: 'right', index: 0, split: 'right' }
    )

    const right = tabsStore.getStrip('right')!
    expect(right.tabs.map((t) => t.id)).toEqual(['panel:chat', 'panel:history'])
    expect(right.splitDir).toBe('row')
  })

  it('borde bottom: split column (apilado), la tab va al final', () => {
    tabsStore.spawnTab('right', panelTab('chat', 'Chat'))
    tabsStore.spawnTab('center', panelTab('history', 'Historial'))

    layoutDropResolver(
      { type: 'tab', stripId: 'center', tabId: 'panel:history' },
      { stripId: 'right', index: 0, split: 'bottom' }
    )

    const right = tabsStore.getStrip('right')!
    expect(right.tabs.map((t) => t.id)).toEqual(['panel:chat', 'panel:history'])
    expect(right.splitDir).toBe('column')
  })

  it('borde top: split column con la tab al inicio', () => {
    tabsStore.spawnTab('right', panelTab('chat', 'Chat'))
    tabsStore.spawnTab('center', panelTab('history', 'Historial'))

    layoutDropResolver(
      { type: 'tab', stripId: 'center', tabId: 'panel:history' },
      { stripId: 'right', index: 0, split: 'top' }
    )

    const right = tabsStore.getStrip('right')!
    expect(right.tabs.map((t) => t.id)).toEqual(['panel:history', 'panel:chat'])
    expect(right.splitDir).toBe('column')
  })

  it('si la tab ya vive en la strip, solo se reordena al lado y se marca split', () => {
    tabsStore.spawnTab('right', panelTab('chat', 'Chat'))
    tabsStore.spawnTab('right', panelTab('history', 'Historial'), { activate: false })

    layoutDropResolver(
      { type: 'tab', stripId: 'right', tabId: 'panel:chat' },
      { stripId: 'right', index: 0, split: 'right' }
    )

    const right = tabsStore.getStrip('right')!
    expect(right.tabs.map((t) => t.id)).toEqual(['panel:history', 'panel:chat'])
    expect(right.splitDir).toBe('row')
  })

  it('sin split delega en el resolver default (reorden en la misma strip)', () => {
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
    expect(tabsStore.getStrip('left')!.splitDir).toBeUndefined()
  })

  it('no-op si la tab no existe', () => {
    tabsStore.spawnTab('right', panelTab('chat', 'Chat'))
    layoutDropResolver(
      { type: 'tab', stripId: 'left', tabId: 'ghost' },
      { stripId: 'right', index: 0, split: 'left' }
    )
    const right = tabsStore.getStrip('right')!
    expect(right.tabs.map((t) => t.id)).toEqual(['panel:chat'])
    expect(right.splitDir).toBeUndefined()
  })

  it('un split sobre una strip ya dividida acumula (un panel más por tab)', () => {
    tabsStore.spawnTab('right', panelTab('chat', 'Chat'))
    tabsStore.spawnTab('center', panelTab('history', 'Historial'))
    tabsStore.spawnTab('bottom', panelTab('explorer', 'Explorador'))

    layoutDropResolver(
      { type: 'tab', stripId: 'center', tabId: 'panel:history' },
      { stripId: 'right', index: 0, split: 'right' }
    )
    layoutDropResolver(
      { type: 'tab', stripId: 'bottom', tabId: 'panel:explorer' },
      { stripId: 'right', index: 0, split: 'right' }
    )

    const right = tabsStore.getStrip('right')!
    expect(right.tabs.map((t) => t.id)).toEqual([
      'panel:chat',
      'panel:history',
      'panel:explorer'
    ])
    expect(right.splitDir).toBe('row')
    expect(tabsStore.getStrip('center')!.tabs).toHaveLength(0)
    expect(tabsStore.getStrip('bottom')!.tabs).toHaveLength(0)
  })
})
