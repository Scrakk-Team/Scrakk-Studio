// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Diagnósticos → subrayado del editor.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUÉ SE PRUEBA Y POR QUÉ
 *
 * El paso que convierte un problema en un trazo tiene tres trampas, y las tres
 * se ven recién cuando el usuario mira el editor:
 *
 *   1. la SEVERIDAD decide color y estilo (error ≠ hint; un hint punteado),
 *   2. cada fuente de diagnósticos tiene que ser su propia fuente de
 *      decoraciones (apagar el linter no puede borrar los de `tsc`), y
 *   3. cuando el problema desaparece, el subrayado se va — si no, el usuario ve
 *      un error que ya no existe y no tiene cómo sacarlo.
 */

import { describe, expect, it, vi } from 'vitest'
import type { LspDiagnostic } from '../src/shared/lsp'

/** Canal del LSP simulado (el store se suscribe una sola vez por módulo). */
type LspPayload = { serverName: string; path: string; diagnostics: LspDiagnostic[] }

vi.stubGlobal('window', {
  api: { lsp: { onDiagnostics: () => () => undefined } },
  addEventListener: () => undefined,
  removeEventListener: () => undefined
})
vi.stubGlobal(
  'MutationObserver',
  class {
    observe(): void {}
    disconnect(): void {}
  }
)
// El canal se suscribe al cambio de tema de verdad (`listenThemeChanges`): en
// el renderer eso es `document.documentElement`. Sin DOM no hay tema, y los
// colores caen a los fallbacks (que es lo que afirman los expectations).
vi.stubGlobal('document', { documentElement: {} })

import {
  applySourceDiagnostics,
  getStoredDiagnostics
} from '../src/renderer/src/services/lsp/diagnosticsStore'
import {
  _resetDiagnosticsDecorationsForTests,
  diagnosticsAt,
  diagnosticsToDecorations,
  diagnosticHoverText,
  initDiagnosticsDecorations,
  refreshDiagnosticsDecorations
} from '../src/renderer/src/services/lsp/decorations'
import {
  _resetDecorationsStoreForTests,
  getDecorations,
  getDecorationSources,
  packDecorations
} from '../src/renderer/src/services/decorations'

/** Colores del tema sin DOM: el store cae a los fallbacks documentados. */
const DANGER = 0xf14c4cff
const WARNING = 0xcca700ff
const MUTED = 0x7a7a7aff

function diag(
  line: number,
  message: string,
  severity?: number,
  extra?: Partial<LspDiagnostic>
): LspDiagnostic {
  return {
    range: { start: { line, character: 0 }, end: { line, character: 4 } },
    ...(severity === undefined ? {} : { severity }),
    message,
    ...extra
  }
}

function seed(path: string, diagnostics: LspDiagnostic[], name = 'tsserver'): void {
  applySourceDiagnostics({ kind: 'lsp', name, path, diagnostics })
}

describe('diagnósticos → decoraciones', () => {
  it('la severidad decide estilo y color', () => {
    const decorations = diagnosticsToDecorations(
      [diag(0, 'error', 1), diag(1, 'warning', 2), diag(2, 'hint', 4)],
      'tsserver'
    )
    expect(decorations.map((entry) => entry.style)).toEqual(['wavy', 'wavy', 'dotted'])
    expect(decorations.map((entry) => entry.color)).toEqual([DANGER, WARNING, MUTED])
  })

  it('sin severidad se asume ERROR (no un hint invisible)', () => {
    const [decoration] = diagnosticsToDecorations([diag(0, 'sin severidad')], 'tsserver')
    expect(decoration.color).toBe(DANGER)
    expect(decoration.style).toBe('wavy')
  })

  it('el mensaje del hover lleva el origen y el código', () => {
    expect(diagnosticHoverText(diag(0, 'no usado', 2, { source: 'eslint', code: 'no-unused' }))).toBe(
      '**Advertencia:** no usado\n\n_eslint(no-unused)_'
    )
    expect(diagnosticHoverText(diag(0, 'roto', 1))).toBe('**Error:** roto')
  })
})

describe('el canal vivo (store de diagnósticos → subrayados)', () => {
  it('un problema publicado se vuelve subrayado, y al irse desaparece', () => {
    _resetDecorationsStoreForTests()
    _resetDiagnosticsDecorationsForTests()
    initDiagnosticsDecorations()

    const path = '/w/canal.ts'
    seed(path, [diag(2, 'error del server', 1)])

    const decorations = getDecorations(path)
    expect(decorations).toHaveLength(1)
    expect(decorations[0]).toMatchObject({ startLine: 2, endLine: 2, endCol: 4, style: 'wavy' })
    expect(getDecorationSources(path)).toEqual(['diagnostics:lsp:tsserver'])

    // El server deja de reportarlo: el subrayado se va con el problema.
    seed(path, [])
    expect(getDecorations(path)).toHaveLength(0)
  })

  it('un diagnóstico de ancho CERO igual se subraya (caso real del server de CSS)', () => {
    _resetDecorationsStoreForTests()
    _resetDiagnosticsDecorationsForTests()
    initDiagnosticsDecorations()

    const path = '/w/llave.css'
    // `} expected` del server de CSS: misma línea y misma columna (rango vacío).
    // Antes se descartaba y el archivo quedaba sin ninguna marca.
    seed(path, [
      {
        range: { start: { line: 3, character: 0 }, end: { line: 3, character: 0 } },
        severity: 1,
        message: '} expected',
        code: 'css-rcurlyexpected'
      }
    ])

    const [decoration] = getDecorations(path)
    expect(decoration).toMatchObject({ startLine: 3, startCol: 0, endLine: 3, endCol: 0 })
    expect(decoration.style).toBe('wavy')
    // El motor recibe un carácter de ancho (0 = no dibuja nada).
    expect(packDecorations([decoration])[3]).toBe(1)
    // Y el hover cubre ese mismo carácter.
    expect(diagnosticsAt(path, 3, 0).map((entry) => entry.message)).toEqual(['} expected'])
  })

  it('dos fuentes sobre el mismo archivo no se pisan', () => {
    _resetDecorationsStoreForTests()
    _resetDiagnosticsDecorationsForTests()
    initDiagnosticsDecorations()

    const path = '/w/dos-fuentes.ts'
    seed(path, [diag(1, 'error del server', 1)])
    applySourceDiagnostics({
      kind: 'extension',
      name: 'pub.linter',
      path,
      diagnostics: [diag(5, 'aviso del linter', 2)]
    })
    expect(getDecorationSources(path)).toEqual([
      'diagnostics:extension:pub.linter',
      'diagnostics:lsp:tsserver'
    ])
    expect(getDecorations(path)).toHaveLength(2)

    // La extensión limpia: el error de `tsc` sigue subrayado.
    applySourceDiagnostics({ kind: 'extension', name: 'pub.linter', path, diagnostics: [] })
    expect(getDecorationSources(path)).toEqual(['diagnostics:lsp:tsserver'])
    expect(getDecorations(path)).toHaveLength(1)
  })

  it('el subrayado sobrevive a una re-publicación idéntica (sin parpadeo)', () => {
    _resetDecorationsStoreForTests()
    _resetDiagnosticsDecorationsForTests()
    initDiagnosticsDecorations()

    const path = '/w/repeticion.ts'
    seed(path, [diag(0, 'error', 1)])
    const before = getDecorations(path)
    seed(path, [diag(0, 'error', 1)])
    refreshDiagnosticsDecorations()
    expect(getDecorations(path)).toEqual(before)
  })

  it('el hover sobre el subrayado sabe qué problema está debajo', () => {
    _resetDecorationsStoreForTests()
    _resetDiagnosticsDecorationsForTests()
    initDiagnosticsDecorations()

    const path = '/w/puntero.ts'
    seed(path, [diag(4, 'aquí está el error', 1)])
    expect(diagnosticsAt(path, 4, 2).map((entry) => entry.message)).toEqual([
      'aquí está el error'
    ])
    expect(diagnosticsAt(path, 4, 99)).toHaveLength(0)
    expect(diagnosticsAt('/w/otro.ts', 4, 0)).toHaveLength(0)
    // El store sigue siendo el dueño del dato (esto no lo duplica).
    expect(getStoredDiagnostics(path)?.diagnostics).toHaveLength(1)
  })
})
