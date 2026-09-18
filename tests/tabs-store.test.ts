/**
 * Tests del sistema de tabs — tabsStore (spawn / close / activate / reorder
 * / move entre strips) y los helpers de specs.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { tabsStore, fileTab, panelTab, terminalTab, welcomeTab } from '../src/renderer/src/features/tabs/store'

describe('tabsStore — spawn/close/activate', () => {
  beforeEach(() => {
    tabsStore.hydrate({})
  })

  it('spawnea tabs y activa la última por defecto', () => {
    tabsStore.spawnTab('left', panelTab('explorer', 'Explorador'))
    tabsStore.spawnTab('left', terminalTab('main', 'Terminal'))
    const strip = tabsStore.getStrip('left')!
    expect(strip.tabs.map((t) => t.id)).toEqual(['panel:explorer', 'term:main'])
    expect(strip.activeId).toBe('term:main')
  })

  it('no duplica tabs con el mismo id (solo activa)', () => {
    tabsStore.spawnTab('center', welcomeTab())
    tabsStore.spawnTab('center', fileTab('/a.ts', 'a.ts'))
    tabsStore.spawnTab('center', fileTab('/a.ts', 'a.ts'))
    const strip = tabsStore.getStrip('center')!
    expect(strip.tabs).toHaveLength(2)
    expect(strip.activeId).toBe('file:/a.ts')
  })

  it('cierra la tab y activa el vecino', () => {
    tabsStore.spawnTab('center', welcomeTab())
    tabsStore.spawnTab('center', fileTab('/a.ts', 'a.ts'), { activate: false })
    tabsStore.spawnTab('center', fileTab('/b.ts', 'b.ts'), { activate: false })
    const removed = tabsStore.closeTab('center', 'file:/a.ts')
    expect(removed?.filePath).toBe('/a.ts')
    const strip = tabsStore.getStrip('center')!
    expect(strip.tabs.map((t) => t.id)).toEqual(['welcome', 'file:/b.ts'])
    // El activo era file:/b.ts (spawneado con activate:false queda en el welcome,
    // que es el primero tras cerrar el activo? en realidad el activo es welcome).
    expect(strip.activeId).toBe('welcome')
  })

  it('cierra el activo y activa el siguiente archivo (semántica editor)', () => {
    tabsStore.spawnTab('center', fileTab('/a.ts', 'a.ts'))
    tabsStore.spawnTab('center', fileTab('/b.ts', 'b.ts'), { activate: false })
    tabsStore.closeTab('center', 'file:/a.ts')
    const strip = tabsStore.getStrip('center')!
    expect(strip.activeId).toBe('file:/b.ts')
  })
})

describe('tabsStore — reorder y move entre strips', () => {
  beforeEach(() => {
    tabsStore.hydrate({})
  })

  it('reorderTab usa POSICIÓN FINAL (0 = primera)', () => {
    tabsStore.spawnTab('center', fileTab('/a.ts', 'a.ts'))
    tabsStore.spawnTab('center', fileTab('/b.ts', 'b.ts'), { activate: false })
    tabsStore.spawnTab('center', fileTab('/c.ts', 'c.ts'), { activate: false })
    // Mueve c.ts al frente.
    tabsStore.reorderTab('center', 2, 0)
    const strip = tabsStore.getStrip('center')!
    expect(strip.tabs.map((t) => t.id)).toEqual(['file:/c.ts', 'file:/a.ts', 'file:/b.ts'])
  })

  it('moveTabToStrip mueve la tab (no duplica) y la activa en destino', () => {
    tabsStore.spawnTab('left', panelTab('explorer', 'Explorador'))
    tabsStore.spawnTab('right', panelTab('chat', 'Chat'))
    const ok = tabsStore.moveTabToStrip('left', 'panel:explorer', 'right', 0)
    expect(ok).toBe(true)
    expect(tabsStore.getStrip('left')!.tabs).toHaveLength(0)
    const right = tabsStore.getStrip('right')!
    expect(right.tabs.map((t) => t.id)).toEqual(['panel:explorer', 'panel:chat'])
    expect(right.activeId).toBe('panel:explorer')
  })

  it('findTab localiza una tab en cualquier strip', () => {
    tabsStore.spawnTab('bottom', terminalTab('main', 'Terminal'))
    tabsStore.spawnTab('center', fileTab('/x.ts', 'x.ts'))
    expect(tabsStore.findTab('term:main')?.stripId).toBe('bottom')
    expect(tabsStore.findTab('file:/x.ts')?.stripId).toBe('center')
    expect(tabsStore.findTab('nope')).toBeNull()
  })
})

describe('helpers de specs', () => {
  it('fileTab/panelTab/terminalTab/welcomeTab construyen specs correctos', () => {
    const f = fileTab('/a/b.ts', 'b.ts')
    expect(f).toMatchObject({ id: 'file:/a/b.ts', kind: 'file', filePath: '/a/b.ts', label: 'b.ts', closable: true })
    const p = panelTab('chat')
    expect(p).toMatchObject({ id: 'panel:chat', kind: 'panel', panelId: 'chat' })
    const t = terminalTab('main')
    expect(t).toMatchObject({ id: 'term:main', kind: 'terminal', sessionId: 'main', label: 'Terminal' })
    const w = welcomeTab()
    expect(w.fixed).toBe(true)
    expect(w.closable).toBe(false)
  })
})
