/**
 * Íconos por tipo de archivo para el árbol.
 *
 * Dos capas:
 *  1. Tema activo de `services/fileIcons` (APORTADO por extensiones SEF vía
 *     `contributes.fileIcons`, o por VSIX convertido). Si resuelve un data
 *     URI → <img>. Esta es la vía custom que intercepta todo.
 *  2. Fallback UI por extensión vía `services/productIcons` (IDs, no
 *     imports directos): Code/FileText/Terminal/Database en tono neutro +
 *     carpetas con acento.
 */

import type { JSX } from 'react'
import { useFileIconUrl } from '@services/fileIcons'
import { FileIconImage } from '@services/fileIcons/components'
import { ProductIcon } from '@services/productIcons/components'

const EXTENSION_ICON_IDS: Record<string, string> = {
  ts: 'code',
  tsx: 'code',
  js: 'code',
  jsx: 'code',
  mjs: 'code',
  cjs: 'code',
  py: 'code',
  rb: 'code',
  go: 'code',
  rs: 'code',
  java: 'code',
  c: 'code',
  cpp: 'code',
  h: 'code',
  sh: 'terminal',
  bash: 'terminal',
  zsh: 'terminal',
  fish: 'terminal',
  sql: 'database',
  db: 'database',
  json: 'file-text',
  md: 'file-text',
  markdown: 'file-text',
  txt: 'file-text',
  css: 'file-text',
  scss: 'file-text',
  less: 'file-text',
  html: 'code',
  yml: 'file-text',
  yaml: 'file-text',
  toml: 'file-text',
  xml: 'file-text'
}

const DOTFILE_ICON_IDS: Record<string, string> = {
  gitignore: 'file-text',
  gitattributes: 'file-text',
  editorconfig: 'file-text',
  prettierrc: 'file-text',
  eslintrc: 'file-text'
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return ''
  return name.slice(dot + 1).toLowerCase()
}

function dotfileKey(name: string): string {
  return name.replace(/^\./, '').toLowerCase()
}

export function FileTypeIcon({
  name,
  isDirectory,
  isExpanded,
  size,
  isRoot
}: {
  name: string
  isDirectory: boolean
  isExpanded: boolean
  size: number
  isRoot?: boolean
}): JSX.Element {
  // Capa 1: tema activo (reactivo — re-render al instalar/cambiar tema).
  const customUrl = useFileIconUrl(name, isDirectory, isExpanded, { isRoot })

  if (customUrl) {
    return <FileIconImage src={customUrl} size={size} />
  }

  // Capa 2: fallback UI por ID (temable vía productIcons).
  if (isDirectory) {
    return <ProductIcon id={isExpanded ? 'folder-opened' : 'folder'} size={size} />
  }

  const key = dotfileKey(name)
  const iconId = DOTFILE_ICON_IDS[key] ?? EXTENSION_ICON_IDS[extensionOf(name)] ?? 'file'

  return <ProductIcon id={iconId} size={size} />
}
