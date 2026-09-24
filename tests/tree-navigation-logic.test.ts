// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Resolución de “ir a la definición” (sin LSP) y expansión de selección.
 *
 * Lo que se protege acá es la diferencia entre resolver con ÁMBITOS y hacerlo
 * con grep: `x` dentro de una función tiene que ir al parámetro de ESA función,
 * no a la primera `x` del archivo. Un test que no distinga esos dos casos no
 * sirve para nada.
 */

import { describe, expect, it } from 'vitest'
import {
  nextTextObject,
  resolveDefinition,
  spansEqual,
  wordAt,
  type Span
} from '../src/renderer/src/features/editor/treeNavigationLogic'
import type { DynamicLocalEntry, DynamicTextObject } from '../src/shared/extensions'

function definition(name: string, line: number, scope: Span | null = null): DynamicLocalEntry {
  return {
    kind: 'definition',
    name,
    line,
    column: 0,
    endLine: line,
    endColumn: name.length,
    scope
  }
}

function reference(name: string, line: number, scope: Span | null = null): DynamicLocalEntry {
  return {
    kind: 'reference',
    name,
    line,
    column: 4,
    endLine: line,
    endColumn: 4 + name.length,
    scope
  }
}

const FILE_SCOPE: Span = { startLine: 0, startColumn: 0, endLine: 40, endColumn: 0 }

describe('wordAt', () => {
  const text = ['const foo_bar = baz();', 'obj.qux = 1'].join('\n')

  it('toma el identificador completo, con `_`', () => {
    expect(wordAt(text, 0, 8)).toBe('foo_bar')
  })

  it('desde el medio de la palabra', () => {
    expect(wordAt(text, 0, 10)).toBe('foo_bar')
  })

  it('NO incluye el punto: `obj.qux` resuelve `qux`', () => {
    expect(wordAt(text, 1, 6)).toBe('qux')
  })

  it('con el caret JUSTO después de la palabra, la resuelve igual', () => {
    // `const|` — es el caso normal de poner el cursor al final del identificador.
    expect(wordAt(text, 0, 5)).toBe('const')
  })

  it('en un espacio (sin palabra pegada) no hay palabra', () => {
    // `const foo_bar =| baz()`: el carácter anterior es `=`, no una palabra.
    expect(wordAt(text, 0, 15)).toBe('')
  })

  it('fuera del texto no rompe', () => {
    expect(wordAt(text, 99, 0)).toBe('')
  })
})

describe('resolveDefinition', () => {
  it('prefiere la definición del MISMO ámbito (el parámetro, no otra igual)', () => {
    const inner: Span = { startLine: 5, startColumn: 0, endLine: 9, endColumn: 1 }
    const other: Span = { startLine: 20, startColumn: 0, endLine: 25, endColumn: 1 }
    const locals = [
      definition('value', 6, inner),
      definition('value', 21, other),
      reference('value', 7, inner)
    ]
    const target = resolveDefinition(locals, 'value', { line: 7, column: 5 })
    expect(target?.line).toBe(6)
  })

  it('sube a un ámbito que CONTIENE al de la referencia (closure)', () => {
    const outer: Span = { startLine: 0, startColumn: 0, endLine: 30, endColumn: 1 }
    const inner: Span = { startLine: 10, startColumn: 0, endLine: 14, endColumn: 1 }
    const locals = [
      definition('total', 1, outer),
      definition('total', 40, null),
      reference('total', 11, inner)
    ]
    const target = resolveDefinition(locals, 'total', { line: 11, column: 5 })
    expect(target?.line).toBe(1)
  })

  it('sin ámbitos cae a la definición más cercana HACIA ARRIBA', () => {
    const locals = [definition('run', 2, null), definition('run', 50, null)]
    const target = resolveDefinition(locals, 'run', { line: 30, column: 3 })
    expect(target?.line).toBe(2)
  })

  it('si no hay ninguna definición con ese nombre, no inventa', () => {
    expect(resolveDefinition([definition('otra', 1)], 'run', { line: 2, column: 0 })).toBeNull()
    expect(resolveDefinition([], '', { line: 0, column: 0 })).toBeNull()
  })

  it('con el cursor sobre la propia referencia sin ámbito, no rompe', () => {
    const locals = [definition('x', 0, FILE_SCOPE), reference('x', 3, null)]
    expect(resolveDefinition(locals, 'x', { line: 3, column: 5 })?.line).toBe(0)
  })
})

describe('nextTextObject', () => {
  const objects: DynamicTextObject[] = [
    { name: 'function.outer', startLine: 0, startColumn: 0, endLine: 9, endColumn: 1 },
    { name: 'function.inner', startLine: 1, startColumn: 2, endLine: 8, endColumn: 1 },
    { name: 'parameter.outer', startLine: 1, startColumn: 13, endLine: 1, endColumn: 19 }
  ]

  it('el primer paso toma el objeto MÁS CHICO que contiene el cursor', () => {
    const next = nextTextObject(objects, { line: 1, column: 15 }, null)
    expect(next?.name).toBe('parameter.outer')
  })

  it('el segundo paso sube al siguiente más grande', () => {
    const previous: Span = { startLine: 1, startColumn: 13, endLine: 1, endColumn: 19 }
    const next = nextTextObject(objects, { line: 1, column: 13 }, previous)
    expect(next?.name).toBe('function.inner')
  })

  it('cuando ya no hay más grandes, devuelve null', () => {
    const previous: Span = { startLine: 0, startColumn: 0, endLine: 9, endColumn: 1 }
    expect(nextTextObject(objects, { line: 0, column: 0 }, previous)).toBeNull()
  })

  it('sin objetos que contengan el punto, no hay nada', () => {
    expect(nextTextObject(objects, { line: 30, column: 0 }, null)).toBeNull()
  })
})

describe('spansEqual', () => {
  it('compara los dos nulos como iguales (alcance de archivo)', () => {
    expect(spansEqual(null, null)).toBe(true)
    expect(spansEqual(null, FILE_SCOPE)).toBe(false)
  })
})
