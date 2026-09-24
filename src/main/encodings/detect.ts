// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Detección de encoding — BOM + validación UTF-8 + fallback Latin-1.
 *
 * Modelo VS Code: sin heurística pesada. BOM manda; si no hay, se prueba
 * UTF-8 estricto; si falla, Windows-1252 con flag lossy. Binarios (NULs)
 * se detectan aparte para que el editor los rechace.
 */

import {
  BOM_UTF8,
  BOM_UTF16LE,
  BOM_UTF16BE,
  startsWithBom,
  type DetectedEncoding
} from '@shared/encodings'
import { BUILTIN_CODECS } from './codecs'

/** Tamaño de muestra para detección en archivos grandes. */
const SAMPLE_BYTES = 64 * 1024
/** Umbral de NUL bytes en la muestra para considerar binario. */
const NUL_THRESHOLD = 0.01

/** ¿Parece binario? (NULs significativos en la muestra). */
export function looksBinary(bytes: Uint8Array): boolean {
  const sample = bytes.length > SAMPLE_BYTES ? bytes.slice(0, SAMPLE_BYTES) : bytes
  if (sample.length === 0) return false
  let nulls = 0
  for (let i = 0; i < sample.length; i++) {
    if (sample[i] === 0) nulls++
  }
  return nulls / sample.length > NUL_THRESHOLD || hasConsecutiveNulls(sample)
}

function hasConsecutiveNulls(bytes: Uint8Array): boolean {
  let run = 0
  const limit = Math.min(bytes.length, 4096)
  for (let i = 0; i < limit; i++) {
    if (bytes[i] === 0) {
      run++
      if (run >= 4) return true
    } else {
      run = 0
    }
  }
  return false
}

/**
 * Detecta el encoding del buffer.
 * Orden: BOM UTF-8 → BOM UTF-16LE → BOM UTF-16BE → binario → UTF-8 válido → latin1.
 * Los BOMs van PRIMERO: un archivo UTF-16 con BOM contiene NULs legítimos
 * y no debe marcarse binario.
 */
export function detectEncoding(bytes: Uint8Array): DetectedEncoding {
  // 1) BOMs explícitos (antes del check binario).
  if (startsWithBom(bytes, BOM_UTF8)) {
    return { encoding: 'utf8-bom', hasBom: true, lossy: false, binary: false }
  }
  if (startsWithBom(bytes, BOM_UTF16LE)) {
    return { encoding: 'utf16le-bom', hasBom: true, lossy: false, binary: false }
  }
  if (startsWithBom(bytes, BOM_UTF16BE)) {
    return { encoding: 'utf16be-bom', hasBom: true, lossy: false, binary: false }
  }

  const binary = looksBinary(bytes)
  if (binary) {
    return { encoding: 'utf8', hasBom: false, lossy: true, binary: true }
  }

  // 2) UTF-8 válido sin BOM.
  const sample = bytes.length > SAMPLE_BYTES ? bytes.slice(0, SAMPLE_BYTES) : bytes
  const strict = new TextDecoder('utf-8', { fatal: true })
  try {
    strict.decode(sample)
    return { encoding: 'utf8', hasBom: false, lossy: false, binary: false }
  } catch {
    // No era UTF-8 limpio.
  }

  // 3) Fallback: Windows-1252 nunca falla pero puede haber reemplazos.
  const lenient = new TextDecoder('windows-1252')
  const decoded = lenient.decode(sample)
  const replacementChars = (decoded.match(/\uFFFD/g) ?? []).length
  return { encoding: 'latin1', hasBom: false, lossy: replacementChars > 0, binary: false }
}

/** Ids builtin derivados del index de codecs (única fuente de verdad). */
export const BUILTIN_ENCODING_IDS: ReadonlySet<string> = new Set(
  BUILTIN_CODECS.map((c) => c.id as string)
)

/** ¿Es un id builtin? */
export function isBuiltinEncoding(id: string): boolean {
  return BUILTIN_ENCODING_IDS.has(id)
}
