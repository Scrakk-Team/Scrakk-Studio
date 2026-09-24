// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { describe, expect, it } from 'vitest'
import {
  decodeHostTokens,
  encodeHostTokens,
  LEGEND,
  LEGEND_TO_SLOT,
  legendForSlot,
  mergeHostTokens,
  resolveSlotForScopes,
  SLOT_TO_LEGEND,
  slotForLegend,
  STANDARD_LEGEND_SIZE,
  type HostToken
} from '@shared/syntax'

describe('leyenda de tokens', () => {
  it('EL ESPEJO DEL C++: todo slot canónico vuelve a su leyenda', () => {
    // Si esta prueba falla, la tabla TS y `LspTokenTypeToSlot` (C++) se
    // separaron: el color que pide el host y el que pinta el motor dejan de
    // coincidir, y el síntoma es "colores plausibles pero equivocados".
    for (const [slotRaw, legend] of Object.entries(SLOT_TO_LEGEND)) {
      const slot = Number(slotRaw)
      expect(slotForLegend(legend), `slot ${slot} → leyenda ${legend}`).toBe(slot)
    }
  })

  it('la leyenda estándar del LSP cae en el slot del tema que corresponde', () => {
    expect(slotForLegend(LEGEND.keyword)).toBe(0)
    expect(slotForLegend(LEGEND.string)).toBe(1)
    expect(slotForLegend(LEGEND.number)).toBe(2)
    expect(slotForLegend(LEGEND.comment)).toBe(3)
    expect(slotForLegend(LEGEND.function)).toBe(4)
    expect(slotForLegend(LEGEND.type)).toBe(6)
    expect(slotForLegend(LEGEND.property)).toBe(9)
    expect(slotForLegend(LEGEND.class)).toBe(10)
    expect(slotForLegend(LEGEND.parameter)).toBe(12)
  })

  it('tag es una extensión propia (no está en el LSP) y llega al slot 13', () => {
    expect(LEGEND.tag).toBe(STANDARD_LEGEND_SIZE)
    expect(slotForLegend(LEGEND.tag)).toBe(13)
    // El 13 no está en la leyenda estándar: el motor hace `% 23` para las
    // leyendas largas, y 13 % 23 = 13 → method → slot 4. La leyenda LARGA sólo
    // se usa para índices >= 24, así que el tag nunca se confunde.
    expect(LEGEND_TO_SLOT[LEGEND.tag]).toBe(13)
  })

  it('una leyenda larga no se descarta: se reusa la estándar', () => {
    // Un servidor que declara 40 tipos: 24 = keyword (24 % 23 = 1 → type).
    expect(slotForLegend(24)).toBe(LEGEND_TO_SLOT[1])
    expect(slotForLegend(-1)).toBe(5)
  })
})

describe('resolveSlotForScopes', () => {
  it('resuelve un stack de TextMate', () => {
    expect(resolveSlotForScopes(['source.js', 'comment.line.double-slash.js'])).toBe(3)
    expect(resolveSlotForScopes(['source.js', 'string.quoted.double.js'])).toBe(1)
    expect(resolveSlotForScopes(['source.js', 'constant.numeric.js'])).toBe(2)
    expect(resolveSlotForScopes(['source.js', 'entity.name.function.js'])).toBe(4)
    expect(resolveSlotForScopes(['source.js', 'keyword.control.flow.js'])).toBe(0)
    expect(resolveSlotForScopes(['source.js', 'variable.parameter.function.js'])).toBe(12)
  })

  it('resuelve un capture de tree-sitter (mismo espacio de nombres)', () => {
    // El punto entero de unificar: `@variable.parameter` y
    // `variable.parameter.function.js` se resuelven con la MISMA tabla.
    expect(resolveSlotForScopes(['@variable.parameter'])).toBe(12)
    expect(resolveSlotForScopes(['@keyword'])).toBe(0)
    expect(resolveSlotForScopes(['@type.builtin'])).toBe(10)
  })

  it('lo específico gana sobre lo genérico', () => {
    // `variable` a secas es slot 5; `variable.parameter` es 12.
    expect(resolveSlotForScopes(['@variable'])).toBe(5)
    expect(resolveSlotForScopes(['@variable.parameter'])).toBe(12)
  })

  it('sin match → el slot "sin color propio" (texto por defecto)', () => {
    expect(resolveSlotForScopes(['source.unknown'])).toBe(5)
    expect(resolveSlotForScopes([])).toBe(5)
  })

  it('las reglas adicionales del tema pisan a las por defecto', () => {
    const rules = [{ selector: 'comment', value: 11 }]
    expect(resolveSlotForScopes(['source.js', 'comment.line.js'], rules)).toBe(11)
  })
})

describe('encodeHostTokens / decodeHostTokens', () => {
  it('codifica en deltas del LSP, con la línea y columna relativas', () => {
    const tokens: HostToken[] = [
      { line: 0, startChar: 0, length: 5, slot: 0 },
      { line: 0, startChar: 6, length: 4, slot: 4 },
      { line: 2, startChar: 3, length: 2, slot: 1 }
    ]
    expect(encodeHostTokens(tokens)).toEqual([
      0, 0, 5, LEGEND.keyword, 0, //
      0, 6, 4, LEGEND.function, 0,
      2, 3, 2, LEGEND.string, 0
    ])
  })

  it('round-trip: lo codificado se decodifica al mismo slot', () => {
    const tokens: HostToken[] = [
      { line: 1, startChar: 4, length: 3, slot: 3 },
      { line: 1, startChar: 10, length: 6, slot: 10 },
      { line: 7, startChar: 0, length: 1, slot: 13 }
    ]
    expect(decodeHostTokens(encodeHostTokens(tokens))).toEqual(tokens)
  })

  it('ordena por (línea, columna) — el motor asume deltas ordenados', () => {
    const encoded = encodeHostTokens([
      { line: 2, startChar: 0, length: 1, slot: 0 },
      { line: 0, startChar: 5, length: 1, slot: 0 }
    ])
    expect(decodeHostTokens(encoded).map((token) => token.line)).toEqual([0, 2])
  })

  it('descarta tokens inválidos en vez de mandar basura al motor', () => {
    const encoded = encodeHostTokens([
      { line: 0, startChar: 0, length: 0, slot: 0 },
      { line: -1, startChar: 0, length: 3, slot: 0 },
      { line: Number.NaN, startChar: 0, length: 3, slot: 0 },
      { line: 0, startChar: 2, length: 3, slot: 1 }
    ])
    expect(decodeHostTokens(encoded)).toEqual([{ line: 0, startChar: 2, length: 3, slot: 1 }])
  })

  it('datos vacíos o truncados no explotan', () => {
    expect(decodeHostTokens(undefined)).toEqual([])
    expect(decodeHostTokens([])).toEqual([])
    expect(decodeHostTokens([0, 0, 5])).toEqual([])
  })

  it('cada slot usa la leyenda canónica', () => {
    expect(legendForSlot(0)).toBe(LEGEND.keyword)
    expect(legendForSlot(13)).toBe(LEGEND.tag)
    expect(legendForSlot(99)).toBe(LEGEND.variable)
  })
})

describe('mergeHostTokens', () => {
  it('el LSP gana sobre la gramática en el rango que ambos cubren', () => {
    const merged = mergeHostTokens([
      { source: 'textMate', tokens: [{ line: 0, startChar: 0, length: 10, slot: 5 }] },
      { source: 'semanticTokens', tokens: [{ line: 0, startChar: 4, length: 3, slot: 0 }] }
    ])
    expect(merged).toEqual([
      { line: 0, startChar: 0, length: 4, slot: 5 },
      { line: 0, startChar: 4, length: 3, slot: 0 },
      { line: 0, startChar: 7, length: 3, slot: 5 }
    ])
  })

  it('a igual prioridad gana la fuente que llegó después', () => {
    const merged = mergeHostTokens([
      { source: 'textMate', tokens: [{ line: 0, startChar: 0, length: 4, slot: 1 }] },
      { source: 'treeSitterDynamic', tokens: [{ line: 0, startChar: 0, length: 4, slot: 3 }] }
    ])
    expect(merged).toEqual([{ line: 0, startChar: 0, length: 4, slot: 3 }])
  })

  it('fusiona tramos contiguos con el mismo slot', () => {
    const merged = mergeHostTokens([
      {
        source: 'textMate',
        tokens: [
          { line: 1, startChar: 0, length: 4, slot: 0 },
          { line: 1, startChar: 4, length: 4, slot: 0 }
        ]
      }
    ])
    expect(merged).toEqual([{ line: 1, startChar: 0, length: 8, slot: 0 }])
  })

  it('no mezcla líneas distintas', () => {
    const merged = mergeHostTokens([
      {
        source: 'textMate',
        tokens: [
          { line: 0, startChar: 0, length: 4, slot: 0 },
          { line: 1, startChar: 0, length: 4, slot: 0 }
        ]
      }
    ])
    expect(merged.map((token) => token.line)).toEqual([0, 1])
  })

  it('sin fuentes no hay tokens (y no hay crash)', () => {
    expect(mergeHostTokens([])).toEqual([])
    expect(mergeHostTokens([{ source: 'textMate', tokens: [] }])).toEqual([])
  })
})
