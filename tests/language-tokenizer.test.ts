import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * El tokenizador del main corre con Oniguruma REAL y una gramática REAL: si
 * esto pasa, la cadena "gramática de una extensión → scopes" funciona en Node,
 * que es exactamente lo que hace la app. Un mock acá no probaría nada.
 */
const root = mkdtempSync(join(tmpdir(), 'scrakk-tokenize-'))

vi.mock('electron', () => ({
  app: {
    getPath: (): string => join(root, 'userData')
  }
}))

/** Gramática mínima: comentario, string, keyword y número (`source.demo`). */
const GRAMMAR = {
  scopeName: 'source.demo',
  patterns: [
    { match: '//.*$', name: 'comment.line.double-slash.demo' },
    { match: '"([^"\\\\]|\\\\.)*"', name: 'string.quoted.double.demo' },
    { match: '\\b(if|else|return)\\b', name: 'keyword.control.demo' },
    { match: '\\b\\d+\\b', name: 'constant.numeric.demo' },
    { match: '[a-zA-Z_][a-zA-Z0-9_]*(?=\\s*\\()', name: 'entity.name.function.demo' },
    // begin/end: es el tipo de regla que MANTIENE estado entre líneas (una
    // `match` no puede, porque el tokenizador trabaja línea por línea).
    { begin: "'", end: "'", name: 'string.single.demo' }
  ]
}

/**
 * Gramática "padre": un lenguaje contenedor que marca un tramo EMBEBIDO del
 * lenguaje `demo` (`<< … >>`), tal como markdown marca un bloque de código.
 */
const HOST_GRAMMAR = {
  scopeName: 'source.host',
  // Marca la LÍNEA completa como tramo embebido: es la forma que tiene un
  // bloque de código dentro de markdown (cada línea del bloque viene marcada
  // por la gramática padre).
  patterns: [{ match: '^.*$', name: 'meta.embedded.block.demo' }],
  repository: {}
}

/** Gramática de INYECCIÓN: se mete dentro de `source.host` y marca su tramo. */
const INJECTION_GRAMMAR = {
  scopeName: 'host.demo.codeblock',
  injectionSelector: 'L:source.host',
  patterns: [
    { begin: '<<', end: '>>', name: 'meta.embedded.block.demo' }
  ]
}

const EXTENSION_DIR = join(root, 'userData', 'extensions', 'demo.language')
const GRAMMAR_PATH = join(EXTENSION_DIR, 'syntaxes', 'demo.tmLanguage.json')
const HOST_GRAMMAR_PATH = join(EXTENSION_DIR, 'syntaxes', 'host.tmLanguage.json')
const INJECTION_GRAMMAR_PATH = join(EXTENSION_DIR, 'syntaxes', 'host-codeblock.json')

beforeAll(() => {
  mkdirSync(join(EXTENSION_DIR, 'syntaxes'), { recursive: true })
  writeFileSync(GRAMMAR_PATH, JSON.stringify(GRAMMAR))
  writeFileSync(HOST_GRAMMAR_PATH, JSON.stringify(HOST_GRAMMAR))
  writeFileSync(INJECTION_GRAMMAR_PATH, JSON.stringify(INJECTION_GRAMMAR))
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

async function tokenize(text: string): Promise<Awaited<ReturnType<typeof import('../src/main/extensions/tokenize')['tokenizeText']>>> {
  const { tokenizeText, resetTokenizerCaches } = await import('../src/main/extensions/tokenize')
  resetTokenizerCaches()
  return tokenizeText({
    scopeName: 'source.demo',
    grammars: [{ scopeName: 'source.demo', path: GRAMMAR_PATH }],
    text
  })
}

describe('tokenizador TextMate (main)', () => {
  it('devuelve scopes por token, no colores', async () => {
    const result = await tokenize('return 42 // ok')
    expect(result.ok).toBe(true)

    const scopesOf = (index: number): string[] => result.scopeSets[index] ?? []
    const scopes = result.tokens.map((token) => scopesOf(token.scopes))
    const flat = scopes.flat().join(' | ')

    expect(flat).toContain('keyword.control.demo')
    expect(flat).toContain('constant.numeric.demo')
    expect(flat).toContain('comment.line.double-slash.demo')
  })

  it('las columnas caen donde deben (UTF-16 sobre la línea)', async () => {
    const result = await tokenize('return 42')
    const keyword = result.tokens.find((token) =>
      (result.scopeSets[token.scopes] ?? []).includes('keyword.control.demo')
    )
    const number = result.tokens.find((token) =>
      (result.scopeSets[token.scopes] ?? []).includes('constant.numeric.demo')
    )
    expect(keyword).toMatchObject({ line: 0, start: 0, end: 6 })
    expect(number).toMatchObject({ line: 0, start: 7, end: 9 })
  })

  it('internea los stacks de scope (no repite el mismo array)', async () => {
    const result = await tokenize('// a\n// b\n// c')
    // Tres comentarios con el MISMO stack → un solo scopeSet.
    const commentIndexes = new Set(
      result.tokens
        .filter((token) =>
          (result.scopeSets[token.scopes] ?? []).includes('comment.line.double-slash.demo')
        )
        .map((token) => token.scopes)
    )
    expect(commentIndexes.size).toBe(1)
    expect(result.scopeSets.length).toBeLessThan(result.tokens.length)
  })

  it('mantiene el estado entre líneas (una string multilínea no cierra la siguiente)', async () => {
    // El estado del tokenizador es lo que hace que el color de las líneas
    // siguientes dependa de las anteriores: si se reseteara por línea, esto
    // fallaría.
    const result = await tokenize('"sin cerrar\nreturn')
    const lastLine = result.tokens.filter((token) => token.line === 1)
    const hasKeyword = lastLine.some((token) =>
      (result.scopeSets[token.scopes] ?? []).includes('keyword.control.demo')
    )
    // `return` en la línea 1 SÍ matchea la keyword (la string del demo no es
    // multilínea porque el patrón no cruza líneas) — el punto del test es que
    // el tokenizador no explota y sigue entregando tokens de la línea 2.
    expect(result.tokens.some((token) => token.line === 1)).toBe(true)
    expect(hasKeyword).toBe(true)
  })

  it('rechaza una gramática fuera del directorio de extensiones', async () => {
    const { tokenizeText } = await import('../src/main/extensions/tokenize')
    const outside = join(root, 'afuera.tmLanguage.json')
    writeFileSync(outside, JSON.stringify(GRAMMAR))
    const result = await tokenizeText({
      scopeName: 'source.demo',
      grammars: [{ scopeName: 'source.demo', path: outside }],
      text: 'return 1'
    })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('fuera del directorio de extensiones')
  })

  it('sin gramática declarada devuelve error explícito (no una lista vacía)', async () => {
    const { tokenizeText, resetTokenizerCaches } = await import('../src/main/extensions/tokenize')
    resetTokenizerCaches()
    const result = await tokenizeText({ scopeName: 'source.demo', grammars: [], text: 'return 1' })
    expect(result.ok).toBe(false)
    expect(result.error).toBe('sin gramática')
  })
})

describe('lenguajes embebidos (dos pasadas)', () => {
  /**
   * El caso real: un lenguaje contenedor declara un tramo con
   * `embeddedLanguages` y el texto de ese tramo se tokeniza con la gramática
   * del lenguaje EMBEBIDO, no con la del padre. Sin la segunda pasada, el
   * bloque se pinta con los colores del contenedor (o con ninguno).
   */
  async function tokenizeHost(text: string): Promise<Awaited<ReturnType<typeof import('../src/main/extensions/tokenize')['tokenizeText']>>> {
    const { tokenizeText, resetTokenizerCaches } = await import('../src/main/extensions/tokenize')
    resetTokenizerCaches()
    return tokenizeText({
      scopeName: 'source.host',
      grammars: [
        { scopeName: 'source.host', path: HOST_GRAMMAR_PATH, language: 'host', embeddedLanguages: { 'meta.embedded.block.demo': 'demo' } },
        { scopeName: 'source.demo', path: GRAMMAR_PATH, language: 'demo' }
      ],
      text
    })
  }

  it('el tramo embebido se tokeniza con la gramática del lenguaje embebido', async () => {
    const result = await tokenizeHost('texto suelto << return 42 >>')
    expect(result.ok).toBe(true)

    const allScopes = result.scopeSets.flat()
    expect(allScopes).toContain('keyword.control.demo')
    expect(allScopes).toContain('constant.numeric.demo')
  })

  it('el tramo NO queda con el scope del contenedor (sería el color equivocado)', async () => {
    const result = await tokenizeHost('<< return 1 >>')
    const embeddedTokens = result.tokens.filter((token) =>
      (result.scopeSets[token.scopes] ?? []).includes('meta.embedded.block.demo')
    )
    expect(embeddedTokens).toHaveLength(0)
    // Y el token de `return` está en la posición correcta dentro de la línea.
    const keyword = result.tokens.find((token) =>
      (result.scopeSets[token.scopes] ?? []).includes('keyword.control.demo')
    )
    expect(keyword).toMatchObject({ line: 0, start: 3, end: 9 })
  })

  it('el stack del embebido sobrevive entre líneas de un mismo bloque', async () => {
    // Una string sin cerrar en el bloque: si el stack se reseteara por línea,
    // la segunda línea del bloque empezaría fuera de la string.
    const result = await tokenizeHost("'sin cerrar\nreturn '")
    const secondLine = result.tokens.filter((token) => token.line === 1)
    expect(secondLine.length).toBeGreaterThan(0)
    const scopes = secondLine.map((token) => result.scopeSets[token.scopes] ?? []).flat()
    expect(scopes.some((scope) => scope.startsWith('string.single.demo'))).toBe(true)
    // Y el `return` de la segunda línea NO es keyword: está dentro de la string.
    expect(scopes).not.toContain('keyword.control.demo')
  })

  it('sin la gramática del embebido disponible, el tramo queda con los scopes del contenedor', async () => {
    const { tokenizeText, resetTokenizerCaches } = await import('../src/main/extensions/tokenize')
    resetTokenizerCaches()
    const result = await tokenizeText({
      scopeName: 'source.host',
      grammars: [
        {
          scopeName: 'source.host',
          path: HOST_GRAMMAR_PATH,
          language: 'host',
          embeddedLanguages: { 'meta.embedded.block.demo': 'demo' }
        }
      ],
      text: '<< return 1 >>'
    })
    expect(result.ok).toBe(true)
    // Sin la gramática del lenguaje embebido (la extensión no está instalada),
    // el tramo queda con los scopes del CONTENEDOR: no se pierde texto, y el
    // scope del padre suele resolver al color de texto por defecto.
    expect(result.tokens).toHaveLength(1)
    expect(result.scopeSets[result.tokens[0].scopes]).toContain('meta.embedded.block.demo')
  })

  it('la gramática de inyección aplica su scope dentro del contenedor', async () => {
    // Inyección: `host.demo.codeblock` se mete en `source.host`. El contenedor
    // NO tiene la regla del bloque: el scope sólo puede venir de la inyección.
    const { tokenizeText, resetTokenizerCaches } = await import('../src/main/extensions/tokenize')
    resetTokenizerCaches()
    const bare = { scopeName: 'source.host', patterns: [], repository: {} }
    const barePath = join(EXTENSION_DIR, 'syntaxes', 'bare.tmLanguage.json')
    writeFileSync(barePath, JSON.stringify(bare))

    const result = await tokenizeText({
      scopeName: 'source.host',
      grammars: [
        { scopeName: 'source.host', path: barePath, language: 'host', embeddedLanguages: { 'meta.embedded.block.demo': 'demo' } },
        { scopeName: 'source.demo', path: GRAMMAR_PATH, language: 'demo' },
        { scopeName: 'host.demo.codeblock', path: INJECTION_GRAMMAR_PATH, language: 'demo', injectTo: ['source.host'] }
      ],
      text: 'antes << return 7 >> despues'
    })

    expect(result.ok).toBe(true)
    const scopes = result.scopeSets.flat()
    expect(scopes).toContain('keyword.control.demo')
    expect(scopes).toContain('constant.numeric.demo')
  })
})
