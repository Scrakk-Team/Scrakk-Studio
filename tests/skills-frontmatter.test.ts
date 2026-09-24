// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { describe, it, expect } from 'vitest'
import { parseSkillFile } from '../src/renderer/src/services/skills/frontmatter'

describe('skills frontmatter', () => {
  it('lee una descripción de una sola línea', () => {
    const parsed = parseSkillFile(
      ['---', 'name: code-review', 'description: Revisa diffs.', '---', '', 'Cuerpo'].join('\n')
    )
    expect(parsed.frontmatter.name).toBe('code-review')
    expect(parsed.frontmatter.description).toBe('Revisa diffs.')
    expect(parsed.body).toBe('Cuerpo')
  })

  it('resuelve un escalar plegado (>): une las líneas con espacios', () => {
    const parsed = parseSkillFile(
      [
        '---',
        'name: check-work',
        'description: >',
        '  Check your work with a verification subagent that reviews diffs,',
        '  runs builds and tests, and evaluates correctness.',
        '---',
        '',
        'Cuerpo'
      ].join('\n')
    )
    expect(parsed.frontmatter.description).toBe(
      'Check your work with a verification subagent that reviews diffs, runs builds and tests, and evaluates correctness.'
    )
  })

  it('resuelve un escalar literal (|)', () => {
    const parsed = parseSkillFile(
      ['---', 'description: |', '  línea uno', '  línea dos', '---'].join('\n')
    )
    expect(parsed.frontmatter.description).toBe('línea uno línea dos')
  })

  it('respeta el chomping (>) sin dejar el marcador >', () => {
    const parsed = parseSkillFile(
      ['---', 'description: >-', '  sin salto final', '---'].join('\n')
    )
    expect(parsed.frontmatter.description).toBe('sin salto final')
  })

  it('no rompe el resto del frontmatter después de un bloque', () => {
    const parsed = parseSkillFile(
      [
        '---',
        'name: imagine',
        'description: >',
        '  Genera imágenes.',
        'license: MIT',
        '---',
        '',
        'Cuerpo'
      ].join('\n')
    )
    expect(parsed.frontmatter.name).toBe('imagine')
    expect(parsed.frontmatter.description).toBe('Genera imágenes.')
    expect(parsed.frontmatter.license).toBe('MIT')
    expect(parsed.body).toBe('Cuerpo')
  })

  it('sin frontmatter, el archivo entero es cuerpo', () => {
    const parsed = parseSkillFile('# Solo cuerpo\n\nNada más.')
    expect(parsed.frontmatter.description).toBeUndefined()
    expect(parsed.body).toBe('# Solo cuerpo\n\nNada más.')
  })
})
