/**
 * Tests de fonts custom del theme (slot ui): parser, stack y fallback.
 */

import { describe, it, expect } from 'vitest'
import {
  normalizeThemeFonts,
  normalizeThemeFontSlot,
  normalizeThemeDefinition
} from '../src/renderer/src/services/extensions/types/themes/schema'
import {
  buildFontStack,
  getFontFallbackMode
} from '../src/renderer/src/services/extensions/types/themes/logic'

describe('normalizeThemeFontSlot', () => {
  it('acepta slot válido', () => {
    expect(
      normalizeThemeFontSlot({
        family: 'IBM Plex Mono',
        source: 'https://fonts.googleapis.com/css2?family=x',
        size: '13px',
        weight: '500',
        lineHeight: '1.5'
      })
    ).toEqual({
      family: 'IBM Plex Mono',
      source: 'https://fonts.googleapis.com/css2?family=x',
      size: '13px',
      weight: '500',
      lineHeight: '1.5'
    })
  })

  it('descarta family inválida (inyección CSS)', () => {
    expect(normalizeThemeFontSlot({ family: 'x");body{}' })).toBeNull()
    expect(normalizeThemeFontSlot({ family: 'x; y' })).toBeNull()
    expect(normalizeThemeFontSlot({ family: '' })).toBeNull()
    expect(normalizeThemeFontSlot(null)).toBeNull()
  })

  it('source solo https:/data:, resto se ignora', () => {
    expect(
      normalizeThemeFontSlot({ family: 'F', source: 'http://x/y.css' })
    ).toEqual({ family: 'F' })
    expect(
      normalizeThemeFontSlot({ family: 'F', source: 'data:text/css;base64,AAA' })
    ).toEqual({ family: 'F', source: 'data:text/css;base64,AAA' })
  })

  it('size/weight/lineHeight fuera de rango se ignoran sin invalidar', () => {
    expect(normalizeThemeFontSlot({ family: 'F', size: '99px', weight: 'heavy', lineHeight: 'x' })).toEqual({
      family: 'F'
    })
  })
})

describe('normalizeThemeFonts', () => {
  it('solo slot ui; sin ui → undefined', () => {
    expect(normalizeThemeFonts({ ui: { family: 'F' }, editor: { family: 'E' } })).toEqual({
      ui: { family: 'F' }
    })
    expect(normalizeThemeFonts({})).toBeUndefined()
    expect(normalizeThemeFonts(null)).toBeUndefined()
  })

  it('viaja en normalizeThemeDefinition', () => {
    const def = normalizeThemeDefinition({
      name: 'T',
      type: 'dark',
      colors: {},
      fonts: { ui: { family: 'IBM Plex Mono', source: 'https://x/y.css' } }
    })
    expect(def?.fonts).toEqual({
      ui: { family: 'IBM Plex Mono', source: 'https://x/y.css' }
    })
  })
})

describe('buildFontStack', () => {
  it('familia con espacios se entrecomilla + fallback elegido', () => {
    expect(buildFontStack('IBM Plex Mono', 'system')).toBe(
      '"IBM Plex Mono", system-ui, -apple-system, \'Segoe UI\', Roboto, Ubuntu, sans-serif'
    )
    expect(buildFontStack('Inter', 'original')).toBe('Inter, var(--font-sans)')
  })
})

describe('getFontFallbackMode', () => {
  it('default sistema sin storage', () => {
    expect(getFontFallbackMode()).toBe('system')
  })
})
