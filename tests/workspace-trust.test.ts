// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Workspace Trust: una config LSP del proyecto ejecuta comandos al abrir un
 * archivo. El primer uso debe pedir consentimiento y la decisión se persiste
 * FUERA del workspace (el repo no puede auto-concederse confianza).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

const state = vi.hoisted(() => ({
  userData: '',
  response: 1,
  prompts: 0
}))

vi.mock('electron', () => ({
  app: {
    getPath: () => state.userData
  },
  dialog: {
    showMessageBox: async () => {
      state.prompts++
      return { response: state.response }
    }
  }
}))

const { ensureWorkspaceTrusted, isWorkspaceTrusted } = await import('../src/main/trust')

let userData: string
let workspace: string

beforeEach(async () => {
  vi.stubEnv('SCRAKK_TRUST_PROJECT_LSP', '')
  userData = await fs.mkdtemp(path.join(os.tmpdir(), 'scrakk-trust-home-'))
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'scrakk-trust-proj-'))
  state.userData = userData
  state.response = 1
  state.prompts = 0
})

afterEach(async () => {
  vi.unstubAllEnvs()
  await fs.rm(userData, { recursive: true, force: true })
  await fs.rm(workspace, { recursive: true, force: true })
})

describe('ensureWorkspaceTrusted', () => {
  it('pregunta una vez y recuerda la aprobación fuera del workspace', async () => {
    state.response = 0

    expect(await ensureWorkspaceTrusted(workspace, 'sh -c evil')).toBe(true)
    expect(state.prompts).toBe(1)
    expect(await isWorkspaceTrusted(workspace)).toBe(true)

    // Segunda vez: no vuelve a preguntar.
    expect(await ensureWorkspaceTrusted(workspace, 'sh -c evil')).toBe(true)
    expect(state.prompts).toBe(1)

    // El store vive en userData, no en el proyecto.
    const store = await fs.readFile(path.join(userData, 'workspace-trust.json'), 'utf-8')
    expect(JSON.parse(store).trusted).toContain(path.resolve(workspace))
    await expect(fs.access(path.join(workspace, 'workspace-trust.json'))).rejects.toThrow()
  })

  it('recuerda la negativa y no ejecuta nada', async () => {
    state.response = 1

    expect(await ensureWorkspaceTrusted(workspace, 'sh -c evil')).toBe(false)
    expect(await ensureWorkspaceTrusted(workspace, 'sh -c evil')).toBe(false)
    expect(state.prompts).toBe(1)
    expect(await isWorkspaceTrusted(workspace)).toBe(false)
  })

  it('el override de CI no lee ni escribe el store', async () => {
    vi.stubEnv('SCRAKK_TRUST_PROJECT_LSP', '1')
    expect(await ensureWorkspaceTrusted(workspace, 'anything')).toBe(true)
    expect(state.prompts).toBe(0)
    await expect(fs.access(path.join(userData, 'workspace-trust.json'))).rejects.toThrow()
  })
})
