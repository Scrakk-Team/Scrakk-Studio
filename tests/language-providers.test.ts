/**
 * Proveedores de lenguaje (host) — registro real + serialización al LSP.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUÉ SE PRUEBA Y POR QUÉ
 *
 * Un language server de una extensión (o un linter sin server) responde a
 * través del API de `vscode`: `languages.registerHoverProvider(selector,
 * provider)`. Con los proveedores inertes, el server arrancaba y NADIE le
 * preguntaba; acá se fija el contrato de la mitad que faltaba:
 *
 *   1. sólo responde el proveedor cuyo SELECTOR atiende el documento,
 *   2. el resultado se serializa a la forma del LSP (lo que come el editor),
 *   3. un proveedor que tira no tumba la consulta (ni al IDE).
 */

import { describe, expect, it } from 'vitest'
import {
  LanguageProviderRegistry,
  serialize,
  serializeHover,
  serializeLocations,
  serializeTextEdits
} from '../src/main/extensions/host/languageProviders'
import { matchDocumentSelector } from '../src/main/extensions/host/vscodeApi'
import type { TextDocumentImpl } from '../src/main/extensions/host/textDocuments'

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Documento mínimo: el registro sólo lo usa para matchear el selector. */
function doc(languageId = 'typescript', fileName = '/w/src/a.ts'): TextDocumentImpl {
  return { languageId, fileName } as unknown as TextDocumentImpl
}

function registry(): { registry: LanguageProviderRegistry; warnings: string[] } {
  const warnings: string[] = []
  return {
    warnings,
    registry: new LanguageProviderRegistry({
      match: matchDocumentSelector,
      log: (level, message) => {
        if (level === 'warn') warnings.push(message)
      }
    })
  }
}

describe('LanguageProviderRegistry: a quién le toca responder', () => {
  it('sólo el proveedor cuyo selector atiende el documento', async () => {
    const { registry: providers } = registry()
    providers.register('hover', 'python', {
      provideHover: () => ({ contents: 'de python' })
    })
    providers.register('hover', 'typescript', {
      provideHover: () => ({ contents: 'de ts' })
    })

    const answer = await providers.query({ kind: 'hover', document: doc(), position: { line: 0, character: 0 } })
    expect(answer.matched).toBe(true)
    expect(answer.result).toEqual({ contents: { value: 'de ts', kind: 'markdown' } })
  })

  it('sin proveedor del tipo (o sin selector que matchee) no opina', async () => {
    const { registry: providers } = registry()
    providers.register('hover', 'python', { provideHover: () => ({ contents: 'x' }) })

    const other = await providers.query({ kind: 'hover', document: doc(), position: { line: 0, character: 0 } })
    expect(other).toEqual({ matched: false, result: null })

    const formatting = await providers.query({ kind: 'formatting', document: doc() })
    expect(formatting).toEqual({ matched: false, result: null })
  })

  it('el disposable desregistra (la extensión se apagó: no queda colgado)', async () => {
    const { registry: providers } = registry()
    const disposable = providers.register('hover', 'typescript', {
      provideHover: () => ({ contents: 'hola' })
    })
    expect(providers.counts()).toEqual({ hover: 1 })
    disposable.dispose()
    expect(providers.counts()).toEqual({})
    const answer = await providers.query({ kind: 'hover', document: doc(), position: { line: 0, character: 0 } })
    expect(answer.matched).toBe(false)
  })

  it('un proveedor que TIRA se reporta y la consulta no explota', async () => {
    const { registry: providers, warnings } = registry()
    providers.register('hover', 'typescript', {
      provideHover: () => {
        throw new Error('el server se cayó')
      }
    })

    const answer = await providers.query({ kind: 'hover', document: doc(), position: { line: 0, character: 0 } })
    // Matcheó (había un proveedor) pero no devolvió nada: el IDE no puede
    // quedarse creyendo que nadie atiende el archivo.
    expect(answer).toEqual({ matched: true, result: null })
    expect(warnings[0]).toContain('el server se cayó')
  })

  it('un proveedor async se espera (los servers reales tardan)', async () => {
    const { registry: providers } = registry()
    providers.register('definition', 'typescript', {
      provideDefinition: async () => [
        { uri: { toString: () => 'file:///w/src/b.ts' }, range: range(0, 0, 0, 0) }
      ]
    })

    const answer = await providers.query({
      kind: 'definition',
      document: doc(),
      position: { line: 3, character: 2 }
    })
    expect(answer.matched).toBe(true)
    expect(answer.result).toEqual([
      { uri: 'file:///w/src/b.ts', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } } }
    ])
  })

  it('la posición que recibe el proveedor es 0-based y del tipo real (Position)', async () => {
    const { registry: providers } = registry()
    let received: any
    providers.register('hover', 'typescript', {
      provideHover: (_document: unknown, position: unknown) => {
        received = position
        return { contents: 'ok' }
      }
    })
    await providers.query({ kind: 'hover', document: doc(), position: { line: 7, character: 3 } })
    expect(received.line).toBe(7)
    expect(received.character).toBe(3)
  })
})

describe('serialización al LSP', () => {
  it('hover: string, MarkupContent, MarkedString y ARRAY se aplanan a markdown', () => {
    // Un hover en array (el caso que se pintaba vacío en la UI).
    expect(
      serializeHover({
        contents: ['texto plano', { value: 'md **fuerte**' }, { language: 'ts', value: 'const a = 1' }]
      })
    ).toEqual({
      contents: {
        value: 'texto plano\n\nmd **fuerte**\n\n```ts\nconst a = 1\n```',
        kind: 'markdown'
      }
    })

    // El range, si viene, se conserva serializado.
    expect(
      serializeHover({ contents: 'x', range: { start: { line: 1, character: 0 }, end: { line: 1, character: 4 } } })
    ).toEqual({
      contents: { value: 'x', kind: 'markdown' },
      range: { start: { line: 1, character: 0 }, end: { line: 1, character: 4 } }
    })

    // Hover vacío: texto vacío, nunca `undefined` (la UI lo trata como "nada").
    expect(serializeHover(undefined)).toEqual({ contents: { value: '', kind: 'markdown' } })
  })

  it('definición: Location y LocationLink se unifican (los dos servers reales)', () => {
    const location = { uri: { toString: () => 'file:///a.ts' }, range: range(1, 0, 1, 5) }
    const link = {
      targetUri: { toString: () => 'file:///b.ts' },
      targetSelectionRange: range(9, 2, 9, 8),
      targetRange: range(8, 0, 11, 1)
    }
    expect(serializeLocations([location, link])).toEqual([
      { uri: 'file:///a.ts', range: { start: { line: 1, character: 0 }, end: { line: 1, character: 5 } } },
      { uri: 'file:///b.ts', range: { start: { line: 9, character: 2 }, end: { line: 9, character: 8 } } }
    ])
    // Sin resultado → lista vacía (y no una entrada con `range: null`).
    expect(serializeLocations(null)).toEqual([])
    expect(serializeLocations([{ uri: { toString: () => 'x' } }])).toEqual([])
  })

  it('formateo: TextEdit → { range, newText }, descartando entradas rotas', () => {
    expect(
      serializeTextEdits([
        { range: range(0, 0, 0, 3), newText: 'const' },
        { newText: 'sin rango' },
        { range: range(1, 0, 1, 1) }
      ])
    ).toEqual([{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } }, newText: 'const' }])
  })

  it('el serializador por tipo elige el que corresponde', () => {
    expect(serialize('hover', { contents: 'a' })).toEqual({ contents: { value: 'a', kind: 'markdown' } })
    expect(
      serialize('references', [{ uri: { toString: () => 'file:///a.ts' }, range: range(0, 0, 0, 1) }])
    ).toHaveLength(1)
    expect(
      serialize('documentHighlight', [{ range: range(0, 0, 0, 2), kind: 2 }])
    ).toEqual([{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 2 } }, kind: 2 }])
    expect(serialize('rangeFormatting', [{ range: range(0, 0, 1, 0), newText: 'x' }])).toHaveLength(1)
  })
})

function range(startLine: number, startCharacter: number, endLine: number, endCharacter: number): unknown {
  return {
    start: { line: startLine, character: startCharacter },
    end: { line: endLine, character: endCharacter }
  }
}
