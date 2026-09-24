// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * `viewsWelcome` — el contenido de una vista vacía.
 *
 * Cubre la cadena completa: VSIX (`contributes.viewsWelcome`) → manifest SEF
 * (`views[].welcome`) → parser que la UI pinta. Lo que se verifica es que el
 * texto y los BOTONES de la extensión lleguen intactos, y que un viewsWelcome
 * sin destino se reporte en vez de desaparecer.
 */

import { describe, expect, it } from 'vitest'
import {
  hasWelcomeContent,
  parseCommandLine,
  parseWelcomeContents
} from '@shared/compatibility/vscode/welcome'
import { translateViews } from '../src/shared/compatibility/vscode/translators/types/views/views'
import { parseViewContributions } from '../src/renderer/src/services/extensions/types/views/schema'
import {
  forgetContainerExtension,
  rememberContainerView,
  visibleViews
} from '../src/renderer/src/features/extensionviews/containers'
import { findSurfaceEntry } from '@shared/compatibility/surface'
import type { VsixFileEntry, VsixPackageJson } from '../src/shared/compatibility/types'

const enc = new TextEncoder()

function file(path: string, text: string): VsixFileEntry {
  return { path, data: enc.encode(text) }
}

/** Args como los emite VS Code: JSON array URL-encoded. */
function encodeArgs(args: unknown[]): string {
  return encodeURIComponent(JSON.stringify(args))
}

const ICON = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/></svg>'

function manifest(overrides: Partial<VsixPackageJson> = {}): VsixPackageJson {
  return {
    name: 'anchors',
    publisher: 'demo',
    version: '1.0.0',
    main: 'out/extension.js',
    contributes: {
      viewsContainers: {
        activitybar: [{ id: 'demo.side', title: 'Anclas', icon: 'resources/icon.svg' }]
      },
      views: {
        'demo.side': [{ id: 'demo.anchors.view', name: 'Anclas' }]
      }
    },
    ...overrides
  }
}

const files: VsixFileEntry[] = [
  file('out/extension.js', 'exports.activate = function () {}'),
  file('resources/icon.svg', ICON)
]

// ── Parser ────────────────────────────────────────────────────────────────

describe('parser de viewsWelcome', () => {
  it('separa líneas de texto de botones de comando', () => {
    const parts = parseWelcomeContents(
      'Sin anclas todavía.\n[Crear ancla](command:anchors.create)\nUsá el editor para marcar.'
    )
    expect(parts).toEqual([
      { kind: 'text', text: 'Sin anclas todavía.' },
      { kind: 'command', label: 'Crear ancla', command: 'anchors.create', args: [] },
      { kind: 'text', text: 'Usá el editor para marcar.' }
    ])
  })

  it('lee los args URL-encoded como los emite VS Code', () => {
    const parts = parseWelcomeContents(
      `[Buscar](command:anchors.search?${encodeArgs(['tag', 3])})`
    )
    expect(parts[0]).toEqual({
      kind: 'command',
      label: 'Buscar',
      command: 'anchors.search',
      args: ['tag', 3]
    })
  })

  it('un JSON de args inválido no mata el botón', () => {
    // Mejor un botón que corre sin args que un botón muerto.
    const command = parseCommandLine('[Raro](command:anchors.x?%7Bno-json)')
    expect(command?.command).toBe('anchors.x')
    expect(command?.args).toEqual([])
  })

  it('sin `?` no hay args', () => {
    expect(parseCommandLine('[Abrir](command:anchors.open)')?.args).toEqual([])
  })

  it('saca la sintaxis de link en frases con link embebido', () => {
    const parts = parseWelcomeContents('Ver [la guía](https://x.dev) para empezar')
    expect(parts).toEqual([{ kind: 'text', text: 'Ver la guía para empezar' }])
  })

  it('ignora líneas vacías y no inventa contenido', () => {
    expect(parseWelcomeContents('\n\n   \n')).toEqual([])
    expect(hasWelcomeContent([])).toBe(false)
    expect(hasWelcomeContent(parseWelcomeContents('\n '))).toBe(false)
    expect(hasWelcomeContent(parseWelcomeContents('[X](command:a)'))).toBe(true)
  })
})

// ── Traductor VSIX → SEF ──────────────────────────────────────────────────

describe('traductor de viewsWelcome', () => {
  it('pega el contenido a la vista y lo reporta como `full`', () => {
    const translated = translateViews(
      manifest({
        contributes: {
          ...manifest().contributes,
          viewsWelcome: [
            {
              view: 'demo.anchors.view',
              contents: 'Sin anclas.\n[Crear](command:anchors.create)'
            }
          ]
        }
      }),
      files,
      { extensionId: 'vscode-demo.anchors' }
    )

    const view = translated.contributions[0] as {
      id: string
      welcome?: Array<{ contents: string; when?: string }>
    }
    expect(view.id).toBe('demo.anchors.view')
    expect(view.welcome).toEqual([
      { contents: 'Sin anclas.\n[Crear](command:anchors.create)', when: undefined }
    ])

    const mapped = translated.mapped.find((entry) => entry.source === 'viewsWelcome')
    expect(mapped?.support).toBe('full')
    expect(mapped?.target).toBe('SEF contributes.views[].welcome')
  })

  it('conserva el `when` y varias entradas por vista', () => {
    const translated = translateViews(
      manifest({
        contributes: {
          ...manifest().contributes,
          viewsWelcome: [
            { view: 'demo.anchors.view', contents: 'Primera', when: 'anchors.empty' },
            { view: 'demo.anchors.view', contents: 'Segunda' }
          ]
        }
      }),
      files,
      { extensionId: 'vscode-demo.anchors' }
    )
    const view = translated.contributions[0] as {
      welcome?: Array<{ contents: string; when?: string }>
    }
    expect(view.welcome).toEqual([
      { contents: 'Primera', when: 'anchors.empty' },
      { contents: 'Segunda', when: undefined }
    ])
  })

  it('un viewsWelcome de una vista inexistente se REPORTA, no desaparece', () => {
    const translated = translateViews(
      manifest({
        contributes: {
          ...manifest().contributes,
          viewsWelcome: [{ view: 'builtin.something', contents: 'Hola' }]
        }
      }),
      files,
      { extensionId: 'vscode-demo.anchors' }
    )
    expect((translated.contributions[0] as { welcome?: unknown }).welcome).toBeUndefined()
    const mapped = translated.mapped.find((entry) =>
      entry.source.startsWith('viewsWelcome:builtin.something')
    )
    expect(mapped?.support).toBe('none')
    expect(mapped?.note).toContain('no se pudo ubicar')
  })

  it('traduce `visibility` a collapsed / hidden', () => {
    const translated = translateViews(
      manifest({
        contributes: {
          viewsContainers: {
            activitybar: [{ id: 'demo.side', title: 'Anclas', icon: 'resources/icon.svg' }]
          },
          views: {
            'demo.side': [
              { id: 'demo.anchors.view', name: 'Anclas' },
              { id: 'demo.epic.view', name: 'Épicas', visibility: 'collapsed' },
              { id: 'demo.secret.view', name: 'Oculta', visibility: 'hidden' }
            ]
          }
        }
      }),
      files,
      { extensionId: 'vscode-demo.anchors' }
    )
    const [first, second, third] = translated.contributions as Array<{
      collapsed?: boolean
      hidden?: boolean
    }>
    expect(first.collapsed).toBeUndefined()
    expect(second.collapsed).toBe(true)
    expect(third.hidden).toBe(true)
  })

  it('una vista `hidden` no se muestra (y el `when` no la revive)', () => {
    forgetContainerExtension('vscode-demo.hidden')
    rememberContainerView('vscode-demo.hidden', {
      containerId: 'side',
      iconSvg: '',
      view: { id: 'v.hidden', name: 'Oculta', hidden: true }
    })
    rememberContainerView('vscode-demo.hidden', {
      containerId: 'side',
      iconSvg: '',
      view: { id: 'v.when', name: 'Condicional', when: 'demo.ready' }
    })
    const keys = new Map<string, unknown>([['demo.ready', true]])
    const visible = visibleViews('vscode-demo.hidden', 'side', (key) => keys.get(key))
    expect(visible.map((view) => view.id)).toEqual(['v.when'])
  })

  it('descarta contenido vacío (no reemplaza un panel vacío por otro)', () => {
    const translated = translateViews(
      manifest({
        contributes: {
          ...manifest().contributions,
          ...manifest().contributes,
          viewsWelcome: [{ view: 'demo.anchors.view', contents: '   ' }]
        }
      }),
      files,
      { extensionId: 'vscode-demo.anchors' }
    )
    expect((translated.contributions[0] as { welcome?: unknown }).welcome).toBeUndefined()
    expect(translated.mapped.some((entry) => entry.source === 'viewsWelcome')).toBe(false)
  })
})

// ── Schema SEF ────────────────────────────────────────────────────────────

describe('schema SEF del welcome', () => {
  const ctx = { extensionId: 'vscode-demo.anchors', extensionPath: '/tmp/x' }

  it('parsea el welcome declarado en el manifest SEF', () => {
    const parsed = parseViewContributions(
      [
        {
          id: 'demo.anchors.view',
          name: 'Anclas',
          container: 'demo.side',
          welcome: [{ contents: 'Sin anclas', when: 'anchors.empty' }]
        }
      ],
      ctx
    )
    expect(parsed?.[0].welcome).toEqual([{ contents: 'Sin anclas', when: 'anchors.empty' }])
  })

  it('sin welcome no agrega la clave', () => {
    const parsed = parseViewContributions(
      [{ id: 'demo.anchors.view', name: 'Anclas', container: 'demo.side' }],
      ctx
    )
    expect(parsed?.[0].welcome).toBeUndefined()
  })
})

// ── Tabla única ───────────────────────────────────────────────────────────

describe('tabla de compatibilidad', () => {
  it('declara viewsWelcome como traducido a `views`', () => {
    const entry = findSurfaceEntry('contributes.viewsWelcome')?.entry
    expect(entry?.status).toBe('real')
    expect(entry?.route).toBe('sef')
    expect(entry?.native).toBe('views')
  })
})
