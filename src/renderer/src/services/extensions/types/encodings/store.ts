/**
 * Store del tipo `encodings` — preferencias persistidas.
 *
 * v1: el encoding default global (override del usuario). Los docs ya
 * abiertos guardan su encoding en documentState (memoria, no disco).
 */

import { STORAGE_KEYS, lsGet, lsSet } from '@services/storage'
import type { EncodingId } from '@shared/encodings'

/** Default global de apertura para archivos sin BOM y UTF-8 válido. */
export function getDefaultEncoding(): EncodingId {
  return lsGet<EncodingId>(STORAGE_KEYS.ENCODINGS_DEFAULT) ?? 'utf8'
}

export function setDefaultEncoding(id: EncodingId): void {
  lsSet(STORAGE_KEYS.ENCODINGS_DEFAULT, id)
}
