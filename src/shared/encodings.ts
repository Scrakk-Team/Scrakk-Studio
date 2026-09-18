/**
 * Contrato de codificaciones — compartido (main + renderer + extensiones).
 *
 * Modelo VS Code:
 *  - Detectar al abrir, NUNCA convertir en silencio.
 *  - El encoding es propiedad por-documento; default global configurable.
 *  - BOM se preserva al guardar salvo elección explícita.
 *
 * Este módulo no tiene deps: lo consumen main (I/O real), renderer (UI)
 * y las extensiones (codecs custom implementan IEncodingCodec).
 */

/** Ids builtin. Las extensiones agregan ids propios (cualquier string único). */
export type BuiltinEncodingId = 'utf8' | 'utf8-bom' | 'utf16le' | 'utf16be' | 'latin1'

export type EncodingId = BuiltinEncodingId | (string & {})

export interface EncodingInfo {
  id: EncodingId
  /** Label humano para el picker ("UTF-8", "Cyrillic (KOI8-R)"…). */
  label: string
  source: 'builtin' | 'extension'
  extensionId?: string
}

/** Resultado de detectar el encoding de un buffer. */
export interface DetectedEncoding {
  encoding: EncodingId
  hasBom: boolean
  /** true si hubo bytes inválidos reemplazados por U+FFFD. */
  lossy: boolean
  /** true si parece binario (NULs en la muestra) → no abrir como texto. */
  binary: boolean
}

/** Codec: conversión byte↔texto. Lo implementan builtins y extensiones. */
export interface IEncodingCodec {
  readonly id: EncodingId
  readonly label: string
  /**
   * Bytes del BOM que este codec escribe AL INICIO cuando hasBom=true.
   * Vacío = sin BOM posible.
   */
  readonly bom?: readonly number[]
  decode(bytes: Uint8Array): string
  encode(text: string): Uint8Array
}

// ── Line endings ─────────────────────────────────────────────────────────

export type LineEnding = 'LF' | 'CRLF'

/**
 * Detecta el EOL dominante. Empate o archivo vacío → LF.
 * Un solo `\r\n` gana sobre muchos `\n` sueltos? No: se cuentan ambos y
 * gana el mayor (comportamiento VS Code: primer EOL encontrado en el file
 * para docs nuevos; para existentes, mayoría simple).
 */
export function detectLineEnding(text: string): LineEnding {
  let crlf = 0
  let lf = 0
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i)
    if (ch === 13) {
      // \r
      if (text.charCodeAt(i + 1) === 10) crlf++
      i++
    } else if (ch === 10) {
      lf++
    }
  }
  return crlf > lf ? 'CRLF' : 'LF'
}

/** Normaliza TODO el texto al EOL dado. */
export function convertLineEndings(text: string, eol: LineEnding): string {
  if (eol === 'LF') return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '\r\n')
}

// ── Constantes de BOM ────────────────────────────────────────────────────

export const BOM_UTF8: readonly number[] = [0xef, 0xbb, 0xbf]
export const BOM_UTF16LE: readonly number[] = [0xff, 0xfe]
export const BOM_UTF16BE: readonly number[] = [0xfe, 0xff]

/** ¿Los bytes empiezan con este prefijo? */
export function startsWithBom(bytes: Uint8Array, bom: readonly number[]): boolean {
  if (bytes.length < bom.length) return false
  for (let i = 0; i < bom.length; i++) {
    if (bytes[i] !== bom[i]) return false
  }
  return true
}

/** Quita el BOM UTF-8 ya decodificado (\uFEFF inicial), si está. */
export function stripUtf8BomChar(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

// ── Tipos IPC ────────────────────────────────────────────────────────────

export const ENCODINGS_IPC = {
  readEncoded: 'encodings:read',
  writeEncoded: 'encodings:write',
  list: 'encodings:list',
  registerDynamic: 'encodings:register-dynamic',
  removeDynamic: 'encodings:remove-dynamic'
} as const

export interface ReadEncodedRequest {
  path: string
}

/** Resultado interno del servicio de lectura (main). */
export interface ReadEncodedResult {
  success: boolean
  text?: string
  detected?: DetectedEncoding
  error?: string
  /**
   * true si el encoding es dinámico (extensión): el main no convierte;
   * `rawBytes` viaja en base64 y el renderer resuelve con su codec.
   */
  delegatedToRenderer?: boolean
  rawBytes?: string
}

export interface ReadEncodedResponse extends ReadEncodedResult {}

export interface WriteEncodedResult {
  success: boolean
  error?: string
  /** Encoding efectivamente escrito (puede diferir si se pidió drop-BOM). */
  wroteEncoding?: EncodingId
}

export interface WriteEncodedRequest {
  path: string
  text: string
  encoding: EncodingId
  /** Re-escribir el BOM del codec (si el codec lo soporta). Default true. */
  preserveBom?: boolean
  /** Normalizar EOL antes de codificar. Omitido = dejar tal cual. */
  lineEnding?: LineEnding
}

export interface WriteEncodedResponse {
  success: boolean
  error?: string
}

export interface ListEncodingsResponse {
  success: boolean
  encodings?: EncodingInfo[]
  error?: string
}

export interface DynamicCodecPayload {
  /** Id de la extensión dueña (para desinstalar limpio). */
  extensionId: string
  codecs: Array<{
    id: EncodingId
    label: string
    bom?: number[]
    /**
     * Los codecs dinámicos corren EN EL RENDERER (sandbox de la extensión).
     * El main guarda solo los metadatos y delega la conversión vía evento.
     */
  }>
}

export interface RegisterDynamicCodecsRequest extends DynamicCodecPayload {}

export interface RegisterDynamicCodecsResponse {
  success: boolean
  registeredIds?: EncodingId[]
  error?: string
}

export interface RemoveDynamicCodecsRequest {
  extensionId: string
}
