// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tests del sistema de iconos de producto (UI):
 * - Registry: builtin, override por tema, fallback, fontCharacter.
 * - Schema SEF productIcons.
 * - Regla de arquitectura: nadie importa @proicons/react directo salvo el
 *   propio servicio (todo pasa por IDs de la API).
 */

import { describe, it, expect, beforeEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  registerProductIconTheme,
  unregisterProductIconTheme,
  resolveProductIcon,
  setActiveProductIconTheme,
  listProductIconThemes,
  SCRAKK_PRODUCT_ICON_THEME_ID
} from '@services/productIcons'
import { parseFontCharacter } from '@services/productIcons/registry'
import { normalizeProductIconThemeDefinition } from '@services/extensions/types/productIcons/schema'

const FONT_URI = 'data:font/woff2;base64,ZmFrZS1mb250LWJ5dGVz'

function carbonTheme() {
  return {
    id: 'carbon',
    name: 'Carbon',
    iconDefinitions: {
      folder: { fontCharacter: '\\E001', fontId: 'carbon' },
      files: { fontCharacter: '\\E002' }
    },
    fonts: [{ id: 'carbon', family: 'carbon-test', dataUri: FONT_URI, format: 'woff2' as const }]
  }
}

beforeEach(() => {
  for (const t of listProductIconThemes()) unregisterProductIconTheme(t.id)
  setActiveProductIconTheme(SCRAKK_PRODUCT_ICON_THEME_ID)
})

describe('resolveProductIcon', () => {
  it('builtin resuelve componente por id y sinónimo', () => {
    expect(resolveProductIcon('folder')).toMatchObject({ kind: 'component', componentId: 'folder' })
    expect(resolveProductIcon('FOLDER')).toMatchObject({ kind: 'component' })
    expect(resolveProductIcon('folder-open')).toMatchObject({
      kind: 'component',
      componentId: 'folder-opened'
    })
  })

  it('tema de extensión hace override con glyph', () => {
    registerProductIconTheme({
      id: 'carbon',
      name: 'Carbon',
      extensionId: 'ext',
      isBuiltin: false,
      theme: carbonTheme()
    })
    expect(setActiveProductIconTheme('carbon')).toBe(true)
    const hit = resolveProductIcon('folder')
    expect(hit?.kind).toBe('font')
    if (hit?.kind === 'font') {
      expect(hit.family).toBe('carbon-test')
      expect(hit.char).toBe(String.fromCodePoint(0xe001))
    }
    // IDs no definidos por el tema siguen al builtin.
    expect(resolveProductIcon('search')).toMatchObject({ kind: 'component' })
  })

  it('id desconocido → null (el componente usa fallback)', () => {
    expect(resolveProductIcon('no-existe-xyz')).toBeNull()
    expect(resolveProductIcon('')).toBeNull()
  })

  it('desinstalar vuelve a scrakk', () => {
    registerProductIconTheme({
      id: 'carbon',
      name: 'Carbon',
      extensionId: 'ext',
      isBuiltin: false,
      theme: carbonTheme()
    })
    setActiveProductIconTheme('carbon')
    unregisterProductIconTheme('carbon')
    expect(resolveProductIcon('folder')).toMatchObject({ kind: 'component' })
  })
})

describe('parseFontCharacter', () => {
  it('formatos VS Code', () => {
    expect(parseFontCharacter('\\EB42')).toBe(String.fromCodePoint(0xeb42))
    expect(parseFontCharacter('\\uEB42')).toBe(String.fromCodePoint(0xeb42))
    expect(parseFontCharacter('0xEB42')).toBe(String.fromCodePoint(0xeb42))
    expect(parseFontCharacter('EB42')).toBe(String.fromCodePoint(0xeb42))
    expect(parseFontCharacter('')).toBeNull()
    expect(parseFontCharacter('xyz')).toBeNull()
  })
})

describe('defIndex con prefijo codicon-', () => {
  const FURI = 'data:font/woff2;base64,ZmFrZS1mb250LWJ5dGVz'
  const themeWithPrefix = {
    id: 'pref',
    name: 'Pref',
    iconDefinitions: {
      'codicon-folder': { fontCharacter: '\\E003', fontId: 'f' }
    },
    fonts: [{ id: 'f', family: 'pref-f', dataUri: FURI, format: 'woff2' as const }]
  }

  it('resuelve en ambas direcciones', () => {
    registerProductIconTheme({
      id: 'pref',
      name: 'Pref',
      extensionId: 'ext',
      isBuiltin: false,
      theme: themeWithPrefix
    })
    expect(setActiveProductIconTheme('pref')).toBe(true)
    expect(resolveProductIcon('folder')?.kind).toBe('font')
    expect(resolveProductIcon('codicon-folder')?.kind).toBe('font')
  })
})

describe('normalizeProductIconThemeDefinition', () => {
  it('acepta fuentes con data URI y descarta el resto', () => {
    const def = normalizeProductIconThemeDefinition({
      id: 't',
      name: 'T',
      iconDefinitions: {
        a: { fontCharacter: '\\E001', fontId: 'f' },
        b: { noChar: true },
        c: 'no-objeto'
      },
      fonts: [
        { id: 'f', dataUri: FONT_URI, format: 'woff2' },
        { id: 'rota', dataUri: 'fonts/f.woff2' }
      ]
    })
    expect(Object.keys(def?.iconDefinitions ?? {})).toEqual(['a'])
    expect(def?.fonts).toHaveLength(1)
    expect(def?.fonts[0].family).toContain('t-f')
  })

  it('rechaza sin fuentes o sin definiciones', () => {
    expect(
      normalizeProductIconThemeDefinition({ id: 't', name: 'T', iconDefinitions: {}, fonts: [] })
    ).toBeNull()
    expect(normalizeProductIconThemeDefinition({})).toBeNull()
  })
})

describe('arquitectura: proicons solo vía el servicio', () => {
  it('ningún archivo fuera de services/productIcons importa @proicons/react', async () => {
    const here = path.dirname(fileURLToPath(import.meta.url))
    const root = path.resolve(here, '..', 'src')
    const offenders: string[] = []

    async function walk(dir: string): Promise<void> {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          await walk(full)
          continue
        }
        if (!/\.(ts|tsx)$/.test(entry.name)) continue
        if (full.includes(`${path.sep}productIcons${path.sep}`)) continue
        const content = await fs.readFile(full, 'utf-8')
        if (content.includes("from '@proicons/react'")) {
          offenders.push(path.relative(root, full))
        }
      }
    }

    await walk(root)
    expect(offenders).toEqual([])
  })
})

describe('alias semánticos de tema (chat)', () => {
  const FURI = 'data:font/woff2;base64,ZmFrZS1mb250LWJ5dGVz'
  const themeAlias = {
    id: 'alias',
    name: 'Alias',
    iconDefinitions: {
      'comment-discussion': { fontCharacter: '\\E010', fontId: 'f' }
    },
    fonts: [{ id: 'f', family: 'alias-f', dataUri: FURI, format: 'woff2' as const }]
  }

  it('chat resuelve al glyph del tema vía comment-discussion', () => {
    registerProductIconTheme({
      id: 'alias',
      name: 'Alias',
      extensionId: 'ext',
      isBuiltin: false,
      theme: themeAlias
    })
    expect(setActiveProductIconTheme('alias')).toBe(true)
    const hit = resolveProductIcon('chat')
    expect(hit?.kind).toBe('font')
    if (hit?.kind === 'font') {
      expect(hit.char).toBe(String.fromCodePoint(0xe010))
    }
  })

  it('el id exacto manda sobre el alias', () => {
    registerProductIconTheme({
      id: 'alias2',
      name: 'Alias2',
      extensionId: 'ext',
      isBuiltin: false,
      theme: {
        ...themeAlias,
        id: 'alias2',
        iconDefinitions: {
          ...themeAlias.iconDefinitions,
          chat: { fontCharacter: '\\E011', fontId: 'f' }
        }
      }
    })
    expect(setActiveProductIconTheme('alias2')).toBe(true)
    const hit = resolveProductIcon('chat')
    expect(hit?.kind).toBe('font')
    if (hit?.kind === 'font') {
      expect(hit.char).toBe(String.fromCodePoint(0xe011))
    }
  })

  it('sin alias en el tema, chat cae al builtin', () => {
    registerProductIconTheme({
      id: 'alias3',
      name: 'Alias3',
      extensionId: 'ext',
      isBuiltin: false,
      theme: {
        ...themeAlias,
        id: 'alias3',
        iconDefinitions: { folder: { fontCharacter: '\\E012', fontId: 'f' } }
      }
    })
    expect(setActiveProductIconTheme('alias3')).toBe(true)
    expect(resolveProductIcon('chat')).toMatchObject({ kind: 'component' })
  })
})
