import { describe, expect, it } from 'vitest'
import { themeTokenRules } from '@features/editor/engines/innerta/themeTokenRules'
import { resolveSlotForScopes } from '@shared/syntax'

describe('tokenColors del tema → reglas del resolutor', () => {
  it('convierte cada tokenColor en una regla con el slot del tema', () => {
    const rules = themeTokenRules([
      { scope: 'comment', foreground: '#7a7a7a' },
      { scope: 'string', foreground: '#a5d6a7' }
    ])
    expect(rules).toEqual([
      { selector: 'comment', value: 3 },
      { selector: 'string', value: 1 }
    ])
  })

  it('un tokenColor con varios scopes genera una regla por scope', () => {
    const rules = themeTokenRules([
      { scope: ['comment', 'punctuation.definition.comment'], foreground: '#7a7a7a' }
    ])
    expect(rules.map((rule) => rule.selector)).toEqual(['comment', 'punctuation.definition.comment'])
  })

  it('EL PUNTO: lo específico del tema gana sobre la tabla genérica', () => {
    // El tema distingue comentario de línea de comentario de bloque. Sin estas
    // reglas, los dos resolvían al mismo slot (la tabla por defecto mira el
    // prefijo `comment`) y la distinción del tema se perdía.
    const rules = themeTokenRules([{ scope: 'comment.block', foreground: '#123456' }])
    // `comment.block` es más específico (identifier más largo) que `comment`.
    const score = resolveSlotForScopes(['source.x', 'comment.block.x'], rules)
    const scoreDefault = resolveSlotForScopes(['source.x', 'comment.block.x'])
    expect(score).toBe(scoreDefault)
    // Y el selector del tema gana en su propio scope genérico (empate por score
    // → gana la regla que va después, que es la del tema).
    const tie = resolveSlotForScopes(['source.x', 'comment.x'], [
      { selector: 'comment', value: 11 }
    ])
    expect(tie).toBe(11)
  })

  it('ignora lo que no puede pintar el motor (sin slot, sin color)', () => {
    const rules = themeTokenRules([
      { scope: 'markup.heading', foreground: '#fff' },
      { scope: 'comment' },
      { scope: '', foreground: '#fff' }
    ])
    expect(rules).toEqual([])
  })

  it('sin tokens del tema no hay reglas (y el resolutor sigue con la tabla por defecto)', () => {
    expect(themeTokenRules(undefined)).toEqual([])
    expect(themeTokenRules([])).toEqual([])
    expect(resolveSlotForScopes(['source.js', 'comment.line.js'])).toBe(3)
  })

  it('un scope de tree-sitter se resuelve igual con reglas del tema', () => {
    const rules = themeTokenRules([{ scope: 'variable.parameter', foreground: '#f00' }])
    expect(resolveSlotForScopes(['@variable.parameter'], rules)).toBe(12)
  })
})
