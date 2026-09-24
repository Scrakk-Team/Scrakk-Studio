// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { describe, expect, it } from 'vitest'
import {
  connectedGroups,
  groupCentroid,
  portCountForSize,
  portPositions
} from '@features/layout/components/TerminalNodes/terminalNodesModel'

describe('portCountForSize', () => {
  it('nodo chico → pocos puertos, nodo grande → más', () => {
    const small = portCountForSize(360, 220)
    const big = portCountForSize(900, 600)
    expect(small).toBeGreaterThanOrEqual(4)
    expect(big).toBeGreaterThan(small)
    expect(big).toBeLessThanOrEqual(20)
  })
  it('respeta el mínimo de 4', () => {
    expect(portCountForSize(10, 10)).toBe(4)
  })
})

describe('portPositions', () => {
  it('reparte N puntos sobre el perímetro', () => {
    const w = 560
    const h = 340
    const pts = portPositions(w, h)
    expect(pts).toHaveLength(portCountForSize(w, h))
    for (const p of pts) {
      const onEdge =
        p.y === 0 || p.y === h || p.x === 0 || p.x === w
      expect(onEdge).toBe(true)
    }
  })
  it('toca los 4 lados en un nodo típico', () => {
    const pts = portPositions(560, 340)
    expect(pts.some((p) => p.y === 0)).toBe(true)
    expect(pts.some((p) => p.x === 560)).toBe(true)
    expect(pts.some((p) => p.y === 340)).toBe(true)
    expect(pts.some((p) => p.x === 0)).toBe(true)
  })
})

describe('connectedGroups', () => {
  it('une en cadena a-b-c en un solo grupo', () => {
    const groups = connectedGroups(['a', 'b', 'c', 'solo'], [
      { a: 'a', b: 'b' },
      { a: 'b', b: 'c' }
    ])
    const big = groups.find((g) => g.includes('a'))
    expect(big?.sort()).toEqual(['a', 'b', 'c'])
    expect(groups.find((g) => g.includes('solo'))).toEqual(['solo'])
  })
  it('ignora enlaces con extremos inexistentes', () => {
    const groups = connectedGroups(['a', 'b'], [{ a: 'a', b: 'fantasma' }])
    expect(groups).toHaveLength(2)
  })
})

describe('groupCentroid', () => {
  it('promedia los centros', () => {
    const c = groupCentroid(['a', 'b'], {
      a: { x: 0, y: 0, w: 100, h: 100 },
      b: { x: 100, y: 100, w: 100, h: 100 }
    })
    expect(c).toEqual({ x: 100, y: 100 })
  })
  it('null sin miembros válidos', () => {
    expect(groupCentroid(['x'], {})).toBeNull()
  })
})
