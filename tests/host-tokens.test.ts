import { describe, expect, it } from 'vitest'
import {
  resetHostTokens,
  setSourceTokens,
  sourceCount
} from '@features/editor/engines/innerta/hostTokens'
import { decodeHostTokens, LEGEND } from '@shared/syntax'
import type { InnertaModule } from '@features/editor/engines/innerta/InnertaEngine'

/** Módulo falso: lo único que el canal usa es `setHostTokens`. */
function fakeModule(): { mod: InnertaModule; pushed: Array<{ data: number[]; source: number }> } {
  const pushed: Array<{ data: number[]; source: number }> = []
  const mod = {
    setHostTokens: (data: number[], source: number): void => {
      pushed.push({ data, source })
    }
  } as unknown as InnertaModule
  return { mod, pushed }
}

describe('canal de tokens del host', () => {
  it('sin tokens publica fuente 0 (sólo tree-sitter embebido)', () => {
    const { mod, pushed } = fakeModule()
    resetHostTokens(mod, '/a.ts')
    expect(pushed.at(-1)).toEqual({ data: [], source: 0 })
  })

  it('con tokens publica fuente 2 (mixto) y el payload delta', () => {
    const { mod, pushed } = fakeModule()
    setSourceTokens(mod, '/a.ts', 'textMate', [{ line: 0, startChar: 0, length: 3, slot: 0 }])
    const last = pushed.at(-1)
    expect(last?.source).toBe(2)
    expect(decodeHostTokens(last?.data)).toEqual([
      { line: 0, startChar: 0, length: 3, slot: 0 }
    ])
  })

  it('fusiona las fuentes por prioridad: el LSP pisa la gramática', () => {
    const { mod, pushed } = fakeModule()
    setSourceTokens(mod, '/a.ts', 'textMate', [{ line: 0, startChar: 0, length: 10, slot: 5 }])
    setSourceTokens(mod, '/a.ts', 'semanticTokens', [{ line: 0, startChar: 4, length: 2, slot: 0 }])

    expect(sourceCount(mod)).toBe(2)
    expect(decodeHostTokens(pushed.at(-1)?.data)).toEqual([
      { line: 0, startChar: 0, length: 4, slot: 5 },
      { line: 0, startChar: 4, length: 2, slot: 0 },
      { line: 0, startChar: 6, length: 4, slot: 5 }
    ])
  })

  it('una fuente que se queda sin tokens sale del merge (no borra a la otra)', () => {
    const { mod, pushed } = fakeModule()
    setSourceTokens(mod, '/a.ts', 'textMate', [{ line: 1, startChar: 0, length: 2, slot: 1 }])
    setSourceTokens(mod, '/a.ts', 'semanticTokens', [{ line: 0, startChar: 0, length: 2, slot: 0 }])
    setSourceTokens(mod, '/a.ts', 'semanticTokens', null)

    expect(sourceCount(mod)).toBe(1)
    expect(decodeHostTokens(pushed.at(-1)?.data)).toEqual([
      { line: 1, startChar: 0, length: 2, slot: 1 }
    ])
  })

  it('cambiar de archivo tira TODO lo anterior', () => {
    // Si no, el archivo nuevo se pinta con los tokens del viejo hasta que cada
    // fuente se recalcule (y el LSP tarda cientos de ms).
    const { mod, pushed } = fakeModule()
    setSourceTokens(mod, '/a.ts', 'textMate', [{ line: 0, startChar: 0, length: 2, slot: 0 }])
    setSourceTokens(mod, '/a.ts', 'semanticTokens', [{ line: 0, startChar: 0, length: 2, slot: 0 }])
    resetHostTokens(mod, '/b.ts')

    expect(sourceCount(mod)).toBe(0)
    expect(pushed.at(-1)).toEqual({ data: [], source: 0 })
  })

  it('un módulo sin el export (WASM viejo) no rompe nada', () => {
    const mod = {} as InnertaModule
    expect(() => setSourceTokens(mod, '/a.ts', 'textMate', [{ line: 0, startChar: 0, length: 1, slot: 0 }])).not.toThrow()
    expect(sourceCount(mod)).toBe(1)
  })

  it('el payload usa la leyenda, no el slot', () => {
    const { mod, pushed } = fakeModule()
    setSourceTokens(mod, '/a.ts', 'textMate', [{ line: 0, startChar: 0, length: 1, slot: 13 }])
    // slot 13 (tag) → leyenda 23: es lo que el motor espera leer.
    expect(pushed.at(-1)?.data[3]).toBe(LEGEND.tag)
  })

  it('una publicación por cambio de fuente (no una por merge parcial)', () => {
    const { mod, pushed } = fakeModule()
    setSourceTokens(mod, '/a.ts', 'textMate', [{ line: 0, startChar: 0, length: 1, slot: 0 }])
    setSourceTokens(mod, '/a.ts', 'semanticTokens', [{ line: 0, startChar: 0, length: 1, slot: 0 }])
    expect(pushed).toHaveLength(2)
  })
})
