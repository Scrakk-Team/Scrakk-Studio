// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Las API keys de proveedores ya no viven en `localStorage`: se guardan en el
 * main con `safeStorage` (o, sin keyring, en un archivo 0600). El renderer solo
 * ve booleanos.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

const state = vi.hoisted(() => ({ userData: '', available: false, backend: 'basic_text' }))

vi.mock('electron', () => ({
  app: { getPath: () => state.userData },
  safeStorage: {
    isEncryptionAvailable: () => state.available,
    getSelectedStorageBackend: () => state.backend,
    encryptString: (value: string) => Buffer.from(`enc:${value}`, 'utf-8'),
    decryptString: (value: Buffer) => value.toString('utf-8').replace(/^enc:/, '')
  }
}))

const { apiKeyStatus, deleteApiKey, getApiKey, migrateApiKeys, setApiKey } = await import(
  '../src/main/llm/apiKeys'
)

let userData: string

beforeEach(async () => {
  userData = await fs.mkdtemp(path.join(os.tmpdir(), 'scrakk-keys-'))
  state.userData = userData
  state.available = true
  state.backend = 'gnome_libsecret'
})

afterEach(async () => {
  await fs.rm(userData, { recursive: true, force: true })
})

async function resetModuleCache(): Promise<void> {
  // El módulo cachea el mapa en memoria; para probar el archivo se reimporta.
  vi.resetModules()
}

describe('llm/apiKeys', () => {
  it('guarda, consulta y elimina una key', async () => {
    expect(await getApiKey('deepseek')).toBe('')
    expect(await setApiKey('deepseek', '  sk-test  ')).toBe(true)
    expect(await getApiKey('deepseek')).toBe('sk-test')
    expect(await apiKeyStatus()).toEqual({ deepseek: true })

    expect(await deleteApiKey('deepseek')).toBe(true)
    expect(await getApiKey('deepseek')).toBe('')
    expect(await apiKeyStatus()).toEqual({})
  })

  it('rechaza ids inválidos y no acepta objetos', async () => {
    expect(await setApiKey('../evil', 'sk')).toBe(false)
    expect(await setApiKey('ok', 123 as unknown as string)).toBe(false)
    expect(await getApiKey('..')).toBe('')
  })

  it('escribe con permisos 0600 y sin key en claro cuando hay cifrado', async () => {
    state.available = true
    state.backend = 'gnome_libsecret'
    await resetModuleCache()
    const mod = await import('../src/main/llm/apiKeys')
    await mod.setApiKey('openai', 'sk-secret-value')

    const file = path.join(userData, 'secrets', 'api-keys.json')
    const raw = await fs.readFile(file, 'utf-8')
    expect(raw).not.toContain('sk-secret-value')
    expect(JSON.parse(raw).encrypted).toBe(true)
    const stat = await fs.stat(file)
    expect(stat.mode & 0o777).toBe(0o600)
  })

  it('sin keyring NO persiste la key en disco (solo memoria)', async () => {
    state.available = false
    await resetModuleCache()
    const mod = await import('../src/main/llm/apiKeys')
    expect(await mod.setApiKey('openai', 'sk-plain')).toBe(false)
    const file = path.join(userData, 'secrets', 'api-keys.json')
    await expect(fs.access(file)).rejects.toThrow()
    expect(await mod.getApiKey('openai')).toBe('sk-plain')
  })

  it('trata el backend basic_text como inseguro', async () => {
    state.available = true
    state.backend = 'basic_text'
    await resetModuleCache()
    const mod = await import('../src/main/llm/apiKeys')
    expect(await mod.setApiKey('openai', 'sk-basic')).toBe(false)
    await expect(fs.access(path.join(userData, 'secrets', 'api-keys.json'))).rejects.toThrow()
  })

  it('migra el mapa viejo y cuenta solo las keys nuevas', async () => {
    expect(await migrateApiKeys({ a: 'k1', b: 'k2', '../bad': 'x', c: '' })).toBe(2)
    expect(await migrateApiKeys({ a: 'k1' })).toBe(0)
    expect(await apiKeyStatus()).toEqual({ a: true, b: true })
  })
})
