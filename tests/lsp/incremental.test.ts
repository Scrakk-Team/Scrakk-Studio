// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Test de sync incremental — el cliente debe enviar SOLO diffs cuando el
 * server negocia change=2, y full-text cuando no.
 */

import { describe, it, expect } from 'vitest'
import * as path from 'path'
import { LspClient, computeIncrementalChange } from '../../src/main/lsp/client'
import type { DiagnosticsChangedPayload } from '@shared/lsp'
import { makeTempDir, cleanupDir, waitFor } from '../helpers/lsp-test-utils'

const MOCK_SERVER = path.resolve(__dirname, '../helpers/mock-lsp-server.mjs')

describe('computeIncrementalChange (puro)', () => {
  it('edita en el medio → inserción de rango cero', () => {
    const diff = computeIncrementalChange('hello world\n', 'hello brave world\n')
    // Diff mínimo real: insertar 'brave ' en el offset 6 (start === end).
    expect(diff.range).toEqual({
      start: { line: 0, character: 6 },
      end: { line: 0, character: 6 }
    })
    expect(diff.text).toBe('brave ')
  })

  it('append al final', () => {
    const diff = computeIncrementalChange('abc', 'abcdef')
    expect(diff.range?.start).toEqual({ line: 0, character: 3 })
    expect(diff.text).toBe('def')
  })

  it('multi-linea: salto de línea cuenta para line/character', () => {
    const oldText = 'a\nb\nc\n'
    const newText = 'a\nb\nX\nc\n'
    const diff = computeIncrementalChange(oldText, newText)
    expect(diff?.range?.start).toEqual({ line: 2, character: 0 })
    expect(diff?.text).toBe('X\n')
  })

  it('texto IDÉNTICO → null (no un cambio sin range: eso BORRA el documento)', () => {
    // Regresión concreta: `{ text: '' }` sin `range` significa, en LSP,
    // "reemplazá TODO el documento por vacío". Pasaba al GUARDAR (el sync
    // re-manda el mismo texto) y el server quedaba con el documento vacío:
    // publicaba 0 diagnósticos y el subrayado/chip se vaciaban con el archivo
    // todavía roto (ver tools/_probe-lsp-realtime.mjs).
    expect(computeIncrementalChange('body { color: red; }\n', 'body { color: red; }\n')).toBeNull()
  })
})

describe('sync incremental E2E', () => {
  it('server incremental recibe range edits con versiones crecientes', async () => {
    const projectDir = await makeTempDir('lsp-incr-')
    try {
      const noop = (): void => {}
      const client = new LspClient('incr', 1, {
        command: process.execPath,
        args: [MOCK_SERVER, 'incr'],
        extensions: { '.mockts': 'mocklang' }
      }, projectDir, {
        onDiagnostics: (_: DiagnosticsChangedPayload) => {},
        onState: noop,
        onProcessExit: noop
      })

      // El mock negocia incremental solo si MOCK_INCREMENTAL=1 está en su env;
      // el spawn hereda process.env del test → lo seteamos acá.
      process.env.MOCK_INCREMENTAL = '1'
      await client.start()

      const file = path.join(projectDir, 'code.mockts')
      await client.notifyFileChange(file, 'hello world\n', 'mocklang')

      let state = await client.request<{ changes: unknown; version: number; incremental: boolean }>(
        'mock/state',
        {},
        5000
      )
      expect(state.incremental).toBe(true)
      expect(state.version).toBe(0)

      // Edición en el medio: el cambio enviado DEBE llevar range.
      await client.notifyFileChange(file, 'hello brave world\n', 'mocklang')
      state = await client.request('mock/state', {}, 5000)
      expect(Array.isArray(state.changes)).toBe(true)
      expect(state.changes).toHaveLength(1)
      expect((state.changes as Array<{ range?: object; text: string }>)[0].range).toBeDefined()
      expect((state.changes as Array<{ text: string }>)[0].text).toContain('brave')
      expect(state.version).toBe(1)

      await client.shutdown()
      delete process.env.MOCK_INCREMENTAL
    } finally {
      await cleanupDir(projectDir)
    }
  }, 20_000)

  it('re-mandar el MISMO texto no manda didChange (no vacía el documento)', async () => {
    const projectDir = await makeTempDir('lsp-same-')
    try {
      const noop = (): void => {}
      const client = new LspClient('same', 1, {
        command: process.execPath,
        args: [MOCK_SERVER, 'incr'],
        extensions: { '.mockts': 'mocklang' }
      }, projectDir, {
        onDiagnostics: (_: DiagnosticsChangedPayload) => {},
        onState: noop,
        onProcessExit: noop
      })

      process.env.MOCK_INCREMENTAL = '1'
      await client.start()

      const file = path.join(projectDir, 'code.mockts')
      const content = 'hello brave world\n'
      await client.notifyFileChange(file, content, 'mocklang')

      const afterOpen = await client.request<{
        version: number
        changeCount: number
        saveCount: number
        openCount: number
      }>('mock/state', {}, 5000)
      expect(afterOpen.openCount).toBe(1)
      expect(afterOpen.changeCount).toBe(0)

      // El camino del GUARDADO: el sync re-manda el contenido (idéntico) +
      // didSave. El didChange NO debe salir (borraría el documento del server)
      // y la versión no debe avanzar.
      await client.notifyFileChange(file, content, 'mocklang')

      const afterSave = await client.request<{
        version: number
        changeCount: number
        saveCount: number
      }>('mock/state', {}, 5000)
      expect(afterSave.changeCount).toBe(0)
      expect(afterSave.version).toBe(afterOpen.version)
      // El didSave SÍ sale: hay servers que sólo validan al guardar.
      expect(afterSave.saveCount).toBe(2)

      // Y una edición REAL sigue mandando su diff.
      await client.notifyFileChange(file, 'hello brave new world\n', 'mocklang')
      const afterEdit = await client.request<{
        version: number
        changeCount: number
        changes: Array<{ range?: object; text: string }>
      }>('mock/state', {}, 5000)
      expect(afterEdit.changeCount).toBe(1)
      expect(afterEdit.version).toBe(afterOpen.version + 1)
      expect(afterEdit.changes[0].range).toBeDefined()
      expect(afterEdit.changes[0].text).toBe('new ')

      await client.shutdown()
      delete process.env.MOCK_INCREMENTAL
    } finally {
      await cleanupDir(projectDir)
    }
  }, 20_000)

  it('server full-sync sigue recibiendo texto completo', async () => {
    const projectDir = await makeTempDir('lsp-full-')
    try {
      delete process.env.MOCK_INCREMENTAL
      const client = new LspClient('full', 1, {
        command: process.execPath,
        args: [MOCK_SERVER, 'full'],
        extensions: { '.mockts': 'mocklang' }
      }, projectDir, {
        onDiagnostics: () => {},
        onState: () => {},
        onProcessExit: () => {}
      })

      await client.start()

      const file = path.join(projectDir, 'code.mockts')
      await client.notifyFileChange(file, 'v0\n', 'mocklang')
      await client.notifyFileChange(file, 'v0\nmore\n', 'mocklang')

      const state = await client.request<{ changes: Array<{ range?: object; text: string }> }>(
        'mock/state',
        {},
        5000
      )
      expect(state.changes).toHaveLength(1)
      expect(state.changes[0].range).toBeUndefined() // full-text
      expect(state.changes[0].text).toBe('v0\nmore\n')

      await client.shutdown()
    } finally {
      await cleanupDir(projectDir)
    }
  }, 20_000)

  it('waitFor disponible para polling de estado', async () => {
    let counter = 0
    const value = await waitFor(() => (++counter >= 3 ? 'ready' : undefined), 2000, 10)
    expect(value).toBe('ready')
  })
})
