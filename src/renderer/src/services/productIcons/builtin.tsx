// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * ProductIcons — set builtin `scrakk` (defaults offline con @proicons/react).
 *
 * ESTE es el único archivo de la app que importa @proicons/react (más el
 * fallback de components.tsx). Todo lo demás usa IDs a través de la API.
 *
 * IDs canónicos = codicons de VS Code donde existe el concepto (así los
 * temas de extensiones hacen override exacto), más sinónimos.
 */

import type { ComponentType, CSSProperties, JSX } from 'react'
import {
  ArrowClockwiseIcon,
  ArrowDownloadIcon,
  ArrowReplyIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  AlertTriangleIcon,
  BarChart,
  BellIcon,
  BookmarkIcon,
  BoxIcon,
  BranchIcon,
  BugIcon,
  ChatIcon,
  CheckmarkIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClipboardIcon,
  ClipboardSearchIcon,
  Clock,
  CloseIcon,
  CodeIcon,
  CompassIcon,
  CopyIcon,
  CrownIcon,
  DatabaseIcon,
  DeleteIcon,
  ExtensionIcon,
  ExternalLinkIcon,
  EyeIcon,
  FileAddIcon,
  FileIcon,
  FileMultipleIcon,
  FileTextIcon,
  FolderAddIcon,
  FolderIcon,
  FolderOpenIcon,
  GlobeIcon,
  GridIcon,
  HashIcon,
  HeadphonesIcon,
  HistoryIcon,
  HomeIcon,
  InfoIcon,
  KeyIcon,
  KeyboardIcon,
  LayersIcon,
  LinkIcon,
  MegaphoneIcon,
  MoreHorizontalIcon,
  NoteIcon,
  PanelBottomIcon,
  PanelBottomOpenIcon,
  PanelLeftIcon,
  PanelLeftOpenIcon,
  PanelRightIcon,
  PanelRightOpenIcon,
  PersonAddIcon,
  PersonIcon,
  PersonMultipleIcon,
  PencilIcon,
  MinusIcon,
  PlusIcon,
  RecordStopIcon,
  SearchIcon,
  ServerIcon,
  SettingsIcon,
  ShareIcon,
  ShieldCheckmarkIcon,
  SubtractSquareMultipleIcon,
  TerminalIcon,
  TimerIcon,
  VolumeHighIcon,
  XIcon
} from '@proicons/react'
import { CenterPanelViewIcon } from '@ui'

export type IconComponent = ComponentType<{
  size?: number
  className?: string
  style?: CSSProperties
}>

export interface BuiltinProductIconEntry {
  /** Id canónico (codicon cuando existe). */
  id: string
  component: IconComponent
  /** Sinónimos que también resuelven a este icono. */
  synonyms?: string[]
}

function wrapCenterPanel(): IconComponent {
  const Comp = ({ size }: { size?: number }): JSX.Element => (
    <CenterPanelViewIcon size={size ?? 16} />
  )
  Comp.displayName = 'CenterPanelViewIcon'
  return Comp as unknown as IconComponent
}

/** Id del tema builtin (siempre disponible, es el fallback). */
export const SCRAKK_PRODUCT_ICON_THEME_ID = 'scrakk'

export const BUILTIN_PRODUCT_ICONS: BuiltinProductIconEntry[] = [
  { id: 'files', component: FolderIcon },
  { id: 'folder', component: FolderIcon },
  { id: 'folder-opened', component: FolderOpenIcon, synonyms: ['folder-open'] },
  { id: 'file', component: FileIcon },
  { id: 'file-text', component: FileTextIcon },
  { id: 'code', component: CodeIcon },
  { id: 'database', component: DatabaseIcon },
  { id: 'terminal', component: TerminalIcon },
  { id: 'new-file', component: FileAddIcon, synonyms: ['file-add'] },
  { id: 'new-folder', component: FolderAddIcon, synonyms: ['folder-add'] },
  { id: 'chevron-down', component: ChevronDownIcon },
  { id: 'chevron-right', component: ChevronRightIcon },
  { id: 'search', component: SearchIcon },
  { id: 'settings-gear', component: SettingsIcon, synonyms: ['settings'] },
  { id: 'share', component: ShareIcon, synonyms: ['nodes', 'network'] },
  { id: 'shield-check', component: ShieldCheckmarkIcon, synonyms: ['shield-checkmark', 'verified'] },
  { id: 'key', component: KeyIcon },
  { id: 'keyboard', component: KeyboardIcon },
  { id: 'server', component: ServerIcon },
  { id: 'chat', component: ChatIcon },
  { id: 'history', component: HistoryIcon },
  { id: 'info', component: InfoIcon },
  { id: 'home', component: HomeIcon },
  { id: 'extensions', component: ExtensionIcon },
  { id: 'grid', component: GridIcon },
  { id: 'close', component: CloseIcon },
  { id: 'x', component: XIcon },
  { id: 'check', component: CheckmarkIcon, synonyms: ['checkmark'] },
  { id: 'copy', component: CopyIcon },
  { id: 'trash', component: DeleteIcon, synonyms: ['delete'] },
  { id: 'pencil', component: PencilIcon },
  { id: 'plus', component: PlusIcon },
  { id: 'minus', component: MinusIcon },
  { id: 'more', component: MoreHorizontalIcon, synonyms: ['ellipsis', 'more-horizontal'] },
  { id: 'refresh', component: ArrowClockwiseIcon, synonyms: ['sync', 'reload'] },
  { id: 'download', component: ArrowDownloadIcon },
  { id: 'arrow-up', component: ArrowUpIcon },
  { id: 'record-stop', component: RecordStopIcon, synonyms: ['stop'] },
  { id: 'collapse-all', component: SubtractSquareMultipleIcon },
  { id: 'panel-left', component: PanelLeftIcon },
  { id: 'panel-left-open', component: PanelLeftOpenIcon },
  { id: 'panel-right', component: PanelRightIcon },
  { id: 'panel-right-open', component: PanelRightOpenIcon },
  { id: 'panel-bottom', component: PanelBottomIcon },
  { id: 'panel-bottom-open', component: PanelBottomOpenIcon },
  { id: 'center-panel', component: wrapCenterPanel(), synonyms: ['center-panel-view'] },
  { id: 'link-external', component: ExternalLinkIcon, synonyms: ['external-link'] },
  { id: 'link', component: LinkIcon, synonyms: ['connect'] },
  { id: 'clock', component: Clock },
  { id: 'bell', component: BellIcon },
  { id: 'bookmark', component: BookmarkIcon, synonyms: ['bookmarks'] },
  { id: 'chart', component: BarChart, synonyms: ['graph', 'bar-chart'] },
  { id: 'box', component: BoxIcon },
  /* ── Glyphs de tools de IA (uno por tool, congruente con su función) ── */
  { id: 'file-multiple', component: FileMultipleIcon },
  { id: 'arrow-right', component: ArrowRightIcon, synonyms: ['move', 'arrow-move'] },
  { id: 'reply', component: ArrowReplyIcon, synonyms: ['arrow-reply', 'answer'] },
  { id: 'clipboard-search', component: ClipboardSearchIcon },
  { id: 'alert', component: AlertTriangleIcon, synonyms: ['alert-triangle', 'warning-triangle'] },
  { id: 'layers', component: LayersIcon },
  { id: 'compass', component: CompassIcon },
  { id: 'globe', component: GlobeIcon },
  { id: 'eye', component: EyeIcon },
  { id: 'clipboard', component: ClipboardIcon },
  { id: 'timer', component: TimerIcon },
  { id: 'source-control', component: BranchIcon, synonyms: ['git', 'branch'] },
  { id: 'browser', component: GlobeIcon },
  { id: 'note', component: NoteIcon, synonyms: ['notes'] },
  { id: 'debug', component: BugIcon, synonyms: ['bug'] },
  { id: 'people', component: PersonMultipleIcon, synonyms: ['users', 'friends', 'social'] },
  { id: 'person', component: PersonIcon, synonyms: ['user'] },
  { id: 'person-add', component: PersonAddIcon, synonyms: ['user-add', 'add-friend'] },
  { id: 'hash', component: HashIcon, synonyms: ['channel', 'hashtag', 'symbol-namespace'] },
  { id: 'volume', component: VolumeHighIcon, synonyms: ['speaker', 'voice', 'sound'] },
  { id: 'megaphone', component: MegaphoneIcon, synonyms: ['announce', 'announcements'] },
  { id: 'crown', component: CrownIcon, synonyms: ['owner', 'admin'] },
  { id: 'headphones', component: HeadphonesIcon, synonyms: ['voice-channel'] }
]

/** Componente del entry (o null si el id no existe). */
export function builtinComponentFor(normalizedId: string): IconComponent | null {
  for (const entry of BUILTIN_PRODUCT_ICONS) {
    if (entry.id === normalizedId || entry.synonyms?.includes(normalizedId)) {
      return entry.component
    }
  }
  return null
}

/** Fallback último (id desconocido): caja genérica, import directo local. */
export function fallbackComponent(): IconComponent {
  return BoxIcon
}
