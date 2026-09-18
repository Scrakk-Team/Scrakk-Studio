/**
 * Paneles de extensiones — tests del traductor, el tipo SEF `views` y los ids.
 *
 * Cubre la cadena que convierte "una extensión de VS Code con un panel" en
 * botón de activity bar + panel montable + entry Node para el host.
 */

import { describe, expect, it, beforeEach } from 'vitest'
import { zipSync } from 'fflate'
import { convertVsix } from '@shared/compatibility'
import {
  detectViews,
  translateViews
} from '../src/shared/compatibility/vscode/translators/types/views/views'
import { detectKinds, KIND_TABLE } from '../src/shared/compatibility/vscode/kinds'
import type { VsixFileEntry, VsixPackageJson } from '../src/shared/compatibility/types'
import {
  parseViewPanelId,
  viewButtonId,
  viewPanelId,
  VIEW_PANEL_PREFIX
} from '../src/renderer/src/features/extensionviews/ids'
import {
  containerWhenClause,
  forgetContainerExtension,
  getContainerViews,
  hasContainer,
  visibleViews
} from '../src/renderer/src/features/extensionviews/containers'
import { evaluateWhen } from '../src/renderer/src/services/extensions/when'
import { ExtensionRegistry } from '../src/renderer/src/services/extensions/registry'
import { viewsHandler } from '../src/renderer/src/services/extensions/types/views/api'
import type { ViewContribution } from '../src/renderer/src/services/extensions/types/views/schema'

const EXTENSION_ID = 'vscode-demo.chat'

const enc = new TextEncoder()

function u8(text: string): Uint8Array {
  return enc.encode(text)
}

function decode(bytes: Uint8Array | undefined): string {
  return bytes ? new TextDecoder().decode(bytes) : ''
}

function file(path: string, text: string): VsixFileEntry {
  return { path, data: u8(text) }
}

const SVG_ICON = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/></svg>'

function manifest(overrides: Partial<VsixPackageJson> = {}): VsixPackageJson {
  return {
    name: 'chat',
    publisher: 'demo',
    version: '1.0.0',
    main: 'out/extension.js',
    contributes: {
      viewsContainers: {
        activitybar: [{ id: 'demo.side', title: 'Demo Chat', icon: 'resources/icon.svg' }]
      },
      views: {
        'demo.side': [
          { id: 'demo.chat.view', name: 'Chat', type: 'webview' },
          { id: 'demo.history.view', name: 'Historial' }
        ]
      }
    },
    ...overrides
  }
}

const files: VsixFileEntry[] = [
  file('out/extension.js', 'exports.activate = function () {}'),
  file('resources/icon.svg', SVG_ICON)
]

// ── Ids de panel ──────────────────────────────────────────────────────────

describe('ids de panel de extensión', () => {
  it('ida y vuelta conserva extensión y contenedor', () => {
    const id = viewPanelId('vscode-demo.chat', 'demo.side')
    expect(id.startsWith(VIEW_PANEL_PREFIX)).toBe(true)
    expect(parseViewPanelId(id)).toEqual({
      extensionId: 'vscode-demo.chat',
      containerId: 'demo.side'
    })
  })

  it('rechaza ids que no son de extensión o están mal formados', () => {
    expect(parseViewPanelId('welcome')).toBeNull()
    expect(parseViewPanelId(`${VIEW_PANEL_PREFIX}sin-separador`)).toBeNull()
    expect(parseViewPanelId(`${VIEW_PANEL_PREFIX}|solo-vista`)).toBeNull()
    expect(parseViewPanelId(`${VIEW_PANEL_PREFIX}ext|`)).toBeNull()
  })

  it('el id del botón y el del panel no colisionan', () => {
    expect(viewButtonId('a', 'c')).not.toBe(viewPanelId('a', 'c'))
  })
})

// ── Detección y traducción ────────────────────────────────────────────────

describe('traductor de paneles (views)', () => {
  it('detecta sólo si hay vistas con contenido', () => {
    expect(detectViews(manifest())).toBe(true)
    expect(detectViews({ name: 'x', contributes: { views: {} } })).toBe(false)
    expect(detectViews({ name: 'x', contributes: { views: { 'c.a': [] } } })).toBe(false)
    expect(detectViews({ name: 'x' })).toBe(false)
  })

  it('traduce contenedor + vistas a contribuciones SEF views', () => {
    const out = translateViews(manifest(), files, { extensionId: EXTENSION_ID })
    expect(out.contributions).toHaveLength(2)
    expect(out.contributions[0]).toMatchObject({
      id: 'demo.chat.view',
      name: 'Chat',
      container: 'demo.side',
      containerTitle: 'Demo Chat'
    })
    // El icono del contenedor va inline (así hereda el color del tema).
    expect(String(out.contributions[0].iconSvg)).toContain('<svg')
    expect(out.contributions[1]).toMatchObject({ id: 'demo.history.view', container: 'demo.side' })
  })

  it('copia el paquete con sus rutas y declara el entry del manifest', () => {
    const out = translateViews(manifest(), files, { extensionId: EXTENSION_ID })
    // El entry se queda donde la extensión lo espera: `out/extension.js`.
    expect(decode(out.assets.get('out/extension.js'))).toContain('exports.activate')
    expect(out.manifestExtras.runtime).toEqual({ kind: 'node', entry: 'out/extension.js' })
  })

  it('preserva los módulos relativos y los assets (extensiones multi-archivo)', () => {
    const multi = [
      file('extension/out/extension.js', "require('./anchorIndex')"),
      file('extension/out/anchorIndex.js', 'module.exports = {}'),
      file('extension/media/logo.svg', SVG_ICON),
      // Reservado: el SEF lo escribe el pipeline, no puede pisarlo la extensión.
      file('extension/manifest.json', '{"id":"mentiroso"}')
    ]
    const out = translateViews(manifest({ main: './out/extension' }), multi, {
      extensionId: EXTENSION_ID
    })
    // El prefijo `extension/` del vsix se saca y la ruta relativa se conserva.
    expect(out.assets.has('out/anchorIndex.js')).toBe(true)
    expect(out.assets.has('media/logo.svg')).toBe(true)
    expect(out.assets.has('manifest.json')).toBe(false)
    // `main` con `./` y sin extensión: Node lo resuelve igual que VS Code.
    expect(out.manifestExtras.runtime).toEqual({ kind: 'node', entry: 'out/extension' })
  })

  it('si el entry no está en el paquete lo reporta sin romper', () => {
    const out = translateViews(manifest({ main: 'out/falta.js' }), files, {
      extensionId: EXTENSION_ID
    })
    expect(out.assets.has('out/extension.js')).toBe(false)
    expect(out.manifestExtras.runtime).toBeUndefined()
    expect(out.mapped.some((m) => m.support === 'none' && m.note?.includes('falta.js'))).toBe(true)
    // Las vistas se traducen igual: el panel existe, el código no.
    expect(out.contributions).toHaveLength(2)
  })

  it('sin icono usable no inventa uno y lo dice', () => {
    const m = manifest({
      contributes: {
        viewsContainers: { activitybar: [{ id: 'demo.side', title: 'Demo' }] },
        views: { 'demo.side': [{ id: 'demo.a', name: 'A' }] }
      }
    })
    const out = translateViews(m, files, { extensionId: EXTENSION_ID })
    expect(out.contributions[0].iconSvg).toBeUndefined()
    expect(out.mapped[0].note).toContain('genérico')
  })

  it('una web extension (browser) se reporta como no ejecutable', () => {
    const m = manifest({ main: undefined, browser: './dist/web.js' })
    const out = translateViews(m, files, { extensionId: EXTENSION_ID })
    expect(out.manifestExtras.runtime).toBeUndefined()
    expect(out.mapped.some((x) => x.source.startsWith('browser:') && x.support === 'none')).toBe(
      true
    )
  })
})

describe('clasificación de kinds', () => {
  it('views y viewsContainers son traducibles; browser sigue fuera', () => {
    expect(KIND_TABLE.views.support).toBe('supported')
    expect(KIND_TABLE.views.sefKind).toBe('views')
    expect(KIND_TABLE.viewsContainers.support).toBe('supported')

    const kinds = detectKinds({ contributes: { views: { a: [{}] } }, main: 'out/extension.js' })
    expect(kinds.find((k) => k.key === 'views')?.support).toBe('supported')
    expect(kinds.find((k) => k.key === 'code')?.support).toBe('supported')

    // Una web extension es OTRO caso, con su propia key: así el reporte dice
    // "Web extension (browser)" en vez de confundirla con el código Node.
    const web = detectKinds({ browser: './web.js' })
    expect(web).toHaveLength(1)
    expect(web[0].key).toBe('code.browser')
    expect(web[0].support).toBe('unsupported')
  })
})

// ── Tipo SEF `views` ──────────────────────────────────────────────────────

const resolverStub = {
  resolveComponent: () => () => Promise.resolve({ default: () => null }),
  resolveIcon: () => undefined,
  hasModule: () => true
}

function register(raw: unknown): unknown[] {
  const contributions = viewsHandler.parse(raw, { hasModule: () => true }) as ViewContribution[]
  expect(contributions).not.toBeNull()
  return contributions.map((c) =>
    viewsHandler.register(c, {
      extensionId: EXTENSION_ID,
      isBuiltin: false,
      resolver: resolverStub as never,
      readFile: async () => null,
      api: {} as never
    })
  )
}

describe('tipo SEF views', () => {
  beforeEach(() => {
    ExtensionRegistry.unregister(EXTENSION_ID)
    forgetContainerExtension(EXTENSION_ID)
  })

  it('registra un botón y un panel por contenedor, no por vista', () => {
    register([
      { id: 'demo.chat.view', name: 'Chat', container: 'demo.side', containerTitle: 'Demo Chat' },
      { id: 'demo.history.view', name: 'Historial', container: 'demo.side' }
    ])

    const buttons = ExtensionRegistry.getActivityButtons().filter((b) =>
      b.id.includes(EXTENSION_ID)
    )
    const panels = ExtensionRegistry.getAllPanels().filter((p) => p.id.startsWith('extview:'))

    expect(buttons).toHaveLength(1)
    expect(panels).toHaveLength(1)
    // El botón y el panel apuntan al MISMO id: clickearlo abre el panel.
    expect(buttons[0].panelId).toBe(panels[0].id)
    expect(buttons[0].icon).toContain('<svg')
  })

  it('`when` del VSIX se traduce y decide qué vistas se ven', () => {
    register([
      { id: 'demo.chat.view', name: 'Chat', container: 'demo.side' },
      {
        id: 'demo.debug.view',
        name: 'Debug',
        container: 'demo.side',
        when: 'debugActive'
      }
    ])

    const keys: Record<string, unknown> = { debugActive: false }
    const getKey = (key: string): unknown => keys[key]

    // Con la clave en false, la vista condicionada no se muestra ni se cuenta.
    expect(visibleViews(EXTENSION_ID, 'demo.side', getKey).map((v) => v.id)).toEqual([
      'demo.chat.view'
    ])

    // El botón sigue visible porque la otra vista del contenedor no tiene `when`.
    expect(containerWhenClause(EXTENSION_ID, 'demo.side')).toBeUndefined()

    keys.debugActive = true
    expect(visibleViews(EXTENSION_ID, 'demo.side', getKey)).toHaveLength(2)
  })

  it('un contenedor donde TODAS las vistas están condicionadas oculta su botón', () => {
    register([
      { id: 'demo.a.view', name: 'A', container: 'demo.solo', when: 'aVisible' },
      { id: 'demo.b.view', name: 'B', container: 'demo.solo', when: 'bVisible' }
    ])

    const clause = containerWhenClause(EXTENSION_ID, 'demo.solo')
    expect(clause).toBe('(aVisible) || (bVisible)')

    const button = ExtensionRegistry.getActivityButtons().find((b) =>
      b.panelId.includes('demo.solo')
    )
    expect(button?.when).toBe(clause)

    const getKey = (key: string): unknown => ({ aVisible: false, bVisible: false })[key]
    expect(evaluateWhen(button?.when, getKey)).toBe(false)
    const oneVisible = (key: string): unknown => ({ aVisible: true, bVisible: false })[key]
    expect(evaluateWhen(button?.when, oneVisible)).toBe(true)
  })

  it('el contenedor recuerda sus vistas (para el selector del panel)', () => {
    register([
      { id: 'demo.chat.view', name: 'Chat', container: 'demo.side' },
      { id: 'demo.history.view', name: 'Historial', container: 'demo.side' }
    ])
    expect(hasContainer(EXTENSION_ID, 'demo.side')).toBe(true)
    expect(getContainerViews(EXTENSION_ID, 'demo.side')).toEqual([
      { id: 'demo.chat.view', name: 'Chat' },
      { id: 'demo.history.view', name: 'Historial' }
    ])
  })

  it('descarta contribuciones inválidas sin tumbarse', () => {
    const parsed = viewsHandler.parse(
      [{ id: 'ok.view', name: 'Ok', container: 'c' }, { name: 'sin id' }, null, 42],
      { hasModule: () => true }
    ) as ViewContribution[]
    expect(parsed).toHaveLength(1)
    expect(parsed[0].id).toBe('ok.view')
  })

  it('el desregistro libera botón, panel y contenedor', () => {
    const owned = register([{ id: 'demo.chat.view', name: 'Chat', container: 'demo.side' }])
    viewsHandler.unregister(owned)

    expect(
      ExtensionRegistry.getActivityButtons().some((b) => b.id === viewButtonId(EXTENSION_ID, 'demo.side'))
    ).toBe(false)
    expect(
      ExtensionRegistry.getAllPanels().some((p) => p.id === viewPanelId(EXTENSION_ID, 'demo.side'))
    ).toBe(false)
    expect(hasContainer(EXTENSION_ID, 'demo.side')).toBe(false)
  })
})

// ── Cadena completa: .vsix real → SEF → botón + panel ────────────────────

describe('cadena completa de un panel de VS Code', () => {
  /** Un .vsix como los reales: package.json + bundle + icono. */
  function panelVsix(): Uint8Array {
    const pkg = {
      name: 'ai-chat',
      publisher: 'demo',
      version: '2.0.0',
      displayName: 'AI Chat',
      main: './out/extension.js',
      engines: { vscode: '^1.85.0' },
      contributes: {
        viewsContainers: {
          activitybar: [{ id: 'demo.ai', title: 'AI Chat', icon: 'media/icon.svg' }]
        },
        views: { 'demo.ai': [{ id: 'demo.ai.chat', name: 'Chat', type: 'webview' }] }
      }
    }
    return zipSync({
      'extension/package.json': u8(JSON.stringify(pkg)),
      'extension/out/extension.js': u8('exports.activate = function () { return 42 }'),
      'extension/media/icon.svg': u8(SVG_ICON)
    })
  }

  it('convierte, declara el panel y deja el código listo para el host', () => {
    const converted = convertVsix(panelVsix(), { fileName: 'ai-chat.vsix' })
    const manifest = converted.manifest as {
      contributes: { views: ViewContribution[] }
      runtime: { kind: string; entry: string }
    }

    // 1) El host puede ejecutar la extensión (el paquete va con sus rutas).
    expect(manifest.runtime).toEqual({ kind: 'node', entry: 'out/extension.js' })
    expect(decode(converted.files.get('out/extension.js') as Uint8Array)).toContain(
      'exports.activate'
    )

    // 2) El IDE sabe que el panel existe, sin ejecutar nada todavía.
    expect(manifest.contributes.views).toHaveLength(1)
    expect(manifest.contributes.views[0]).toMatchObject({
      id: 'demo.ai.chat',
      name: 'Chat',
      container: 'demo.ai',
      containerTitle: 'AI Chat'
    })

    // 3) Y eso se materializa en botón + panel del layout.
    ExtensionRegistry.unregister(converted.id)
    forgetContainerExtension(converted.id)

    const contributions = viewsHandler.parse(manifest.contributes.views, {
      hasModule: () => true
    }) as ViewContribution[]
    const owned = contributions.map((c) =>
      viewsHandler.register(c, {
        extensionId: converted.id,
        isBuiltin: false,
        resolver: resolverStub as never,
        readFile: async () => null,
        api: {} as never
      })
    )

    const button = ExtensionRegistry.getActivityButtons().find(
      (b) => b.id === viewButtonId(converted.id, 'demo.ai')
    )
    const panel = ExtensionRegistry.getPanel(viewPanelId(converted.id, 'demo.ai'))
    expect(button?.label).toBe('AI Chat')
    expect(String(button?.icon)).toContain('<svg')
    expect(panel?.title).toBe('AI Chat')

    // Y el click del botón abre exactamente ese panel.
    expect(button?.panelId).toBe(panel?.id)
    expect(parseViewPanelId(button!.panelId!)).toEqual({
      extensionId: converted.id,
      containerId: 'demo.ai'
    })

    viewsHandler.unregister(owned)
  })

  it('el resumen de compatibilidad dice que el panel está soportado', () => {
    const converted = convertVsix(panelVsix(), { fileName: 'ai-chat.vsix' })
    const report = converted.report
    expect(report.coverage).toBeGreaterThan(0)
    expect(
      report.supported.some((m) => m.target === 'SEF contributes.views')
    ).toBe(true)
    expect(report.unsupported.some((m) => m.source === 'contributes.views')).toBe(false)
  })
})
