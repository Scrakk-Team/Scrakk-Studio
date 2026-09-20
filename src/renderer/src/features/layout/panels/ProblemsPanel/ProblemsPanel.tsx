/**
 * Problemas — la lista de diagnósticos del IDE (panel del layout).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DE DÓNDE SALEN (dos canales, un solo store)
 *
 *   1. **Language servers**: `publishDiagnostics` → main → `lsp:on-diagnostics`.
 *   2. **Extensiones**: `vscode.languages.createDiagnosticCollection(...).set()`
 *      → host → `diagnostics/change`.
 *
 * El store (`@services/lsp/diagnosticsStore`) guarda cada fuente por separado
 * y aquí se lee AGREGADO: un error de un linter y uno de `tsc` sobre la misma
 * línea son dos problemas, no uno que pisa al otro. Cada fila muestra su
 * ORIGEN (`source` del diagnóstico, o el nombre del server/extensión) porque
 * "por qué me marca esto" es la primera pregunta del usuario.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUIÉN SUBRAYA EN EL EDITOR
 *
 * No este panel: el subrayado lo pinta el motor con el canal de decoraciones
 * (`services/lsp/decorations.ts` → `@services/decorations` → Innerta). El panel
 * LISTA, el editor MUESTRA; los dos leen el MISMO store, así que no pueden
 * discrepar.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { ProductIcon } from '@services/productIcons/components'
import { getEditorFiles, openFileInEditor } from '@features/editor'
import { revealInnertaPosition } from '@features/editor/engines/innerta/hostBridge'
import {
  getAllStoredDiagnostics,
  severityOf,
  subscribeToDiagnostics,
  type StoredFileDiagnostics
} from '@services/lsp'
import type { LspDiagnostic } from '@shared/lsp'
import styles from './ProblemsPanel.module.css'

/** Severidades del LSP, con su icono y su color (1 = error … 4 = hint). */
const SEVERITIES = [
  { id: 1, label: 'Errores', icon: 'close', color: 'var(--color-danger, #f14c4c)' },
  { id: 2, label: 'Advertencias', icon: 'alert', color: 'var(--color-warning, #cca700)' },
  { id: 3, label: 'Información', icon: 'info', color: 'var(--color-info, #3794ff)' },
  { id: 4, label: 'Sugerencias', icon: 'info', color: 'var(--color-text-muted)' }
] as const

function severityMeta(severity: number): (typeof SEVERITIES)[number] {
  return SEVERITIES.find((entry) => entry.id === severity) ?? SEVERITIES[3]
}

/** Último segmento de una ruta (el nombre del archivo). */
function baseName(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  return normalized.slice(normalized.lastIndexOf('/') + 1) || path
}

/** Carpeta que contiene la ruta ('' si está en la raíz). */
function dirName(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const index = normalized.lastIndexOf('/')
  return index > 0 ? normalized.slice(0, index) : ''
}

/**
 * Abre el archivo y lleva el cursor al problema.
 *
 * El engine del editor tarda en montar (se carga el wasm por archivo), así que
 * `revealInnertaPosition` falla en los primeros milisegundos: se reintenta
 * acotado en vez de perder el salto (que es justo para lo que el usuario
 * clickeó).
 */
function openProblemAt(path: string, line: number, column: number): void {
  const { activePath, openFiles } = getEditorFiles()
  if (activePath !== path || !openFiles.some((file) => file.path === path)) {
    openFileInEditor(path, baseName(path))
  }

  const deadline = Date.now() + 2000
  const attempt = (): void => {
    if (revealInnertaPosition(path, line, column)) return
    if (Date.now() >= deadline) return
    window.setTimeout(attempt, 60)
  }
  attempt()
}

export function ProblemsPanel(): JSX.Element {
  const [groups, setGroups] = useState<StoredFileDiagnostics[]>(() => getAllStoredDiagnostics())
  const [enabled, setEnabled] = useState<Set<number>>(() => new Set([1, 2, 3, 4]))
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  /** El foco del input no se pierde al refrescar (los diagnósticos llegan en vivo). */
  const queryRef = useRef(query)
  queryRef.current = query

  useEffect(() => {
    const refresh = (): void => setGroups(getAllStoredDiagnostics())
    refresh()
    return subscribeToDiagnostics(refresh)
  }, [])

  const toggleSeverity = useCallback((id: number): void => {
    setEnabled((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  /** Conteo por severidad sobre TODO lo conocido (para los filtros). */
  const counts = useMemo(() => {
    const out = new Map<number, number>()
    for (const group of groups) {
      for (const diagnostic of group.diagnostics) {
        const severity = severityOf(diagnostic)
        out.set(severity, (out.get(severity) ?? 0) + 1)
      }
    }
    return out
  }, [groups])

  /**
   * Filtro aplicado: severidades activas + texto (mensaje, origen o archivo).
   * Cada fila sale con SU origen: el diagnóstico puede no traer `source` (una
   * extensión que no lo setea) y ahí el origen útil es el nombre de la fuente
   * que lo publicó, que sí lo conocemos.
   */
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return groups
      .map((group) => {
        const rows: Array<{ diagnostic: LspDiagnostic; origin: string }> = []
        for (const source of group.sources) {
          for (const diagnostic of source.diagnostics) {
            const origin = diagnostic.source ?? source.name
            if (!enabled.has(severityOf(diagnostic))) continue
            if (
              needle.length > 0 &&
              !`${diagnostic.message} ${origin} ${diagnostic.code ?? ''} ${group.path}`
                .toLowerCase()
                .includes(needle)
            ) {
              continue
            }
            rows.push({ diagnostic, origin })
          }
        }
        return { path: group.path, rows }
      })
      .filter((group) => group.rows.length > 0)
  }, [groups, enabled, query])

  const totalVisible = filtered.reduce((total, group) => total + group.rows.length, 0)

  const toggleGroup = useCallback((path: string): void => {
    setCollapsed((previous) => {
      const next = new Set(previous)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  return (
    <div className={styles.problems}>
      <div className={styles.filters}>
        {SEVERITIES.map((severity) => {
          const count = counts.get(severity.id) ?? 0
          const active = enabled.has(severity.id)
          return (
            <button
              key={severity.id}
              type="button"
              className={[styles.filter, active ? styles.filterOn : null].filter(Boolean).join(' ')}
              aria-pressed={active}
              title={active ? `Ocultar ${severity.label.toLowerCase()}` : `Mostrar ${severity.label.toLowerCase()}`}
              onClick={() => toggleSeverity(severity.id)}
            >
              <span style={{ color: severity.color, display: 'inline-flex' }}>
                <ProductIcon id={severity.icon} size={12} />
              </span>
              <span className={styles.filterCount}>{count}</span>
            </button>
          )
        })}
        <input
          className={styles.query}
          value={query}
          placeholder="Filtrar problemas…"
          aria-label="Filtrar problemas"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <p className={styles.empty}>
          {groups.length === 0
            ? 'No hay problemas en el workspace.'
            : 'Ningún problema coincide con el filtro.'}
        </p>
      ) : (
        <div className={styles.list}>
          {filtered.map((group) => {
            const isCollapsed = collapsed.has(group.path)
            const active = getEditorFiles().activePath === group.path
            return (
              <div key={group.path} className={styles.group}>
                <button
                  type="button"
                  className={[styles.groupHeader, active ? styles.groupActive : null]
                    .filter(Boolean)
                    .join(' ')}
                  title={group.path}
                  onClick={() => toggleGroup(group.path)}
                >
                  <span className={styles.arrow}>
                    <ProductIcon id={isCollapsed ? 'chevron-right' : 'chevron-down'} size={12} />
                  </span>
                  <span className={styles.fileName}>{baseName(group.path)}</span>
                  <span className={styles.fileDir}>{dirName(group.path)}</span>
                  <span className={styles.groupCount}>{group.rows.length}</span>
                </button>

                {isCollapsed
                  ? null
                  : group.rows.map(({ diagnostic, origin }, index) => {
                      const meta = severityMeta(severityOf(diagnostic))
                      return (
                        <button
                          key={`${group.path}:${index}:${diagnostic.range.start.line}:${diagnostic.range.start.character}`}
                          type="button"
                          className={styles.row}
                          title={`${diagnostic.message}${origin ? `\nOrigen: ${origin}` : ''}`}
                          onClick={() =>
                            openProblemAt(
                              group.path,
                              diagnostic.range.start.line,
                              diagnostic.range.start.character
                            )
                          }
                        >
                          <span className={styles.rowIcon} style={{ color: meta.color }}>
                            <ProductIcon id={meta.icon} size={12} />
                          </span>
                          <span className={styles.message}>{diagnostic.message}</span>
                          <span className={styles.origin}>{origin}</span>
                          {diagnostic.code !== undefined ? (
                            <span className={styles.code}>{String(diagnostic.code)}</span>
                          ) : null}
                          <span className={styles.position}>
                            {diagnostic.range.start.line + 1}:{diagnostic.range.start.character + 1}
                          </span>
                        </button>
                      )
                    })}
              </div>
            )
          })}
        </div>
      )}

      <div className={styles.footer}>
        {totalVisible} problema{totalVisible === 1 ? '' : 's'} · los aportan los language servers y las
        extensiones; los subrayados se pintan en el editor
      </div>
    </div>
  )
}
