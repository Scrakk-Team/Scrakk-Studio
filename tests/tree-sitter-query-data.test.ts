// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Datos del árbol (tags / folds / injections / locals / textobjects).
 *
 * Son funciones PURAS: reciben capturas y texto. Se testean con capturas
 * escritas a mano porque lo que importa no es el parser (eso ya lo cubre
 * `tree-sitter-tokenizer.test.ts` con un `.wasm` real) sino la CONVENCIÓN:
 * cada convención de query de tree-sitter tiene una forma de deducir el dato, y
 * equivocarse ahí no rompe nada visible — sale un símbolo con el nombre
 * equivocado, que es peor.
 */

import { describe, expect, it } from 'vitest'
import {
  buildFoldRanges,
  buildInjectionRanges,
  buildLocalEntries,
  buildSymbols,
  buildTextObjects,
  type RawMatch
} from '../src/main/extensions/treeSitter/queryData'
import type { RawCapture } from '../src/main/extensions/treeSitter/scopes'

/** Captura: `name` sobre el rango [start, end) del texto. */
function cap(name: string, start: number, end: number, properties?: Record<string, string | null>): RawCapture {
  return { name, start, end, properties }
}

function match(captures: RawCapture[], properties: Record<string, string | null> = {}): RawMatch {
  return { captures, properties }
}

describe('tags.scm → símbolos', () => {
  const code = ['fn outer() {', '  fn inner() {}', '}', 'fn other() {}'].join('\n')

  it('anida por CONTENCIÓN de rangos, no por orden de aparición', () => {
    // Índices reales del texto de arriba: `outer` 0..30 (incluye su `}`),
    // `inner` 15..28 y `other` 31..43.
    const captures: RawCapture[] = [
      cap('definition.function', 0, 30),
      cap('name', 3, 8),
      cap('definition.function', 15, 28),
      cap('name', 18, 23),
      cap('definition.function', 31, 43),
      cap('name', 34, 39)
    ]
    const symbols = buildSymbols(captures, code)
    expect(symbols).toHaveLength(2)
    expect(symbols[0].name).toBe('outer')
    expect(symbols[0].endLine).toBe(2)
    expect(symbols[0].children.map((child) => child.name)).toEqual(['inner'])
    expect(symbols[1].name).toBe('other')
  })

  it('sin `@name` usa el texto del propio capture de definición', () => {
    // Convención del `.scm` de JavaScript de nvim: captura el identificador.
    const text = 'const foo = 1'
    const symbols = buildSymbols([cap('definition.variable', 6, 9)], text)
    expect(symbols).toHaveLength(1)
    expect(symbols[0].name).toBe('foo')
    expect(symbols[0].kind).toBe('variable')
  })

  it('un `@name` sin definición que lo contenga se descarta', () => {
    const symbols = buildSymbols([cap('name', 0, 3)], 'foo')
    expect(symbols).toEqual([])
  })

  it('el fin del padre nunca queda ANTES del de un hijo', () => {
    // Invariante del outline: si el padre terminara antes, su rango se vería
    // más chico que el del hijo y el plegado del panel cortaría mal.
    const text = ['a', 'bb', 'ccc'].join('\n')
    const symbols = buildSymbols(
      [
        cap('definition.function', 0, 8),
        cap('name', 0, 1),
        cap('definition.method', 2, 6),
        cap('name', 2, 4)
      ],
      text
    )
    expect(symbols).toHaveLength(1)
    expect(symbols[0].name).toBe('a')
    expect(symbols[0].children[0].name).toBe('bb')
    expect(symbols[0].endLine).toBeGreaterThanOrEqual(symbols[0].children[0].endLine)
  })

  it('en el camino con `@name`, una definición SIN nombre no es símbolo', () => {
    // `@definition.comment` sin `@name` adentro: la convención de tags dice que
    // el nombre lo da el `@name`, así que no hay qué mostrar en el outline.
    const text = ['// doc', 'fn f() {}'].join('\n')
    const symbols = buildSymbols(
      [cap('definition.comment', 0, 6), cap('definition.function', 7, 16), cap('name', 10, 11)],
      text
    )
    expect(symbols).toHaveLength(1)
    expect(symbols[0].name).toBe('f')
    expect(symbols[0].line).toBe(1)
  })
})

describe('folds.scm → rangos plegables', () => {
  const text = ['fn a() {', '  x', '  y', '}', '', 'fn b() {}'].join('\n')

  it('traduce el rango del nodo a líneas (y descarta lo de una línea)', () => {
    // La primera `fn` va de 0 al `}` de la línea 3 (índice 19 = fin exclusivo).
    const folds = buildFoldRanges(
      [match([cap('fold', 0, 19)]), match([cap('fold', 28, 38)])],
      text
    )
    expect(folds).toEqual([{ startLine: 0, endLine: 3, kind: 'region' }])
  })

  it('el kind sale del sufijo del capture', () => {
    const folds = buildFoldRanges([match([cap('fold.comment', 0, 19)])], text)
    expect(folds[0].kind).toBe('comment')
  })

  it('el kind también puede venir de `#set! fold.kind`', () => {
    const folds = buildFoldRanges(
      [match([cap('fold', 0, 19)], { 'fold.kind': 'imports' })],
      text
    )
    expect(folds[0].kind).toBe('imports')
  })

  it('a igual línea de inicio gana el rango MÁS GRANDE', () => {
    const folds = buildFoldRanges(
      [match([cap('fold', 0, 19)]), match([cap('fold', 0, 38)])],
      text
    )
    expect(folds).toHaveLength(1)
    expect(folds[0].endLine).toBe(5)
  })
})

describe('injections.scm → tramos de otro lenguaje', () => {
  const text = ['```js', 'const a = 1', '```'].join('\n')

  it('el lenguaje viene de `#set! injection.language`', () => {
    const ranges = buildInjectionRanges(
      [match([cap('injection.content', 6, 17)], { 'injection.language': 'javascript' })],
      text
    )
    expect(ranges).toHaveLength(1)
    expect(ranges[0].language).toBe('javascript')
    expect(ranges[0].startLine).toBe(1)
    expect(ranges[0].endLine).toBe(1)
    expect(ranges[0].combined).toBe(false)
  })

  it('el lenguaje puede venir del TEXTO de un `@injection.language` (heredoc)', () => {
    const heredoc = ['cat <<EOF', 'SELECT 1', 'EOF'].join('\n')
    const ranges = buildInjectionRanges(
      [
        match([
          cap('injection.content', 10, 18),
          cap('injection.language', 6, 9)
        ])
      ],
      heredoc
    )
    expect(ranges[0].language).toBe('EOF')
    expect(ranges[0].startLine).toBe(1)
  })

  it('`injection.combined` se propaga', () => {
    const ranges = buildInjectionRanges(
      [
        match([cap('injection.content', 6, 17)], {
          'injection.language': 'js',
          'injection.combined': ''
        })
      ],
      text
    )
    expect(ranges[0].combined).toBe(true)
  })

  it('sin lenguaje declarado no se inventa nada', () => {
    expect(buildInjectionRanges([match([cap('injection.content', 6, 17)])], text)).toEqual([])
  })
})

describe('locals.scm → definiciones y referencias', () => {
  const text = ['fn f(a) {', '  b = a', '}', 'f(1)'].join('\n')

  it('el nombre de la definición sale de su `@name` interno', () => {
    const entries = buildLocalEntries(
      [
        cap('local.scope', 0, 26),
        cap('local.definition', 5, 6),
        cap('name', 5, 6),
        cap('local.reference', 16, 17),
        cap('local.reference', 0, 1)
      ],
      text
    )
    const definitions = entries.filter((entry) => entry.kind === 'definition')
    expect(definitions).toHaveLength(1)
    expect(definitions[0].name).toBe('a')
    expect(definitions[0].line).toBe(0)
    // El scope de la definición y de la referencia de adentro es el mismo.
    const inner = entries.find((entry) => entry.kind === 'reference' && entry.line === 1)
    expect(inner?.scope?.startLine).toBe(0)
    expect(inner?.name).toBe('a')
  })

  it('sin `@local.scope` el alcance es el archivo (`null`)', () => {
    const entries = buildLocalEntries([cap('local.definition', 5, 6)], text)
    expect(entries[0].scope).toBeNull()
  })

  it('un nombre de una línea con basura no entra', () => {
    const entries = buildLocalEntries([cap('local.reference', 0, 0)], text)
    expect(entries).toEqual([])
  })
})

describe('textobjects.scm → rangos seleccionables', () => {
  const text = ['fn f(a) {', '  a', '}'].join('\n')

  it('acepta el sufijo `.inner`/`.outer`', () => {
    const objects = buildTextObjects(
      [cap('function.outer', 0, 22), cap('function.inner', 9, 20)],
      text
    )
    expect(objects.map((object) => object.name)).toEqual(['function.outer', 'function.inner'])
  })

  it('acepta el prefijo `textobject.`', () => {
    const objects = buildTextObjects([cap('textobject.class.outer', 0, 22)], text)
    expect(objects[0].name).toBe('class.outer')
  })

  it('normaliza `.inside`/`.around` (Helix y el repo de swift) a `.inner`/`.outer`', () => {
    const objects = buildTextObjects(
      [cap('function.around', 0, 22), cap('function.inside', 9, 20)],
      text
    )
    expect(objects.map((object) => object.name)).toEqual(['function.outer', 'function.inner'])
  })

  it('lo que no es un objeto de texto se ignora', () => {
    expect(buildTextObjects([cap('variable', 0, 22)], text)).toEqual([])
  })
})
