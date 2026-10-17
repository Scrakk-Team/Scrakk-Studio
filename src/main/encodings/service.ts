// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Servicio de I/O con encoding — la ÚNICA puerta de bytes con codificación
 * del proceso main. Lee → detecta → decodifica; escribe → normaliza EOL →
 * codifica (con BOM si corresponde).
 */

import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import {
  detectLineEnding,
  convertLineEndings,
  type DetectedEncoding,
  type EncodingId,
  type LineEnding,
  type ReadEncodedResult,
  type WriteEncodedResult
} from '@shared/encodings'
import { detectEncoding } from './detect'
import { getCodec, isRendererDelegated } from './registry'

import { t } from '@shared/i18n'
import { isSensitiveCredentialPath } from '@shared/permissions'

/** Tope de lectura: el editor no abre archivos de cientos de MB. */
const MAX_ENCODED_BYTES = 256 * 1024 * 1024
export interface ReadEncodedOptions {
  /** Encoding a forzar (ignora detección). Para "Reabrir con…". */
  overrideEncoding?: EncodingId
}

/**
 * Lee un archivo, detecta su encoding y devuelve texto + metadata.
 * El BOM se quita del texto (queda anotado en detected.hasBom).
 */
export async function readFileEncoded(
  filePath: string,
  options: ReadEncodedOptions = {}
): Promise<ReadEncodedResult> {
  // Este canal no pasa por el jail de workspace: al menos nunca devuelve
  // claves privadas/credenciales a un renderer comprometido.
  if (isSensitiveCredentialPath(filePath)) {
    return { success: false, error: t('main.ruta.sensible.protegida') }
  }
  const stat = await fs.stat(filePath).catch(() => null)
  if (stat && stat.size > MAX_ENCODED_BYTES) {
    return { success: false, error: t('main.el.archivo.es.demasiado.grande') }
  }
  const bytes = await fs.readFile(filePath)
  const view = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)

  let detected: DetectedEncoding
  if (options.overrideEncoding) {
    detected = { ...detectEncoding(view), encoding: options.overrideEncoding }
    // hasBom real: miramos los bytes igual (para utf8-bom etc.).
    detected.hasBom = computeHasBom(view)
  } else {
    detected = detectEncoding(view)
  }

  if (detected.binary) {
    return {
      success: false,
      error: t('main.el.archivo.parece.binario.y')
    }
  }

  // Codec dinámico (extensión): el main no puede convertir — lo resuelve el renderer.
  if (isRendererDelegated(detected.encoding)) {
    return {
      success: true,
      text: '',
      detected: { ...detected, lossy: true },
      delegatedToRenderer: true,
      rawBytes: Buffer.from(view).toString('base64')
    }
  }

  const codec = getCodec(detected.encoding)
  if (!codec) {
    return { success: false, error: `Encoding desconocido: ${detected.encoding}` }
  }

  return { success: true, text: codec.decode(view), detected }
}

function computeHasBom(bytes: Uint8Array): boolean {
  return (
    (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) ||
    (bytes[0] === 0xff && bytes[1] === 0xfe) ||
    (bytes[0] === 0xfe && bytes[1] === 0xff)
  )
}

export interface WriteEncodedOptions {
  encoding: EncodingId
  /** Re-escribir BOM del codec destino. Default: true. */
  preserveBom?: boolean
  /** Normalizar EOL antes de codificar. Omitido = tal cual. */
  lineEnding?: LineEnding
}

/** Escribe texto con el encoding pedido. Crea dirs padre. */
export async function writeFileEncoded(
  filePath: string,
  text: string,
  options: WriteEncodedOptions
): Promise<WriteEncodedResult> {
  if (isSensitiveCredentialPath(filePath)) {
    return { success: false, error: t('main.ruta.sensible.protegida') }
  }
  const codec = getCodec(options.encoding)
  if (!codec) {
    return { success: false, error: `Encoding desconocido: ${options.encoding}` }
  }
  if (isRendererDelegated(options.encoding)) {
    return {
      success: false,
      error:
        t('main.este.encoding.pertenece.a.una')
    }
  }

  let textToWrite = text
  if (options.lineEnding) {
    textToWrite = convertLineEndings(textToWrite, options.lineEnding)
  }

  // preserveBom=false sobre un codec con BOM → usar el codec plano equivalente.
  let effectiveCodec = codec
  if (options.preserveBom === false && codec.bom) {
    const plain = plainCounterpart(options.encoding)
    const plainCodec = plain ? getCodec(plain) : undefined
    if (!plainCodec) {
      return { success: false, error: `Sin variante sin BOM para ${options.encoding}` }
    }
    effectiveCodec = plainCodec
  }

  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, effectiveCodec.encode(textToWrite))
    return { success: true, wroteEncoding: effectiveCodec.id as EncodingId }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return { success: false, error: msg }
  }
}

/** utf8-bom→utf8, utf16le-bom→utf16le, utf16be-bom→utf16be; resto: null. */
function plainCounterpart(id: EncodingId): EncodingId | null {
  if (id.endsWith('-bom')) return id.slice(0, -4) as EncodingId
  return null
}

/** EOL actual del archivo según el texto decodificado (para docState). */
export function lineEndingOf(text: string): LineEnding {
  return detectLineEnding(text)
}
