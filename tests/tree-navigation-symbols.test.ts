import { describe, it, expect } from 'vitest'
import { resolveSymbolDefinition } from '../src/renderer/src/features/editor/treeNavigationLogic'
import type { DocumentSymbol } from '../src/renderer/src/services/symbolExtractor'

const symbol = (name: string, line: number, endLine: number, children?: DocumentSymbol[]): DocumentSymbol => ({
  name,
  kind: 'class',
  line,
  endLine,
  children
})

describe('resolveSymbolDefinition (tags.scm → clases/funciones)', () => {
  const symbols: DocumentSymbol[] = [
    symbol('Servicio', 0, 40, [
      symbol('obtener', 5, 12),
      symbol('guardar', 20, 28)
    ]),
    symbol('Servicio', 50, 60)
  ]

  it('elige el símbolo que CONTIENE la posición', () => {
    const found = resolveSymbolDefinition(symbols, 'obtener', { line: 8, column: 4 })
    expect(found?.name).toBe('obtener')
    expect(found?.line).toBe(5)
  })

  it('el más cercano hacia arriba cuando la referencia está afuera', () => {
    const found = resolveSymbolDefinition(symbols, 'Servicio', { line: 45, column: 0 })
    expect(found?.line).toBe(0)
  })

  it('sin coincidencias devuelve null', () => {
    expect(resolveSymbolDefinition(symbols, 'noExiste', { line: 1, column: 0 })).toBeNull()
  })

  it('busca también en símbolos anidados', () => {
    expect(resolveSymbolDefinition(symbols, 'guardar', { line: 22, column: 2 })?.line).toBe(20)
  })
})
