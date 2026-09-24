// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Puente de proveedores (main) — de un pedido LSP a los hosts de extensiones.
 *
 * Lo que se prueba acá es la TRADUCCIÓN (el pedido del LSP → la consulta que
 * entiende el host) y el fan-out (preguntarle a todos los hosts vivos, juntar
 * sólo los que opinan, y no colgarse si uno no contesta). Es la costura entre
 * los dos runtimes: si se rompe, el hover de una extensión desaparece en
 * silencio.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fileUriToPath,
  hasExtensionProviders,
  PROVIDER_METHODS,
  providerQueryFromLspRequest,
  queryExtensionProviders,
  setExtensionProvidersQueryFn,
  toLspResults
} from '../src/main/extensions/providerBridge'

afterEach(() => {
  setExtensionProvidersQueryFn(null)
})

describe('pedido del LSP → consulta de proveedores', () => {
  it('los métodos con equivalente declaran su tipo', () => {
    expect(PROVIDER_METHODS['textDocument/hover']).toBe('hover')
    expect(PROVIDER_METHODS['textDocument/definition']).toBe('definition')
    expect(PROVIDER_METHODS['textDocument/formatting']).toBe('formatting')
    // No hay equivalente para lo que el editor no consume (todavía).
    expect(providerQueryFromLspRequest('textDocument/completion', {})).toBeNull()
    expect(providerQueryFromLspRequest('workspace/symbol', { query: 'x' })).toBeNull()
  })

  it('arma path, posición y contexto (con la URI des-escapada)', () => {
    expect(
      providerQueryFromLspRequest('textDocument/hover', {
        textDocument: { uri: 'file:///w/mi%20carpeta/a.ts' },
        position: { line: 4, character: 7 }
      })
    ).toEqual({ kind: 'hover', path: '/w/mi carpeta/a.ts', position: { line: 4, character: 7 } })

    expect(
      providerQueryFromLspRequest('textDocument/references', {
        textDocument: { uri: 'file:///w/a.ts' },
        position: { line: 0, character: 0 },
        context: { includeDeclaration: true }
      })
    ).toMatchObject({ kind: 'references', context: { includeDeclaration: true } })
  })

  it('el formateo lleva sus opciones y el rango del pedido', () => {
    const range = {
      start: { line: 1, character: 0 },
      end: { line: 3, character: 0 }
    }
    expect(
      providerQueryFromLspRequest('textDocument/rangeFormatting', {
        textDocument: { uri: 'file:///w/a.ts' },
        range,
        options: { tabSize: 4, insertSpaces: false }
      })
    ).toEqual({
      kind: 'rangeFormatting',
      path: '/w/a.ts',
      range,
      options: { tabSize: 4, insertSpaces: false }
    })
  })

  it('sin documento de disco no hay consulta (los virtuales no son de un host)', () => {
    expect(providerQueryFromLspRequest('textDocument/hover', {})).toBeNull()
    expect(
      providerQueryFromLspRequest('textDocument/hover', {
        textDocument: { uri: 'cline-diff:/algo' },
        position: { line: 0, character: 0 }
      })
    ).toBeNull()
  })

  it('`fileUriToPath` no se rompe con una URI rara', () => {
    expect(fileUriToPath('file:///a/b.ts')).toBe('/a/b.ts')
    expect(fileUriToPath('file:///a/%E2%9C%93.ts')).toBe('/a/✓.ts')
    // Un `%` suelto no puede tirar abajo la consulta.
    expect(fileUriToPath('file:///a/100%.ts')).toBe('/a/100%.ts')
  })
})

describe('fan-out a los hosts', () => {
  it('sin nadie registrado no pregunta nada (ni paga el camino)', async () => {
    expect(hasExtensionProviders()).toBe(false)
    expect(await queryExtensionProviders({ kind: 'hover', path: '/w/a.ts' })).toEqual([])
  })

  it('junta sólo las respuestas de quienes opinaron', async () => {
    setExtensionProvidersQueryFn(async () => [
      { extensionId: 'pub.linter', result: { contents: { value: 'del linter' } } },
      { extensionId: 'pub.otra', result: undefined }
    ])
    const answers = await queryExtensionProviders({ kind: 'hover', path: '/w/a.ts' })
    // `undefined` = no opina (el host lo dice así); no se le atribuye nada.
    expect(answers).toEqual([
      { extensionId: 'pub.linter', result: { contents: { value: 'del linter' } } }
    ])
  })

  it('se pasan a la forma del canal del LSP (serverName = extensión)', () => {
    expect(toLspResults([{ extensionId: 'pub.linter', result: [1] }])).toEqual([
      { serverName: 'pub.linter', result: [1] }
    ])
  })

  it('si un host no contesta se corta por timeout y no se cuelga el editor', async () => {
    vi.useFakeTimers()
    try {
      setExtensionProvidersQueryFn(() => new Promise(() => undefined))
      const pending = queryExtensionProviders({ kind: 'hover', path: '/w/a.ts' })
      await vi.advanceTimersByTimeAsync(6000)
      expect(await pending).toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })

  it('un error del fan-out se reporta y devuelve vacío', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      setExtensionProvidersQueryFn(async () => {
        throw new Error('host muerto')
      })
      expect(await queryExtensionProviders({ kind: 'hover', path: '/w/a.ts' })).toEqual([])
      expect(warn.mock.calls.some((call) => String(call[0]).includes('host muerto'))).toBe(true)
    } finally {
      warn.mockRestore()
    }
  })
})
