// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { describe, it, expect } from 'vitest'
import {
  RESOURCE_MIME,
  setResourceDragData,
  hasResourceDragData,
  readResourceDragData
} from '../src/renderer/src/features/dnd/resource'
import { explorerTab } from '../src/renderer/src/features/tabs/store'

/** DataTransfer mínimo para testear el payload (sin DOM completo). */
class FakeDataTransfer {
  private data = new Map<string, string>()
  get types(): string[] {
    return [...this.data.keys()]
  }
  setData(type: string, value: string): void {
    this.data.set(type, value)
  }
  getData(type: string): string {
    return this.data.get(type) ?? ''
  }
}

describe('recurso del explorador para el DnD de tabs', () => {
  it('publica y lee un archivo', () => {
    const dt = new FakeDataTransfer() as unknown as DataTransfer
    setResourceDragData(dt, [{ kind: 'file', path: '/w/a.ts', name: 'a.ts' }])
    expect(dt.types).toContain(RESOURCE_MIME)
    expect(hasResourceDragData(dt)).toBe(true)
    expect(readResourceDragData(dt)).toEqual([{ kind: 'file', path: '/w/a.ts', name: 'a.ts' }])
  })

  it('publica y lee una carpeta', () => {
    const dt = new FakeDataTransfer() as unknown as DataTransfer
    setResourceDragData(dt, [{ kind: 'folder', path: '/w/src', name: 'src' }])
    expect(readResourceDragData(dt)).toEqual([{ kind: 'folder', path: '/w/src', name: 'src' }])
  })

  it('sin payload devuelve null', () => {
    const dt = new FakeDataTransfer() as unknown as DataTransfer
    expect(hasResourceDragData(dt)).toBe(false)
    expect(readResourceDragData(dt)).toBeNull()
  })

  it('ignora un payload corrupto', () => {
    const dt = new FakeDataTransfer() as unknown as DataTransfer
    dt.setData(RESOURCE_MIME, '{no-json')
    expect(readResourceDragData(dt)).toBeNull()
  })
})

describe('explorerTab', () => {
  it('deriva el id de la raíz y el label del nombre', () => {
    expect(explorerTab('/w/src', 'src')).toMatchObject({
      id: 'explorer:/w/src',
      kind: 'explorer',
      rootPath: '/w/src',
      label: 'src'
    })
  })

  it('usa el último segmento como label si no se pasa nombre', () => {
    expect(explorerTab('/w/src').label).toBe('src')
  })
})
