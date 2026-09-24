// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tests del fondo con imagen del theme (eye-dark): parser, merge y CSP.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  normalizeThemeDefinition,
  normalizeThemeBackground
} from '../src/renderer/src/services/extensions/types/themes/schema'

const IMG = 'https://example.com/bg.jpg'

function themeWithBackground(background: unknown): unknown {
  return {
    name: 'T',
    type: 'dark',
    colors: { bg: 'transparent', background }
  }
}

describe('normalizeThemeBackground', () => {
  it('acepta objeto válido con defaults', () => {
    expect(normalizeThemeBackground({ type: 'image', image: IMG })).toEqual({
      type: 'image',
      image: IMG
    })
  })

  it('normaliza opcionales (clamp + allowlist)', () => {
    expect(
      normalizeThemeBackground({
        type: 'image',
        image: IMG,
        imageOpacity: 2,
        imageSize: 'cover',
        imagePosition: 'top left',
        imageBlur: '100px'
      })
    ).toEqual({
      type: 'image',
      image: IMG,
      imageOpacity: 1,
      imageSize: 'cover',
      imagePosition: 'top left',
      imageBlur: '40px'
    })
  })

  it('rechaza type, url, size, position y blur inválidos', () => {
    expect(normalizeThemeBackground({ type: 'video', image: IMG })).toBeNull()
    expect(normalizeThemeBackground({ type: 'image', image: 'http://x/y.jpg' })).toBeNull()
    expect(normalizeThemeBackground({ type: 'image', image: 'ftp://x/y.jpg' })).toBeNull()
    expect(normalizeThemeBackground({ type: 'image', image: '");x(' })).toBeNull()
    expect(
      normalizeThemeBackground({ type: 'image', image: IMG, imageSize: 'stretch' })?.imageSize
    ).toBeUndefined()
    expect(
      normalizeThemeBackground({ type: 'image', image: IMG, imagePosition: 'url(x)' })?.imagePosition
    ).toBeUndefined()
    expect(
      normalizeThemeBackground({ type: 'image', image: IMG, imageBlur: 'fuerte' })?.imageBlur
    ).toBeUndefined()
    expect(normalizeThemeBackground(null)).toBeNull()
    expect(normalizeThemeBackground('https://x/y.jpg')).toBeNull()
  })

  it('acepta data: y porcentajes', () => {
    const def = normalizeThemeBackground({
      type: 'image',
      image: 'data:image/png;base64,AAA',
      imagePosition: '50% 20%'
    })
    expect(def?.imagePosition).toBe('50% 20%')
  })
})

describe('normalizeThemeDefinition con background', () => {
  it('conserva el objeto validado y acepta bg transparent', () => {
    const def = normalizeThemeDefinition(
      themeWithBackground({
        type: 'image',
        image: IMG,
        imageOpacity: 0.8,
        imageSize: 'cover',
        imagePosition: 'center',
        imageBlur: '0px'
      })
    )
    expect(def?.colors.bg).toBe('transparent')
    expect(def?.colors.background).toEqual({
      type: 'image',
      image: IMG,
      imageOpacity: 0.8,
      imageSize: 'cover',
      imagePosition: 'center',
      imageBlur: '0px'
    })
  })

  it('background inválido no tumba el tema (queda sin imagen)', () => {
    const def = normalizeThemeDefinition(themeWithBackground({ type: 'video' }))
    expect(def).not.toBeNull()
    expect(def?.colors.background).toBeUndefined()
  })
})

describe('eye-dark builtin trae background válido', () => {
  it('el theme.json del repo parsea con imagen', () => {
    const here = path.dirname(fileURLToPath(import.meta.url))
    const raw = JSON.parse(
      fs.readFileSync(
        path.resolve(here, '..', 'src/renderer/src/services/extensions/builtin/themes/eye-dark/theme.json'),
        'utf-8'
      )
    )
    const def = normalizeThemeDefinition(raw)
    expect(def?.colors.background?.type).toBe('image')
    expect(def?.colors.background?.image.startsWith('https://')).toBe(true)
  })
})

describe('CSP permite la imagen remota', () => {
  it('img-src incluye https:', () => {    const here = path.dirname(fileURLToPath(import.meta.url))
    const html = fs.readFileSync(path.resolve(here, '..', 'src/renderer/index.html'), 'utf-8')
    const match = html.match(/http-equiv="Content-Security-Policy"[^>]*content="([^"]*)"/)
    expect(match, 'CSP no encontrado').not.toBeNull()
    const img = match![1]
      .split(';')
      .map((s) => s.trim())
      .find((s) => s === 'img-src' || s.startsWith('img-src '))
    expect(img).toContain('https:')
    expect(img).toContain('data:')
  })
})

describe('getActiveThemeBackground', () => {
  it('null sin imagen, objeto con imagen', async () => {
    const { vi } = await import('vitest')
    vi.stubGlobal('document', {
      documentElement: { dataset: {} as Record<string, string> },
      createElement: () => ({ textContent: '' }),
      getElementById: () => null,
      head: { appendChild: () => {} }
    })
    vi.stubGlobal('window', { dispatchEvent: () => {} })
    try {
      const logic = await import(
        '../src/renderer/src/services/extensions/types/themes/logic'
      )
      const plain = {
        name: 'P',
        type: 'dark' as const,
        colors: { bg: '#000000' }
      }
      logic.registerTheme({ id: 'plain-t', name: 'P', type: 'dark', extensionId: 'e', isBuiltin: false, definition: plain })
      logic.activateTheme('plain-t')
      expect(logic.getActiveThemeBackground()).toBeNull()
      const withBg = {
        name: 'I',
        type: 'dark' as const,
        colors: {
          bg: 'transparent',
          background: {
            type: 'image' as const,
            image: 'https://example.com/bg.jpg',
            imageOpacity: 0.8
          }
        }
      }
      logic.registerTheme({ id: 'img-t', name: 'I', type: 'dark', extensionId: 'e', isBuiltin: false, definition: withBg })
      logic.activateTheme('img-t')
      expect(logic.getActiveThemeBackground()).toEqual({
        type: 'image',
        image: 'https://example.com/bg.jpg',
        imageOpacity: 0.8
      })
      logic.unregisterTheme('plain-t')
      logic.unregisterTheme('img-t')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('miles-dark builtin trae background válido', () => {
  it('el theme.json del repo parsea con imagen y paleta spider', async () => {
    const path = await import('node:path')
    const fs = await import('node:fs')
    const { fileURLToPath } = await import('node:url')
    const here = path.dirname(fileURLToPath(import.meta.url))
    const raw = JSON.parse(
      fs.readFileSync(
        path.resolve(here, '..', 'src/renderer/src/services/extensions/builtin/themes/miles-dark/theme.json'),
        'utf-8'
      )
    )
    const { normalizeThemeDefinition } = await import(
      '../src/renderer/src/services/extensions/types/themes/schema'
    )
    const def = normalizeThemeDefinition(raw)
    expect(def?.colors.bg).toBe('transparent')
    expect(def?.colors.accent).toBe('#e8232a')
    expect(def?.colors.background?.type).toBe('image')
    expect(def?.colors.background?.image).toContain('hdwallpapers.in')
    expect(def?.colors.background?.imageOpacity).toBe(0.8)
  })
})
