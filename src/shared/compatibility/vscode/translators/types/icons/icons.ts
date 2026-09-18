/**
 * Traductor icons: vsix iconThemes → SEF fileIcons.
 * Vive en translators/types/icons/ para tener libertad interna (schemas,
 * assets, variantes light en el futuro) sin ensuciar el pipeline.
 *
 * Entrada: contributes.iconThemes del package.json + bytes del .vsix.
 * Salida: contribuciones SEF {id, name, path: icons/<id>.json} + assets
 * (icons.json con iconDefinitions ya resueltas a data URIs).
 *
 * El IDE consume el resultado como SEF puro: ni sabe que hubo vsix.
 */

import type { IconsTranslation, MappedApi, VsixFileEntry, VsixPackageJson } from '../../../../types'
import { decodeText, resolveThemeAsset, resolveVsixFile, toBase64Binary } from '../../../extract'

/** Id SEF seguro para un tema (el converter namespacing, no el core). */
export function sanitizeThemeId(raw: string): string {
  return (
    raw
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'icons'
  )
}

function assetToDataUri(data: Uint8Array, pathHint: string): string {
  const lower = pathHint.toLowerCase()
  if (lower.endsWith('.png')) return `data:image/png;base64,${toBase64Binary(data)}`
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
    return `data:image/jpeg;base64,${toBase64Binary(data)}`
  }
  if (lower.endsWith('.gif')) return `data:image/gif;base64,${toBase64Binary(data)}`
  if (lower.endsWith('.webp')) return `data:image/webp;base64,${toBase64Binary(data)}`
  // SVG (default): texto → base64 latin1-safe.
  try {
    const svgStr = decodeText(data)
    const b64 =
      typeof btoa === 'function'
        ? btoa(unescape(encodeURIComponent(svgStr)))
        : toBase64Binary(data)
    return `data:image/svg+xml;base64,${b64}`
  } catch {
    return `data:image/svg+xml;base64,${toBase64Binary(data)}`
  }
}

function lowerMap(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v !== 'string') continue
    out[k.toLowerCase()] = v
  }
  return Object.keys(out).length > 0 ? out : undefined
}

interface RawIconTheme {
  iconDefinitions?: Record<string, { iconPath?: string }>
  fileExtensions?: Record<string, string>
  fileNames?: Record<string, string>
  folderNames?: Record<string, string>
  folderNamesExpanded?: Record<string, string>
  languageIds?: Record<string, string>
  file?: string
  folder?: string
  folderExpanded?: string
  rootFolder?: string
  rootFolderExpanded?: string
  hidesExplorerArrows?: boolean
}

export function detectIconThemes(manifest: VsixPackageJson): boolean {
  const list = manifest.contributes?.iconThemes
  return Array.isArray(list) && list.length > 0
}

/**
 * Traduce TODOS los iconThemes del vsix. Los iconPath rotos se omiten con
 * warning (una extensión rota jamás tumba la conversión).
 */
export function translateIconThemes(
  manifest: VsixPackageJson,
  files: VsixFileEntry[],
  opts: { extensionId: string }
): IconsTranslation {
  const contributions: IconsTranslation['contributions'] = []
  const assets = new Map<string, string>()
  const mapped: MappedApi[] = []

  const list = manifest.contributes?.iconThemes ?? []
  for (const theme of list) {
    if (!theme || typeof theme.path !== 'string') continue
    const themeFile = resolveVsixFile(theme.path, files)
    if (!themeFile) {
      mapped.push({
        source: `iconThemes:${theme.id ?? theme.path}`,
        target: null,
        support: 'none',
        note: `no se encontró ${theme.path} en el vsix`
      })
      continue
    }

    let raw: RawIconTheme
    try {
      raw = JSON.parse(decodeText(themeFile.data)) as RawIconTheme
    } catch {
      mapped.push({
        source: `iconThemes:${theme.id ?? theme.path}`,
        target: null,
        support: 'none',
        note: 'JSON inválido'
      })
      continue
    }

    const iconDefinitions: Record<string, string> = {}
    let skippedPaths = 0
    for (const [defId, def] of Object.entries(raw.iconDefinitions ?? {})) {
      const rel = def?.iconPath ?? ''
      if (!rel) continue
      const resolved = resolveThemeAsset(theme.path, rel)
      const iconFile = resolved ? resolveVsixFile(resolved, files) : null
      if (!iconFile) {
        skippedPaths++
        continue
      }
      iconDefinitions[defId] = assetToDataUri(iconFile.data, resolved ?? rel)
    }

    if (Object.keys(iconDefinitions).length === 0) {
      mapped.push({
        source: `iconThemes:${theme.id}`,
        target: null,
        support: 'none',
        note:
          skippedPaths > 0
            ? `${skippedPaths} iconPath(s) sin archivo en el vsix`
            : 'sin definiciones utilizables'
      })
      continue
    }

    const sefId = sanitizeThemeId(`${opts.extensionId}-${theme.id}`)
    const sefTheme = {
      id: sefId,
      name: theme.label || theme.id,
      iconDefinitions,
      fileExtensions: lowerMap(raw.fileExtensions),
      fileNames: lowerMap(raw.fileNames),
      folderNames: lowerMap(raw.folderNames),
      folderNamesExpanded: lowerMap(raw.folderNamesExpanded),
      languageIds: lowerMap(raw.languageIds),
      file: raw.file,
      folder: raw.folder,
      folderExpanded: raw.folderExpanded,
      rootFolder: raw.rootFolder,
      rootFolderExpanded: raw.rootFolderExpanded,
      hidesExplorerArrows: raw.hidesExplorerArrows
    }

    const assetPath = `icons/${sefId}.json`
    assets.set(assetPath, JSON.stringify(sefTheme))
    contributions.push({ id: sefId, name: theme.label || theme.id, path: assetPath })
    mapped.push({
      source: `iconThemes:${theme.id}`,
      target: 'SEF contributes.fileIcons',
      support: 'full',
      note: `${Object.keys(iconDefinitions).length} iconos embebidos`
    })
  }

  return { contributions, assets, mapped }
}
