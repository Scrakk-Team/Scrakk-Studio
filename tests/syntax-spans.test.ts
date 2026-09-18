/**
 * Paint list: merge de spans de 4 fuentes + encoding u32.
 *
 * El test que más importa de todo el archivo es "un semantic token pisa sólo
 * lo que declara": es la razón por la que el diseño tiene spans con ASPECTOS en
 * vez de "un color por rango". Si eso se rompe, el LSP borra el color del
 * árbol cada vez que manda sólo una negrita.
 */

import { describe, it, expect } from 'vitest'
import {
  MetadataConsts,
  StylePalette,
  decodeTokenMetadata,
  encodeTokenMetadata,
  fontStyleBits,
  inheritStyle,
  mergeSpans,
  type StyledSpan
} from '@shared/syntax'

const span = (
  startLine: number,
  startCol: number,
  endLine: number,
  endCol: number,
  style: StyledSpan['style'],
  source: StyledSpan['source'],
  layer: StyledSpan['layer'] = 'text'
): StyledSpan => ({
  start: { line: startLine, column: startCol },
  end: { line: endLine, column: endCol },
  style,
  source,
  layer
})

describe('inheritStyle', () => {
  it('pisa sólo los aspectos presentes', () => {
    const base = { foreground: '#ff0000', bold: true }
    expect(inheritStyle(base, { italic: true })).toEqual({
      foreground: '#ff0000',
      bold: true,
      italic: true
    })
  })

  it('pisa un aspecto cuando lo declara', () => {
    expect(inheritStyle({ foreground: '#ff0000' }, { foreground: '#00ff00' }).foreground).toBe('#00ff00')
  })

  it('un estilo vacío no pisa nada', () => {
    expect(inheritStyle({ foreground: '#ff0000' }, {})).toEqual({ foreground: '#ff0000' })
  })
})

describe('mergeSpans', () => {
  it('sin spans no hay paint list', () => {
    expect(mergeSpans([])).toEqual([])
  })

  it('un solo span pasa tal cual', () => {
    const merged = mergeSpans([span(0, 0, 0, 5, { foreground: '#f00' }, 'treeSitter')])
    expect(merged).toHaveLength(1)
    expect(merged[0].style.foreground).toBe('#f00')
    expect(merged[0].source).toBe('treeSitter')
  })

  it('UN SEMANTIC TOKEN PISA SÓLO LO QUE DECLARA (conserva el color del árbol)', () => {
    const merged = mergeSpans([
      span(0, 0, 0, 10, { foreground: '#ff0000' }, 'treeSitter'),
      span(0, 0, 0, 5, { italic: true }, 'semanticTokens')
    ])
    expect(merged).toHaveLength(2)
    expect(merged[0]).toMatchObject({
      source: 'semanticTokens',
      style: { foreground: '#ff0000', italic: true }
    })
    expect(merged[1]).toMatchObject({ source: 'treeSitter', style: { foreground: '#ff0000' } })
  })

  it('la fuente de mayor prioridad gana el tramo', () => {
    const merged = mergeSpans([
      span(0, 0, 0, 5, { foreground: '#arbol' }, 'treeSitter'),
      span(0, 0, 0, 5, { foreground: '#textmate' }, 'textMate')
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0].source).toBe('textMate')
    expect(merged[0].style.foreground).toBe('#textmate')
  })

  it('a igual prioridad gana el span que llegó después', () => {
    const merged = mergeSpans([
      span(0, 0, 0, 5, { foreground: '#primero' }, 'textMate'),
      span(0, 0, 0, 5, { foreground: '#segundo' }, 'treeSitterDynamic')
    ])
    expect(merged[0].style.foreground).toBe('#segundo')
    expect(merged[0].source).toBe('treeSitterDynamic')
  })

  it('fusiona tramos contiguos idénticos', () => {
    const merged = mergeSpans([
      span(0, 0, 0, 5, { foreground: '#f00' }, 'treeSitter'),
      span(0, 5, 0, 10, { foreground: '#f00' }, 'treeSitter')
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0].start.column).toBe(0)
    expect(merged[0].end.column).toBe(10)
  })

  it('corta en los límites de cada span que no solapa', () => {
    const merged = mergeSpans([
      span(0, 0, 0, 10, { foreground: '#f00' }, 'treeSitter'),
      span(0, 10, 0, 12, { foreground: '#0f0' }, 'treeSitter')
    ])
    expect(merged).toHaveLength(2)
  })

  it('acumula las capas que aportaron en el tramo', () => {
    const merged = mergeSpans([
      span(0, 0, 0, 5, { foreground: '#f00' }, 'treeSitter', 'text'),
      span(0, 0, 0, 5, { underline: true }, 'semanticTokens', 'underline')
    ])
    expect(merged[0].layers).toEqual(['text', 'underline'])
  })

  it('ignora spans inválidos (vacíos o al revés) sin romper el resto', () => {
    const merged = mergeSpans([
      span(0, 5, 0, 5, { foreground: '#x' }, 'treeSitter'),
      span(0, 5, 0, 1, { foreground: '#x' }, 'treeSitter'),
      span(0, 0, 0, 3, { foreground: '#ok' }, 'treeSitter')
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0].style.foreground).toBe('#ok')
  })

  it('funciona en varias líneas', () => {
    const merged = mergeSpans([
      span(1, 0, 3, 4, { foreground: '#block' }, 'treeSitter'),
      span(2, 1, 2, 3, { italic: true }, 'semanticTokens')
    ])
    const middle = merged.find((m) => m.start.line === 2 && m.start.column === 1)
    expect(middle?.style).toEqual({ foreground: '#block', italic: true })
  })
})

describe('encoding u32 (el formato probado de VS Code)', () => {
  it('roundtrip completo', () => {
    const parts = {
      languageId: 42,
      tokenType: 2,
      balancedBrackets: true,
      fontStyle: fontStyleBits({ bold: true, italic: true }),
      foreground: 300,
      background: 7
    }
    const encoded = encodeTokenMetadata(parts)
    expect(encoded).toBeGreaterThan(0)
    expect(decodeTokenMetadata(encoded)).toEqual(parts)
  })

  it('los bits de fontStyle son los de VS Code (1 italic, 2 bold, 4 underline, 8 strike)', () => {
    expect(fontStyleBits({ italic: true })).toBe(MetadataConsts.ITALIC)
    expect(fontStyleBits({ bold: true })).toBe(MetadataConsts.BOLD)
    expect(fontStyleBits({ underline: true })).toBe(MetadataConsts.UNDERLINE)
    expect(fontStyleBits({ strikethrough: true })).toBe(MetadataConsts.STRIKETHROUGH)
    expect(fontStyleBits({ bold: true, underline: true })).toBe(
      MetadataConsts.BOLD | MetadataConsts.UNDERLINE
    )
    expect(fontStyleBits({})).toBe(0)
  })

  it('el lenguaje y el tipo de token no se pisan entre sí', () => {
    const encoded = encodeTokenMetadata({
      languageId: 3,
      tokenType: 1,
      balancedBrackets: false,
      fontStyle: 0,
      foreground: 0,
      background: 0
    })
    const decoded = decodeTokenMetadata(encoded)
    expect(decoded.languageId).toBe(3)
    expect(decoded.tokenType).toBe(1)
    expect(decoded.foreground).toBe(0)
    expect(decoded.background).toBe(0)
  })
})

describe('StylePalette', () => {
  it('reutiliza el índice del mismo estilo', () => {
    const palette = new StylePalette()
    const a = palette.intern({ foreground: '#f00', bold: true })
    const b = palette.intern({ bold: true, foreground: '#f00' })
    expect(a).toBe(b)
    expect(palette.size).toBe(2)
  })

  it('un estilo vacío es el índice 0 (sin estilo)', () => {
    const palette = new StylePalette()
    expect(palette.intern({})).toBe(0)
  })

  it('estilos distintos son índices distintos y se pueden recuperar', () => {
    const palette = new StylePalette()
    const red = palette.intern({ foreground: '#f00' })
    const green = palette.intern({ foreground: '#0f0' })
    expect(red).not.toBe(green)
    expect(palette.at(green)?.foreground).toBe('#0f0')
    expect(palette.toArray()[0]).toEqual({})
  })
})
