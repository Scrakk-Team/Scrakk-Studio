/**
 * Puente de los datos del árbol: símbolos → outline y plegado → motor.
 *
 * Las dos conversiones son de FORMA (el árbol produce una cosa y el consumidor
 * espera otra) y por eso vale testearlas: un `kind` que no matchea el del
 * outline deja un icono genérico, y un triplete de plegado mal armado deja el
 * gutter con chevrons en líneas equivocadas.
 */

import { describe, expect, it, beforeEach } from 'vitest'
import {
  _resetDynamicSyntaxForTests,
  clearDynamicSyntax,
  getDynamicSyntax,
  publishDynamicSyntax,
  subscribeToDynamicSyntax,
  toDocumentSymbol,
  toDocumentSymbols
} from '../src/renderer/src/services/extensions/dynamicSyntax'
import { foldPayload } from '../src/renderer/src/features/editor/engines/innerta/treeSitterHighlightBridge'
import type { DynamicSymbolNode } from '../src/shared/extensions'

function node(overrides: Partial<DynamicSymbolNode> = {}): DynamicSymbolNode {
  return {
    name: 'f',
    kind: 'function',
    line: 0,
    column: 3,
    endLine: 4,
    endColumn: 1,
    children: [],
    ...overrides
  }
}

describe('símbolos del árbol → símbolos del outline', () => {
  it('mapea los kinds de tags a los del outline', () => {
    expect(toDocumentSymbol(node({ kind: 'function' })).kind).toBe('function')
    expect(toDocumentSymbol(node({ kind: 'method' })).kind).toBe('method')
    expect(toDocumentSymbol(node({ kind: 'class' })).kind).toBe('class')
    // Alias que usan varias gramáticas.
    expect(toDocumentSymbol(node({ kind: 'type' })).kind).toBe('class')
    expect(toDocumentSymbol(node({ kind: 'parameter' })).kind).toBe('variable')
  })

  it('un kind desconocido cae a `variable` en vez de romper el icono', () => {
    expect(toDocumentSymbol(node({ kind: 'cosa-rara' })).kind).toBe('variable')
  })

  it('pasa línea/fin y anida los hijos', () => {
    const symbols = toDocumentSymbols([
      node({
        name: 'outer',
        children: [node({ name: 'inner', line: 1, endLine: 2 })]
      })
    ])
    expect(symbols[0].line).toBe(0)
    expect(symbols[0].endLine).toBe(4)
    expect(symbols[0].children?.[0].name).toBe('inner')
    // Sin hijos, la propiedad va `undefined` (el panel decide con eso).
    expect(toDocumentSymbol(node()).children).toBeUndefined()
  })
})

describe('plegado → payload del motor', () => {
  it('arma tripletes (inicio, fin, kind)', () => {
    expect(
      foldPayload([
        { startLine: 2, endLine: 8, kind: 'region' },
        { startLine: 10, endLine: 14, kind: 'comment' },
        { startLine: 20, endLine: 25, kind: 'imports' }
      ])
    ).toEqual([2, 8, 0, 10, 14, 1, 20, 25, 2])
  })

  it('descarta los rangos vacíos o invertidos', () => {
    expect(foldPayload([{ startLine: 5, endLine: 5, kind: 'region' }])).toEqual([])
    expect(foldPayload([{ startLine: 9, endLine: 3, kind: 'region' }])).toEqual([])
  })

  it('un array vacío es una orden: volver al plegado por indentación', () => {
    expect(foldPayload([])).toEqual([])
  })
})

describe('store de sintaxis dinámica', () => {
  beforeEach(() => {
    _resetDynamicSyntaxForTests()
  })

  it('publica por path y avisa a los suscriptores', () => {
    let notifications = 0
    const unsubscribe = subscribeToDynamicSyntax(() => {
      notifications++
    })
    publishDynamicSyntax('/a.ts', {
      languageId: 'typescript',
      extensionId: 'demo.ts',
      symbols: toDocumentSymbols([node()]),
      folds: [{ startLine: 0, endLine: 4, kind: 'region' }],
      locals: [],
      textObjects: [],
      appliedCategories: ['highlights', 'tags'],
      at: 1
    })
    expect(notifications).toBe(1)
    expect(getDynamicSyntax('/a.ts')?.languageId).toBe('typescript')
    expect(getDynamicSyntax('/otro.ts')).toBeNull()
    unsubscribe()
  })

  it('cerrar el archivo tira sus datos (un outline viejo es peor que vacío)', () => {
    publishDynamicSyntax('/a.ts', {
      languageId: 'typescript',
      extensionId: 'demo.ts',
      symbols: [],
      folds: [],
      locals: [],
      textObjects: [],
      appliedCategories: [],
      at: 1
    })
    clearDynamicSyntax('/a.ts')
    expect(getDynamicSyntax('/a.ts')).toBeNull()
  })

  it('sin path devuelve null (no adivina “el último”)', () => {
    expect(getDynamicSyntax(null)).toBeNull()
    expect(getDynamicSyntax(undefined)).toBeNull()
  })
})
