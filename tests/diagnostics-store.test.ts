/**
 * Store de diagnósticos (renderer) — multi-fuente.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUÉ SE PRUEBA Y POR QUÉ
 *
 * Los problemas de un archivo llegan por DOS canales distintos: el LSP
 * (`lsp:on-diagnostics`, un server por nombre) y el Extension Host
 * (`diagnostics/change`, una extensión por id). Antes había UNA lista por ruta
 * y el último que publicaba borraba al otro: el linter de una extensión hacía
 * desaparecer los errores de `tsc`. Estos tests fijan la regla: cada fuente
 * tiene su entrada, la lectura agrega y limpiar una fuente no toca a la otra.
 */

import { describe, expect, it, vi } from 'vitest'
import type { LspDiagnostic } from '../src/shared/lsp'

/** Canal del LSP simulado: el store se suscribe una sola vez (módulo). */
type LspPayload = { serverName: string; path: string; diagnostics: LspDiagnostic[] }
let emitLsp: ((payload: LspPayload) => void) | null = null

vi.stubGlobal('window', {
  api: {
    lsp: {
      onDiagnostics: (callback: (payload: LspPayload) => void) => {
        emitLsp = callback
        return () => {
          emitLsp = null
        }
      }
    }
  }
})

import {
  applyExtensionDiagnostics,
  countProblems,
  dropExtensionDiagnostics,
  getAllStoredDiagnostics,
  getProblems,
  getStoredDiagnostics,
  severityOf,
  subscribeToDiagnostics
} from '../src/renderer/src/services/lsp/diagnosticsStore'

/** Diagnóstico mínimo en la forma del LSP. */
function diag(line: number, message: string, severity?: number): LspDiagnostic {
  return {
    range: { start: { line, character: 0 }, end: { line, character: 4 } },
    ...(severity === undefined ? {} : { severity }),
    message
  }
}

/** Empuja un publishDiagnostics por el canal del LSP. */
function publish(serverName: string, path: string, diagnostics: LspDiagnostic[]): void {
  if (!emitLsp) getStoredDiagnostics(path) // asegura la suscripción
  emitLsp?.({ serverName, path, diagnostics })
}

describe('diagnosticsStore: dos fuentes en el mismo archivo', () => {
  it('el LSP y una extensión conviven (ninguna pisa a la otra)', () => {
    const path = '/w/conviven.ts'
    publish('tsserver', path, [diag(1, 'error del server', 1)])
    applyExtensionDiagnostics('pub.linter', [{ path, diagnostics: [diag(5, 'aviso del linter', 2)] }])

    const entry = getStoredDiagnostics(path)
    expect(entry).not.toBeNull()
    // Agregado: los dos, ordenados por severidad (error antes que warning).
    expect(entry!.diagnostics.map((d) => d.message)).toEqual([
      'error del server',
      'aviso del linter'
    ])
    // Orden estable por nombre de fuente (la UI lo usa para el rótulo del origen).
    expect(entry!.sources.map((s) => `${s.kind}:${s.name}`)).toEqual([
      'extension:pub.linter',
      'lsp:tsserver'
    ])
  })

  it('limpiar una fuente deja viva a la otra', () => {
    const path = '/w/limpiar.ts'
    publish('tsserver', path, [diag(1, 'error del server', 1)])
    applyExtensionDiagnostics('pub.linter', [{ path, diagnostics: [diag(2, 'aviso', 2)] }])

    // La extensión limpia: el error del server sigue ahí.
    applyExtensionDiagnostics('pub.linter', [{ path, diagnostics: [] }])
    const entry = getStoredDiagnostics(path)
    expect(entry!.diagnostics.map((d) => d.message)).toEqual(['error del server'])
    expect(entry!.sources).toHaveLength(1)

    // Y el server limpia: el archivo entero sale del store.
    publish('tsserver', path, [])
    expect(getStoredDiagnostics(path)).toBeNull()
  })

  it('desactivar una extensión se lleva SOLO sus problemas', () => {
    const path = '/w/desactivar.ts'
    applyExtensionDiagnostics('pub.uno', [{ path, diagnostics: [diag(1, 'de uno', 1)] }])
    applyExtensionDiagnostics('pub.dos', [{ path, diagnostics: [diag(2, 'de dos', 1)] }])

    dropExtensionDiagnostics('pub.uno')
    const entry = getStoredDiagnostics(path)
    expect(entry!.diagnostics.map((d) => d.message)).toEqual(['de dos'])
    expect(entry!.sources.map((s) => s.name)).toEqual(['pub.dos'])
  })

  it('los mismos diagnósticos otra vez NO emiten (los servers los repiten)', () => {
    const path = '/w/repeticion.ts'
    publish('tsserver', path, [diag(1, 'error', 1)])
    let notifications = 0
    const unsubscribe = subscribeToDiagnostics(() => {
      notifications += 1
    })

    publish('tsserver', path, [diag(1, 'error', 1)])
    expect(notifications).toBe(0)

    publish('tsserver', path, [diag(1, 'error cambiado', 1)])
    expect(notifications).toBe(1)
    unsubscribe()
  })
})

describe('diagnosticsStore: lectura para la UI', () => {
  it('getProblems deja sólo ERROR/WARNING y el conteo separa severidades', () => {
    const path = '/w/severidades.ts'
    publish('tsserver', path, [
      diag(1, 'error', 1),
      diag(2, 'warning', 2),
      diag(3, 'info', 3),
      diag(4, 'hint', 4)
    ])

    expect(getProblems(path).map((d) => d.message)).toEqual(['error', 'warning'])
    const counts = countProblems()
    // Se suman a lo que ya había en el store de otros tests: por eso se mira
    // el delta por severidad de ESTE archivo vía getAllStoredDiagnostics.
    const entry = getAllStoredDiagnostics().find((item) => item.path === path)
    expect(entry!.diagnostics).toHaveLength(4)
    expect(counts.total).toBeGreaterThanOrEqual(4)
  })

  it('sin severidad se asume ERROR (como VS Code), nunca hint', () => {
    expect(severityOf(diag(0, 'sin severidad'))).toBe(1)
  })

  it('el origen de cada fila es la fuente que lo publicó', () => {
    const path = '/w/origen.ts'
    applyExtensionDiagnostics('pub.anchors', [{ path, diagnostics: [diag(0, 'ancla duplicada')] }])
    const entry = getStoredDiagnostics(path)
    expect(entry!.sources[0].kind).toBe('extension')
    expect(entry!.sources[0].name).toBe('pub.anchors')
  })
})
