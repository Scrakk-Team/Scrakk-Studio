/**
 * Registry de codecs — builtins + dinámicos (extensiones).
 *
 * Los codecs dinámicos NO ejecutan código en el main: el main guarda sus
 * metadatos y delega la conversión al renderer vía eventos IPC cuando hace
 * falta convertir un archivo con uno de esos ids.
 */

import type { EncodingId, EncodingInfo, IEncodingCodec } from '@shared/encodings'
import { BUILTIN_CODECS } from './codecs'

export interface DynamicCodecMeta {
  id: EncodingId
  label: string
  bom?: number[]
  extensionId: string
}

interface RegistryEntry {
  codec?: IEncodingCodec // solo builtins
  meta: DynamicCodecMeta & { source: 'builtin' | 'extension' }
}

const byId = new Map<EncodingId, RegistryEntry>()

/** Idempotente: se llama una vez al boot del módulo. */
export function registerBuiltins(): void {
  for (const codec of BUILTIN_CODECS) {
    byId.set(codec.id, {
      codec,
      meta: { id: codec.id, label: codec.label, bom: codec.bom ? [...codec.bom] : undefined, extensionId: '', source: 'builtin' }
    })
  }
}

registerBuiltins()

export interface DynamicCodecRegistration {
  extensionId: string
  codecs: Array<{ id: EncodingId; label: string; bom?: number[] }>
}

/** Ids builtin para defensa en registry (derivado de codecs/index). */
const BUILTIN_IDS: ReadonlySet<string> = new Set(BUILTIN_CODECS.map((c) => c.id as string))

/** Registra codecs declarados por una extensión. JAMÁS pisa builtins. */
export function registerDynamic(reg: DynamicCodecRegistration): EncodingId[] {
  const registered: EncodingId[] = []
  for (const c of reg.codecs) {
    if (!c.id || BUILTIN_IDS.has(c.id)) continue
    byId.set(c.id, {
      meta: { ...c, extensionId: reg.extensionId, source: 'extension' }
    })
    registered.push(c.id)
  }
  return registered
}

/** Quita todos los codecs de una extensión. Devuelve ids removidos. */
export function removeDynamic(extensionId: string): EncodingId[] {
  const removed: EncodingId[] = []
  for (const [id, entry] of [...byId]) {
    if (entry.meta.source === 'extension' && entry.meta.extensionId === extensionId) {
      byId.delete(id)
      removed.push(id)
    }
  }
  return removed
}

export function getCodec(id: EncodingId): IEncodingCodec | undefined {
  return byId.get(id)?.codec
}

/** ¿El id existe aunque sea dinámico (sin implementación en main)? */
export function hasEncoding(id: EncodingId): boolean {
  return byId.has(id)
}

/** ¿La conversión byte↔texto vive en el renderer (codec dinámico)? */
export function isRendererDelegated(id: EncodingId): boolean {
  const entry = byId.get(id)
  return !!entry && !entry.codec
}

export function listEncodings(): EncodingInfo[] {
  return [...byId.values()].map((e) => ({
    id: e.meta.id,
    label: e.meta.label,
    source: e.meta.source,
    extensionId: e.meta.extensionId || undefined
  }))
}
