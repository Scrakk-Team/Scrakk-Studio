/**
 * Tests: agregación de estado LSP (chip statusbar) + decode semantic tokens.
 */

import { describe, it, expect } from 'vitest'
import { aggregateServerState } from '../src/renderer/src/services/lsp/aggregate'
import { decodeSemanticTokens } from '../src/renderer/src/services/lsp/semanticTokens'
import type { LspServerStatus } from '@shared/lsp'

function server(state: LspServerStatus['state']): LspServerStatus {
  return {
    id: `s-${state}`,
    name: `s-${state}`,
    root: '/tmp',
    state,
    available: true,
    source: 'builtin',
    extensions: ['.ts']
  }
}

describe('aggregateServerState (chip statusbar)', () => {
  it('vacío → idle', () => {
    expect(aggregateServerState([]).state).toBe('idle')
  })

  it('failed domina sobre ready', () => {
    const agg = aggregateServerState([server('ready'), server('failed')])
    expect(agg.state).toBe('failed')
    expect(agg.counts['failed']).toBe(1)
  })

  it('retrying domina sobre starting/ready', () => {
    expect(aggregateServerState([server('ready'), server('retrying')]).state).toBe('retrying')
  })

  it('starting domina sobre ready', () => {
    expect(aggregateServerState([server('starting'), server('ready')]).state).toBe('starting')
  })

  it('todo ready → ready', () => {
    const agg = aggregateServerState([server('ready'), server('ready')])
    expect(agg.state).toBe('ready')
    expect(agg.total).toBe(2)
  })
})

describe('decodeSemanticTokens (delta → absoluto)', () => {
  it('decodifica secuencia en la misma línea (deltas acumulativos)', () => {
    // línea 0: token en col 0 len 5; luego col +6 len 3
    const tokens = decodeSemanticTokens([0, 0, 5, 1, 0, 0, 6, 3, 2, 0])
    expect(tokens).toHaveLength(2)
    expect(tokens[0]).toMatchObject({ line: 0, startCharacter: 0, length: 5, tokenType: 1 })
    expect(tokens[1]).toMatchObject({ line: 0, startCharacter: 6, length: 3, tokenType: 2 })
  })

  it('avanza de línea con deltaLine', () => {
    const tokens = decodeSemanticTokens([0, 2, 4, 0, 0, 3, 1, 2, 1, 0])
    expect(tokens[1]).toMatchObject({ line: 3, startCharacter: 1, length: 2 })
  })

  it('data incompleta/truncada se descarta sin explotar', () => {
    expect(decodeSemanticTokens(undefined)).toEqual([])
    expect(decodeSemanticTokens([0, 0, 5, 1])).toEqual([]) // 4 < 5
    expect(decodeSemanticTokens([0, 0, 5, 1, 0, 0])).toHaveLength(1) // 1 token válido + resto truncado
  })
})
