/**
 * Tests del cargador de paneles: cache, dedupe de descargas, preload y error.
 *
 * Es lo que reemplaza a `React.lazy`/`Suspense` (que dejaba el panel colgado
 * en "Cargando panel…"): si esto cumple el contrato, PanelHost monta el panel
 * cuando la promesa resuelve y nunca se queda esperando.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ComponentType } from 'react'
import {
  loadPanelComponent,
  loadedPanel,
  preloadPanelEntry,
  preloadPanelsLazily,
  _resetPanelModulesForTests
} from '../src/renderer/src/features/layout/components/PanelHost/panelModules'
import type { PanelEntry } from '../src/renderer/src/features/layout/types'

function fakeComponent(name: string): ComponentType {
  const Component = (): null => null
  Component.displayName = name
  return Component
}

beforeEach(() => {
  _resetPanelModulesForTests()
})

describe('panelModules — carga y cache', () => {
  it('resuelve el componente y lo deja cacheado', async () => {
    const Component = fakeComponent('Git')
    const load = vi.fn(async () => Component)
    const entry: PanelEntry = { id: 'git', title: 'Git', load }

    expect(loadedPanel('git')).toBeNull()
    await expect(loadPanelComponent(entry)).resolves.toBe(Component)
    expect(loadedPanel('git')).toBe(Component)
    // Segunda apertura: cache hit, sin volver a pedir el módulo.
    await loadPanelComponent(entry)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('deduplica dos montajes simultáneos del mismo panel', async () => {
    const Component = fakeComponent('Chat')
    let resolveLoad: ((value: ComponentType) => void) | null = null
    const load = vi.fn(
      () =>
        new Promise<ComponentType>((resolve) => {
          resolveLoad = resolve
        })
    )
    const entry: PanelEntry = { id: 'chat', title: 'Chat', load }

    const first = loadPanelComponent(entry)
    const second = loadPanelComponent(entry)
    expect(load).toHaveBeenCalledTimes(1)
    resolveLoad?.(Component)
    expect(await first).toBe(Component)
    expect(await second).toBe(Component)
  })

  it('un panel sin `load` (extensión) resuelve su componente tal cual', async () => {
    const Loader = fakeComponent('ExtensionViewPanelLoader')
    const entry: PanelEntry = { id: 'ext.view', title: 'Ext', component: Loader }
    await expect(loadPanelComponent(entry)).resolves.toBe(Loader)
    expect(loadedPanel('ext.view')).toBe(Loader)
  })

  it('una entrada sin componente ni loader rechaza (no se queda colgada)', async () => {
    const entry: PanelEntry = { id: 'roto', title: 'Roto' }
    await expect(loadPanelComponent(entry)).rejects.toThrow(/sin componente/)
  })

  it('un módulo que NO exporta componente rechaza en vez de dejar el loader eterno', async () => {
    // El caso real: `load()` resuelve a `undefined` (export mal escrito). El
    // estado del PanelModule quedaba en undefined y el `if (!Component)` no
    // avanzaba nunca → "Cargando panel…" para siempre.
    const entry: PanelEntry = {
      id: 'sin-export',
      title: 'Sin export',
      load: async () => undefined as unknown as ComponentType
    }
    await expect(loadPanelComponent(entry)).rejects.toThrow(/no exporta un componente/)
    expect(loadedPanel('sin-export')).toBeNull()
  })

  it('un `component` sin `load` que no es función rechaza', async () => {
    const entry: PanelEntry = {
      id: 'componente-raro',
      title: 'Raro',
      component: {} as unknown as ComponentType
    }
    await expect(loadPanelComponent(entry)).rejects.toThrow(/no exporta un componente/)
  })
})

describe('panelModules — errores y preload', () => {
  it('un fallo NO se cachea: el próximo intento vuelve a probar', async () => {
    const Component = fakeComponent('Search')
    const load = vi
      .fn<() => Promise<ComponentType>>()
      .mockRejectedValueOnce(new Error('chunk roto'))
      .mockResolvedValueOnce(Component)
    const entry: PanelEntry = { id: 'search', title: 'Búsqueda', load }

    await expect(loadPanelComponent(entry)).rejects.toThrow('chunk roto')
    expect(loadedPanel('search')).toBeNull()
    await expect(loadPanelComponent(entry)).resolves.toBe(Component)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('preload arranca la carga y no rompe si falla', async () => {
    const Component = fakeComponent('Notas')
    const load = vi.fn(async () => Component)
    preloadPanelEntry({ id: 'notes', title: 'Notas', load })
    expect(load).toHaveBeenCalledTimes(1)
    await Promise.resolve()
    expect(loadedPanel('notes')).toBe(Component)

    // Con el módulo ya cargado, un preload extra no vuelve a pedirlo.
    preloadPanelEntry({ id: 'notes', title: 'Notas', load })
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('preload de una entrada sin `load` no hace nada', () => {
    const load = vi.fn(async () => fakeComponent('X'))
    preloadPanelEntry(null)
    preloadPanelEntry({ id: 'ext', title: 'Ext', component: fakeComponent('L') })
    expect(load).not.toHaveBeenCalled()
  })
})

describe('panelModules — precarga serializada', () => {
  /** Entrada con una carga que se resuelve cuando el test quiere. */
  function deferred(id: string): { entry: PanelEntry; start: () => void; done: () => void } {
    let release: (() => void) | null = null
    let started: (() => void) | null = null
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const began = new Promise<void>((resolve) => {
      started = resolve
    })
    return {
      entry: {
        id,
        title: id,
        load: () => {
          started?.()
          return gate.then(() => fakeComponent(id))
        }
      },
      start: () => started?.(),
      done: () => release?.()
    }
  }

  it('la cola carga DE A UNO: la segunda no arranca hasta que termina la primera', async () => {
    const first = deferred('uno')
    const second = deferred('dos')
    let secondStarted = false
    preloadPanelsLazily([first.entry, { ...second.entry, load: () => {
      secondStarted = true
      return second.entry.load?.() ?? Promise.reject(new Error('sin load'))
    } }])
    await first.start()
    await Promise.resolve()
    // La primera está en vuelo y la segunda todavía NO arrancó (serial).
    expect(secondStarted).toBe(false)
    first.done()
    await vi.waitFor(() => expect(secondStarted).toBe(true))
  })

  it('el preload por hover/click arranca YA, aunque la cola esté ocupada', async () => {
    const queued = deferred('en-cola')
    preloadPanelsLazily([queued.entry])
    await queued.start()

    // Mientras la cola espera, el usuario pasa por un botón: prioridad.
    const urgentLoad = vi.fn(async () => fakeComponent('urgente'))
    preloadPanelEntry({ id: 'urgente', title: 'Urgente', load: urgentLoad })
    expect(urgentLoad).toHaveBeenCalledTimes(1)
    queued.done()
  })

  it('no encola dos veces el mismo panel ni los que ya están cargados', async () => {
    const Component = fakeComponent('Notas')
    const load = vi.fn(async () => Component)
    await loadPanelComponent({ id: 'notes', title: 'Notas', load })
    preloadPanelsLazily([{ id: 'notes', title: 'Notas', load }])
    preloadPanelsLazily([{ id: 'notes', title: 'Notas', load }])
    await Promise.resolve()
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('un panel que falla en la cola no corta la precarga de los demás', async () => {
    const good = fakeComponent('Git')
    const goodLoad = vi.fn(async () => good)
    preloadPanelsLazily([
      { id: 'roto', title: 'Roto', load: async () => Promise.reject(new Error('boom')) },
      { id: 'git', title: 'Git', load: goodLoad }
    ])
    await vi.waitFor(() => expect(goodLoad).toHaveBeenCalledTimes(1))
    expect(loadedPanel('git')).toBe(good)
  })
})
