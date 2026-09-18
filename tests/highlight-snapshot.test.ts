import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearHighlightSnapshot,
  getHighlightSnapshots,
  groupSnapshotTokens,
  recordHighlightSnapshot,
  slotLabel,
  subscribeToHighlightSnapshots,
  type SnapshotToken
} from '../src/renderer/src/features/editor/engines/innerta/highlightSnapshot'

/**
 * El store es lo que permite responder "¿por qué este token es naranja?" sin
 * tokenizar de nuevo: guarda la procedencia por archivo Y por fuente. Si el
 * orden de prioridad o el borrado por fuente se rompen, el panel de inspección
 * miente, que es peor que no tener panel.
 */
function token(startChar: number, slot: number, detail: string[]): SnapshotToken {
  return { line: 0, startChar, length: 1, slot, detail }
}

function record(
  source: 'textMate' | 'semanticTokens' | 'treeSitterDynamic',
  path = '/a.ts',
  tokens: SnapshotToken[] = [token(0, 3, ['comment'])]
): void {
  recordHighlightSnapshot({
    path,
    source,
    languageId: source === 'semanticTokens' ? null : 'demo',
    scopeName: source === 'textMate' ? 'source.demo' : null,
    extensionId: source === 'semanticTokens' ? null : 'demo.pack',
    tokens,
    at: Date.now()
  })
}

beforeEach(() => {
  clearHighlightSnapshot('/a.ts')
  clearHighlightSnapshot('/b.ts')
})

describe('store de procedencia del resaltado', () => {
  it('guarda una entrada por fuente y las ordena por prioridad', () => {
    record('textMate')
    record('semanticTokens')
    const snapshots = getHighlightSnapshots('/a.ts')
    // El LSP gana sobre la gramática: el primero de la lista es el que pisa.
    expect(snapshots.map((snapshot) => snapshot.source)).toEqual(['semanticTokens', 'textMate'])
  })

  it('la misma fuente se reemplaza, no se acumula', () => {
    record('textMate', '/a.ts', [token(0, 3, ['comment'])])
    record('textMate', '/a.ts', [token(0, 1, ['string']), token(4, 1, ['string'])])
    const snapshots = getHighlightSnapshots('/a.ts')
    expect(snapshots).toHaveLength(1)
    expect(snapshots[0].tokens).toHaveLength(2)
  })

  it('borra SÓLO la fuente que se pide (el LSP sigue pintando)', () => {
    record('textMate')
    record('semanticTokens')
    clearHighlightSnapshot('/a.ts', 'textMate')
    expect(getHighlightSnapshots('/a.ts').map((snapshot) => snapshot.source)).toEqual([
      'semanticTokens'
    ])
  })

  it('sin fuente borra todo el archivo y no toca los demás', () => {
    record('textMate')
    record('semanticTokens', '/b.ts')
    clearHighlightSnapshot('/a.ts')
    expect(getHighlightSnapshots('/a.ts')).toEqual([])
    expect(getHighlightSnapshots('/b.ts')).toHaveLength(1)
  })

  it('avisa a los suscriptores (el panel se actualiza solo)', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeToHighlightSnapshots(listener)
    record('textMate')
    clearHighlightSnapshot('/a.ts')
    unsubscribe()
    record('textMate')
    // Después del unsubscribe no llega nada más: el panel desmontado no trabaja.
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('sin archivo activo (o sin snapshots) devuelve vacío', () => {
    expect(getHighlightSnapshots(null)).toEqual([])
    expect(getHighlightSnapshots('/no-existe.ts')).toEqual([])
  })
})

describe('agrupado por scope stack', () => {
  it('agrupa por el STACK completo y ordena por cantidad', () => {
    const groups = groupSnapshotTokens([
      token(0, 3, ['comment']),
      token(5, 0, ['keyword']),
      token(9, 3, ['comment', 'meta.embedded']),
      token(12, 3, ['comment'])
    ])
    // `comment` (2) antes que `keyword` (1) y `comment meta.embedded` (1):
    // agrupar sólo por el último scope fusionaría los dos comment y el conteo
    // mentiría sobre por qué se pintan distinto.
    expect(groups.map((group) => [group.detail, group.count])).toEqual([
      ['comment', 2],
      ['comment meta.embedded', 1],
      ['keyword', 1]
    ])
    expect(groups[0].sample.startChar).toBe(0)
  })

  it('un token sin scope no desaparece', () => {
    const groups = groupSnapshotTokens([token(0, 5, [])])
    expect(groups[0].detail).toBe('(sin scope)')
  })

  it('los slots tienen nombre legible', () => {
    expect(slotLabel(3)).toBe('comment')
    expect(slotLabel(0)).toBe('keyword')
    expect(slotLabel(99)).toBe('slot 99')
  })
})
