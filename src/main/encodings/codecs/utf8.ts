// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Codec UTF-8 — sin BOM y variante con BOM.
 *
 * Cada familia de encoding vive en su propio archivo: agregar un encoding
 * builtin = crear un archivo aquí + exportarlo en codecs/index.ts.
 */

import { BOM_UTF8, stripUtf8BomChar, type IEncodingCodec } from '@shared/encodings'

/** UTF-8 puro (sin BOM). */
export const utf8Codec: IEncodingCodec = {
  id: 'utf8',
  label: 'UTF-8',
  decode(bytes) {
    return new TextDecoder('utf-8').decode(bytes)
  },
  encode(text) {
    return new TextEncoder().encode(text)
  }
}

/** UTF-8 con BOM obligatorio al codificar; decodifica y lo quita. */
export const utf8BomCodec: IEncodingCodec = {
  id: 'utf8-bom',
  label: 'UTF-8 con BOM',
  bom: BOM_UTF8,
  decode(bytes) {
    return stripUtf8BomChar(new TextDecoder('utf-8').decode(bytes))
  },
  encode(text) {
    const body = new TextEncoder().encode(text)
    const out = new Uint8Array(BOM_UTF8.length + body.length)
    out.set(BOM_UTF8, 0)
    out.set(body, BOM_UTF8.length)
    return out
  }
}
