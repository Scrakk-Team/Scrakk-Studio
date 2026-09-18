/**
 * Tipo 'fileIcons' — schema declarativo.
 *
 * Dos capas (igual que themes):
 *  1. Slice `contributes.fileIcons` del manifest: {id, name, path}.
 *  2. El JSON del tema (`normalizeFileIconThemeDefinition`): formato SEF
 *     fileIcons — deliberadamente NO 1:1 VS Code (por algo existe el
 *     traductor). Solo exige iconDefinitions como data URIs; el resto de
 *     mapas son opcionales y tolerantes.
 */

import type { ParseContext } from '../handler'
import type { FileIconTheme } from '@services/fileIcons'

// ── Slice del manifest ─────────────────────────────────────────────────────

export interface FileIconContribution {
  /** Id único del tema (global entre todas las extensiones). */
  id: string
  /** Nombre visible en el picker. */
  name: string
  /** Ruta del JSON del tema relativa a la raíz del paquete. */
  path: string
}

export function parseFileIconContributions(
  raw: unknown,
  _ctx: ParseContext
): FileIconContribution[] | null {
  if (!Array.isArray(raw)) return null
  const out: FileIconContribution[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const c = item as Partial<FileIconContribution>
    if (
      typeof c.id !== 'string' ||
      typeof c.name !== 'string' ||
      typeof c.path !== 'string'
    ) {
      console.warn('[extensions/fileIcons] contribución inválida descartada:', c)
      continue
    }
    out.push({ id: c.id, name: c.name, path: c.path })
  }
  return out
}

// ── Definición del tema (el JSON del archivo) ──────────────────────────────

function isDataUri(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('data:')
}

function cleanStringMap(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof k !== 'string' || typeof v !== 'string') continue
    out[k.toLowerCase()] = v
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/**
 * Valida y normaliza el JSON crudo de un tema de iconos. Tolerante:
 * descarta definiciones no-dataURI y conserva las válidas.
 */
export function normalizeFileIconThemeDefinition(raw: unknown): FileIconTheme | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>

  const id = typeof r.id === 'string' ? r.id : ''
  const name = typeof r.name === 'string' ? r.name : ''
  if (!id || !name) {
    console.warn('[extensions/fileIcons] JSON de iconos sin id/name válido')
    return null
  }

  const iconDefinitions: Record<string, string> = {}
  if (r.iconDefinitions && typeof r.iconDefinitions === 'object') {
    for (const [k, v] of Object.entries(r.iconDefinitions as Record<string, unknown>)) {
      if (typeof k !== 'string') continue
      if (isDataUri(v)) iconDefinitions[k] = v
      else if (typeof v === 'string') {
        console.warn(`[extensions/fileIcons] definición "${k}" no es data URI, se descarta`)
      }
    }
  }

  const single = (v: unknown): string | undefined =>
    typeof v === 'string' && v.length > 0 ? v : undefined

  return {
    id,
    name,
    iconDefinitions,
    fileExtensions: cleanStringMap(r.fileExtensions),
    fileNames: cleanStringMap(r.fileNames),
    folderNames: cleanStringMap(r.folderNames),
    folderNamesExpanded: cleanStringMap(r.folderNamesExpanded),
    languageIds: cleanStringMap(r.languageIds),
    file: single(r.file),
    folder: single(r.folder),
    folderExpanded: single(r.folderExpanded),
    rootFolder: single(r.rootFolder),
    rootFolderExpanded: single(r.rootFolderExpanded),
    hidesExplorerArrows: typeof r.hidesExplorerArrows === 'boolean' ? r.hidesExplorerArrows : undefined
  }
}
