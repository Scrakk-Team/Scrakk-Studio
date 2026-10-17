// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Los procesos hijos (terminal, LSP, extensiones, instaladores) no deben
 * heredar los secretos que el main carga en `process.env`.
 */

import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp', isPackaged: true }
}))

const { childEnv } = await import('../src/main/env')

describe('childEnv', () => {
  it('filtra credenciales R2, tokens, service_role y hooks de ejecución', () => {
    const env = childEnv({
      PATH: '/usr/bin',
      HOME: '/home/dev',
      SCRAKK_R2_ACCESS_KEY: 'ak',
      SCRAKK_R2_SECRET_KEY: 'sk',
      SCRAKK_GITHUB_TOKEN: 'ghp_x',
      SCRAKK_GITLAB_TOKEN: 'glpat_x',
      SCRAKK_SERVICE_ROLE_KEY: 'eyJ',
      SUPABASE_SERVICE_ROLE_KEY: 'eyJ',
      LD_PRELOAD: '/tmp/evil.so',
      NODE_OPTIONS: '--require /tmp/evil.js',
      GIT_SSH_COMMAND: 'sh -c evil'
    })

    expect(env.PATH).toBe('/usr/bin')
    expect(env.HOME).toBe('/home/dev')
    for (const key of [
      'SCRAKK_R2_ACCESS_KEY',
      'SCRAKK_R2_SECRET_KEY',
      'SCRAKK_GITHUB_TOKEN',
      'SCRAKK_GITLAB_TOKEN',
      'SCRAKK_SERVICE_ROLE_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'LD_PRELOAD',
      'NODE_OPTIONS',
      'GIT_SSH_COMMAND'
    ]) {
      expect(env).not.toHaveProperty(key)
    }
  })

  it('conserva configuración no sensible', () => {
    const env = childEnv({
      SCRAKK_R2_ENDPOINT: 'https://r2.test',
      SCRAKK_R2_BUCKET_CHAT: 'chat',
      TERM: 'xterm-256color'
    })
    expect(env.SCRAKK_R2_ENDPOINT).toBe('https://r2.test')
    expect(env.SCRAKK_R2_BUCKET_CHAT).toBe('chat')
    expect(env.TERM).toBe('xterm-256color')
  })
})
