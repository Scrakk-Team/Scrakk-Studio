// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tests del resize ghost (estilo VS Code):
 * - Matemática pura del drag (px y ratio): clamp, invert, bordes.
 * - Roundtrip de anchos de slots en persistencia (antes se perdían).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// Stub de localStorage ANTES de tocar el storage (los accesos son en runtime).
const mem = new Map<string, string>()
vi.stubGlobal('window', {
  localStorage: {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
    key: (i: number) => [...mem.keys()][i] ?? null,
    get length() {
      return mem.size
    }
  }
})

import {
  dragPxValue,
  dragRatioValue
} from '../src/renderer/src/features/layout/components/ResizeHandle/ResizeHandle'
import {
  serializeLayout,
  loadSlotSizes,
  setSlotSizesCache
} from '../src/renderer/src/features/layout/persistence'
import { splitTreeStore } from '../src/renderer/src/features/layout/splitTree'
import { tabsStore } from '../src/renderer/src/features/tabs/store'

const KEY = 'scrakk:layout.slots'

beforeEach(() => {
  mem.clear()
  setSlotSizesCache({})
})

describe('dragPxValue (slots externos)', () => {
  it('suma delta clampado', () => {
    expect(dragPxValue(260, 100, 150, false, 200, 440)).toBe(310)
    expect(dragPxValue(260, 100, 900, false, 200, 440)).toBe(440)
    expect(dragPxValue(260, 100, -900, false, 200, 440)).toBe(200)
  })

  it('invert resta el delta', () => {
    expect(dragPxValue(300, 500, 450, true, 220, 520)).toBe(350)
    // Sin movimiento no hay cambio (el commit se salta).
    expect(dragPxValue(300, 500, 500, true, 220, 520)).toBe(300)
  })
})

describe('dragRatioValue (splits 0..1)', () => {
  it('fracción del contenedor clampada', () => {
    // Contenedor 0..1000, cursor a 250 → 0.25.
    expect(dragRatioValue(250, 0, 1000, 0.15, 0.85)).toBeCloseTo(0.25)
    expect(dragRatioValue(-50, 0, 1000, 0.15, 0.85)).toBeCloseTo(0.15)
    expect(dragRatioValue(2000, 0, 1000, 0.15, 0.85)).toBeCloseTo(0.85)
  })

  it('respeta offset del contenedor y tamaño 0', () => {
    expect(dragRatioValue(600, 100, 1000, 0.15, 0.85)).toBeCloseTo(0.5)
    expect(dragRatioValue(600, 100, 0, 0.15, 0.85)).toBe(0.15)
  })
})

describe('slotSizes en persistencia v3', () => {
  it('serialize incluye sizes solo si hay alguno', () => {
    const base = serializeLayout(tabsStore.getAll(), splitTreeStore.getAll())
    expect(base.slotSizes).toBeUndefined()
    const withSizes = serializeLayout(tabsStore.getAll(), splitTreeStore.getAll(), {
      left: 280
    })
    expect(withSizes.slotSizes).toEqual({ left: 280 })
    expect(withSizes.v).toBe(3)
  })

  it('loadSlotSizes valida y descarta basura', () => {
    mem.set(KEY, JSON.stringify({ v: 3, slots: {}, tree: {}, slotSizes: { left: 280, right: -5, bottom: 'x' } }))
    expect(loadSlotSizes()).toEqual({ left: 280 })
    mem.set(KEY, 'no-json{{{')
    expect(loadSlotSizes()).toEqual({})
    mem.delete(KEY)
    expect(loadSlotSizes()).toEqual({})
  })

  it('setSlotSizesCache + serialize roundtrip', () => {
    setSlotSizesCache({ left: 300, right: 320, bottom: 240 })
    const data = serializeLayout(tabsStore.getAll(), splitTreeStore.getAll(), {
      left: 300,
      right: 320,
      bottom: 240
    })
    expect(data.slotSizes).toEqual({ left: 300, right: 320, bottom: 240 })
  })
})
