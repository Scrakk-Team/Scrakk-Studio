// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * FileIcons — registry singleton con subscribe.
 *
 * Mismo patrón que services/modals/registry.ts y
 * services/notifications/registry.ts: Map + Set<Listener> + emit().
 * Diferencia: no hay ModalHost visual — es un RESOLVER puro (dato, no
 * overlay). Los consumidores se suscriben para re-render live cuando una
 * extensión registra un tema o el usuario cambia el activo.
 */

import type { FileIconTheme, RegisteredFileIconTheme, ResolveFileIconArgs } from './types'
import { loadStoredActiveTheme, saveStoredActiveTheme, clearStoredActiveTheme } from './store'

type Listener = () => void

const themes = new Map<string, RegisteredFileIconTheme>()
let activeId: string | null = null
const listeners = new Set<Listener>()

function emit(): void {
  for (const listener of listeners) {
    try {
      listener()
    } catch {
      // Un suscriptor roto no debe tumbar a los demás.
    }
  }
}

/** Suscripción reactiva. Devuelve unsubscribe. */
export function subscribeToFileIcons(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// ── Registro ───────────────────────────────────────────────────────────────

export function registerFileIconTheme(entry: RegisteredFileIconTheme): void {
  themes.set(entry.id, entry)
  // Primera vez: si hay un activo guardado de esta extensión, reactivarlo.
  // Si no hay activo, activar el primero registrado (default builtin).
  if (activeId === null) {
    const stored = loadStoredActiveTheme()
    if (stored && themes.has(stored.id)) {
      activeId = stored.id
    } else {
      activeId = entry.id
    }
  }
  emit()
}

export function unregisterFileIconTheme(id: string): void {
  const wasActive = activeId === id
  themes.delete(id)
  if (wasActive) {
    const next = [...themes.keys()][0] ?? null
    activeId = next
    if (next) saveStoredActiveTheme({ id: next })
    else clearStoredActiveTheme()
  }
  emit()
}

export function getFileIconTheme(id: string): RegisteredFileIconTheme | null {
  return themes.get(id) ?? null
}

export function listFileIconThemes(): RegisteredFileIconTheme[] {
  return [...themes.values()]
}

export function getActiveFileIconThemeId(): string | null {
  return activeId
}

export function getActiveFileIconTheme(): RegisteredFileIconTheme | null {
  return activeId ? (themes.get(activeId) ?? null) : null
}

/** Activa un tema registrado. Devuelve false si no existe. */
export function setActiveFileIconTheme(id: string): boolean {
  if (!themes.has(id)) return false
  activeId = id
  saveStoredActiveTheme({ id })
  emit()
  return true
}

/** Al registrar: si era el activo guardado, re-aplicarlo (across reloads). */
export function reactivateStoredFileIconTheme(id: string): void {
  const stored = loadStoredActiveTheme()
  if (stored && stored.id === id && themes.has(id)) {
    activeId = id
    emit()
  }
}

// ── Resolución ─────────────────────────────────────────────────────────────

/** Data URI válida (lo único que el registry acepta como icono custom). */
function isDataUri(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('data:')
}

function lookupDefinition(theme: FileIconTheme, id: string | undefined): string | null {
  if (!id) return null
  const uri = theme.iconDefinitions[id]
  return isDataUri(uri) ? uri : null
}

/**
 * Prioridad VS Code (adaptada):
 * fileNames exacto > folderNamesExpanded (si expandida) > folderNames >
 * fileExtensions > languageIds > defaults (file/folder/rootFolder).
 */
export function resolveFileIconUrl(
  args: ResolveFileIconArgs,
  themeOverride?: FileIconTheme | null
): string | null {
  const active = themeOverride ?? getActiveFileIconTheme()?.theme
  if (!active) return null

  const nameLower = args.name.toLowerCase()

  if (args.isDirectory) {
    if (args.isRoot) {
      const rootId = args.isExpanded ? active.rootFolderExpanded ?? active.rootFolder : active.rootFolder
      const hit = lookupDefinition(active, rootId)
      if (hit) return hit
    }
    const folderMap = args.isExpanded
      ? { ...active.folderNames, ...active.folderNamesExpanded }
      : active.folderNames
    const hit = lookupDefinition(active, folderMap?.[nameLower])
    if (hit) return hit
    const defId = args.isExpanded
      ? (active.folderExpanded ?? active.folder)
      : active.folder
    return lookupDefinition(active, defId)
  }

  // Archivo.
  const fileHit = lookupDefinition(active, active.fileNames?.[nameLower])
  if (fileHit) return fileHit

  const dot = nameLower.lastIndexOf('.')
  if (dot > 0) {
    const ext = nameLower.slice(dot + 1)
    const extHit = lookupDefinition(active, active.fileExtensions?.[ext])
    if (extHit) return extHit
  }

  if (args.languageId) {
    const langHit = lookupDefinition(active, active.languageIds?.[args.languageId.toLowerCase()])
    if (langHit) return langHit
  }

  return lookupDefinition(active, active.file)
}

/** Atajo: nombre + flags sin construir el objeto. */
export function getFileIconUrl(
  name: string,
  opts?: { path?: string; isDirectory?: boolean; isExpanded?: boolean; languageId?: string; isRoot?: boolean }
): string | null {
  return resolveFileIconUrl({
    name,
    path: opts?.path,
    isDirectory: opts?.isDirectory ?? false,
    isExpanded: opts?.isExpanded,
    languageId: opts?.languageId,
    isRoot: opts?.isRoot
  })
}
