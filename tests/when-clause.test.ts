// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Cláusulas `when` — evaluador y visibilidad de vistas de extensión.
 *
 * Regla de oro del evaluador: lo que no se entiende NO oculta UI. Ocultar algo
 * que debería verse es peor que mostrar algo de más, y el aviso queda en el
 * log del renderer.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { _resetWhenWarningsForTests, evaluateWhen } from '@services/extensions/when'

const keys = (values: Record<string, unknown>) => (key: string): unknown => values[key]

describe('evaluador de when', () => {
  beforeEach(() => _resetWhenWarningsForTests())

  it('sin expresión (o vacía) siempre visible', () => {
    expect(evaluateWhen(undefined, keys({}))).toBe(true)
    expect(evaluateWhen('', keys({}))).toBe(true)
    expect(evaluateWhen('   ', keys({}))).toBe(true)
  })

  it('clave suelta: verdadera si el valor es true o no vacío', () => {
    expect(evaluateWhen('chatEnabled', keys({ chatEnabled: true }))).toBe(true)
    expect(evaluateWhen('chatEnabled', keys({ chatEnabled: false }))).toBe(false)
    expect(evaluateWhen('mode', keys({ mode: 'edit' }))).toBe(true)
    expect(evaluateWhen('mode', keys({ mode: '' }))).toBe(false)
    expect(evaluateWhen('count', keys({ count: 0 }))).toBe(false)
    expect(evaluateWhen('count', keys({ count: 3 }))).toBe(true)
    // Clave desconocida = falsa (la extensión no la publicó todavía).
    expect(evaluateWhen('nuncaPublicada', keys({}))).toBe(false)
  })

  it('negación', () => {
    expect(evaluateWhen('!chatEnabled', keys({ chatEnabled: false }))).toBe(true)
    expect(evaluateWhen('!chatEnabled', keys({ chatEnabled: true }))).toBe(false)
    expect(evaluateWhen('!!chatEnabled', keys({ chatEnabled: true }))).toBe(true)
  })

  it('comparaciones con literales', () => {
    expect(evaluateWhen("mode == 'edit'", keys({ mode: 'edit' }))).toBe(true)
    expect(evaluateWhen("mode == 'edit'", keys({ mode: 'view' }))).toBe(false)
    expect(evaluateWhen("mode != 'edit'", keys({ mode: 'view' }))).toBe(true)
    expect(evaluateWhen('count == 0', keys({ count: 0 }))).toBe(true)
    expect(evaluateWhen("flag == true", keys({ flag: true }))).toBe(true)
    expect(evaluateWhen('uri == "file://x"', keys({ uri: 'file://x' }))).toBe(true)
  })

  it('lógica con paréntesis y precedencia', () => {
    const values = keys({ a: true, b: false, c: true })
    expect(evaluateWhen('a && c', values)).toBe(true)
    expect(evaluateWhen('a && b', values)).toBe(false)
    expect(evaluateWhen('b || c', values)).toBe(true)
    expect(evaluateWhen('b && c || a', values)).toBe(true)
    expect(evaluateWhen('(a || b) && c', values)).toBe(true)
    expect(evaluateWhen('!(a && b)', values)).toBe(true)
    expect(evaluateWhen("a && mode == 'edit'", keys({ a: true, mode: 'edit' }))).toBe(true)
  })

  it('una expresión NO soportada no oculta nada (y no rompe)', () => {
    // `=~`, `in` y `key:value` son de VS Code y todavía no se soportan.
    expect(evaluateWhen("file =~ /.*\\.ts/", keys({}))).toBe(true)
    expect(evaluateWhen("resourceScheme in ['file']", keys({}))).toBe(true)
    expect(evaluateWhen('view == chat && (', keys({ view: 'chat' }))).toBe(true)
  })

  it('valores raros de las claves no rompen la evaluación', () => {
    const values = keys({ obj: { a: 1 }, nil: null, undef: undefined })
    expect(evaluateWhen('obj', values)).toBe(true)
    expect(evaluateWhen('nil', values)).toBe(false)
    expect(evaluateWhen('undef', values)).toBe(false)
    expect(evaluateWhen("obj == 'x'", values)).toBe(false)
  })
})
