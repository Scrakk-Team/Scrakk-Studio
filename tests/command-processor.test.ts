// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * El pipeline de tools NO debe tocar el contenido: después de `JSON.parse` los
 * strings ya tienen los caracteres exactos que mandó el modelo. Un segundo pase
 * "arreglando" escapes corrompe código real (Python, regex, paths de Windows,
 * HTML). Estos tests son la red que lo sostiene.
 */

import { describe, it, expect } from 'vitest'
import { convertToolCallArguments } from '../src/renderer/src/services/ai/commandProcessor/converter'

function roundTrip(args: Record<string, unknown>, isWindows = false): Record<string, unknown> {
  return JSON.parse(convertToolCallArguments(JSON.stringify(args), isWindows)) as Record<string, unknown>
}

describe('convertToolCallArguments — el contenido queda verbatim', () => {
  it('no expande los \\n literales del contenido', () => {
    const content = 'print("a\\nb")\n'
    expect(roundTrip({ path: 'src/x.py', content }).content).toBe(content)
  })

  it('no toca tabs, backslashes ni anclas de regex en el contenido', () => {
    const content = 'x\\ty\nC:\\new\\file\n^\\s*def foo\n$1 fin'
    expect(roundTrip({ path: 'src/x.py', content }).content).toBe(content)
  })

  it('no decodifica entidades HTML del contenido', () => {
    const content = '<a href="x">&amp;</a> &#65; &#x41;'
    expect(roundTrip({ path: 'a.html', content }).content).toBe(content)
  })

  it('preserva old_str / new_str / command / query', () => {
    const old_str = 'a\\nb'
    const new_str = '\\t\\d+'
    const command = "printf 'x\\ny'"
    const query = '^ *def '
    const out = roundTrip({ path: 'a', old_str, new_str, command, query })
    expect(out.old_str).toBe(old_str)
    expect(out.new_str).toBe(new_str)
    expect(out.command).toBe(command)
    expect(out.query).toBe(query)
  })
})

describe('convertToolCallArguments — payload y paths', () => {
  it('decodifica argumentos doble-codificados (gateway)', () => {
    const inner = JSON.stringify({ path: 'a.txt', content: 'x\\ny' })
    const doubleEncoded = JSON.stringify(inner)
    const out = JSON.parse(convertToolCallArguments(doubleEncoded, false)) as Record<string, unknown>
    expect(out.path).toBe('a.txt')
    expect(out.content).toBe('x\\ny')
  })

  it('normaliza el path según el OS', () => {
    expect(roundTrip({ path: './src/a.ts' }, false).path).toBe('src/a.ts')
    expect(roundTrip({ path: 'src/a.ts' }, true).path).toBe('src\\a.ts')
  })
})
