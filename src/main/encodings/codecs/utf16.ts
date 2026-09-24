// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Codec UTF-16 — LE y BE, cada uno con su variante con BOM.
 */

import { BOM_UTF16LE, BOM_UTF16BE, type EncodingId, type IEncodingCodec } from '@shared/encodings'

/** Utilidad compartida: anteponer bytes de BOM a un cuerpo codificado. */
export function concatBom(bom: readonly number[], body: Uint8Array): Uint8Array {
  const out = new Uint8Array(bom.length + body.length)
  out.set(bom, 0)
  out.set(body, bom.length)
  return out
}

/** Utilidad compartida: quitar prefijo BOM si está. */
export function stripBomBytes(bytes: Uint8Array, bom: readonly number[]): Uint8Array {
  if (bytes.length < bom.length) return bytes
  for (let i = 0; i < bom.length; i++) {
    if (bytes[i] !== bom[i]) return bytes
  }
  return bytes.slice(bom.length)
}

/**
 * TextEncoder solo emite UTF-8 → encode manual a code units UTF-16.
 */
function encodeUtf16Units(text: string, bigEndian: boolean): Uint8Array {
  const out = new Uint8Array(text.length * 2)
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i)
    if (bigEndian) {
      out[i * 2] = (unit >> 8) & 0xff
      out[i * 2 + 1] = unit & 0xff
    } else {
      out[i * 2] = unit & 0xff
      out[i * 2 + 1] = (unit >> 8) & 0xff
    }
  }
  return out
}

function makeUtf16(
  id: EncodingId,
  label: string,
  decoderLabel: 'utf-16le' | 'utf-16be',
  bigEndian: boolean
): IEncodingCodec {
  return {
    id,
    label,
    decode(bytes) {
      return new TextDecoder(decoderLabel).decode(bytes)
    },
    encode(text) {
      return encodeUtf16Units(text, bigEndian)
    }
  }
}

function makeUtf16WithBom(
  id: EncodingId,
  label: string,
  decoderLabel: 'utf-16le' | 'utf-16be',
  bigEndian: boolean,
  bom: readonly number[]
): IEncodingCodec {
  const plain = makeUtf16(`${id}`, label, decoderLabel, bigEndian)
  return {
    id,
    label,
    bom,
    decode(bytes) {
      return plain.decode(stripBomBytes(bytes, bom))
    },
    encode(text) {
      return concatBom(bom, plain.encode(text))
    }
  }
}

export const utf16LeCodec: IEncodingCodec = makeUtf16('utf16le', 'UTF-16 LE', 'utf-16le', false)
export const utf16LeBomCodec: IEncodingCodec = makeUtf16WithBom(
  'utf16le-bom',
  'UTF-16 LE con BOM',
  'utf-16le',
  false,
  BOM_UTF16LE
)
export const utf16BeCodec: IEncodingCodec = makeUtf16('utf16be', 'UTF-16 BE', 'utf-16be', true)
export const utf16BeBomCodec: IEncodingCodec = makeUtf16WithBom(
  'utf16be-bom',
  'UTF-16 BE con BOM',
  'utf-16be',
  true,
  BOM_UTF16BE
)
