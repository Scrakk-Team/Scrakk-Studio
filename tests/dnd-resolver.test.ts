/**
 * Tests del resolver de drop del sistema dnd: un drag de tab que aterriza en
 * un strip se reordena (misma strip) o se mueve (otra strip), sin duplicar.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { tabsStore, panelTab, terminalTab } from '../src/renderer/src/features/tabs/store'
import { defaultDropResolver } from '../src/renderer/src/features/dnd/resolver'

beforeEach(() => {
  tabsStore.hydrate({})
})

describe('defaultDropResolver', () => {
  it('reordena dentro de la misma strip a la posición final del indicador', () => {
    tabsStore.spawnTab('left', panelTab('explorer', 'Explorador'))
    tabsStore.spawnTab('left', panelTab('chat', 'Chat'), { activate: false })
    tabsStore.spawnTab('left', panelTab('history', 'Historial'), { activate: false })

    defaultDropResolver(
      { type: 'tab', stripId: 'left', tabId: 'panel:history' },
      { stripId: 'left', index: 0 }
    )
    const strip = tabsStore.getStrip('left')!
    expect(strip.tabs.map((t) => t.id)).toEqual(['panel:history', 'panel:explorer', 'panel:chat'])
  })

  it('mueve la tab a otra strip en la posición indicada', () => {
    tabsStore.spawnTab('bottom', terminalTab('main', 'Terminal'))
    tabsStore.spawnTab('center', panelTab('chat', 'Chat'), { activate: false })

    defaultDropResolver(
      { type: 'tab', stripId: 'bottom', tabId: 'term:main', label: 'Terminal' },
      { stripId: 'center', index: 0 }
    )
    expect(tabsStore.getStrip('bottom')!.tabs).toHaveLength(0)
    const center = tabsStore.getStrip('center')!
    expect(center.tabs.map((t) => t.id)).toEqual(['term:main', 'panel:chat'])
    expect(center.activeId).toBe('term:main')
  })

  it('drop sobre un slot en modo frame (append) deja [original, drageada]', () => {
    // Slot derecho con UNA tab (modo frame): el target append reporta
    // index = tabs.length, o sea la terminal se agrega DESPUÉS del chat.
    tabsStore.spawnTab('right', panelTab('chat', 'Chat'))
    tabsStore.spawnTab('bottom', terminalTab('main', 'Terminal'))

    defaultDropResolver(
      { type: 'tab', stripId: 'bottom', tabId: 'term:main', label: 'Terminal' },
      { stripId: 'right', index: 1 }
    )
    const right = tabsStore.getStrip('right')!
    expect(right.tabs.map((t) => t.id)).toEqual(['panel:chat', 'term:main'])
    expect(right.activeId).toBe('term:main')
  })

  it('usa la posición REAL de la tab como origen, no el stripId stale del payload', () => {
    // La tab ya vive en 'center' (p.ej. tras un drag previo); el payload
    // genérico de un header trae un stripId viejo → no debe importar.
    tabsStore.spawnTab('center', panelTab('explorer', 'Explorador'))
    tabsStore.spawnTab('left', panelTab('history', 'Historial'), { activate: false })

    defaultDropResolver(
      { type: 'tab', stripId: 'bottom', tabId: 'panel:explorer' },
      { stripId: 'left', index: 1 }
    )
    const center = tabsStore.getStrip('center')!
    expect(center.tabs.map((t) => t.id)).toEqual([])
    const left = tabsStore.getStrip('left')!
    expect(left.tabs.map((t) => t.id)).toEqual(['panel:history', 'panel:explorer'])
    expect(left.activeId).toBe('panel:explorer')
  })

  it('no-op si la tab no existe (drag fantasma)', () => {
    tabsStore.spawnTab('right', panelTab('chat', 'Chat'))
    defaultDropResolver(
      { type: 'tab', stripId: 'left', tabId: 'ghost' },
      { stripId: 'right', index: 0 }
    )
    expect(tabsStore.getStrip('right')!.tabs).toHaveLength(1)
  })
})
