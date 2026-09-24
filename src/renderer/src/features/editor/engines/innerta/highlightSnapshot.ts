// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Snapshot del resaltado de un archivo — de dónde salió cada token.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ EXISTE
 *
 * El motor recibe tokens con un SLOT (un número del 0 al 14). Eso alcanza para
 * pintar y no alcanza para nada más: cuando el color está mal, el slot no dice
 * si el culpable es la gramática de la extensión, el tema, o la tabla por
 * defecto. Este store guarda, por archivo Y por fuente, el último resaltado CON
 * su procedencia: scope stack de cada token (TextMate), tipo de la leyenda
 * (LSP), y desde qué paquete salió.
 *
 * Es el dato que come el panel "Inspeccionar tokens" y lo que hace depurable
 * todo el camino de las extensiones de lenguaje.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ POR FUENTE Y NO POR ARCHIVO
 *
 * El LSP y la gramática de una extensión publican para el MISMO archivo y en
 * momentos distintos. Con una sola entrada por archivo, la última en llegar
 * borraba el rastro de la otra y el panel mostraba un archivo a medias según el
 * orden de los debounce. Aquí cada fuente tiene su entrada y el panel las lista
 * en orden de PRIORIDAD — la misma con la que `mergeHostTokens` decide qué token
 * gana, así que lo que se ve arriba del panel es literalmente lo que se pinta.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUÉ NO ES
 *
 * No es una copia del estado del editor ni un canal de pintado: es
 * diagnóstico. Nada del renderizado lo lee, así que un snapshot viejo no puede
 * pintar mal un archivo (a lo sumo el panel muestra datos de hace un segundo, y
 * para eso está `at`).
 */

import { SLOT_NAMES, SOURCE_PRIORITY, type SyntaxSource } from '@shared/syntax'

/** Fuentes que se inspeccionan (las que llevan procedencia por token). */
export type InspectableSource = Extract<
  SyntaxSource,
  'textMate' | 'semanticTokens' | 'treeSitterDynamic'
>

/** Un token del resaltado, con el porqué de su slot. */
export interface SnapshotToken {
  line: number
  startChar: number
  length: number
  /** Slot del tema al que resolvió. */
  slot: number
  /**
   * El porqué: el stack de scopes (`comment.line.gleam`…) en TextMate /
   * tree-sitter, o el tipo de la leyenda (`keyword`) en el LSP.
   */
  detail: string[]
}

/** Último resaltado conocido de un archivo, publicado por UNA fuente. */
export interface HighlightSnapshot {
  path: string
  source: InspectableSource
  /** Lenguaje del registro, si la fuente lo sabe (`null` en el LSP). */
  languageId: string | null
  /** Scope raíz de la gramática aplicada (`null` en el LSP). */
  scopeName: string | null
  /** Extensiones/pack del que salió la gramática (`null` en el LSP). */
  extensionId: string | null
  tokens: SnapshotToken[]
  /** Cuándo se calculó (epoch ms). */
  at: number
}

/** Un grupo de tokens que comparten scope stack → slot → cuántos. */
export interface SnapshotGroup {
  /** Scope stack (`comment.line.gleam`) o tipo de leyenda (`keyword`). */
  detail: string
  slot: number
  count: number
  /** Un token de ejemplo, para poder señalar dónde está en el archivo. */
  sample: SnapshotToken
}

/** path → fuente → snapshot. */
const snapshots = new Map<string, Map<InspectableSource, HighlightSnapshot>>()
const listeners = new Set<() => void>()

/**
 * Tope de archivos con snapshots vivos. Sin tope, cada archivo abierto dejaba
 * su resaltado guardado hasta cerrar la tab. Al pasarse se descarta el más
 * viejo (Map = orden de inserción).
 */
const MAX_SNAPSHOT_FILES = 30

function trimSnapshots(): void {
  while (snapshots.size > MAX_SNAPSHOT_FILES) {
    const oldest = snapshots.keys().next().value
    if (oldest === undefined) break
    snapshots.delete(oldest)
  }
}

function emit(): void {
  for (const listener of [...listeners]) {
    try {
      listener()
    } catch {
      // Un suscriptor roto (panel desmontándose) no tumba a los demás.
    }
  }
}

/** Guarda el resaltado de una fuente para un archivo (reemplaza el anterior). */
export function recordHighlightSnapshot(snapshot: HighlightSnapshot): void {
  let bySource = snapshots.get(snapshot.path)
  if (!bySource) {
    bySource = new Map()
    snapshots.set(snapshot.path, bySource)
  }
  bySource.set(snapshot.source, snapshot)
  trimSnapshots()
  emit()
}

/**
 * Snapshots de un archivo, ordenados por PRIORIDAD de fuente (el que gana
 * primero). Es la misma prioridad que usa el merge, así que la primera entrada
 * es la que manda donde pisa.
 */
export function getHighlightSnapshots(path: string | null | undefined): HighlightSnapshot[] {
  if (!path) return []
  const bySource = snapshots.get(path)
  if (!bySource || bySource.size === 0) return []
  return [...bySource.values()].sort(
    (a, b) => SOURCE_PRIORITY[b.source] - SOURCE_PRIORITY[a.source]
  )
}

/**
 * Tira la procedencia.
 *
 * Con `source` se quita SÓLO la de esa fuente: la gramática de una extensión
 * que no aplica no tiene por qué borrar el rastro del LSP, que sigue pintando.
 * Sin `source` se quita todo (el archivo se cerró o cambió).
 */
export function clearHighlightSnapshot(path: string, source?: InspectableSource): void {
  const bySource = snapshots.get(path)
  if (!bySource) return
  if (source) {
    if (!bySource.delete(source)) return
    if (bySource.size === 0) snapshots.delete(path)
    emit()
    return
  }
  snapshots.delete(path)
  emit()
}

/** Se suscribe a cambios de cualquier snapshot. Devuelve un unsubscribe. */
export function subscribeToHighlightSnapshots(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Agrupa por scope stack (o tipo de leyenda).
 *
 * El scope stack entero es la clave — no el último scope suelto — porque es lo
 * que el resolutor evalúa: dos tokens pueden compartir `string` y resolver a
 * slots distintos por lo que tienen arriba (`string.quoted.double` dentro de
 * `meta.embedded` es otro mundo). Agrupar por el último scope mostraría una
 * tabla que miente.
 */
export function groupSnapshotTokens(tokens: SnapshotToken[]): SnapshotGroup[] {
  const groups = new Map<string, SnapshotGroup>()
  for (const token of tokens) {
    const detail = token.detail.join(' ') || '(sin scope)'
    const existing = groups.get(detail)
    if (existing) {
      existing.count++
      continue
    }
    groups.set(detail, { detail, slot: token.slot, count: 1, sample: token })
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.detail.localeCompare(b.detail))
}

/** Nombre del slot (`keyword`, `string`…) para la UI. */
export function slotLabel(slot: number): string {
  return SLOT_NAMES[slot] ?? `slot ${slot}`
}
