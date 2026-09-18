/**
 * Tests de colorToRgba (puente de theme → Innerta): el alpha SE CONSERVA
 * para que el engine limpie translúcido (glassmorphism).
 */

import { describe, it, expect } from 'vitest'
import { colorToRgba } from '../src/renderer/src/features/editor/engines/innerta/innertaTheme'

function alphaOf(color: string): number {
  return colorToRgba(color) & 0xff
}

describe('colorToRgba', () => {
  it('hex opaco y con alpha', () => {
    expect(alphaOf('#18181b')).toBe(255)
    expect(alphaOf('#18181bd9')).toBe(0xd9)
    expect(alphaOf('#fff')).toBe(255)
  })

  it('rgb() sin alpha → opaco', () => {
    expect(alphaOf('rgb(24, 24, 27)')).toBe(255)
  })

  it('rgba() conserva el alpha float', () => {
    expect(alphaOf('rgba(24, 24, 27, 0.85)')).toBe(217)
    expect(alphaOf('rgba(24,24,27,0)')).toBe(0)
    expect(alphaOf('rgba(24,24,27,1)')).toBe(255)
  })

  it('alpha en % y sintaxis con espacios', () => {
    expect(alphaOf('rgba(24, 24, 27, 50%)')).toBe(128)
    expect(alphaOf('rgb(24 24 27 / 0.5)')).toBe(128)
  })

  it('canales rgb intactos con alpha', () => {
    const v = colorToRgba('rgba(24, 24, 27, 0.85)') >>> 0
    expect((v >>> 24) & 0xff).toBe(24)
    expect((v >>> 16) & 0xff).toBe(24)
    expect((v >>> 8) & 0xff).toBe(27)
  })

  it('inválidos → fallbacks históricos', () => {
    expect(colorToRgba(undefined)).toBe(0x000000ff)
    expect(colorToRgba('no-un-color')).toBe(0xffffffff)
  })
})
