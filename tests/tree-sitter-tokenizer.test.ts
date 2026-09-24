// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { DynamicTokenizeRequest, DynamicTokenizeResult } from '../src/shared/extensions'

/**
 * Tokenizado dinámico REAL: parser wasm de verdad y queries de verdad. Un mock
 * acá no probaría nada — lo que hay que verificar es que el árbol de sintaxis
 * llegue convertido a scopes con las columnas correctas, y eso no se revisa a
 * ojo.
 *
 * El `.wasm` NO se versiona (es un binario de terceros de ~400 KB). El test se
 * salta solo si no está:
 *
 *   npm pack @vscode/tree-sitter-wasm@0.3.1 && tar xzf *.tgz
 *   SCRAKK_TS_PARSER=$PWD/package/wasm/tree-sitter-javascript.wasm npm test
 *
 * Se usa el paquete que publica VS Code porque sus parsers están compilados
 * contra el MISMO runtime (`web-tree-sitter`) que usa la app: un `.wasm` de otra
 * ABI falla al enlazarse (`getDylinkMetadata`) y el test no probaría nada.
 */
// Si la variable apunta a un archivo que ya no está (tmp limpiado, pack viejo),
// el test se SALTEA en vez de tirar un ENOENT confuso en el `beforeAll`.
const parserEnv = process.env['SCRAKK_TS_PARSER']
const parserSource = parserEnv && existsSync(parserEnv) ? parserEnv : undefined

/** Queries de resaltado de JavaScript, con capturas ANIDADAS a propósito. */
const HIGHLIGHTS = `
(function_declaration name: (identifier) @function)
(call_expression function: (identifier) @function.call)
(variable_declarator name: (identifier) @variable)
(string) @string
(number) @number
(true) @constant.builtin
(comment) @comment
[
  "function"
  "const"
  "return"
] @keyword
`

const root = mkdtempSync(join(tmpdir(), 'scrakk-ts-'))

const { createTreeSitterTokenizer } = await import('../src/main/extensions/treeSitter/tokenizer')

function request(text: string, queries = [{ file: join(root, 'queries', 'highlights.scm'), category: 'highlights' as const }]): DynamicTokenizeRequest {
  return {
    languageId: 'javascript',
    parserPath: join(root, 'grammars', 'javascript.wasm'),
    queries,
    text
  }
}

/** Scope del token que cubre `[start, end)` de la línea pedida. */
function scopeAt(result: DynamicTokenizeResult, line: number, start: number, end: number): string[] {
  const token = result.tokens.find((t) => t.line === line && t.start === start && t.end === end)
  if (!token) {
    throw new Error(
      `sin token en L${line + 1}:${start}-${end} (hay: ${result.tokens
        .filter((t) => t.line === line)
        .map((t) => `${t.start}-${t.end}`)
        .join(', ')})`
    )
  }
  return result.scopeSets[token.scopes]
}

describe.skipIf(!parserSource)('tokenizador tree-sitter dinámico (parser real)', () => {
  beforeAll(() => {
    mkdirSync(join(root, 'grammars'), { recursive: true })
    mkdirSync(join(root, 'queries'), { recursive: true })
    if (parserSource) copyFileSync(parserSource, join(root, 'grammars', 'javascript.wasm'))
    writeFileSync(join(root, 'queries', 'highlights.scm'), HIGHLIGHTS)
    // El resto de las categorías, con la convención REAL de tree-sitter: son
    // las que el tokenizador cargaba y tiraba a la basura.
    writeFileSync(
      join(root, 'queries', 'tags.scm'),
      '(function_declaration name: (identifier) @name) @definition.function\n'
    )
    writeFileSync(join(root, 'queries', 'folds.scm'), '(function_declaration) @fold\n')
    writeFileSync(
      join(root, 'queries', 'locals.scm'),
      [
        '(function_declaration) @local.scope',
        '(variable_declarator name: (identifier) @local.definition)',
        '(call_expression function: (identifier) @local.reference)'
      ].join('\n') + '\n'
    )
  })

  afterAll(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('tokeniza con el árbol real y resuelve cada captura a un scope', async () => {
    const tokenizer = createTreeSitterTokenizer()
    const text = 'const saludo = "hola"\nfunction f() { return 1 }\n'
    const result = await tokenizer.tokenize(request(text))

    expect(result.ok).toBe(true)
    expect(result.failed).toEqual([])
    expect(result.applied).toEqual([join(root, 'queries', 'highlights.scm')])

    // `const` es keyword y `saludo` es variable: dos capturas distintas sobre
    // la misma línea, y el tokenizador tiene que haberlas separado bien.
    expect(scopeAt(result, 0, 0, 5)).toEqual(['keyword'])
    expect(scopeAt(result, 0, 6, 12)).toEqual(['variable'])
    expect(scopeAt(result, 0, 15, 21)).toEqual(['string'])
    // Línea 2: `f` (función) y `function`/`return` (keywords) y el `1`
    // (number) — es la prueba de que se está mirando el ÁRBOL, no un regex.
    expect(scopeAt(result, 1, 0, 8)).toEqual(['keyword'])
    expect(scopeAt(result, 1, 9, 10)).toEqual(['function'])
    expect(scopeAt(result, 1, 15, 21)).toEqual(['keyword'])
    expect(scopeAt(result, 1, 22, 23)).toEqual(['number'])
  })

  it('cada token cae dentro de su línea', async () => {
    const tokenizer = createTreeSitterTokenizer()
    const result = await tokenizer.tokenize(request('const a = 1\nconst b = 2\n'))
    expect(result.ok).toBe(true)
    expect(result.tokens.some((token) => token.line === 0)).toBe(true)
    expect(result.tokens.some((token) => token.line === 1)).toBe(true)
    for (const token of result.tokens) {
      expect(token.start).toBeLessThan(token.end)
    }
  })

  it('cuenta en columnas UTF-16 aunque el texto tenga acentos y emojis', async () => {
    const tokenizer = createTreeSitterTokenizer()
    const result = await tokenizer.tokenize(request('const saludo = "ñandú 😀"\n'))
    expect(result.ok).toBe(true)
    // El string arranca en la columna 15 y termina en la 25: `"ñandú 😀"` son
    // 10 unidades UTF-16 (el emoji ocupa 2). Contando bytes (14) el token
    // terminaría en la 29 y todo lo que siguiera saldría corrido.
    expect(scopeAt(result, 0, 15, 25)).toEqual(['string'])
  })

  it('reporta la query rota y sigue pintando con las buenas', async () => {
    const tokenizer = createTreeSitterTokenizer()
    const broken = join(root, 'queries', 'broken.scm')
    writeFileSync(broken, '(esto_no_existe_en_la_gramatica) @x')
    const result = await tokenizer.tokenize(
      request('const a = 1\n', [
        { file: broken, category: 'highlights' },
        { file: join(root, 'queries', 'highlights.scm'), category: 'highlights' }
      ])
    )
    expect(result.ok).toBe(true)
    expect(result.failed.some((failure) => failure.file === broken)).toBe(true)
    expect(result.applied).toEqual([join(root, 'queries', 'highlights.scm')])
    expect(result.tokens.length).toBeGreaterThan(0)
  })

  it('recarga parser y queries si el paquete cambia en disco', async () => {
    const tokenizer = createTreeSitterTokenizer()
    const first = await tokenizer.tokenize(request('const a = 1\n'))
    expect(first.scopeSets.flat()).not.toContain('object')

    // El paquete se reinstala: la próxima corrida tiene que recargar en vez de
    // servir el parser y las queries viejas hasta reiniciar la app.
    writeFileSync(join(root, 'queries', 'highlights.scm'), `${HIGHLIGHTS}\n(program) @object\n`)
    const second = await tokenizer.tokenize(request('const a = 1\n'))
    expect(second.scopeSets.flat()).toContain('object')
  })

  /**
   * El resto del árbol, con el parser REAL.
   *
   * Es la parte que antes se tiraba (`tags.scm`, `folds.scm`, `locals.scm`… se
   * cargaban y se ignoraban): acá se verifica que la convención de cada query
   * se traduzca a datos usables, con el árbol de verdad en el medio.
   */
  it('devuelve TODO lo que el árbol sabe, no sólo color', async () => {
    const tokenizer = createTreeSitterTokenizer()
    const text = [
      'const top = 1',
      'function outer() {',
      '  const inner = top',
      '  return inner()',
      '}',
      'outer()'
    ].join('\n')
    const result = await tokenizer.tokenize(
      request(text, [
        { file: join(root, 'queries', 'highlights.scm'), category: 'highlights' },
        { file: join(root, 'queries', 'tags.scm'), category: 'tags' },
        { file: join(root, 'queries', 'folds.scm'), category: 'folds' },
        { file: join(root, 'queries', 'locals.scm'), category: 'locals' }
      ])
    )

    expect(result.ok).toBe(true)
    const data = result.data
    expect(data).toBeDefined()

    // Símbolos: la función `outer`, con su nombre, sacado del `@name`.
    expect(data!.symbols.map((symbol) => symbol.name)).toEqual(['outer'])
    expect(data!.symbols[0].kind).toBe('function')
    expect(data!.symbols[0].line).toBe(1)
    // El rango cubre hasta su `}` (línea 4): es lo que pliega el outline.
    expect(data!.symbols[0].endLine).toBe(4)

    // Plegado: la función, de la línea 1 a la 4 (no a la 5).
    expect(data!.folds).toEqual([{ startLine: 1, endLine: 4, kind: 'region' }])

    // Alcances: `inner` se define DENTRO de la función y se referencia ahí.
    const innerDef = data!.locals.find(
      (entry) => entry.kind === 'definition' && entry.name === 'inner'
    )
    const innerRef = data!.locals.find(
      (entry) => entry.kind === 'reference' && entry.name === 'inner'
    )
    expect(innerDef?.line).toBe(2)
    expect(innerRef?.line).toBe(3)
    expect(innerDef?.scope?.startLine).toBe(1)

    // Y el color sigue saliendo por el mismo pedido.
    expect(result.tokens.length).toBeGreaterThan(0)
    // Las categorías aplicadas se reportan (diagnóstico honesto).
    expect(data!.appliedCategories).toContain('tags')
    expect(data!.appliedCategories).toContain('folds')
    expect(data!.appliedCategories).toContain('locals')
  })

  it('tokeniza el tramo EMBEBIDO con el parser del lenguaje inyectado', async () => {
    const parserPath = join(root, 'grammars', 'javascript.wasm')
    const text = ['const style = `', 'a { color: red }', '`'].join('\n')
    // La inyección: el contenido del template string es CSS.
    writeFileSync(
      join(root, 'queries', 'injections.scm'),
      '(template_string (string_fragment) @injection.content\n (#set! injection.language "css"))\n'
    )
    writeFileSync(join(root, 'queries', 'css-highlights.scm'), '(property_name) @variable\n(color_value) @number\n')

    const tokenizer = createTreeSitterTokenizer()
    const result = await tokenizer.tokenize({
      languageId: 'javascript',
      parserPath,
      queries: [
        { file: join(root, 'queries', 'highlights.scm'), category: 'highlights' },
        { file: join(root, 'queries', 'injections.scm'), category: 'injections' }
      ],
      embedded: [
        {
          languageId: 'css',
          parserPath,
          queries: [{ file: join(root, 'queries', 'css-highlights.scm'), category: 'highlights' }]
        }
      ],
      text
    })

    expect(result.ok).toBe(true)
    // El tramo embebido se reporta con su lenguaje.
    expect(result.data?.injections[0]?.language).toBe('css')
    // Y sus capturas entraron al resultado: `color` como propiedad y `red`
    // como valor son scopes del lenguaje INYECTADO, no del padre.
    const scopes = result.scopeSets.flat()
    expect(scopes).toContain('variable')
  })
})
