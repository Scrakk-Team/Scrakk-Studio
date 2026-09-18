/**
 * Paneles de EXTENSIÓN registrados en el layout: contrato de carga.
 *
 * El bug que esto candadea: `panels` y `centerTabs` registraban el componente
 * de la extensión con `React.lazy(...)`. El `PanelHost` del layout NO tiene
 * Suspense, así que un `lazy` sin boundary suspende y React NO reintenta
 * cuando el módulo llega: el panel no monta en la primera apertura y aparece
 * recién cuando se lo vuelve a abrir (ahí el módulo ya está evaluado y el
 * `lazy` resuelve al instante). Es exactamente el "queda cargando hasta que
 * cambio de panel y vuelvo".
 *
 * El contrato correcto es el mismo de los paneles built-in: `load` (import
 * dinámico) que el PanelHost espera con `useState` y cachea.
 */

import { describe, expect, it } from 'vitest'
import type { ComponentType } from 'react'
import { buildPanelEntry } from '../src/renderer/src/services/extensions/types/panels/logic'
import { registerCenterTab } from '../src/renderer/src/services/extensions/types/centertabs/logic'
import { ExtensionRegistry } from '../src/renderer/src/services/extensions/registry'
import type { ComponentResolver } from '../src/renderer/src/services/extensions/manifest'

function fakeComponent(name: string): ComponentType {
  const Component = (): null => null
  Component.displayName = name
  return Component
}

/**
 * Resolver como el de un `.sef` instalado: `resolveComponent` devuelve el
 * factory de módulo (lo que después envuelve `lazy`, y que ahora NO se usa).
 */
function resolverWith(module: { default: ComponentType }): ComponentResolver {
  return {
    resolveComponent: () => () => Promise.resolve(module),
    resolveIcon: () => undefined,
    hasModule: () => true
  }
}

describe('paneles de extensión — contrato de carga', () => {
  it('un panel de extensión se registra con `load`, no con un componente lazy', async () => {
    const Panel = fakeComponent('ExtPanel')
    const entry = buildPanelEntry(
      { id: 'demo.panel', title: 'Demo', component: 'panels/Panel.tsx' },
      resolverWith({ default: Panel })
    )

    // Sin `component`: nada que montar directo (ni lazy ni nada).
    expect(entry.component).toBeUndefined()
    expect(entry.load).toBeTypeOf('function')
    // `load` es un import dinámico: resuelve al componente del módulo.
    await expect(entry.load?.()).resolves.toBe(Panel)
  })

  it('un centerTab registra su panel con `load` (el id del tab ES el del panel)', async () => {
    const Panel = fakeComponent('CenterPanel')
    const tab = registerCenterTab(
      { id: 'demo.center', label: 'Centro', component: 'panels/Center.tsx' },
      resolverWith({ default: Panel }),
      'demo.extension'
    )

    const entry = ExtensionRegistry.getPanel(tab.panelId)
    expect(tab.panelId).toBe('demo.center')
    expect(entry?.component).toBeUndefined()
    expect(entry?.load).toBeTypeOf('function')
    await expect(entry?.load?.()).resolves.toBe(Panel)

    ExtensionRegistry.unregister('demo.extension')
  })
})
