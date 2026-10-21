// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Color picker del editor: la UI la dibuja el FRONTEND.
 *
 * Antes el motor (Innerta) pintaba el cuadradito de color al lado del literal
 * y el panel entero sobre su canvas. Ahora el motor sólo publica los literales
 * (con su rect) y el frontend pone la piel encima. Lo que se rompe en
 * silencio: que el motor siga pintando (dos UIs para lo mismo), que el panel
 * del frontend no tenga las MISMAS medidas que el nativo, o que el frontend no
 * sea el que aplica el color en el buffer.
 */

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseColorTokens } from '../src/renderer/src/features/editor/colorpicker/types'

const read = (rel: string): string =>
  readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')

const LAYER = 'src/renderer/src/features/editor/colorpicker/ColorSwatchLayer.tsx'
const PANEL = 'src/renderer/src/features/editor/colorpicker/ColorPickerPanel.tsx'
const TYPES = 'src/renderer/src/features/editor/colorpicker/types.ts'
const MATH = 'src/renderer/src/features/editor/colorpicker/colorMath.ts'
const ENGINE = 'src/renderer/src/features/editor/engines/innerta/InnertaEngine.ts'
const LOADER = 'src/renderer/src/features/editor/engines/innerta/innertaLoader.ts'
const VIEW = 'src/renderer/src/features/editor/FileTabView.tsx'

describe('el motor sólo publica los colores', () => {
  it('publica los tokens con su rect y avisa al host', () => {
    const engine = read(ENGINE)
    expect(engine).toContain('publishColorTokens()')
    expect(engine).toContain('COLOR_TOKENS_EVENT')
    expect(engine).toContain('getColorTokensJson')
  })

  it('el loader expone el JSON y el apply', () => {
    const loader = read(LOADER)
    expect(loader).toContain('_GetInnertaColorTokensJson')
    expect(loader).toContain('_ApplyInnertaColorToken')
  })
})

describe('el frontend dibuja los cuadraditos y el panel', () => {
  it('la capa escucha los tokens y los pinta', () => {
    const layer = read(LAYER)
    expect(layer).toContain('COLOR_TOKENS_EVENT')
    expect(layer).toContain('parseColorTokens')
    expect(layer).toContain('styles.swatch')
  })

  it('el panel tiene SV, tono, alfa, preview, hex y botones', () => {
    const panel = read(PANEL)
    for (const piece of [
      'styles.sv',
      'styles.hue',
      'styles.alpha',
      'styles.previewSwatch',
      'styles.hexField',
      'styles.button'
    ]) {
      expect(panel).toContain(piece)
    }
  })

  it('las medidas son las del panel nativo', () => {
    const types = read(TYPES)
    // LayoutSpec del motor: pad 10, sv 180, gap 10, hue 16, alpha 14,
    // preview 28, hex 26, botones 28, radio 10/8.
    expect(types).toContain('panelPad: 10')
    expect(types).toContain('svSize: 180')
    expect(types).toContain('gap: 10')
    expect(types).toContain('hueBarW: 16')
    expect(types).toContain('alphaBarH: 14')
    expect(types).toContain('previewH: 28')
    expect(types).toContain('hexFieldH: 26')
    expect(types).toContain('btnH: 28')
    expect(types).toContain('panelRadius: 10')
    expect(types).toContain('btnRadius: 8')
  })

  it('aplicar el color lo escribe en el buffer (el motor conserva el formato)', () => {
    const layer = read(LAYER)
    expect(layer).toContain('applyColorToken')
    expect(layer).toContain('onApply')
  })

  it('la capa está montada en la tab del editor', () => {
    const view = read(VIEW)
    expect(view).toContain('ColorSwatchLayer')
  })
})

describe('la matemática de color', () => {
  it('convierte rgba↔hsva y parsea hex', () => {
    const math = read(MATH)
    expect(math).toContain('export function rgbaToHsva')
    expect(math).toContain('export function hsvaToRgba')
    expect(math).toContain('export function parseHex')
  })
})

describe('el JSON del motor se mapea a los tokens', () => {
  // El JSON del motor usa claves cortas (l, cs, ce, f). Si el frontend las
  // lee con el nombre largo, el apply recibe `undefined` y el color NUNCA se
  // escribe en el texto: de hecho pasaba.
  const json = JSON.stringify([
    {
      l: 12,
      cs: 4,
      ce: 11,
      x: 120.5,
      y: 40,
      w: 11,
      h: 11,
      r: 1,
      g: 0.5,
      b: 0,
      a: 0.8,
      f: 2,
      raw: '#ff8000'
    }
  ])

  it('mapea cada campo', () => {
    const [token] = parseColorTokens(json)
    expect(token.line).toBe(12)
    expect(token.colStart).toBe(4)
    expect(token.colEnd).toBe(11)
    expect(token.x).toBe(120.5)
    expect(token.y).toBe(40)
    expect(token.w).toBe(11)
    expect(token.h).toBe(11)
    expect(token.r).toBe(1)
    expect(token.g).toBe(0.5)
    expect(token.b).toBe(0)
    expect(token.a).toBe(0.8)
    expect(token.format).toBe(2)
    expect(token.raw).toBe('#ff8000')
  })

  it('un JSON roto no rompe nada', () => {
    expect(parseColorTokens('')).toEqual([])
    expect(parseColorTokens('no es json')).toEqual([])
    expect(parseColorTokens('{"a":1}')).toEqual([])
  })
})
