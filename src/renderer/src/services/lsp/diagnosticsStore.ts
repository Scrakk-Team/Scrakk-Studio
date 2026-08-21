/**
 * LSP — store de diagnósticos en vivo (renderer).
 *
 * Cachea los publishDiagnostics que llegan por IPC, por ruta absoluta,
 * agregando todos los servers. Suscribible: el editor/tools leen acá sin
 * re-consultar al main. Réplica del modelo de lectura del CLI
 * (uri → Vec<Diagnostic> multi-server).
 */

import type { LspDiagnostic } from '@shared/lsp'
import { onLspDiagnostics } from './api'

export interface StoredFileDiagnostics {
  path: string
  diagnostics: LspDiagnostic[]
  updatedAt: number
}

const byPath = new Map<string, StoredFileDiagnostics>()
const listeners = new Set<() => void>()
let subscribed = false

function emit(): void {
  for (const listener of [...listeners]) {
    try {
      listener()
    } catch {
      // un suscriptor roto no tumba a los demás
    }
  }
}

/** Se suscribe una sola vez al stream IPC. */
function ensureSubscribed(): void {
  if (subscribed) return
  subscribed = true
  onLspDiagnostics((payload) => {
    const hasContent =
      payload.diagnostics.length > 0 || byPath.has(payload.path)
    if (!hasContent) return
    byPath.set(payload.path, {
      path: payload.path,
      diagnostics: payload.diagnostics,
      updatedAt: Date.now()
    })
    emit()
  })
}

/** Diagnósticos cacheados de una ruta (multi-server). */
export function getStoredDiagnostics(path: string): StoredFileDiagnostics | null {
  ensureSubscribed()
  return byPath.get(path) ?? null
}

/** Snapshot completo (rutas con diagnósticos conocidos). */
export function getAllStoredDiagnostics(): StoredFileDiagnostics[] {
  ensureSubscribed()
  return [...byPath.values()]
}

/** Solo ERROR/WARNING de una ruta. */
export function getProblems(path: string): LspDiagnostic[] {
  const entry = getStoredDiagnostics(path)
  if (!entry) return []
  return entry.diagnostics.filter((d) => d.severity === undefined || d.severity <= 2)
}

export function clearStoredDiagnostics(path?: string): void {
  if (path) byPath.delete(path)
  else byPath.clear()
  emit()
}

export function subscribeToDiagnostics(listener: () => void): () => void {
  ensureSubscribed()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
