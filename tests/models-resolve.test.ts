// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * El endpoint de un proveedor conocido sale del catálogo del main, no del
 * renderer: así un XSS no puede redirigir la API key guardada.
 */

import { describe, it, expect } from 'vitest'
import { resolveProviderBaseUrl } from '../src/main/models-dev/resolve'

const providers = [
  { id: 'openai', baseUrl: 'https://api.openai.com/v1' },
  { id: 'deepseek', baseUrl: 'https://api.deepseek.com' }
]

describe('resolveProviderBaseUrl', () => {
  it('ignora el baseUrl del renderer para un proveedor conocido', () => {
    expect(resolveProviderBaseUrl(providers, 'openai', 'https://atacante.tld')).toBe(
      'https://api.openai.com/v1'
    )
  })

  it('acepta el baseUrl pedido para un proveedor custom', () => {
    expect(resolveProviderBaseUrl(providers, 'mi-ollama', 'http://127.0.0.1:11434/v1')).toBe(
      'http://127.0.0.1:11434/v1'
    )
  })

  it('funciona sin catálogo (primer arranque)', () => {
    expect(resolveProviderBaseUrl(null, 'openai', 'https://api.openai.com/v1')).toBe(
      'https://api.openai.com/v1'
    )
  })
})
