// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Firma Ed25519 de `.sef`: verificación, tamper, TOFU por extensión y
 * rechazo de actualizaciones sin firma.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  createHash,
  createPublicKey,
  generateKeyPairSync,
  sign as signPayload,
  type KeyObject
} from 'node:crypto'
import { zipSync } from 'fflate'

const state = vi.hoisted(() => ({ userData: '' }))

vi.mock('electron', () => ({
  app: { getPath: () => state.userData },
  dialog: { showMessageBox: async () => ({ response: 0 }) },
  ipcMain: { handle: () => undefined, on: () => undefined }
}))

const { verifySefFiles, SIGNATURE_FILE } = await import('../src/main/extensions/signature')
const { installSefFromBuffer } = await import('../src/main/ipc/extensions')

let userData: string

function sha256(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex')
}

function keyIdFor(publicDer: Buffer): string {
  return `sha256:${sha256(new Uint8Array(publicDer)).slice(0, 32)}`
}

function canonical(meta: {
  version: number
  algorithm: string
  keyId: string
  manifestSha256: string
  files: Record<string, string>
}): Buffer {
  const files = Object.fromEntries(
    Object.entries(meta.files).sort(([a], [b]) => a.localeCompare(b))
  )
  return Buffer.from(
    JSON.stringify({
      version: meta.version,
      algorithm: meta.algorithm,
      keyId: meta.keyId,
      manifestSha256: meta.manifestSha256,
      files
    }),
    'utf-8'
  )
}

interface SigningKey {
  privateKey: KeyObject
  publicDer: Buffer
  keyId: string
}

function makeKey(): SigningKey {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const publicDer = publicKey.export({ type: 'spki', format: 'der' }) as Buffer
  return { privateKey, publicDer, keyId: keyIdFor(publicDer) }
}

function buildSigned(
  id: string,
  key: SigningKey,
  extraFiles: Record<string, string> = {}
): Uint8Array {
  const files: Record<string, Uint8Array> = {
    'manifest.json': new TextEncoder().encode(
      JSON.stringify({ id, name: 'Demo', version: '1.0.0', panels: [{ id: 'p' }] })
    ),
    'dist/modules.js': new TextEncoder().encode('export const modules = {}'),
    ...Object.fromEntries(
      Object.entries(extraFiles).map(([name, value]) => [name, new TextEncoder().encode(value)])
    )
  }
  const hashes = Object.fromEntries(
    Object.entries(files).map(([name, data]) => [name, sha256(data)])
  )
  const meta = {
    version: 1,
    algorithm: 'ed25519',
    keyId: key.keyId,
    manifestSha256: hashes['manifest.json']!,
    files: hashes
  }
  const signature = signPayload(null, canonical(meta), key.privateKey).toString('base64')
  const signatureFile = {
    ...meta,
    publicKey: key.publicDer.toString('base64'),
    signature
  }
  return zipSync({
    ...files,
    [SIGNATURE_FILE]: new TextEncoder().encode(JSON.stringify(signatureFile))
  })
}

beforeEach(async () => {
  userData = await fs.mkdtemp(path.join(os.tmpdir(), 'scrakk-sign-'))
  state.userData = userData
})

afterEach(async () => {
  await fs.rm(userData, { recursive: true, force: true })
})

describe('verifySefFiles', () => {
  it('acepta una firma válida', async () => {
    const key = makeKey()
    const { unzipSync } = await import('fflate')
    const files = unzipSync(buildSigned('demo', key))
    const result = verifySefFiles(files)
    expect(result).toMatchObject({ signed: true, ok: true, keyId: key.keyId })
  })

  it('rechaza un archivo alterado', async () => {
    const key = makeKey()
    const { unzipSync } = await import('fflate')
    const files = unzipSync(buildSigned('demo', key))
    files['dist/modules.js'] = new TextEncoder().encode('evil()')
    const result = verifySefFiles(files)
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/alterado/)
  })

  it('rechaza un paquete sin firma', async () => {
    const { unzipSync } = await import('fflate')
    const files = unzipSync(
      zipSync({ 'manifest.json': new TextEncoder().encode('{}') })
    )
    expect(verifySefFiles(files)).toMatchObject({ signed: false, ok: false })
  })
})

describe('installSefFromBuffer — firma y trust store', () => {
  it('instala firmado y fija la clave (TOFU)', async () => {
    const key = makeKey()
    const result = await installSefFromBuffer(buildSigned('demo', key))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.extension.signed).toBe(true)
      expect(result.extension.publisherKeyId).toBe(key.keyId)
    }
    const store = JSON.parse(
      await fs.readFile(path.join(userData, 'extension-publishers.json'), 'utf-8')
    )
    expect(store.demo.keyId).toBe(key.keyId)
  })

  it('rechaza una actualización firmada con otra clave', async () => {
    const first = makeKey()
    const second = makeKey()
    expect((await installSefFromBuffer(buildSigned('demo', first))).success).toBe(true)
    const result = await installSefFromBuffer(buildSigned('demo', second))
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toMatch(/clave del publisher/)
  })

  it('rechaza sin firma cuando el origen la exige (auto-update/market)', async () => {
    const unsigned = zipSync({
      'manifest.json': new TextEncoder().encode(
        JSON.stringify({ id: 'demo', name: 'Demo', version: '1.0.0', panels: [{ id: 'p' }] })
      )
    })
    const result = await installSefFromBuffer(unsigned, { requireSignature: true })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toMatch(/no está firmado/)
  })

  it('permite una instalación local sin firma (con consentimiento)', async () => {
    const unsigned = zipSync({
      'manifest.json': new TextEncoder().encode(
        JSON.stringify({ id: 'demo', name: 'Demo', version: '1.0.0' })
      )
    })
    const result = await installSefFromBuffer(unsigned)
    expect(result.success).toBe(true)
    if (result.success) expect(result.extension.signed).toBe(false)
  })

  it('rechaza un paquete manipulado antes de tocar la extensión existente', async () => {
    const key = makeKey()
    const good = buildSigned('demo', key)
    expect((await installSefFromBuffer(good)).success).toBe(true)

    const { unzipSync } = await import('fflate')
    const files = unzipSync(buildSigned('demo', key, { 'assets/x.txt': 'ok' }))
    files['assets/x.txt'] = new TextEncoder().encode('tampered')
    const result = await installSefFromBuffer(zipSync(files))
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toMatch(/Firma inválida/)
    // La instalación anterior sigue intacta.
    await expect(
      fs.access(path.join(userData, 'extensions', 'demo', 'manifest.json'))
    ).resolves.toBeUndefined()
  })
})
