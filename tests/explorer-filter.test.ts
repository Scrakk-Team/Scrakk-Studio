// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tests del filtro de visibles del árbol (sección Cambios de git).
 */

import { describe, it, expect } from 'vitest'
import { ancestorDirs, filterRowsByPaths } from '../src/renderer/src/features/explorer/filter'

describe('ancestorDirs', () => {
  it('ancestros hasta el root (sin el root)', () => {
    expect(ancestorDirs('/r', ['/r/a/b/f.ts'])).toEqual(new Set(['/r/a/b', '/r/a']))
  })

  it('varios paths comparten ancestros (dedupe)', () => {
    expect(ancestorDirs('/r', ['/r/a/x.ts', '/r/a/y.ts'])).toEqual(new Set(['/r/a']))
  })

  it('archivo directo al root → sin ancestros', () => {
    expect(ancestorDirs('/r', ['/r/f.ts'])).toEqual(new Set())
  })

  it('paths fuera del root no expanden', () => {
    expect(ancestorDirs('/r', ['/otro/f.ts'])).toEqual(new Set(['/otro']))
  })
})

describe('filterRowsByPaths', () => {
  const flat = [
    { node: { path: '/r' } },
    { node: { path: '/r/a' } },
    { node: { path: '/r/a/f.ts' } },
    { node: { path: '/r/b.ts' } }
  ]

  it('visibles + ancestros, en orden', () => {
    const visible = new Set(['/r/a/f.ts', '/r/b.ts'])
    const ancestors = new Set(['/r/a'])
    expect(filterRowsByPaths(flat, visible, ancestors).map((r) => r.node.path)).toEqual([
      '/r/a',
      '/r/a/f.ts',
      '/r/b.ts'
    ])
  })

  it('vacío → vacío', () => {
    expect(filterRowsByPaths(flat, new Set(), new Set())).toEqual([])
  })
})
