// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Store de decoraciones (subrayado por rango) — multi-fuente.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUÉ SE PRUEBA Y POR QUÉ
 *
 * El editor recibe los subrayados por UN canal del motor (el mismo que usa el
 * LSP y las extensiones). Antes de llegar ahí, todo pasa por este store, y las
 * tres cosas que se rompen en silencio son:
 *
 *   1. dos fuentes sobre la misma línea — una pisa a la otra,
 *   2. el `[]` que una fuente manda al limpiar — se ignora y queda pintado, y
 *   3. el empaquetado a sextupletes — un orden distinto de ints y el motor
 *      dibuja un rango donde no va.
 */

import { describe, expect, it } from 'vitest'
import {
  _resetDecorationsStoreForTests,
  clearDecorations,
  DECORATION_STYLE_CODES,
  decorationStyleFromCode,
  fromHostDecoration,
  getDecorationSources,
  getDecorations,
  getDecorationsAt,
  packDecorations,
  setDecorations,
  subscribeToDecorations,
  themeColor,
  type EditorDecoration
} from '../src/renderer/src/services/decorations'

function deco(line: number, style: EditorDecoration['style'] = 'wavy'): EditorDecoration {
  return { startLine: line, startCol: 0, endLine: line, endCol: 5, color: 0xff0000ff, style }
}

describe('decorations: varias fuentes en el mismo archivo', () => {
  it('el LSP y una extensión conviven (ninguna pisa a la otra)', () => {
    _resetDecorationsStoreForTests()
    const path = '/w/conviven.ts'
    setDecorations('diagnostics:lsp:tsserver', path, [deco(1)])
    setDecorations('extension:pub.linter', path, [deco(5, 'underline')])

    expect(getDecorations(path)).toHaveLength(2)
    expect(getDecorationSources(path)).toEqual(['diagnostics:lsp:tsserver', 'extension:pub.linter'])
  })

  it('limpiar una fuente deja viva a la otra', () => {
    _resetDecorationsStoreForTests()
    const path = '/w/limpiar.ts'
    setDecorations('diagnostics:lsp:tsserver', path, [deco(1)])
    setDecorations('extension:pub.linter', path, [deco(2, 'dotted')])

    clearDecorations('extension:pub.linter')
    expect(getDecorations(path).map((entry) => entry.startLine)).toEqual([1])
    expect(getDecorationSources(path)).toEqual(['diagnostics:lsp:tsserver'])

    // Y la que queda también puede limpiar por archivo, sin tocar otros.
    const other = '/w/otro.ts'
    setDecorations('diagnostics:lsp:tsserver', other, [deco(9)])
    clearDecorations('diagnostics:lsp:tsserver', path)
    expect(getDecorations(path)).toHaveLength(0)
    expect(getDecorations(other)).toHaveLength(1)
  })

  it('la misma lista otra vez NO emite (los servers la repiten en cada tecla)', () => {
    _resetDecorationsStoreForTests()
    const path = '/w/repeticion.ts'
    setDecorations('diagnostics:lsp:tsserver', path, [deco(1)])
    let notifications = 0
    const unsubscribe = subscribeToDecorations(() => {
      notifications += 1
    })

    setDecorations('diagnostics:lsp:tsserver', path, [deco(1)])
    expect(notifications).toBe(0)

    setDecorations('diagnostics:lsp:tsserver', path, [deco(2)])
    expect(notifications).toBe(1)

    setDecorations('diagnostics:lsp:tsserver', path, [])
    expect(notifications).toBe(2)
    unsubscribe()
  })

  it('los rangos invertidos se descartan antes de llegar al motor', () => {
    _resetDecorationsStoreForTests()
    const path = '/w/basura.ts'
    setDecorations('manual', path, [
      { startLine: 3, startCol: 4, endLine: 1, endCol: 0, color: 0xffffffff },
      deco(2)
    ])
    expect(getDecorations(path)).toHaveLength(1)
    expect(getDecorations(path)[0].startLine).toBe(2)
  })

  it('un rango VACÍO se conserva (el server de CSS reporta así `} expected`)', () => {
    _resetDecorationsStoreForTests()
    const path = '/w/vacio.css'
    // Antes esto se descartaba por "invertido" y el problema desaparecía en
    // silencio: el panel lo listaba y el editor no subrayaba nada.
    setDecorations('diagnostics:lsp:css', path, [
      { startLine: 3, startCol: 4, endLine: 3, endCol: 4, color: 0xff0000ff, message: '} expected' }
    ])
    expect(getDecorations(path)).toHaveLength(1)
  })
})

describe('decorations: lo que consume el motor y el hover', () => {
  it('empaqueta sextupletes (línea, col, línea, col, rgba, estilo)', () => {
    const packed = packDecorations([
      { startLine: 1, startCol: 2, endLine: 3, endCol: 4, color: 0xffcc00ff, style: 'dotted' }
    ])
    expect(packed).toEqual([1, 2, 3, 4, 0xffcc00ff | 0, DECORATION_STYLE_CODES.dotted])
    // El orden importa: el C++ lee (startLine, startCol, endLine, endCol, rgba, style).
    expect(packed).toHaveLength(6)
  })

  it('un rango vacío se empaqueta con UN carácter de ancho (0 = 0 píxeles)', () => {
    _resetDecorationsStoreForTests()
    const packed = packDecorations([
      { startLine: 3, startCol: 4, endLine: 3, endCol: 4, color: 0xff0000ff, style: 'wavy' }
    ])
    expect(packed).toEqual([3, 4, 3, 5, 0xff0000ff | 0, DECORATION_STYLE_CODES.wavy])
  })

  it('un rango vacío también se encuentra con el hover (mismo tramo que se dibuja)', () => {
    _resetDecorationsStoreForTests()
    const path = '/w/vacio-hover.css'
    setDecorations('diagnostics:lsp:css', path, [
      { startLine: 3, startCol: 4, endLine: 3, endCol: 4, color: 0xff0000ff, message: '} expected' }
    ])
    expect(getDecorationsAt(path, 3, 4)).toHaveLength(1)
    expect(getDecorationsAt(path, 3, 3)).toHaveLength(0)
  })

  it('una posición dentro del rango se encuentra; el final es exclusivo', () => {
    _resetDecorationsStoreForTests()
    const path = '/w/hover.ts'
    setDecorations('diagnostics:lsp:tsserver', path, [
      { startLine: 4, startCol: 2, endLine: 4, endCol: 8, color: 0xffffffff, message: 'algo' }
    ])

    expect(getDecorationsAt(path, 4, 2)).toHaveLength(1)
    expect(getDecorationsAt(path, 4, 7)).toHaveLength(1)
    expect(getDecorationsAt(path, 4, 1)).toHaveLength(0)
    expect(getDecorationsAt(path, 4, 9)).toHaveLength(0)
    expect(getDecorationsAt(path, 5, 4)).toHaveLength(0)
  })

  it('rango multilínea: cualquier línea de en medio está adentro', () => {
    _resetDecorationsStoreForTests()
    const path = '/w/multilinea.ts'
    setDecorations('manual', path, [
      { startLine: 1, startCol: 5, endLine: 4, endCol: 3, color: 0xffffffff }
    ])
    expect(getDecorationsAt(path, 2, 0)).toHaveLength(1)
    expect(getDecorationsAt(path, 3, 999)).toHaveLength(1)
    expect(getDecorationsAt(path, 1, 4)).toHaveLength(0)
    expect(getDecorationsAt(path, 4, 4)).toHaveLength(0)
  })
})

describe('decorations: del payload del host al store', () => {
  it('un estilo desconocido cae en ondulada (nunca en nada raro)', () => {
    expect(decorationStyleFromCode(0)).toBe('wavy')
    expect(decorationStyleFromCode(2)).toBe('dotted')
    expect(decorationStyleFromCode(3)).toBe('double')
    expect(decorationStyleFromCode(undefined)).toBe('wavy')
    expect(decorationStyleFromCode(99)).toBe('wavy')
  })

  it('sin color propio usa el del tema (y con color, el suyo)', () => {
    const withoutColor = fromHostDecoration({
      startLine: 0,
      startCol: 0,
      endLine: 0,
      endCol: 3,
      style: 1
    })
    expect(withoutColor.color).toBe(themeColor('--color-info', '#3794ff'))
    expect(withoutColor.style).toBe('underline')

    const withColor = fromHostDecoration({
      startLine: 0,
      startCol: 0,
      endLine: 0,
      endCol: 3,
      style: 0,
      color: 0xff0000ff,
      message: 'no usado'
    })
    expect(withColor.color).toBe(0xff0000ff)
    expect(withColor.message).toBe('no usado')
  })
})
