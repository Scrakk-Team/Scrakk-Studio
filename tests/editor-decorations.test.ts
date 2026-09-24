// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Decoraciones de editor del Extension Host (`editor.setDecorations`).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUÉ SE PRUEBA Y POR QUÉ
 *
 * Este canal era INERTE: `createTextEditorDecorationType` devolvía un objeto
 * vacío, `setDecorations` ni existía (una extensión que pintaba rangos moría
 * con "not a function") y no hay forma de darse cuenta desde afuera.
 *
 * Lo que fijan estos tests:
 *
 *   1. la cadena «CSS» de VS Code se traduce de verdad (`'underline wavy red'`),
 *   2. `setDecorations` REEMPLAZA (no acumula) y una lista vacía borra, y
 *   3. el snapshot que se empuja incluye los archivos que quedaron sin rangos
 *      (`decorations: []`), porque ese `[]` es lo que limpia los subrayados
 *      viejos en la UI.
 */

import { describe, expect, it } from 'vitest'
import {
  EditorDecorationsRegistry,
  parseDecorationColor,
  parseDecorationSpec,
  parseDecorationStyle,
  toHostDecoration
} from '../src/main/extensions/host/editorDecorations'

describe('parseo de la decoración de VS Code', () => {
  it('la cadena define el estilo, sin importar el orden de las palabras', () => {
    expect(parseDecorationStyle('underline wavy red')).toBe(0)
    expect(parseDecorationStyle('wavy')).toBe(0)
    expect(parseDecorationStyle('underline')).toBe(1)
    expect(parseDecorationStyle('dotted #ff0000')).toBe(2)
    expect(parseDecorationStyle('double underline')).toBe(3)
    // Una extensión puede pedir `line-through`, que el motor no dibuja: no rompe.
    expect(parseDecorationStyle('underline line-through')).toBe(1)
    expect(parseDecorationStyle(undefined)).toBe(1)
  })

  it('el color entiende hex, rgb() y los nombres que más se usan', () => {
    expect(parseDecorationColor('#f00')).toBe(0xff0000ff)
    expect(parseDecorationColor('#ff0000')).toBe(0xff0000ff)
    expect(parseDecorationColor('rgb(255, 0, 0)')).toBe(0xff0000ff)
    expect(parseDecorationColor('red')).toBe(0xff0000ff)
    expect(parseDecorationColor('#ff000080')).toBe(0xff000080)
    // Sin color legible NO se inventa uno: decide el tema.
    expect(parseDecorationColor('var(--color-error)')).toBeUndefined()
    expect(parseDecorationColor(undefined)).toBeUndefined()
  })

  it('acepta la forma nueva y la clásica de las opciones', () => {
    expect(parseDecorationSpec({ textEditorDecorationType: 'underline wavy red' })).toEqual({
      style: 0,
      color: 0xff0000ff
    })
    expect(parseDecorationSpec({ textDecoration: 'underline', color: '#00ff00' })).toEqual({
      style: 1,
      color: 0x00ff00ff
    })
    // `color` explícito gana sobre el que viene en la cadena.
    expect(parseDecorationSpec({ textDecoration: 'underline', color: '#0000ff' }).color).toBe(
      0x0000ffff
    )
    expect(parseDecorationSpec(undefined)).toEqual({ style: 1 })
  })

  it('un rango (u opciones con range) se convierte; lo inválido se descarta', () => {
    const spec = { style: 0 }
    expect(
      toHostDecoration({ start: { line: 2, character: 1 }, end: { line: 2, character: 6 } }, spec)
    ).toEqual({ startLine: 2, startCol: 1, endLine: 2, endCol: 6, style: 0 })

    const withHover = toHostDecoration(
      {
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } },
        hoverMessage: { value: 'import sin usar' }
      },
      spec
    )
    expect(withHover?.message).toBe('import sin usar')

    expect(toHostDecoration({ start: { line: 0 } }, spec)).toBeNull()
    expect(toHostDecoration(null, spec)).toBeNull()
  })
})

describe('EditorDecorationsRegistry', () => {
  it('setDecorations reemplaza por tipo y archivo, y empuja a la UI', () => {
    const pushes: Array<{ entries: Array<{ path: string; decorations: unknown[] }> }> = []
    const registry = new EditorDecorationsRegistry((payload) => pushes.push(payload))
    const type = registry.createType({ textEditorDecorationType: 'underline wavy red' })

    registry.setDecorations('/w/a.ts', type, [
      { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } }
    ])
    expect(registry.snapshot()).toEqual([
      {
        path: '/w/a.ts',
        decorations: [{ startLine: 0, startCol: 0, endLine: 0, endCol: 5, style: 0, color: 0xff0000ff }]
      }
    ])

    // Reemplaza: no se acumulan dos subrayados sobre la misma línea.
    registry.setDecorations('/w/a.ts', type, [
      { start: { line: 3, character: 0 }, end: { line: 3, character: 2 } }
    ])
    expect(registry.snapshot()[0].decorations).toHaveLength(1)
    expect(registry.snapshot()[0].decorations[0].startLine).toBe(3)

    // El último empuje también trae el archivo (la UI reemplaza, no acumula).
    expect(pushes.at(-1)!.entries[0].path).toBe('/w/a.ts')
  })

  it('una lista vacía BORRA el archivo (y viaja en el snapshot)', () => {
    const registry = new EditorDecorationsRegistry(() => undefined)
    const type = registry.createType({ textDecoration: 'underline' })
    registry.setDecorations('/w/b.ts', type, [
      { start: { line: 1, character: 0 }, end: { line: 1, character: 4 } }
    ])
    registry.setDecorations('/w/b.ts', type, [])
    expect(registry.snapshot()).toEqual([{ path: '/w/b.ts', decorations: [] }])
  })

  it('dispose del tipo se lleva sus rangos; disposeAll se lleva todo', () => {
    const registry = new EditorDecorationsRegistry(() => undefined)
    const first = registry.createType({ textDecoration: 'underline' })
    const second = registry.createType({ textDecoration: 'dotted' })
    registry.setDecorations('/w/c.ts', first, [
      { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }
    ])
    registry.setDecorations('/w/c.ts', second, [
      { start: { line: 2, character: 0 }, end: { line: 2, character: 1 } }
    ])
    expect(registry.snapshot()[0].decorations).toHaveLength(2)

    first.dispose()
    expect(registry.snapshot()[0].decorations).toHaveLength(1)

    registry.disposeAll()
    expect(registry.snapshot()).toEqual([{ path: '/w/c.ts', decorations: [] }])
  })

  it('el mismo rango que mandó otra extensión no se mezcla (cada una su registro)', () => {
    const registry = new EditorDecorationsRegistry(() => undefined)
    const type = registry.createType({ textDecoration: 'underline' })
    // Un tipo de OTRO registro (otra extensión) no existe acá: no hace nada.
    registry.setDecorations('/w/d.ts', { key: 'ajeno' }, [
      { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }
    ])
    expect(registry.snapshot()).toEqual([])

    registry.setDecorations('/w/d.ts', type, [])
    expect(registry.snapshot()).toEqual([{ path: '/w/d.ts', decorations: [] }])
  })
})
