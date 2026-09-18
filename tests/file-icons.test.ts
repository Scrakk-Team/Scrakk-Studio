/**
 * Tests del sistema de iconos de archivos:
 * - Registry standalone (prioridades de resolución).
 * - Schema SEF fileIcons (normalización tolerante).
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  registerFileIconTheme,
  unregisterFileIconTheme,
  resolveFileIconUrl,
  listFileIconThemes
} from '@services/fileIcons'
import { normalizeFileIconThemeDefinition } from '@services/extensions/types/fileIcons/schema'

const SVG_URI = 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='
const PNG_URI = 'data:image/png;base64,iVBORw0KGgo='

function theme(id: string) {
  return {
    id,
    name: id,
    iconDefinitions: {
      ts: SVG_URI,
      pkg: PNG_URI,
      folderSrc: SVG_URI,
      folderSrcOpen: SVG_URI,
      defaultFile: SVG_URI,
      defaultFolder: SVG_URI
    },
    fileExtensions: { ts: 'ts' },
    fileNames: { 'package.json': 'pkg' },
    folderNames: { src: 'folderSrc' },
    folderNamesExpanded: { src: 'folderSrcOpen' },
    file: 'defaultFile',
    folder: 'defaultFolder'
  }
}

beforeEach(() => {
  for (const t of listFileIconThemes()) unregisterFileIconTheme(t.id)
  registerFileIconTheme({
    id: 'test',
    name: 'Test',
    extensionId: 'test-ext',
    isBuiltin: false,
    theme: theme('test')
  })
})

describe('resolveFileIconUrl', () => {
  it('fileNames exacto gana a extensión', () => {
    expect(resolveFileIconUrl({ name: 'package.json', isDirectory: false })).toBe(PNG_URI)
  })

  it('resuelve por extensión', () => {
    expect(resolveFileIconUrl({ name: 'App.ts', isDirectory: false })).toBe(SVG_URI)
    expect(resolveFileIconUrl({ name: 'APP.TS', isDirectory: false })).toBe(SVG_URI)
  })

  it('carpeta expandida usa folderNamesExpanded', () => {
    const closed = resolveFileIconUrl({ name: 'src', isDirectory: true, isExpanded: false })
    const open = resolveFileIconUrl({ name: 'src', isDirectory: true, isExpanded: true })
    expect(closed).toBe(SVG_URI)
    expect(open).toBe(SVG_URI)
  })

  it('fallback a defaults', () => {
    expect(resolveFileIconUrl({ name: 'README', isDirectory: false })).toBe(SVG_URI)
    expect(resolveFileIconUrl({ name: 'unknown-dir', isDirectory: true })).toBe(SVG_URI)
  })

  it('desconocido sin defaults → null', () => {
    unregisterFileIconTheme('test')
    registerFileIconTheme({
      id: 'empty',
      name: 'Empty',
      extensionId: 'x',
      isBuiltin: false,
      theme: { id: 'empty', name: 'Empty', iconDefinitions: {} }
    })
    expect(resolveFileIconUrl({ name: 'App.ts', isDirectory: false })).toBeNull()
  })

  it('ignora definiciones que no son data URI', () => {
    unregisterFileIconTheme('test')
    registerFileIconTheme({
      id: 'mixed',
      name: 'Mixed',
      extensionId: 'x',
      isBuiltin: false,
      theme: {
        id: 'mixed',
        name: 'Mixed',
        iconDefinitions: { good: SVG_URI },
        fileExtensions: { ts: 'good', js: 'icons/js.svg' }
      }
    })
    expect(resolveFileIconUrl({ name: 'a.ts', isDirectory: false })).toBe(SVG_URI)
    expect(resolveFileIconUrl({ name: 'a.js', isDirectory: false })).toBeNull()
  })
})

describe('normalizeFileIconThemeDefinition', () => {
  it('normaliza lower y descarta no-dataURI', () => {
    const def = normalizeFileIconThemeDefinition({
      id: 't',
      name: 'T',
      iconDefinitions: { A: SVG_URI, B: 'icons/b.svg' },
      fileExtensions: { TS: 'A' },
      fileNames: { 'PACKAGE.JSON': 'A' }
    })
    expect(def?.iconDefinitions).toEqual({ A: SVG_URI })
    expect(def?.fileExtensions).toEqual({ ts: 'A' })
    expect(def?.fileNames).toEqual({ 'package.json': 'A' })
  })

  it('rechaza sin id/name', () => {
    expect(normalizeFileIconThemeDefinition({})).toBeNull()
    expect(normalizeFileIconThemeDefinition(null)).toBeNull()
  })
})
