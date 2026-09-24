// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Schema del contribution point `contributes.encodings[]`.
 *
 * Formato declarativo en el manifest:
 *
 * ```json
 * "contributes": {
 *   "encodings": [
 *     { "id": "koi8-r", "label": "Cyrillic (KOI8-R)", "module": "./encoding.js" }
 *   ]
 * }
 * ```
 *
 * El `module` es un archivo ESM del paquete cuyo default export implementa
 * el contrato `EncodingModule` (ver logic.ts). Los ids builtin NO pueden
 * pisarse.
 */

import type { EncodingId } from '@shared/encodings'

/** Slice crudo de una contribución (tal como viene del manifest). */
export interface RawEncodingContribution {
  id?: unknown
  label?: unknown
  module?: unknown
}

/** Contribución validada y normalizada. */
export interface EncodingContribution {
  id: EncodingId
  label: string
  /** Ruta del módulo dentro del paquete. */
  module: string
}

/**
 * Contrato EXACTO que debe exportar (default) el módulo JS de la extensión.
 * El logic valida esta estructura antes de registrar; si falla, la
 * contribución se descarta con warning sin romper nada.
 */
export interface EncodingModuleContract {
  decode(bytes: Uint8Array): string
  encode(text: string): Uint8Array
}

export function validateEncodingContribution(
  raw: unknown,
  isBuiltinId: (id: string) => boolean,
  warn: (msg: string) => void
): EncodingContribution | null {
  if (typeof raw !== 'object' || raw === null) {
    warn('[encodings] contribución no es un objeto')
    return null
  }
  const r = raw as RawEncodingContribution

  if (typeof r.id !== 'string' || r.id.trim().length === 0) {
    warn('[encodings] falta "id" string')
    return null
  }
  const id = r.id.trim()
  if (isBuiltinId(id)) {
    warn(`[encodings] "${id}" es builtin y no puede sobrescribirse`)
    return null
  }
  if (!/^[\w.+-]+$/i.test(id)) {
    warn(`[encodings] id inválido: "${id}"`)
    return null
  }
  if (typeof r.label !== 'string' || r.label.trim().length === 0) {
    warn(`[encodings] "${id}" falta "label"`)
    return null
  }
  if (typeof r.module !== 'string' || !r.module.startsWith('./')) {
    warn(`[encodings] "${id}" necesita "module": "./archivo.js" relativo al paquete`)
    return null
  }

  return { id, label: r.label.trim(), module: r.module }
}
