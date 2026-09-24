// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Queries de tree-sitter: cargar TODAS y categorizarlas.
 *
 * La regla que protegen estos tests es la del plan: **nada se descarta**. Una
 * query que no reconocemos viaja como `unknown` con su nombre real, porque el
 * IDE decide dónde pintar el dato — la capa de sintaxis no es la que decide
 * qué es relevante.
 */

import { describe, it, expect } from 'vitest'
import {
  capturesOf,
  categorizeQueryFile,
  describeQueryCategory,
  listQueryFiles
} from '@shared/syntax'
import { toStandardTokenType, StandardTokenType } from '@shared/syntax'

describe('categorizeQueryFile', () => {
  it('reconoce las categorías del ecosistema', () => {
    expect(categorizeQueryFile('highlights.scm')).toBe('highlights')
    expect(categorizeQueryFile('injections.scm')).toBe('injections')
    expect(categorizeQueryFile('locals.scm')).toBe('locals')
    expect(categorizeQueryFile('tags.scm')).toBe('tags')
    expect(categorizeQueryFile('folds.scm')).toBe('folds')
    expect(categorizeQueryFile('indents.scm')).toBe('indents')
    expect(categorizeQueryFile('textobjects.scm')).toBe('textobjects')
  })

  it('reconoce las variantes con guion (existen en el repo de Innerta)', () => {
    expect(categorizeQueryFile('highlights-jsx.scm')).toBe('highlights')
    expect(categorizeQueryFile('highlights-params.scm')).toBe('highlights')
    expect(categorizeQueryFile('injections-markdown.scm')).toBe('injections')
    // `rainbows.scm` (Helix) y `rainbow-delimiters.scm` (nvim) son el mismo dato.
    expect(categorizeQueryFile('rainbows.scm')).toBe('rainbows')
    expect(categorizeQueryFile('rainbow-delimiters.scm')).toBe('rainbows')
  })

  it('acepta rutas y mayúsculas', () => {
    expect(categorizeQueryFile('queries/typescript/highlights.scm')).toBe('highlights')
    expect(categorizeQueryFile('queries\\rust\\Tags.SCM')).toBe('tags')
  })

  it('lo desconocido NO se pierde: cae en unknown', () => {
    expect(categorizeQueryFile('context.scm')).toBe('unknown')
    expect(categorizeQueryFile('sin-extension')).toBe('unknown')
  })
})

describe('listQueryFiles', () => {
  const files = [
    'queries/typescript/highlights.scm',
    'queries/typescript/injections.scm',
    'queries/typescript/locals.scm',
    'queries/typescript/tags.scm',
    'queries/raro/context.scm'
  ]

  it('devuelve la MISMA cantidad de entradas que de archivos', () => {
    expect(listQueryFiles(files)).toHaveLength(files.length)
  })

  it('conserva el archivo y agrega categoría, capa y etiqueta', () => {
    const [first] = listQueryFiles(files)
    expect(first.file).toBe(files[0])
    expect(first.category).toBe('highlights')
    expect(first.layer).toBe('text')
    expect(first.label).toBe('Resaltado')
  })

  it('extrae la variante cuando el archivo la tiene', () => {
    const [jsx] = listQueryFiles(['queries/tsx/highlights-jsx.scm'])
    expect(jsx.category).toBe('highlights')
    expect(jsx.variant).toBe('jsx')
    const [plain] = listQueryFiles(['queries/tsx/highlights.scm'])
    expect(plain.variant).toBeNull()
  })

  it('las tags se pintan en el gutter y el resto en capas propias', () => {
    const [tags] = listQueryFiles(['tags.scm'])
    const [locals] = listQueryFiles(['locals.scm'])
    expect(tags.layer).toBe('gutter')
    expect(locals.layer).toBe('background')
  })
})

describe('describeQueryCategory', () => {
  it('explica qué produce cada categoría (para el reporte y la UI)', () => {
    expect(describeQueryCategory('tags').produces).toContain('goto-definition')
    expect(describeQueryCategory('injections').produces).toContain('OTRO lenguaje')
    expect(describeQueryCategory('unknown').produces).toContain('crudos')
  })
})

describe('capturesOf', () => {
  it('extrae los captures de una query real', () => {
    const query = `
      (function_declaration name: (identifier) @definition.function)
      (type_identifier) @type.builtin
      ["const" "let"] @keyword
    `
    expect(capturesOf(query).sort()).toEqual(
      ['definition.function', 'keyword', 'type.builtin'].sort()
    )
  })

  it('no repite captures y limpia el punto final', () => {
    expect(capturesOf('(a) @keyword\n(b) @keyword\n(c) @keyword.').sort()).toEqual(['keyword'])
  })

  it('sin captures devuelve vacío', () => {
    expect(capturesOf('(identifier)')).toEqual([])
  })
})

describe('capturesOf + toStandardTokenType — el dato que el editor necesita', () => {
  it('marca strings y comentarios igual que con scopes de TextMate', () => {
    const captures = capturesOf('(string) @string\n(comment) @comment\n(x) @variable')
    const typed = captures.map((scope) => [scope, toStandardTokenType(scope)] as const)
    expect(typed).toContainEqual(['string', StandardTokenType.String])
    expect(typed).toContainEqual(['comment', StandardTokenType.Comment])
    expect(typed).toContainEqual(['variable', StandardTokenType.Other])
  })
})
