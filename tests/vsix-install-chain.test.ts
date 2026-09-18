/**
 * Cadena install-time completa de un .vsix de iconos:
 * convertVsix → manifest SEF → registerManifest (con readFile mockeado) →
 * activación → resolveFileIconUrl con los data URIs reales del vsix.
 *
 * Si esto pasa, el explorer muestra los iconos reales: FileTypeIcon consume
 * el mismo resolver con los mismos argumentos.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { zipSync } from 'fflate'
import { convertVsix } from '@shared/compatibility'
import { registerManifest } from '../src/renderer/src/services/extensions/loader/resolve'
import {
  listFileIconThemes,
  unregisterFileIconTheme,
  setActiveFileIconTheme,
  getActiveFileIconThemeId,
  resolveFileIconUrl
} from '@services/fileIcons'
import type { ExtensionManifest } from '../src/renderer/src/services/extensions/manifest'

const enc = new TextEncoder()
const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="16" height="16"/></svg>'

function makeIconPackVsix(): Uint8Array {
  const pkg = {
    name: 'pack',
    publisher: 'p',
    version: '1.0.0',
    contributes: {
      iconThemes: [{ id: 'pack', label: 'Pack', path: './icons/pack.json' }]
    }
  }
  const theme = {
    iconDefinitions: {
      _ts: { iconPath: './ts.svg' },
      _pkg: { iconPath: './pkg.svg' },
      _folder: { iconPath: './folder.svg' },
      _src: { iconPath: './src.svg' }
    },
    fileExtensions: { ts: '_ts', tsx: '_ts' },
    fileNames: { 'package.json': '_pkg' },
    folderNames: { src: '_src' },
    file: '_ts',
    folder: '_folder'
  }
  return zipSync({
    'extension/package.json': enc.encode(JSON.stringify(pkg)),
    'extension/icons/pack.json': enc.encode(JSON.stringify(theme)),
    'extension/icons/ts.svg': enc.encode(SVG),
    'extension/icons/pkg.svg': enc.encode(SVG),
    'extension/icons/folder.svg': enc.encode(SVG),
    'extension/icons/src.svg': enc.encode(SVG)
  })
}

beforeEach(() => {
  for (const t of listFileIconThemes()) unregisterFileIconTheme(t.id)
  vi.unstubAllGlobals()
})

describe('cadena install-time de iconos', () => {
  it('registra, activa y resuelve los iconos reales del vsix', async () => {
    const converted = convertVsix(makeIconPackVsix())
    const files = converted.files

    // Puente nativo mockeado: sirve los assets materializados en disco.
    const readFile = vi.fn(async (p: string): Promise<{ success: boolean; content?: string }> => {
      const rel = String(p).replace(/^.*\/extensions\/[^/]+\//, '')
      const data = files.get(rel)
      if (typeof data !== 'string') return { success: false }
      return { success: true, content: data }
    })
    vi.stubGlobal('window', { api: { fs: { readFile } } })

    const manifest = converted.manifest as unknown as ExtensionManifest
    await registerManifest(
      manifest,
      {
        resolveComponent: () => () => Promise.resolve({ default: null as never }),
        resolveIcon: () => null as never,
        hasModule: () => false
      },
      false,
      '/extensions/vscode-p.pack'
    )

    const themes = listFileIconThemes()
    expect(themes).toHaveLength(1)
    expect(themes[0].extensionId).toBe(converted.id)
    expect(Object.keys(themes[0].theme.iconDefinitions)).toHaveLength(4)

    // Activación como hace activateExtensionIconThemes tras instalar.
    const found = themes.find((t) => t.extensionId === converted.id)
    expect(found).toBeDefined()
    expect(setActiveFileIconTheme(found!.id)).toBe(true)
    expect(getActiveFileIconThemeId()).toBe(found!.id)

    // Resolución real por filetype.
    expect(resolveFileIconUrl({ name: 'App.tsx', isDirectory: false })).toContain('data:image')
    expect(resolveFileIconUrl({ name: 'package.json', isDirectory: false })).toContain('data:image')
    expect(resolveFileIconUrl({ name: 'src', isDirectory: true })).toContain('data:image')
    expect(resolveFileIconUrl({ name: 'other', isDirectory: true })).toContain('data:image')
  })
})
