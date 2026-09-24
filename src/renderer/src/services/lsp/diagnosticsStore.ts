// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Diagnósticos en vivo (renderer) — la fuente del panel de Problemas.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ MULTI-FUENTE
 *
 * Los problemas de un archivo pueden venir de DOS lugares distintos:
 *
 *   1. un language server (`publishDiagnostics` → `lsp:on-diagnostics`), y
 *   2. una EXTENSIÓN que publica en su colección (`vscode.Diagnostic` → host →
 *      `diagnostics/change`).
 *
 * Guardar una sola lista por ruta era un bug silencioso: el último que
 * escribía pisaba al otro (el server publicaba y borraba los del linter, y
 * viceversa). Aquí cada fuente tiene su propia entrada y la lectura AGRUPA.
 *
 * Suscribible: el panel de Problemas lee `getProblems`/`getAllProblems` sin
 * re-consultar al main. Réplica del modelo del CLI (uri → Vec<Diagnostic>
 * multi-server), ahora también con extensiones.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * MIGRACIÓN A OWEAR (leer antes de tocar)
 *
 * Nada de esto conoce Electron: consume el evento IPC del LSP y el del
 * Extension Host, que son dos streams de datos planos. Si Owear cambia el
 * transporte, cambian `onLspDiagnostics` y el puente del host; este store no.
 */

import type { LspDiagnostic } from '@shared/lsp'
import { onLspDiagnostics } from './api'

/** De dónde salió un problema (se muestra en la lista como origen). */
export type DiagnosticsSourceKind = 'lsp' | 'extension'

/** Problemas de UNA fuente para UN archivo. */
export interface DiagnosticsSourceEntry {
  kind: DiagnosticsSourceKind
  /** Language server (kind `lsp`) o id de la extensión (`pub.name`). */
  name: string
  diagnostics: LspDiagnostic[]
  updatedAt: number
}

/** Foto agregada de un archivo (lo que consumen el editor y los paneles). */
export interface StoredFileDiagnostics {
  path: string
  /** Todos los problemas del archivo, de todas las fuentes, más graves primero. */
  diagnostics: LspDiagnostic[]
  /** Desglose por fuente (para mostrar el origen y saber qué limpiar). */
  sources: DiagnosticsSourceEntry[]
  updatedAt: number
}

/** Ruta → clave de fuente → problemas. La clave distingue server de extensión. */
const byPath = new Map<string, Map<string, DiagnosticsSourceEntry>>()
const listeners = new Set<() => void>()
let subscribed = false

/** Severidad efectiva (el LSP la manda 1..4; sin severidad = error, como VS Code). */
export function severityOf(diagnostic: LspDiagnostic): number {
  return typeof diagnostic.severity === 'number' ? diagnostic.severity : 1
}

/** Orden: error → warning → info → hint. Estable dentro de cada severidad. */
function compareDiagnostics(a: LspDiagnostic, b: LspDiagnostic): number {
  const bySeverity = severityOf(a) - severityOf(b)
  if (bySeverity !== 0) return bySeverity
  const byLine = a.range.start.line - b.range.start.line
  if (byLine !== 0) return byLine
  return a.range.start.character - b.range.start.character
}

function emit(): void {
  for (const listener of [...listeners]) {
    try {
      listener()
    } catch {
      // un suscriptor roto no tumba a los demás
    }
  }
}

/** Se suscribe una sola vez al stream IPC del LSP. */
function ensureSubscribed(): void {
  if (subscribed) return
  subscribed = true
  onLspDiagnostics((payload) => {
    applySourceDiagnostics({
      kind: 'lsp',
      name: payload.serverName,
      path: payload.path,
      diagnostics: payload.diagnostics
    })
  })
}

function sourceKey(kind: DiagnosticsSourceKind, name: string): string {
  return `${kind}:${name}`
}

/**
 * Velocidad de cambio. Dos listas iguales NO emiten: la barra de estado y el
 * panel se re-renderizarían en cada `publishDiagnostics` idéntico (los servers
 * los repiten en cada keystroke).
 */
function sameDiagnostics(a: readonly LspDiagnostic[], b: readonly LspDiagnostic[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let index = 0; index < a.length; index += 1) {
    const left = a[index]
    const right = b[index]
    if (
      left.message !== right.message ||
      left.source !== right.source ||
      left.code !== right.code ||
      severityOf(left) !== severityOf(right) ||
      left.range.start.line !== right.range.start.line ||
      left.range.start.character !== right.range.start.character ||
      left.range.end.line !== right.range.end.line ||
      left.range.end.character !== right.range.end.character
    ) {
      return false
    }
  }
  return true
}

/**
 * Reemplaza los problemas de UNA fuente para UNA ruta.
 *
 * Una lista vacía BORRA esa fuente (es lo que mandan los dos canales cuando el
 * problema desaparece) y, si el archivo se queda sin ninguna fuente, la ruta
 * sale del mapa: un archivo sin problemas no tiene que ocupar lugar en la UI.
 */
export function applySourceDiagnostics(input: {
  kind: DiagnosticsSourceKind
  name: string
  path: string
  diagnostics: readonly LspDiagnostic[]
}): void {
  ensureSubscribed()
  const { kind, name, path, diagnostics } = input
  if (!path) return
  const key = sourceKey(kind, name)
  const existing = byPath.get(path)
  const previous = existing?.get(key)

  if (diagnostics.length === 0) {
    if (!existing?.delete(key)) return
    if (existing.size === 0) byPath.delete(path)
    emit()
    return
  }

  if (previous && sameDiagnostics(previous.diagnostics, diagnostics)) return

  const bucket = existing ?? new Map<string, DiagnosticsSourceEntry>()
  bucket.set(key, {
    kind,
    name,
    diagnostics: [...diagnostics],
    updatedAt: Date.now()
  })
  byPath.set(path, bucket)
  emit()
}

/**
 * Diagnósticos que empujó una EXTENSIÓN (evento `diagnostics/change` del host).
 * Cada entrada trae su archivo; una lista vacía limpia lo que había.
 */
export function applyExtensionDiagnostics(
  extensionId: string,
  entries: ReadonlyArray<{ path: string; diagnostics: readonly LspDiagnostic[] }>
): void {
  for (const entry of entries) {
    if (!entry?.path) continue
    applySourceDiagnostics({
      kind: 'extension',
      name: extensionId,
      path: entry.path,
      diagnostics: entry.diagnostics ?? []
    })
  }
}

/**
 * La extensión se apagó (o su host murió): sus problemas se van con ella.
 * Sin esto quedaban fantasmas en la lista de una extensión que ya no corre.
 */
export function dropExtensionDiagnostics(extensionId: string): void {
  ensureSubscribed()
  const key = sourceKey('extension', extensionId)
  let changed = false
  for (const [path, bucket] of [...byPath.entries()]) {
    if (!bucket.delete(key)) continue
    changed = true
    if (bucket.size === 0) byPath.delete(path)
  }
  if (changed) emit()
}

/** Arma la foto agregada de un archivo desde sus fuentes. */
function aggregate(path: string, bucket: Map<string, DiagnosticsSourceEntry>): StoredFileDiagnostics {
  const sources = [...bucket.values()].filter((source) => source.diagnostics.length > 0)
  const diagnostics: LspDiagnostic[] = []
  for (const source of sources) diagnostics.push(...source.diagnostics)
  diagnostics.sort(compareDiagnostics)
  return {
    path,
    diagnostics,
    sources: sources.sort((a, b) => a.name.localeCompare(b.name)),
    updatedAt: Math.max(0, ...sources.map((source) => source.updatedAt))
  }
}

/** Diagnósticos cacheados de una ruta (agregados, multi-fuente). */
export function getStoredDiagnostics(path: string): StoredFileDiagnostics | null {
  ensureSubscribed()
  const bucket = byPath.get(path)
  if (!bucket || bucket.size === 0) return null
  const entry = aggregate(path, bucket)
  return entry.diagnostics.length > 0 ? entry : null
}

/** Snapshot completo (rutas con diagnósticos conocidos). */
export function getAllStoredDiagnostics(): StoredFileDiagnostics[] {
  ensureSubscribed()
  const out: StoredFileDiagnostics[] = []
  for (const [path, bucket] of byPath.entries()) {
    const entry = aggregate(path, bucket)
    if (entry.diagnostics.length > 0) out.push(entry)
  }
  return out
}

/** Solo ERROR/WARNING de una ruta. */
export function getProblems(path: string): LspDiagnostic[] {
  const entry = getStoredDiagnostics(path)
  if (!entry) return []
  return entry.diagnostics.filter((d) => severityOf(d) <= 2)
}

/** Conteo por severidad (lo que muestra el chip de la barra de estado). */
export interface ProblemCounts {
  errors: number
  warnings: number
  infos: number
  total: number
}

export function countProblems(): ProblemCounts {
  const counts: ProblemCounts = { errors: 0, warnings: 0, infos: 0, total: 0 }
  for (const entry of getAllStoredDiagnostics()) {
    for (const diagnostic of entry.diagnostics) {
      const severity = severityOf(diagnostic)
      counts.total += 1
      if (severity === 1) counts.errors += 1
      else if (severity === 2) counts.warnings += 1
      else counts.infos += 1
    }
  }
  return counts
}

export function clearStoredDiagnostics(path?: string): void {
  if (path) byPath.delete(path)
  else byPath.clear()
  emit()
}

export function subscribeToDiagnostics(listener: () => void): () => void {
  ensureSubscribed()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
