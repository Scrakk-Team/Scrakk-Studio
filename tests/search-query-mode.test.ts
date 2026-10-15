// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Modo literal del grep: el patrón que se manda a los backends regex tiene que
 * buscar el texto EXACTO (por eso se escapa). Sin esto, `chr(10)` se interpreta
 * como `chr` + grupo `10` = `chr10`, y una barra suelta es regex inválida.
 */

import { describe, it, expect } from 'vitest'
import { escapeRegex } from '../src/main/search/queryMode'

describe('escapeRegex (modo literal del grep)', () => {
  it('escapa los metacaracteres de regex', () => {
    expect(escapeRegex('chr(10)')).toBe('chr\\(10\\)')
    expect(escapeRegex('a.b*c')).toBe('a\\.b\\*c')
    expect(escapeRegex('^ *def ')).toBe('\\^ \\*def ')
    expect(escapeRegex('a\\b')).toBe('a\\\\b')
  })

  it('deja intacto un texto sin metacaracteres', () => {
    expect(escapeRegex('hello world')).toBe('hello world')
  })
})
