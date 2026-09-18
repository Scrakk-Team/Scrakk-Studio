/**
 * Tests del loader de consejos del WelcomePanel (JSON auto-descubiertos).
 */

import { describe, it, expect } from 'vitest'
import { parseTipDefinition } from '../src/renderer/src/features/layout/panels/WelcomePanel/tips'

describe('parseTipDefinition', () => {
  it('acepta definición válida con order', () => {
    expect(
      parseTipDefinition(
        { id: 'a', title: 'T', description: 'D', order: 5 },
        'a.json'
      )
    ).toEqual({ id: 'a', title: 'T', description: 'D', order: 5 })
  })

  it('order opcional; trim de strings', () => {
    expect(
      parseTipDefinition({ id: ' a ', title: ' T ', description: ' D ' }, 'a.json')
    ).toEqual({ id: 'a', title: 'T', description: 'D' })
  })

  it('descarta lo inválido (no objeto, sin id/title/description)', () => {
    expect(parseTipDefinition(null, 'x.json')).toBeNull()
    expect(parseTipDefinition('texto', 'x.json')).toBeNull()
    expect(parseTipDefinition({ title: 'T', description: 'D' }, 'x.json')).toBeNull()
    expect(parseTipDefinition({ id: 'a', description: 'D' }, 'x.json')).toBeNull()
    expect(parseTipDefinition({ id: 'a', title: 'T' }, 'x.json')).toBeNull()
    expect(parseTipDefinition({ id: '  ', title: 'T', description: 'D' }, 'x.json')).toBeNull()
  })

  it('order no numérico se ignora sin invalidar', () => {
    expect(
      parseTipDefinition({ id: 'a', title: 'T', description: 'D', order: 'x' }, 'a.json')
    ).toEqual({ id: 'a', title: 'T', description: 'D' })
  })
})
