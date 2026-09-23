/**
 * Autocompletado — lógica pura (prefijo a reemplazar y ranking de ítems).
 *
 * El resto del módulo es DOM/LSP; esto se testea sin red ni motor.
 */

import { describe, expect, it } from 'vitest'
import { prefixAt, rankItems } from '../src/renderer/src/services/completion/controller'
import type { CompletionItem } from '../src/renderer/src/services/completion/state'

const item = (label: string, extra: Partial<CompletionItem> = {}): CompletionItem => ({
  serverName: 'srv',
  label,
  kind: 6,
  insertText: label,
  filterText: label,
  ...extra
})

describe('prefixAt', () => {
  it('toma el prefijo de palabra antes del caret', () => {
    expect(prefixAt('const foo = ba', 0, 14)).toBe('ba')
    expect(prefixAt('x.obj.met', 0, 9)).toBe('met')
  })

  it('prefijo vacío si el caret está tras un separador', () => {
    expect(prefixAt('foo.', 0, 4)).toBe('')
    expect(prefixAt('a + ', 0, 4)).toBe('')
  })

  it('respeta la línea del caret, no todo el texto', () => {
    expect(prefixAt('let a = 1\ncons', 1, 4)).toBe('cons')
  })

  it('no rompe con posiciones fuera de rango', () => {
    expect(prefixAt('', 0, 5)).toBe('')
    expect(prefixAt('abc', 9, 2)).toBe('')
  })
})

describe('rankItems', () => {
  it('filtra por prefijo case-insensitive', () => {
    const items = [item('forEach'), item('map'), item('filter')]
    expect(rankItems(items, 'f').map((i) => i.label)).toEqual(['filter', 'forEach'])
  })

  it('si nada matchea el prefijo, no filtra (mejor mostrar que vaciar)', () => {
    const items = [item('alpha'), item('beta')]
    expect(rankItems(items, 'zzz').map((i) => i.label)).toEqual(['alpha', 'beta'])
  })

  it('deduplica el mismo ítem de varios servers', () => {
    const items = [item('map', { serverName: 'a' }), item('map', { serverName: 'b' })]
    expect(rankItems(items, 'map')).toHaveLength(1)
  })

  it('ordena por sortText y cae al label', () => {
    const items = [item('z', { sortText: '1' }), item('a', { sortText: '2' }), item('b')]
    expect(rankItems(items, '').map((i) => i.label)).toEqual(['z', 'a', 'b'])
  })
})
