// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tests del builder de segmentos del breadcrumb.
 */

import { describe, it, expect } from 'vitest'
import { buildSegments } from '../src/renderer/src/features/breadcrumbs/segments'

describe('buildSegments', () => {
  it('root > dirs > archivo', () => {
    expect(buildSegments('/w/jokit', '/w/jokit/src/a.ts')).toEqual([
      { name: 'jokit', path: '/w/jokit', isFile: false, isRoot: true },
      { name: 'src', path: '/w/jokit/src', isFile: false, isRoot: false },
      { name: 'a.ts', path: '/w/jokit/src/a.ts', isFile: true, isRoot: false }
    ])
  })

  it('archivo directo al root', () => {
    expect(buildSegments('/w', '/w/f.ts')).toEqual([
      { name: 'w', path: '/w', isFile: false, isRoot: true },
      { name: 'f.ts', path: '/w/f.ts', isFile: true, isRoot: false }
    ])
  })

  it('fuera del root → solo archivo', () => {
    expect(buildSegments('/w', '/otro/f.ts')).toEqual([
      { name: 'f.ts', path: '/otro/f.ts', isFile: true, isRoot: false }
    ])
  })

  it('sin root → solo archivo; sin path → vacío', () => {
    expect(buildSegments(null, '/w/f.ts')).toEqual([
      { name: 'f.ts', path: '/w/f.ts', isFile: true, isRoot: false }
    ])
    expect(buildSegments('/w', null)).toEqual([])
  })

  it('backslashes y slashes finales', () => {
    expect(buildSegments('C:\\w\\', 'C:\\w\\a\\f.ts')).toEqual([
      { name: 'w', path: 'C:\\w\\', isFile: false, isRoot: true },
      { name: 'a', path: 'C:/w/a', isFile: false, isRoot: false },
      { name: 'f.ts', path: 'C:/w/a/f.ts', isFile: true, isRoot: false }
    ])
  })
})
