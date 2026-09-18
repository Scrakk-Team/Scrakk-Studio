/**
 * Kit de lenguaje SEF (`contributes.languages`).
 *
 * Lo que protegen estos tests:
 *  - una extensión de lenguaje es UN kit con piezas opcionales, y cada pieza
 *    se reporta por separado;
 *  - la asociación archivo → lenguaje es el disparador de todo (onLanguage), así
 *    que el orden de resolución importa: nombre exacto → glob → extensión MÁS
 *    LARGA (`.d.ts` antes que `.ts`, que es el bug clásico);
 *  - las queries se cargan TODAS y ninguna se descarta por no conocerla.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  globToRegExp,
  loadQueryData,
  parseLanguageConfiguration,
  parseSnippets,
  resolveLanguageByFirstLine,
  resolveLanguageForPath,
  LanguageRegistry,
  type RegisteredLanguage
} from '@services/extensions/types/languages/logic'
import { parseLanguagesContribution } from '@services/extensions/types/languages/schema'

/**
 * El schema NO valida existencia de archivos: sólo forma. La existencia se
 * verifica al registrar, leyendo el asset (un `.tmLanguage` no es un módulo JS
 * del bundle, así que `hasModule` daría `false` para TODOS los grammars).
 */
const ctx = () => ({ hasModule: () => true })

const language = (partial: Partial<RegisteredLanguage> & { id: string }): RegisteredLanguage => ({
  aliases: [],
  extensions: [],
  filenames: [],
  filenamePatterns: [],
  grammars: [],
  snippets: [],
  semanticTokenScopes: {},
  configurationDefaults: {},
  queries: [],
  capabilities: {
    highlighting: false,
    symbols: false,
    locals: false,
    injections: false,
    folding: false,
    snippets: false,
    configuration: false
  },
  extensionId: 'test',
  ...partial
})

describe('parseLanguagesContribution', () => {
  it('acepta un objeto suelto o una lista', () => {
    const one = parseLanguagesContribution({ id: 'rust', extensions: ['.rs'] }, ctx())
    expect(one).toHaveLength(1)
    const two = parseLanguagesContribution([{ id: 'rust' }, { id: 'toml' }], ctx())
    expect(two).toHaveLength(2)
  })

  it('sin id no hay lenguaje, y los ids repetidos no se duplican', () => {
    expect(parseLanguagesContribution([{ extensions: ['.x'] }, { id: 'a' }, { id: 'a' }], ctx())).toHaveLength(1)
  })

  it('una gramática tree-sitter sin parser declarado se descarta (forma inválida)', () => {
    const ok = parseLanguagesContribution(
      { id: 'rust', grammars: [{ kind: 'treeSitter', parser: 'grammars/rust.wasm', queries: ['g/highlights.scm'] }] },
      ctx()
    )
    expect(ok?.[0].grammars).toHaveLength(1)

    const noParser = parseLanguagesContribution(
      { id: 'rust', grammars: [{ kind: 'treeSitter' }] },
      ctx()
    )
    expect(noParser?.[0].grammars).toBeUndefined()
  })

  it('NO se cae una gramática TextMate por no ser un módulo JS del bundle', () => {
    // Regresión: el schema usaba `ctx.hasModule(path)` y como un `.tmLanguage`
    // no es un módulo JS, se caía la gramática de TODAS las extensiones de
    // lenguaje de VS Code.
    const parsed = parseLanguagesContribution(
      {
        id: 'rust',
        grammars: [
          { kind: 'textMate', scopeName: 'source.rust', path: 'syntaxes/rust.tmLanguage.json' }
        ]
      },
      ctx()
    )
    expect(parsed?.[0].grammars).toHaveLength(1)
  })

  it('una gramática TextMate necesita scopeName y path existente', () => {
    const parsed = parseLanguagesContribution(
      {
        id: 'rust',
        grammars: [
          {
            kind: 'textMate',
            scopeName: 'source.rust',
            path: 'syntaxes/rust.tmLanguage.json',
            embeddedLanguages: { 'meta.embedded.block.sql': 'sql' },
            injectTo: ['source.js']
          }
        ]
      },
      ctx()
    )
    const grammar = parsed?.[0].grammars?.[0]
    expect(grammar?.kind).toBe('textMate')
    if (grammar?.kind === 'textMate') {
      expect(grammar.embeddedLanguages).toEqual({ 'meta.embedded.block.sql': 'sql' })
      expect(grammar.injectTo).toEqual(['source.js'])
    }
  })

  it('normaliza semanticTokenScopes y defaults de configuración', () => {
    const parsed = parseLanguagesContribution(
      {
        id: 'rust',
        configurationDefaults: { 'editor.tabSize': 4 },
        semanticTokenScopes: [{ language: 'rust', scopes: { keyword: ['keyword.control.rust'] } }]
      },
      ctx()
    )
    expect(parsed?.[0].configurationDefaults).toEqual({ 'editor.tabSize': 4 })
    expect(parsed?.[0].semanticTokenScopes).toEqual([
      { language: 'rust', scopes: { keyword: ['keyword.control.rust'] } }
    ])
  })

  it('marca el parser nativo como tal (necesita permiso, no se activa solo)', () => {
    const parsed = parseLanguagesContribution(
      {
        id: 'raro',
        grammars: [
          { kind: 'treeSitter', parser: 'grammars/linux-x64/raro.so', native: true, sha256: 'abc' }
        ]
      },
      ctx()
    )
    const grammar = parsed?.[0].grammars?.[0]
    expect(grammar?.kind).toBe('treeSitter')
    if (grammar?.kind === 'treeSitter') {
      expect(grammar.native).toBe(true)
      expect(grammar.sha256).toBe('abc')
    }
  })
})

describe('globToRegExp', () => {
  it('un asterisco no cruza carpetas, dos asteriscos sí', () => {
    expect(globToRegExp('*.rs').test('main.rs')).toBe(true)
    expect(globToRegExp('*.rs').test('src/main.rs')).toBe(false)
    expect(globToRegExp('**/main.rs').test('src/deep/main.rs')).toBe(true)
  })

  it('soporta ? y alternativas {a,b}', () => {
    expect(globToRegExp('file?.ts').test('file1.ts')).toBe(true)
    expect(globToRegExp('*.{ts,tsx}').test('App.tsx')).toBe(true)
    expect(globToRegExp('*.{ts,tsx}').test('App.js')).toBe(false)
  })

  it('escapa los puntos (no los trata como comodín)', () => {
    expect(globToRegExp('*.rs').test('mainXrs')).toBe(false)
  })
})

describe('resolveLanguageForPath — el disparador de onLanguage', () => {
  const rust = language({ id: 'rust', extensions: ['.rs'], filenames: ['Cargo.toml'] })
  const ts = language({ id: 'typescript', extensions: ['.ts'] })
  const dts = language({ id: 'typescript-declaration', extensions: ['.d.ts'] })
  const markdown = language({ id: 'markdown', filenamePatterns: ['*.md', 'README*'] })
  const all = [rust, ts, dts, markdown]

  it('matchea por nombre exacto antes que por extensión', () => {
    expect(resolveLanguageForPath('/a/b/Cargo.toml', all)?.id).toBe('rust')
  })

  it('gana la extensión MÁS LARGA (.d.ts sobre .ts)', () => {
    expect(resolveLanguageForPath('/a/tipos.d.ts', all)?.id).toBe('typescript-declaration')
    expect(resolveLanguageForPath('/a/app.ts', all)?.id).toBe('typescript')
  })

  it('matchea por glob', () => {
    expect(resolveLanguageForPath('/a/README.md', all)?.id).toBe('markdown')
  })

  it('respeta los lenguajes desactivados', () => {
    expect(resolveLanguageForPath('/a/lib.rs', all, new Set(['rust']))).toBeNull()
  })

  it('sin candidatos no adivina', () => {
    expect(resolveLanguageForPath('/a/x.unknown', all)).toBeNull()
  })
})

describe('resolveLanguageByFirstLine — shebang', () => {
  it('encuentra el lenguaje por la primera línea', () => {
    const python = language({ id: 'python', firstLine: '^#!/.*\\bpython[0-9.]*\\b' })
    expect(resolveLanguageByFirstLine('#!/usr/bin/env python3', [python])?.id).toBe('python')
    expect(resolveLanguageByFirstLine('const a = 1', [python])).toBeNull()
  })

  it('un regex inválido no rompe la apertura del archivo', () => {
    const broken = language({ id: 'broken', firstLine: '([' })
    expect(() => resolveLanguageByFirstLine('#!/bin/sh', [broken])).not.toThrow()
    expect(resolveLanguageByFirstLine('#!/bin/sh', [broken])).toBeNull()
  })
})

describe('parseLanguageConfiguration', () => {
  it('lee comentarios y brackets con las dos formas de par', () => {
    const config = parseLanguageConfiguration(
      JSON.stringify({
        comments: { lineComment: '//', blockComment: ['/*', '*/'] },
        brackets: [['{', '}']],
        autoClosingPairs: [{ open: '"', close: '"', notIn: ['string'] }, ['(', ')']],
        folding: { offSide: true }
      })
    )
    expect(config?.lineComment).toBe('//')
    expect(config?.blockComment).toEqual(['/*', '*/'])
    expect(config?.brackets).toEqual([['{', '}']])
    expect(config?.autoClosingPairs).toEqual([
      { open: '"', close: '"', notIn: ['string'] },
      { open: '(', close: ')' }
    ])
    expect(config?.folding).toEqual({ offSide: true })
  })

  it('tolera JSONC (los archivos de lenguaje llevan comentarios)', () => {
    const config = parseLanguageConfiguration(`{
      // comentario de línea
      "comments": { "lineComment": "#" }, /* comentario de bloque */
      "brackets": [["[", "]"]]
    }`)
    expect(config?.lineComment).toBe('#')
    expect(config?.brackets).toEqual([['[', ']']])
  })

  it('folding booleano se normaliza a objeto', () => {
    expect(parseLanguageConfiguration('{ "folding": false }')?.folding).toEqual({ offSide: false })
  })

  it('un archivo ilegible devuelve null en vez de romper', () => {
    expect(parseLanguageConfiguration('{ roto')).toBeNull()
    expect(parseLanguageConfiguration('[1,2,3]')).toBeNull()
  })
})

describe('parseSnippets', () => {
  it('lee el formato canónico (mapa)', () => {
    const snippets = parseSnippets(
      JSON.stringify({
        'Print to console': { prefix: 'log', body: ['console.log($1)'], description: 'log' }
      }),
      'javascript'
    )
    expect(snippets).toHaveLength(1)
    expect(snippets[0]).toMatchObject({
      name: 'Print to console',
      prefix: ['log'],
      body: 'console.log($1)',
      scope: 'javascript'
    })
  })

  it('acepta el array de objetos y el body como string', () => {
    const snippets = parseSnippets(
      JSON.stringify([{ name: 'if', prefix: ['iff'], body: 'if ($1) {\n\t$2\n}' }]),
      'rust'
    )
    expect(snippets[0].prefix).toEqual(['iff'])
    expect(snippets[0].body).toContain('\n')
  })

  it('descarta lo que no tiene body o prefix, y no rompe con JSON roto', () => {
    expect(parseSnippets(JSON.stringify({ a: { prefix: 'x' } }))).toEqual([])
    expect(parseSnippets('no es json')).toEqual([])
  })
})

describe('loadQueryData — TODAS las queries, ninguna descartada', () => {
  const files = [
    'queries/rust/highlights.scm',
    'queries/rust/tags.scm',
    'queries/rust/locals.scm',
    'queries/rust/injections.scm',
    'queries/rust/context.scm'
  ]
  const contents: Record<string, string> = {
    'queries/rust/highlights.scm': '(identifier) @variable\n(string_literal) @string',
    'queries/rust/tags.scm': '(function_item name: (identifier) @definition.function)',
    'queries/rust/context.scm': '(block) @context'
  }

  it('indexa todas, categoriza y extrae captures', async () => {
    const data = await loadQueryData([], undefined, async (path) => contents[path] ?? null)
    // Sin gramática declarada no hay nada que indexar.
    expect(data).toEqual([])

    const withGrammar = await loadQueryData(
      [{ kind: 'treeSitter', parser: 'rust.wasm', queries: files }],
      undefined,
      async (path) => contents[path] ?? null
    )
    expect(withGrammar).toHaveLength(files.length)
    const tags = withGrammar.find((q) => q.category === 'tags')
    expect(tags?.captures).toContain('definition.function')
    expect(tags?.layer).toBe('gutter')

    const unknown = withGrammar.find((q) => q.file.endsWith('context.scm'))
    expect(unknown?.category).toBe('unknown')
    expect(unknown?.captures).toEqual(['context'])
  })

  it('un archivo ilegible se lista igual (declarada pero ilegible ≠ inexistente)', async () => {
    const data = await loadQueryData(
      [{ kind: 'treeSitter', parser: 'rust.wasm', queries: ['queries/rust/nope.scm'] }],
      undefined,
      async () => null
    )
    expect(data).toHaveLength(1)
    expect(data[0].captures).toEqual([])
  })
})

describe('LanguageRegistry', () => {
  beforeEach(() => {
    for (const id of LanguageRegistry.languageIds()) {
      LanguageRegistry.get(id) && LanguageRegistry.setDisabled(id, false)
    }
  })

  it('registra, resuelve por path y expone las queries', () => {
    LanguageRegistry.register(
      language({
        id: 'test-lang',
        extensions: ['.tl'],
        extensionId: 'ext-test',
        queries: [
          {
            file: 'q/highlights.scm',
            category: 'highlights',
            label: 'Resaltado',
            layer: 'text',
            variant: null,
            captures: ['keyword']
          }
        ]
      })
    )
    expect(LanguageRegistry.get('test-lang')?.id).toBe('test-lang')
    expect(LanguageRegistry.forPath('/x/a.tl')?.id).toBe('test-lang')
    expect(LanguageRegistry.queriesOf('test-lang')).toHaveLength(1)
  })

  it('desactivar un lenguaje lo saca de la resolución', () => {
    LanguageRegistry.register(language({ id: 'test-off', extensions: ['.off'], extensionId: 'ext-off' }))
    LanguageRegistry.setDisabled('test-off', true)
    expect(LanguageRegistry.forPath('/x/a.off')).toBeNull()
    LanguageRegistry.setDisabled('test-off', false)
  })

  it('desinstalar la extensión se lleva sus lenguajes', () => {
    LanguageRegistry.register(language({ id: 'test-gone', extensions: ['.gone'], extensionId: 'ext-gone' }))
    LanguageRegistry.unregisterExtension('ext-gone')
    expect(LanguageRegistry.get('test-gone')).toBeNull()
    expect(LanguageRegistry.forPath('/x/a.gone')).toBeNull()
  })
})
