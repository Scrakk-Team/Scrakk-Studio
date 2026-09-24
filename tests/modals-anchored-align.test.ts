// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { describe, expect, it } from 'vitest'
import { anchoredX } from '@services/modals/registry'

describe('anchoredX', () => {
  it('end (default) alinea el borde derecho con el del ancla', () => {
    // Ancla x=500 w=100, panel 300 → x=300.
    expect(anchoredX(500, 100, 300, 1280)).toBe(300)
    expect(anchoredX(500, 100, 300, 1280, 'end')).toBe(300)
  })
  it('center centra el panel sobre el ancla', () => {
    // Centro del ancla = 550; panel 300 → x=400.
    expect(anchoredX(500, 100, 300, 1280, 'center')).toBe(400)
  })
  it('start alinea el borde izquierdo con el del ancla', () => {
    expect(anchoredX(500, 100, 300, 1280, 'start')).toBe(500)
  })
  it('clampea al borde izquierdo del viewport', () => {
    expect(anchoredX(10, 40, 300, 1280, 'center')).toBe(8)
    expect(anchoredX(0, 40, 300, 1280, 'start')).toBe(8)
  })
  it('clampea al borde derecho del viewport', () => {
    // Centro en 1250 con panel 300 → 1100, pero máx = 1280-300-8 = 972.
    expect(anchoredX(1200, 100, 300, 1280, 'center')).toBe(972)
    expect(anchoredX(1200, 100, 300, 1280)).toBe(972)
  })
})
