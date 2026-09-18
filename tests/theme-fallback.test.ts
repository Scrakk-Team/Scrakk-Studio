/**
 * Fallback al tema base (Fase themes): un tema parcial (convertido VSIX)
 * fusiona sus colores SOBRE scrakk-night/day según su tipo. Sin esto, las
 * vars no definidas desaparecen del <style> (se reemplaza entero) y esas
 * zonas quedan transparentes (context menus, tabs activas…).
 */

import { describe, it, expect } from 'vitest'
import {
  registerTheme,
  unregisterTheme,
  resolveThemeColors,
  DEFAULT_THEME_ID,
  DEFAULT_LIGHT_THEME_ID
} from '@services/extensions/types/themes/logic'
import type { ThemeDefinition } from '@services/extensions/types/themes/schema'

function def(partial: Partial<ThemeDefinition> & { name: string }): ThemeDefinition {
  return {
    type: 'dark',
    colors: {},
    ...partial
  } as ThemeDefinition
}

describe('resolveThemeColors', () => {
  it('tema parcial hereda las keys que no define (sin transparentes)', () => {
    registerTheme({
      id: DEFAULT_THEME_ID,
      name: 'Scrakk Night',
      type: 'dark',
      extensionId: 'scrakk-night',
      isBuiltin: true,
      definition: def({
        name: 'Scrakk Night',
        colors: { bg: '#000000', surface: '#101010', hover: '#1a1a1a', text: '#fff' }
      })
    })
    const partial = def({
      name: 'Convertido',
      colors: { bg: '#1a1b26', surface: '#16161e' }
    })
    const resolved = resolveThemeColors(partial)
    // Lo propio manda…
    expect(resolved.bg).toBe('#1a1b26')
    expect(resolved.surface).toBe('#16161e')
    // …y lo ausente viene del base en vez de undefined.
    expect(resolved.hover).toBe('#1a1a1a')
    expect(resolved.text).toBe('#fff')
  })

  it('el base sobre sí mismo es identidad', () => {
    registerTheme({
      id: DEFAULT_LIGHT_THEME_ID,
      name: 'Scrakk Day',
      type: 'light',
      extensionId: 'scrakk-day',
      isBuiltin: true,
      definition: def({
        name: 'Scrakk Day',
        type: 'light',
        colors: { bg: '#fff' }
      })
    })
    const base = def({ name: 'Scrakk Day', type: 'light', colors: { bg: '#fff' } })
    expect(resolveThemeColors(base)).toEqual({ bg: '#fff' })
  })

  it('sin base registrada devuelve los colores tal cual', () => {
    unregisterTheme(DEFAULT_THEME_ID)
    const orphan = def({
      name: 'Huérfano',
      type: 'dark',
      colors: { bg: '#123456' }
    })
    // Importante: no rompe aunque el base no exista (boot temprano).
    const resolved = resolveThemeColors(orphan)
    expect(resolved.bg).toBe('#123456')
    expect(resolved.surface).toBeUndefined()
  })
})
