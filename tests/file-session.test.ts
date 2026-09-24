// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Sesiones de archivo: un motor por PANEL con N archivos (una sesión cada uno).
 *
 * Antes cada archivo abría su propio módulo WASM. Ahora todos los archivos de
 * un panel comparten el motor y el estado vive por sesión.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const sessions = new Set<string>()
  const engine = {
    attach: vi.fn(),
    heapBytes: vi.fn(() => 0),
    whenReady: vi.fn(() => Promise.resolve()),
    hasFileSession: vi.fn((id: string) => sessions.has(id)),
    createFileSession: vi.fn((id: string) => {
      sessions.add(id)
    }),
    activateFileSession: vi.fn(),
    dropFileSession: vi.fn((id: string) => {
      sessions.delete(id)
    }),
    onRevision: vi.fn(() => () => {}),
    currentFileSessionId: vi.fn(() => null),
    fileSessionText: vi.fn(() => 'engine-text'),
    fileSessionRevision: vi.fn(() => 7),
    fileSessionDirty: vi.fn(() => false),
    markFileSessionClean: vi.fn()
  }
  return {
    engine,
    sessions,
    readEncoded: vi.fn(),
    paneCalls: [] as string[]
  }
})

vi.mock('@services/encodings', () => ({
  readEncoded: mocks.readEncoded,
  setDetected: vi.fn()
}))
vi.mock('@services/lsp', () => ({ lspNotifyFileChanged: vi.fn() }))
vi.mock('@features/editor/engine', () => ({
  getOrCreatePaneEngine: vi.fn((paneId: string) => {
    mocks.paneCalls.push(paneId)
    return mocks.engine
  }),
  listPaneEngines: vi.fn(() => [mocks.engine]),
  releasePaneEngineIfEmpty: vi.fn()
}))

import {
  getFileSession,
  destroyFileSession,
  backgroundModuleCount
} from '@features/editor/fileSession'

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))
const host = (): HTMLElement => ({} as HTMLElement)

beforeEach(() => {
  mocks.sessions.clear()
  mocks.paneCalls.length = 0
  mocks.readEncoded.mockResolvedValue({ success: true, text: 'disk', detected: {} })
  mocks.engine.createFileSession.mockClear()
  mocks.engine.activateFileSession.mockClear()
  mocks.engine.dropFileSession.mockClear()
  mocks.engine.markFileSessionClean.mockClear()
  mocks.engine.fileSessionDirty.mockReturnValue(false)
  mocks.engine.fileSessionRevision.mockReturnValue(7)
  mocks.engine.fileSessionText.mockReturnValue('engine-text')
})

describe('sesiones de archivo (un motor, N archivos)', () => {
  it('abrir varios archivos usa el MISMO motor, una sesión por archivo', async () => {
    for (const path of ['/a.ts', '/b.ts', '/c.ts']) {
      const session = getFileSession(path)
      session.attach(host(), 'center')
      await flush()
      await flush()
    }
    expect(mocks.engine.createFileSession).toHaveBeenCalledTimes(3)
    expect(mocks.sessions.size).toBe(3)
    // Un solo motor de panel (antes: un módulo por archivo).
    expect(backgroundModuleCount()).toBe(1)
  })

  it('getText / getRevision / isDirty consultan la sesión del motor', async () => {
    const session = getFileSession('/d.ts')
    session.attach(host(), 'center')
    await flush()
    await flush()

    expect(session.getText()).toBe('engine-text')
    expect(session.getRevision()).toBe(7)

    mocks.engine.fileSessionDirty.mockReturnValue(true)
    expect(session.isDirty()).toBe(true)
  })

  it('destroy() suelta la sesión del motor', async () => {
    const session = getFileSession('/e.ts')
    session.attach(host(), 'center')
    await flush()
    await flush()

    destroyFileSession('/e.ts')
    expect(mocks.engine.dropFileSession).toHaveBeenCalledWith('/e.ts')
    expect(mocks.sessions.has('/e.ts')).toBe(false)
  })
})
