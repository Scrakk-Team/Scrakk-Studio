// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * El título de la tab sale de la OSC que reporta la terminal (0/2). El parser es
 * incremental porque los chunks del PTY cortan las secuencias donde quieran.
 */

import { describe, it, expect } from 'vitest'
import { OscTitleParser } from '../src/renderer/src/services/innerta/oscTitle'

describe('OscTitleParser', () => {
  it('lee OSC 0 con terminador BEL', () => {
    const p = new OscTitleParser()
    expect(p.push('\x1b]0;hola\x07')).toBe('hola')
    expect(p.value).toBe('hola')
  })

  it('lee OSC 2 con terminador ST (ESC \\)', () => {
    const p = new OscTitleParser()
    expect(p.push('\x1b]2;~/proyecto\x1b\\')).toBe('~/proyecto')
  })

  it('junta una secuencia partida entre chunks', () => {
    const p = new OscTitleParser()
    expect(p.push('salida previa\x1b]0;he')).toBeNull()
    expect(p.push('llo\x07 resto')).toBe('hello')
  })

  it('ignora otras OSC (no 0/2)', () => {
    const p = new OscTitleParser()
    expect(p.push('\x1b]8;;https://x\x07')).toBeNull()
    expect(p.value).toBe('')
  })

  it('sólo avisa si el título cambió', () => {
    const p = new OscTitleParser()
    expect(p.push('\x1b]0;a\x07')).toBe('a')
    expect(p.push('\x1b]0;a\x07')).toBeNull()
    expect(p.push('\x1b]0;b\x07')).toBe('b')
  })

  it('un título vacío LIMPIA el anterior', () => {
    const p = new OscTitleParser()
    expect(p.push('\x1b]0;algo\x07')).toBe('algo')
    expect(p.push('\x1b]0;\x07')).toBe('')
    expect(p.value).toBe('')
  })

  it('ignora la ruta del ejecutable que manda PowerShell', () => {
    const p = new OscTitleParser()
    // PowerShell manda la ruta de SU BINARIO al arrancar: no es un título.
    expect(p.push('\x1b]0;C:\\Program Files\\WindowsApps\\Microsoft.PowerShell_7.6.7.0_x64__8wekyb3d8bbwe\\pwsh.exe\x07')).toBeNull()
    expect(p.value).toBe('')
  })

  it('después de la ruta del ejecutable, un título de verdad se aplica', () => {
    const p = new OscTitleParser()
    p.push('\x1b]0;C:\\Windows\\System32\\cmd.exe\x07')
    expect(p.push('\x1b]0;proyecto\x07')).toBe('proyecto')
  })

  it('un cwd sigue siendo un título válido', () => {
    const p = new OscTitleParser()
    expect(p.push('\x1b]0;C:\\Users\\dev\\proyecto\x07')).toBe('C:\\Users\\dev\\proyecto')
    expect(p.push('\x1b]0;/home/dev/proyecto\x07')).toBe('/home/dev/proyecto')
  })
})
