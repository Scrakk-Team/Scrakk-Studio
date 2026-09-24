// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Estado de codificación por documento — store reactivo.
 *
 * path → { encoding, hasBom, lossy, lineEnding }. Lo setea EditorPanel al
 * cargar (con lo detectado) y lo mutan las acciones del EncodingChip
 * (reabrir con…, convertir EOL). El save consume estos valores.
 */

import type { DetectedEncoding, EncodingId, LineEnding } from '@shared/encodings'
import { detectLineEnding } from '@shared/encodings'

export interface DocumentEncoding {
  encoding: EncodingId
  hasBom: boolean
  lossy: boolean
  /** EOL detectado al cargar o elegido por el usuario. */
  lineEnding: LineEnding
  /** true si el texto en memoria difiere del EOL del doc (dirty EOL). */
  eolDirty?: boolean
}

const docs = new Map<string, DocumentEncoding>()
const listeners = new Set<Listener>()

/** Tope de documentos con encoding recordado (se descarta el más viejo). */
const MAX_DOCS = 200

function trimDocs(): void {
  while (docs.size > MAX_DOCS) {
    const oldest = docs.keys().next().value
    if (oldest === undefined) break
    docs.delete(oldest)
  }
}

type Listener = () => void

function emit(): void {
  for (const l of listeners) {
    try {
      l()
    } catch {
      // Listener roto no tumba a los demás.
    }
  }
}

/** Registra/actualiza el estado desde una lectura exitosa. */
export function setDetected(path: string, text: string, detected: DetectedEncoding): void {
  docs.set(path, {
    encoding: detected.encoding,
    hasBom: detected.hasBom,
    lossy: detected.lossy,
    lineEnding: detectLineEnding(text)
  })
  trimDocs()
  emit()
}

/** Cambia SOLO el encoding elegido (sin re-lectura). Para "guardar como". */
export function setEncoding(path: string, encoding: EncodingId): void {
  const cur = docs.get(path)
  if (!cur) return
  docs.set(path, { ...cur, encoding, hasBom: encoding.endsWith('-bom') })
  emit()
}

export function getDocumentEncoding(path: string): DocumentEncoding | undefined {
  return docs.get(path)
}

/** Olvida un doc (se cerró). */
export function forget(path: string): void {
  if (docs.delete(path)) emit()
}

/**
 * Re-emite el estado de un doc (p. ej. tras guardar, para que la UI
 * limpie indicaciones de "sin guardar").
 */
export function notifyEncodingListeners(path: string): void {
  void path
  emit()
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Tests. */
export function _resetForTests(): void {
  docs.clear()
  listeners.clear()
}
