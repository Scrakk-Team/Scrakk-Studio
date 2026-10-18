// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Instalación de `.sef`: límites anti zip-bomb y vínculo entre el id del
 * paquete y el slug del catálogo (para que una extensión no pueda reemplazar a
 * otra y heredar su auto-update).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { zipSync } from 'fflate'

const state = vi.hoisted(() => ({ userData: '' }))

vi.mock('electron', () => ({
  app: { getPath: () => state.userData },
  dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
  ipcMain: { handle: () => undefined, on: () => undefined }
}))

const { installSefFromBuffer } = await import('../src/main/ipc/extensions')

let userData: string

function sef(files: Record<string, string>): Uint8Array {
  const entries: Record<string, Uint8Array> = {}
  for (const [name, value] of Object.entries(files)) entries[name] = new TextEncoder().encode(value)
  return zipSync(entries)
}

beforeEach(async () => {
  userData = await fs.mkdtemp(path.join(os.tmpdir(), 'scrakk-sef-'))
  state.userData = userData
})

afterEach(async () => {
  await fs.rm(userData, { recursive: true, force: true })
})

describe('installSefFromBuffer', () => {
  it('instala un .sef válido', async () => {
    const result = await installSefFromBuffer(
      sef({
        'manifest.json': JSON.stringify({ id: 'demo', name: 'Demo', version: '1.0.0' }),
        'dist/index.js': 'export default {}'
      })
    )
    expect(result.success).toBe(true)
    if (result.success) expect(result.extension.id).toBe('demo')
    await expect(fs.access(path.join(userData, 'extensions', 'demo', 'manifest.json'))).resolves.toBeUndefined()
  })

  it('rechaza un id que no coincide con el slug ANTES de borrar la extensión existente', async () => {
    await fs.mkdir(path.join(userData, 'extensions', 'victim'), { recursive: true })
    await fs.writeFile(path.join(userData, 'extensions', 'victim', 'keep.txt'), 'keep', 'utf-8')

    const result = await installSefFromBuffer(
      sef({ 'manifest.json': JSON.stringify({ id: 'victim', name: 'Evil', version: '1' }) }),
      { expectedId: 'other-slug' }
    )
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toContain('other-slug')
    // La extensión legítima sigue intacta.
    await expect(fs.readFile(path.join(userData, 'extensions', 'victim', 'keep.txt'), 'utf-8')).resolves.toBe('keep')
  })

  it('rechaza un manifest fuera del paquete', async () => {
    const result = await installSefFromBuffer(
      sef({
        '../manifest.json': JSON.stringify({ id: 'demo', name: 'Demo', version: '1' })
      })
    )
    expect(result.success).toBe(false)
  })

  it('no instala si el usuario rechaza el consentimiento', async () => {
    const result = await installSefFromBuffer(
      sef({
        'manifest.json': JSON.stringify({
          id: 'demo',
          name: 'Demo',
          version: '1',
          panels: [{ id: 'p' }]
        }),
        'dist/index.js': 'export default {}'
      }),
      { confirm: async () => false }
    )
    expect(result.success).toBe(false)
    await expect(fs.access(path.join(userData, 'extensions', 'demo'))).rejects.toThrow()
  })

  it('actualiza sin dejar archivos de la versión anterior', async () => {
    const first = await installSefFromBuffer(
      sef({
        'manifest.json': JSON.stringify({ id: 'demo', name: 'Demo', version: '1.0.0' }),
        'old.txt': 'old'
      })
    )
    expect(first.success).toBe(true)

    const second = await installSefFromBuffer(
      sef({
        'manifest.json': JSON.stringify({ id: 'demo', name: 'Demo', version: '2.0.0' }),
        'new.txt': 'new'
      })
    )
    expect(second.success).toBe(true)
    await expect(fs.access(path.join(userData, 'extensions', 'demo', 'new.txt'))).resolves.toBeUndefined()
    await expect(fs.access(path.join(userData, 'extensions', 'demo', 'old.txt'))).rejects.toThrow()
  })

  it('escribe extraFiles dentro de la misma instalación', async () => {
    const result = await installSefFromBuffer(
      sef({ 'manifest.json': JSON.stringify({ id: 'demo', name: 'Demo', version: '1' }) }),
      { extraFiles: { '.market.json': '{"slug":"demo"}' } }
    )
    expect(result.success).toBe(true)
    await expect(
      fs.readFile(path.join(userData, 'extensions', 'demo', '.market.json'), 'utf-8')
    ).resolves.toContain('demo')
  })

  it('rechaza un id con traversal', async () => {
    const result = await installSefFromBuffer(
      sef({ 'manifest.json': JSON.stringify({ id: '../evil', name: 'Evil', version: '1' }) })
    )
    expect(result.success).toBe(false)
  })
})
