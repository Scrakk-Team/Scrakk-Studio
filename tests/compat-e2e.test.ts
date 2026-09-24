// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * E2E de compatibilidad (sin Electron): simula lo que hace el loader con una
 * extensión convertida — manifest + assets del pipeline → normalize →
 * registro → resolve. Si esto pasa y en la app no se aplica, el problema es
 * activación; si falla, el bug está en la cadena.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { zipSync } from 'fflate'
import { convertVsix } from '@shared/compatibility'
import { normalizeFileIconThemeDefinition } from '@services/extensions/types/fileIcons/schema'
import { normalizeProductIconThemeDefinition } from '@services/extensions/types/productIcons/schema'
import {
  registerFileIconTheme,
  unregisterFileIconTheme,
  setActiveFileIconTheme,
  resolveFileIconUrl,
  listFileIconThemes
} from '@services/fileIcons'
import {
  registerProductIconTheme,
  unregisterProductIconTheme,
  setActiveProductIconTheme,
  resolveProductIcon,
  listProductIconThemes
} from '@services/productIcons'

const enc = new TextEncoder()
const u8 = (s: string): Uint8Array => enc.encode(s)
const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="16" height="16"/></svg>'

function makeFullVsix(): Uint8Array {
  const pkg = {
    name: 'mega-icons',
    publisher: 'alguien',
    version: '2.0.0',
    displayName: 'Mega Icons',
    contributes: {
      iconThemes: [{ id: 'mega', label: 'Mega', path: './icons/mega.json' }],
      productIconThemes: [{ id: 'mega-ui', label: 'Mega UI', path: './mega-ui.json' }]
    }
  }
  const fileTheme = {
    iconDefinitions: {
      _ts: { iconPath: './ts.svg' },
      _folder: { iconPath: './folder.svg' }
    },
    fileExtensions: { ts: '_ts', TS: '_ts' },
    folderNames: { src: '_folder' },
    file: '_ts',
    folder: '_folder'
  }
  const uiTheme = {
    fonts: [{ id: 'mega', src: [{ path: './mega.woff2', format: 'woff2' }] }],
    iconDefinitions: { folder: { fontCharacter: '\\E001', fontId: 'mega' } }
  }
  return zipSync({
    'extension/package.json': u8(JSON.stringify(pkg)),
    'extension/icons/mega.json': u8(JSON.stringify(fileTheme)),
    'extension/icons/ts.svg': u8(SVG),
    'extension/icons/folder.svg': u8(SVG),
    'extension/mega-ui.json': u8(JSON.stringify(uiTheme)),
    'extension/mega.woff2': u8('fake-font')
  })
}

/** Lee un asset del mapa como lo haría ctx.readFile. */
function readAsset(files: Map<string, Uint8Array | string>, path: string): string {
  const raw = files.get(path)
  expect(raw, `asset ${path} existe`).toBeDefined()
  return String(raw)
}

beforeEach(() => {
  for (const t of listFileIconThemes()) unregisterFileIconTheme(t.id)
  for (const t of listProductIconThemes()) unregisterProductIconTheme(t.id)
})

describe('cadena convertida → aplicada', () => {
  it('fileIcons del vsix resuelven tras normalize + registro + activación', () => {
    const converted = convertVsix(makeFullVsix())
    const manifest = converted.manifest as {
      contributes: { fileIcons: Array<{ id: string; name: string; path: string }> }
    }
    expect(manifest.contributes.fileIcons).toHaveLength(1)
    const contrib = manifest.contributes.fileIcons[0]

    const def = normalizeFileIconThemeDefinition(JSON.parse(readAsset(converted.files, contrib.path)))
    expect(def, 'normalize acepta el asset convertido').not.toBeNull()

    registerFileIconTheme({
      id: contrib.id,
      name: contrib.name,
      extensionId: converted.id,
      isBuiltin: false,
      theme: { ...def!, id: contrib.id, name: contrib.name }
    })
    expect(setActiveFileIconTheme(contrib.id)).toBe(true)

    expect(resolveFileIconUrl({ name: 'App.tsx', isDirectory: false })).toContain('data:image')
    expect(resolveFileIconUrl({ name: 'src', isDirectory: true })).toContain('data:image')
  })

  it('productIcons del vsix resuelven tras normalize + registro + activación', () => {
    const converted = convertVsix(makeFullVsix())
    const manifest = converted.manifest as {
      contributes: { productIcons: Array<{ id: string; name: string; path: string }> }
    }
    expect(manifest.contributes.productIcons).toHaveLength(1)
    const contrib = manifest.contributes.productIcons[0]

    const def = normalizeProductIconThemeDefinition(
      JSON.parse(readAsset(converted.files, contrib.path))
    )
    expect(def, 'normalize acepta el asset convertido').not.toBeNull()

    registerProductIconTheme({
      id: contrib.id,
      name: contrib.name,
      extensionId: converted.id,
      isBuiltin: false,
      theme: { ...def!, id: contrib.id, name: contrib.name }
    })
    expect(setActiveProductIconTheme(contrib.id)).toBe(true)

    const hit = resolveProductIcon('folder')
    expect(hit?.kind).toBe('font')
  })
})
