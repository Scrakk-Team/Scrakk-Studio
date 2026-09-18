/**
 * Diagnósticos → subrayado del editor.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUÉ HACE
 *
 * El LSP y las extensiones publican problemas (línea/columna). El panel de
 * Problemas los LISTA; esto los PINTA dentro del texto, en el mismo archivo
 * donde están: el usuario ve la línea mal antes de leer ninguna lista.
 *
 * Es un ADAPTADOR, no un store: la verdad sigue siendo
 * `diagnosticsStore` (multi-fuente, reactivo) y las decoraciones van al store
 * genérico de `@services/decorations`. Una fuente de diagnósticos = una fuente
 * de decoraciones (`diagnostics:lsp:<server>` / `diagnostics:extension:<id>`),
 * así que apagar una extensión o un server apaga TAMBIÉN su subrayado (y no el
 * de los demás).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * EL COLOR SALE DEL TEMA
 *
 * Nada de colores hardcodeados: se leen las vars del tema activo
 * (`--color-danger`, …) en el momento de pintar y se re-aplican cuando el tema
 * cambia. Un tema que redefine su rojo de error tiene que verse en el editor,
 * igual que en el panel.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * MIGRACIÓN A OWEAR (leer antes de tocar)
 *
 * Depende de dos cosas planas: el store de diagnósticos (eventos del LSP y del
 * Extension Host) y el store de decoraciones. Si Owear cambia el motor de
 * render, se reescribe el empuje al motor; esto no.
 */

import type { LspDiagnostic } from '@shared/lsp'
import {
  clearDecorations,
  setDecorations,
  themeColor,
  type DecorationStyle,
  type EditorDecoration
} from '@services/decorations'
import { listenThemeChanges } from '@features/editor/engines/innerta/innertaTheme'
import { getAllStoredDiagnostics, subscribeToDiagnostics } from './diagnosticsStore'

/** Prefijo de las fuentes que maneja ESTE adaptador. */
export const DIAGNOSTICS_SOURCE_PREFIX = 'diagnostics:'

/**
 * Severidad del LSP (1..4) → estilo + var de color del tema.
 *
 * `hint` va PUNTEADO y no ondulado: en VS Code los hints se distinguen de los
 * avisos por el trazo, y con cuatro colores parecidos el trazo es lo único que
 * el usuario distingue de un vistazo.
 */
const SEVERITY_META: Record<number, { style: DecorationStyle; cssVar: string; fallback: string }> = {
  1: { style: 'wavy', cssVar: '--color-danger', fallback: '#f14c4c' },
  2: { style: 'wavy', cssVar: '--color-warning', fallback: '#cca700' },
  3: { style: 'wavy', cssVar: '--color-info', fallback: '#3794ff' },
  4: { style: 'dotted', cssVar: '--color-text-muted', fallback: '#7a7a7a' }
}

/** Texto del hover: mensaje + origen/código, como el panel de Problemas. */
function diagnosticMessage(diagnostic: LspDiagnostic, sourceName: string): string {
  const parts: string[] = [diagnostic.message]
  const origin = diagnostic.source ?? sourceName
  const code = diagnostic.code !== undefined ? String(diagnostic.code) : ''
  if (origin && code) parts.push(`${origin}(${code})`)
  else if (origin) parts.push(origin)
  return parts.join(' — ')
}

/** Etiqueta legible de la severidad (el texto que se lee al apuntar). */
const SEVERITY_LABEL: Record<number, string> = {
  1: 'Error',
  2: 'Advertencia',
  3: 'Información',
  4: 'Sugerencia'
}

/**
 * Diagnóstico → bloque de markdown del hover.
 *
 * Va en `**negrita**` la severidad y en itálica el origen: el mensaje del
 * problema es lo que el usuario quiere leer, el resto es contexto.
 */
export function diagnosticHoverText(diagnostic: LspDiagnostic): string {
  const severity = typeof diagnostic.severity === 'number' ? diagnostic.severity : 1
  const label = SEVERITY_LABEL[severity] ?? 'Problema'
  const origin = diagnostic.source ?? ''
  const code = diagnostic.code !== undefined ? `(${String(diagnostic.code)})` : ''
  const footer = `${origin}${code}`.trim()
  return footer.length > 0
    ? `**${label}:** ${diagnostic.message}\n\n_${footer}_`
    : `**${label}:** ${diagnostic.message}`
}

/** Diagnósticos → decoraciones (una por problema, con su color y su mensaje). */
export function diagnosticsToDecorations(
  diagnostics: readonly LspDiagnostic[],
  sourceName = ''
): EditorDecoration[] {
  return diagnostics.map((diagnostic) => {
    const severity = typeof diagnostic.severity === 'number' ? diagnostic.severity : 1
    const meta = SEVERITY_META[severity] ?? SEVERITY_META[4]
    return {
      startLine: diagnostic.range.start.line,
      startCol: diagnostic.range.start.character,
      endLine: diagnostic.range.end.line,
      endCol: diagnostic.range.end.character,
      color: themeColor(meta.cssVar, meta.fallback),
      style: meta.style,
      message: diagnosticMessage(diagnostic, sourceName)
    }
  })
}

/** Lo que este adaptador empujó la última vez (fuente → archivos). */
let pushed = new Map<string, Set<string>>()
let started = false

/** Estado deseado: una fuente por (tipo, nombre) de diagnóstico, por archivo. */
function buildDesired(): Map<string, Map<string, EditorDecoration[]>> {
  const desired = new Map<string, Map<string, EditorDecoration[]>>()
  for (const entry of getAllStoredDiagnostics()) {
    for (const source of entry.sources) {
      const list = diagnosticsToDecorations(source.diagnostics, source.name)
      if (list.length === 0) continue
      const sourceId = `${DIAGNOSTICS_SOURCE_PREFIX}${source.kind}:${source.name}`
      const bucket = desired.get(sourceId) ?? new Map<string, EditorDecoration[]>()
      bucket.set(entry.path, list)
      desired.set(sourceId, bucket)
    }
  }
  return desired
}

/**
 * Reconcilia el store de decoraciones con el de diagnósticos.
 *
 * Es un diff y no un "borrar todo y volver a poner": el borrado total haría
 * parpadear el subrayado de TODOS los archivos abiertos en cada keystroke
 * (cada `publishDiagnostics` pasa por acá).
 */
export function refreshDiagnosticsDecorations(): void {
  const desired = buildDesired()
  const previous = pushed
  for (const [sourceId, bucket] of desired) {
    for (const [path, list] of bucket) setDecorations(sourceId, path, list)
  }
  for (const [sourceId, paths] of previous) {
    const bucket = desired.get(sourceId)
    for (const path of paths) {
      if (!bucket?.has(path)) clearDecorations(sourceId, path)
    }
  }
  pushed = new Map([...desired].map(([sourceId, bucket]) => [sourceId, new Set(bucket.keys())]))
}

/**
 * Arranca el canal: un change del store de diagnósticos (o del tema) re-aplica.
 *
 * Idempotente y perezoso: se llama desde el arranque del renderer y no hace
 * nada hasta que exista un diagnóstico. Los N engines vivos se actualizan solos
 * porque escuchan al store de decoraciones, no a este adaptador.
 */
export function initDiagnosticsDecorations(): void {
  if (started) return
  started = true
  subscribeToDiagnostics(() => refreshDiagnosticsDecorations())
  listenThemeChanges(() => refreshDiagnosticsDecorations())
  refreshDiagnosticsDecorations()
}

/** Solo tests: resetea el estado de "qué empujé". */
export function _resetDiagnosticsDecorationsForTests(): void {
  pushed = new Map()
  started = false
}

/**
 * Diagnósticos que CONTIENEN una posición (0-based), de todas las fuentes.
 *
 * Lo usa el hover: en VS Code, pasar el puntero por encima del subrayado
 * muestra el mensaje del problema. Sin esto el usuario ve la ondulación y
 * todavía tiene que ir al panel a averiguar qué dice.
 *
 * Un rango VACÍO (lo que manda el server de CSS para `} expected`) cuenta como
 * el carácter que se dibuja: el subrayado se ensancha a 1 columna al empacar, y
 * el hover tiene que cubrir ese mismo tramo.
 */
export function diagnosticsAt(path: string, line: number, col: number): LspDiagnostic[] {
  const entry = getAllStoredDiagnostics().find((candidate) => candidate.path === path)
  if (!entry) return []
  return entry.diagnostics.filter((diagnostic) => {
    const { start, end } = diagnostic.range
    if (line < start.line || line > end.line) return false
    if (line === start.line && col < start.character) return false
    const endCol =
      end.line === start.line && end.character <= start.character
        ? start.character + 1
        : end.character
    if (line === end.line && col > endCol) return false
    return true
  })
}
