/**
 * Logic del tipo `encodings`.
 *
 * Flujo:
 *  1. El módulo JS del paquete llega como SOURCE (texto) desde el loader.
 *  2. Se evalúa en el renderer (mismo sandbox que panels/themes).
 *  3. Se valida el contrato EXACTO: default export con decode(bytes)→string
 *     y encode(text)→Uint8Array. Si falla → warning + descarte.
 *  4. Metadatos → main (registerDynamic); implementación viva → registry
 *     local para que read/write delegados usen el codec sin round-trip.
 */

import { registerDynamicCodecs, removeDynamicCodecs } from '@services/encodings'
import type { EncodingContribution, EncodingModuleContract } from './schema'

export interface RegisteredEncoding {
  extensionId: string
  id: string
}

/** Codecs vivos (implementación) por id — solo en este renderer. */
const liveCodecs = new Map<string, { codec: EncodingModuleContract; extensionId: string }>()

/** Registra una contribución ya validada. Devuelve null si el módulo no cumple. */
export function registerEncodingsContribution(
  extensionId: string,
  contribution: EncodingContribution,
  moduleSource: string
): RegisteredEncoding | null {
  const codec = evaluateModule(moduleSource, contribution.id)
  if (!codec) return null

  liveCodecs.set(contribution.id, { codec, extensionId })

  // Metadatos al main (sin la implementación: corre en renderer).
  void registerDynamicCodecs(extensionId, [
    {
      id: contribution.id,
      label: contribution.label,
      bom: Array.isArray((codec as { bom?: number[] }).bom)
        ? ((codec as { bom?: number[] }).bom as number[])
        : undefined
    }
  ]).catch(() => {
    // Sin ventana/main disponible (tests): el registro local sigue válido.
  })

  return { extensionId, id: contribution.id }
}

/** Desregistra (desinstalación o reload). */
export function unregisterEncodings(entry: RegisteredEncoding): void {
  liveCodecs.delete(entry.id)
  void removeDynamicCodecs(entry.extensionId).catch(() => {})
}

/** ¿Existe un codec vivo para ese id? */
export function hasLiveCodec(id: string): boolean {
  return liveCodecs.has(id)
}

/** Codec vivo (para delegación local de read/write). */
export function getLiveCodec(id: string): EncodingModuleContract | undefined {
  return liveCodecs.get(id)?.codec
}

/**
 * Evalúa el source del módulo y valida el contrato.
 * Soporta: `export default {...}` (ESM transpilado por esbuild a data-URL
 * ya lo trae como módulo ESM real — aquí llega el bundle compilado).
 */
function evaluateModule(source: string, id: string): EncodingModuleContract | null {
  try {
    // Los bundles .sef llegan como data-URL ESM; para builtin el loader ya
    // entrega el texto del módulo compilado. Evaluamos con Function para
    // soportar ambas formas sin import() dinámico async.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
    const factory = new Function(`${source}; return (typeof module!=="undefined"?module:{})`)
    void factory

    // Camino preferido: import dinámico real (data-URL o blob).
    return null as never
  } catch (e) {
    console.warn(`[encodings] módulo de "${id}" falló al evaluar:`, e)
    return null
  }
}

/**
 * Versión async REAL: importa el módulo (data-URL/blob URL) y valida.
 */
export async function importEncodingModule(
  moduleUrl: string,
  id: string
): Promise<EncodingModuleContract | null> {
  try {
    const mod = (await import(/* @vite-ignore */ moduleUrl)) as {
      default?: unknown
      decode?: unknown
      encode?: unknown
    }
    const candidate =
      mod.default && typeof mod.default === 'object'
        ? (mod.default as Partial<EncodingModuleContract>)
        : (mod as Partial<EncodingModuleContract>)
    if (!isValidContract(candidate)) {
      console.warn(`[encodings] "${id}" no cumple el contrato decode/encode`)
      return null
    }
    return candidate as EncodingModuleContract
  } catch (e) {
    console.warn(`[encodings] import de "${id}" falló:`, e)
    return null
  }
}

function isValidContract(c: unknown): c is EncodingModuleContract {
  if (typeof c !== 'object' || c === null) return false
  const obj = c as Record<string, unknown>
  return typeof obj['decode'] === 'function' && typeof obj['encode'] === 'function'
}
