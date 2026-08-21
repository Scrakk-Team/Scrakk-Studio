/**
 * Íconos por tipo de archivo para el árbol. Combinación de estilos:
 * carpetas teñidas con el acento de la app, archivos con ícono por
 * extensión (Code/FileText/Terminal/Database) en tono neutro.
 */

import type { ComponentType, JSX } from 'react'
import {
  CodeIcon,
  DatabaseIcon,
  FileIcon,
  FileTextIcon,
  FolderIcon,
  FolderOpenIcon,
  TerminalIcon
} from '@proicons/react'

type IconComponent = ComponentType<{ size?: number }>

const EXTENSION_ICONS: Record<string, IconComponent> = {
  ts: CodeIcon,
  tsx: CodeIcon,
  js: CodeIcon,
  jsx: CodeIcon,
  mjs: CodeIcon,
  cjs: CodeIcon,
  py: CodeIcon,
  rb: CodeIcon,
  go: CodeIcon,
  rs: CodeIcon,
  java: CodeIcon,
  c: CodeIcon,
  cpp: CodeIcon,
  h: CodeIcon,
  sh: TerminalIcon,
  bash: TerminalIcon,
  zsh: TerminalIcon,
  fish: TerminalIcon,
  sql: DatabaseIcon,
  db: DatabaseIcon,
  json: FileTextIcon,
  md: FileTextIcon,
  markdown: FileTextIcon,
  txt: FileTextIcon,
  css: FileTextIcon,
  scss: FileTextIcon,
  less: FileTextIcon,
  html: CodeIcon,
  yml: FileTextIcon,
  yaml: FileTextIcon,
  toml: FileTextIcon,
  xml: FileTextIcon
}

const DOTFILE_ICONS: Record<string, IconComponent> = {
  gitignore: FileTextIcon,
  gitattributes: FileTextIcon,
  editorconfig: FileTextIcon,
  prettierrc: FileTextIcon,
  eslintrc: FileTextIcon
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
  size
}: {
  name: string
  isDirectory: boolean
  isExpanded: boolean
  size: number
}): JSX.Element {
  if (isDirectory) {
    const Icon = isExpanded ? FolderOpenIcon : FolderIcon
    return <Icon size={size} />
  }

  const key = dotfileKey(name)
  const Icon = DOTFILE_ICONS[key] ?? EXTENSION_ICONS[extensionOf(name)] ?? FileIcon

  return <Icon size={size} />
}
