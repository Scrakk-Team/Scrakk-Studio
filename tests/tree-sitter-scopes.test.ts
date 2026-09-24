// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { describe, expect, it } from 'vitest'
import { buildScopeTokens, lineStarts, positionAt } from '../src/main/extensions/treeSitter/scopes'
import { classifyParserAbi, parseDeclaredAbi } from '../src/main/extensions/treeSitter/abi'

/**
 * Estas funciones son el corazón del resaltado dinámico: convierten lo que
 * devuelve tree-sitter (capturas por nodo) en el formato que come el motor
 * (tokens por línea, columnas, scope stack). Si esto se equivoca, el color sale
 * corrido y no hay error en ningún lado.
 */
describe('capturas tree-sitter → tokens', () => {
  it('apila los scopes de las capturas anidadas (la de adentro va después)', () => {
    const text = 'hello world'
    const { scopeSets, tokens } = buildScopeTokens(
      [
        { start: 0, end: 5, name: 'variable' },
        { start: 1, end: 3, name: 'string' }
      ],
      text
    )
    expect(tokens).toEqual([
      { line: 0, start: 0, end: 5, scopes: 0 },
      { line: 0, start: 1, end: 3, scopes: 1 }
    ])
    expect(scopeSets[0]).toEqual(['variable'])
    // El stack completo: saber que un `string` está dentro de una `variable`
    // es lo que permite que el resolutor elija otro slot.
    expect(scopeSets[1]).toEqual(['variable', 'string'])
  })

  it('no anida capturas hermanas', () => {
    const { scopeSets, tokens } = buildScopeTokens(
      [
        { start: 0, end: 2, name: 'a' },
        { start: 3, end: 5, name: 'b' }
      ],
      'aa bb'
    )
    expect(tokens).toHaveLength(2)
    expect(scopeSets[tokens[1].scopes]).toEqual(['b'])
  })

  it('dos capturas del MISMO rango se apilan (mismo nodo, dos nombres)', () => {
    const { scopeSets, tokens } = buildScopeTokens(
      [
        { start: 0, end: 5, name: 'string' },
        { start: 0, end: 5, name: 'spell' }
      ],
      'hello'
    )
    expect(tokens).toHaveLength(2)
    // A igual rango se ordena por nombre (dos corridas tienen que dar lo
    // mismo): el que va después queda más adentro y es el que pinta.
    expect(scopeSets[tokens[0].scopes]).toEqual(['spell'])
    expect(scopeSets[tokens[1].scopes]).toEqual(['spell', 'string'])
  })

  it('parte una captura multilínea por línea (el motor pinta dentro de la línea)', () => {
    const { tokens, scopeSets } = buildScopeTokens([{ start: 0, end: 7, name: 'comment' }], 'one\ntwo')
    expect(tokens).toEqual([
      { line: 0, start: 0, end: 3, scopes: 0 },
      { line: 1, start: 0, end: 3, scopes: 0 }
    ])
    expect(scopeSets).toHaveLength(1)
  })

  it('internea los stacks repetidos (un archivo grande tiene pocos scopes distintos)', () => {
    const { scopeSets, tokens } = buildScopeTokens(
      [
        { start: 0, end: 1, name: 'keyword' },
        { start: 2, end: 3, name: 'keyword' },
        { start: 4, end: 5, name: 'keyword' }
      ],
      'a b c'
    )
    expect(tokens).toHaveLength(3)
    expect(scopeSets).toHaveLength(1)
  })

  it('descarta capturas vacías y ordena los tokens por posición', () => {
    const { tokens } = buildScopeTokens(
      [
        { start: 3, end: 5, name: 'b' },
        { start: 3, end: 3, name: 'empty' },
        { start: 0, end: 2, name: 'a' }
      ],
      'aa bb'
    )
    expect(tokens.map((token) => token.start)).toEqual([0, 3])
  })

  it('usa los índices del parser tal cual (ya son columnas UTF-16)', () => {
    // El binding entrega el texto con `(i) => texto.slice(i)`, así que sus
    // índices son unidades UTF-16 — la misma unidad que la columna del editor.
    // Si acá se "tradujera de bytes a UTF-16", el color se correría a partir
    // del primer acento o emoji de la línea.
    // 'ñ if' mide 4 unidades UTF-16: un rango [3,5) se recorta a [3,4), no se
    // "corrige" con la diferencia de bytes (que daría [3,6)).
    expect(buildScopeTokens([{ start: 3, end: 5, name: 'keyword' }], 'ñ if').tokens).toEqual([
      { line: 0, start: 3, end: 4, scopes: 0 }
    ])
    // Un emoji ocupa DOS unidades UTF-16: el token que empieza después arranca
    // en la 3, no en la 5.
    const emoji = '😀 x'
    expect(buildScopeTokens([{ start: 3, end: 4, name: 'variable' }], emoji).tokens).toEqual([
      { line: 0, start: 3, end: 4, scopes: 0 }
    ])
  })

  it('recorta rangos que se pasan del texto (parser con índices raros)', () => {
    const { tokens } = buildScopeTokens([{ start: 0, end: 99, name: 'x' }], 'ab')
    expect(tokens).toEqual([{ line: 0, start: 0, end: 2, scopes: 0 }])
  })

  it('línea/columna desde un índice UTF-16', () => {
    const starts = lineStarts('uno\ndos\n')
    expect(starts).toEqual([0, 4, 8])
    expect(positionAt(0, starts)).toEqual({ line: 0, column: 0 })
    expect(positionAt(5, starts)).toEqual({ line: 1, column: 1 })
    expect(positionAt(8, starts)).toEqual({ line: 2, column: 0 })
  })
})

describe('ABI del parser', () => {
  it('lee la ABI declarada en los formatos que se ven en los manifests', () => {
    expect(parseDeclaredAbi('tree-sitter-abi-14')).toBe(14)
    expect(parseDeclaredAbi('abi-13')).toBe(13)
    expect(parseDeclaredAbi('14')).toBe(14)
    expect(parseDeclaredAbi(undefined)).toBeNull()
    expect(parseDeclaredAbi('desconocida')).toBeNull()
  })

  it('avisa sólo cuando hay ABI declarada Y distinta', () => {
    expect(classifyParserAbi({ abiVersion: 14 }, 'tree-sitter-abi-14').warning).toBeNull()
    // Sin declarar no se avisa: un warning inventado enseña a ignorarlos.
    expect(classifyParserAbi({ abiVersion: 14 }, undefined).warning).toBeNull()
    const mismatch = classifyParserAbi({ abiVersion: 13 }, 'abi-14')
    expect(mismatch.version).toBe(13)
    expect(mismatch.warning).toContain('14')
    expect(mismatch.warning).toContain('13')
  })
})
