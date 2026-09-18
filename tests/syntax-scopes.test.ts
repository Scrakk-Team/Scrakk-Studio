/**
 * Resolutor de selectores de scope.
 *
 * Lo que estos tests protegen: que un tema de VS Code resuelva IGUAL acá. La
 * semántica no es inventada — está copiada de `nameMatcher` /
 * `scopesAreMatching` / `createMatchers` de VS Code, y si se rompe, el color
 * de las 4 fuentes (tree-sitter nativo, tree-sitter dinámico, TextMate y
 * semantic tokens) se rompe a la vez.
 */

import { describe, it, expect } from 'vitest'
import {
  NO_MATCH,
  SOURCE_PRIORITY,
  StandardTokenType,
  matchNames,
  matchScopeSelector,
  parseScopeSelector,
  pickWinningSource,
  resolveScopeStyle,
  scopeMatches,
  toStandardTokenType
} from '@shared/syntax'

describe('scopeMatches', () => {
  it('matchea exacto', () => {
    expect(scopeMatches('keyword', 'keyword')).toBe(true)
  })

  it('matchea por prefijo de punto', () => {
    expect(scopeMatches('keyword.control.flow.js', 'keyword')).toBe(true)
    expect(scopeMatches('keyword.control.flow.js', 'keyword.control')).toBe(true)
  })

  it('no matchea prefijos parciales ni subcadenas del medio', () => {
    expect(scopeMatches('keywordx', 'keyword')).toBe(false)
    expect(scopeMatches('keyword.control', 'control')).toBe(false)
    expect(scopeMatches('', 'keyword')).toBe(false)
  })
})

describe('matchNames — profundidad y longitud', () => {
  const stack = ['source.js', 'meta.function.js', 'entity.name.function.js']

  it('cuenta los identificadores que matchean', () => {
    expect(matchNames(['entity.name.function'], stack)).toBeGreaterThan(0)
  })

  it('lo más INTERNO pesa más que lo externo', () => {
    const inner = matchNames(['entity.name.function'], stack)
    const outer = matchNames(['source'], stack)
    expect(inner).toBeGreaterThan(outer)
  })

  it('a igual profundidad gana el identificador MÁS LARGO', () => {
    const shortStack = ['keyword.control']
    expect(matchNames(['keyword.control'], shortStack)).toBeGreaterThan(
      matchNames(['keyword'], shortStack)
    )
  })

  it('una conjunción exige TODOS los identificadores', () => {
    const full = ['source.js', 'meta.function.js', 'entity.name.function.js']
    expect(matchNames(['entity.name.function', 'meta.function'], full)).toBeGreaterThan(0)
    expect(matchNames(['entity.name.function', 'nope'], full)).toBe(NO_MATCH)
    // Más identificadores que elementos del stack no puede matchear.
    expect(matchNames(['a', 'b'], ['a'])).toBe(NO_MATCH)
  })
})

describe('parseScopeSelector — gramática', () => {
  it('separa alternativas por coma', () => {
    const parts = parseScopeSelector('keyword, storage')
    expect(parts).toHaveLength(2)
    expect(parts[0].identifiers).toEqual(['keyword'])
    expect(parts[1].identifiers).toEqual(['storage'])
  })

  it('una conjunción por espacio se junta en una sola lista', () => {
    const parts = parseScopeSelector('meta.function entity.name')
    expect(parts).toHaveLength(1)
    expect(parts[0].identifiers).toEqual(['meta.function', 'entity.name'])
  })

  it('lee la prioridad explícita R:/L:', () => {
    expect(parseScopeSelector('R:string')[0].priority).toBe(1)
    expect(parseScopeSelector('L:string')[0].priority).toBe(-1)
    expect(parseScopeSelector('string')[0].priority).toBe(0)
  })

  it('marca la negación con `-`', () => {
    const parts = parseScopeSelector('-comment')
    expect(parts[0].negated).toBe(true)
    expect(parts[0].identifiers).toEqual(['comment'])
  })

  it('un selector vacío no produce matchers', () => {
    expect(parseScopeSelector('')).toEqual([])
    expect(parseScopeSelector('   ')).toEqual([])
  })
})

describe('matchScopeSelector', () => {
  it('devuelve el máximo de las alternativas', () => {
    expect(matchScopeSelector('nope, keyword', ['keyword.control'])).toBeGreaterThan(0)
  })

  it('no matchea nada cuando ninguna alternativa entra', () => {
    expect(matchScopeSelector('nope', ['keyword.control'])).toBe(NO_MATCH)
  })
})

describe('resolveScopeStyle', () => {
  const scopes = ['source.ts', 'meta.class.ts', 'entity.name.type.class.ts']

  it('gana la regla más específica', () => {
    const won = resolveScopeStyle(
      [
        { selector: 'entity', value: 'generico' },
        { selector: 'entity.name.type.class', value: 'especifico' }
      ],
      scopes
    )
    expect(won?.value).toBe('especifico')
  })

  it('a igual especificidad gana la ÚLTIMA declarada (orden del tema)', () => {
    const won = resolveScopeStyle(
      [
        { selector: 'entity.name.type.class', value: 'primero' },
        { selector: 'entity.name.type.class', value: 'segundo' }
      ],
      scopes
    )
    expect(won?.value).toBe('segundo')
  })

  it('la prioridad R: gana el empate', () => {
    const won = resolveScopeStyle(
      [
        { selector: 'entity.name.type.class', value: 'normal' },
        { selector: 'R:entity.name.type.class', value: 'conPrioridad' }
      ],
      scopes
    )
    expect(won?.value).toBe('conPrioridad')
  })

  it('sin reglas que entren no hay estilo', () => {
    expect(resolveScopeStyle([{ selector: 'comment', value: 'x' }], scopes)).toBeNull()
  })
})

describe('toStandardTokenType — el mismo dato para las 3 fuentes', () => {
  it('reconoce comment/string/regex en scopes de TextMate y en captures', () => {
    expect(toStandardTokenType('comment.line.double-slash.js')).toBe(StandardTokenType.Comment)
    expect(toStandardTokenType('@comment')).toBe(StandardTokenType.Comment)
    expect(toStandardTokenType('string.quoted.single.ts')).toBe(StandardTokenType.String)
    expect(toStandardTokenType('@string')).toBe(StandardTokenType.String)
    expect(toStandardTokenType('regexp.js')).toBe(StandardTokenType.RegEx)
  })

  it('un scope que dice `string` y `regexp` a la vez da String (gana el match más a la IZQUIERDA, igual que VS Code)', () => {
    // Detalle de fidelidad, no un descuido: VS Code usa
    // /\b(comment|string|regex|regexp)\b/ y se queda con el PRIMER match, así
    // que `string.regexp.js` es String. Si algún día queremos el orden
    // distinto, hay que cambiarlo a conciencia y en los dos lados.
    expect(toStandardTokenType('string.regexp.js')).toBe(StandardTokenType.String)
  })

  it('todo lo demás es Other', () => {
    expect(toStandardTokenType('keyword.control')).toBe(StandardTokenType.Other)
    expect(toStandardTokenType('@variable.parameter')).toBe(StandardTokenType.Other)
  })
})

describe('pickWinningSource — prioridad entre fuentes', () => {
  it('los semantic tokens pisan a todo', () => {
    expect(pickWinningSource(['treeSitter', 'semanticTokens'])).toBe('semanticTokens')
    expect(pickWinningSource(['textMate', 'semanticTokens', 'treeSitter'])).toBe('semanticTokens')
  })

  it('tree-sitter dinámico y TextMate están por encima del compilado', () => {
    expect(pickWinningSource(['treeSitter', 'textMate'])).toBe('textMate')
    expect(pickWinningSource(['treeSitter', 'treeSitterDynamic'])).toBe('treeSitterDynamic')
  })

  it('a igual prioridad gana el último registrado (extensión instalada después)', () => {
    expect(SOURCE_PRIORITY.textMate).toBe(SOURCE_PRIORITY.treeSitterDynamic)
    expect(pickWinningSource(['textMate', 'treeSitterDynamic'])).toBe('treeSitterDynamic')
  })

  it('sin fuentes no hay ganador', () => {
    expect(pickWinningSource([])).toBeNull()
  })
})
