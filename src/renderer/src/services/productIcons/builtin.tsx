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
  ClipboardIcon,
  ClipboardSearchIcon,
  Clock,
  CloseIcon,
  CodeIcon,
  CompassIcon,
  CopyIcon,
  CrownIcon,
  EmojiIcon,
  DatabaseIcon,
  DeleteIcon,
  ExtensionIcon,
  ExternalLinkIcon,
  EyeOffIcon,
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

/**
 * Chevrons propios: un solo trazo redondeado, 16×16 y grosor 1.5. Los temas de
 * iconos pueden seguir pisando `chevron-down`/`chevron-right` por id.
 */
const ChevronDownIcon: IconComponent = ({ size = 16, className, style }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    className={className}
    style={style}
    aria-hidden="true"
  >
    <path
      d="M4.25 6.25 8 9.75l3.75-3.5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

const ChevronRightIcon: IconComponent = ({ size = 16, className, style }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    className={className}
    style={style}
    aria-hidden="true"
  >
    <path
      d="M6.25 4.25 9.75 8l-3.5 3.75"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

function wrapCenterPanel(): IconComponent {
  const Comp = ({ size }: { size?: number }): JSX.Element => (
    <CenterPanelViewIcon size={size ?? 16} />
  )
  Comp.displayName = 'CenterPanelViewIcon'
  return Comp as unknown as IconComponent
}

/**
 * Marca de VERIFICADO — check dentro de un sello circular con puntas, relleno.
 *
 * No está en @proicons, así que va como componente propio con el MISMO contrato
 * que los demás (`currentColor`, `size`, `className`). El check es un HUECO
 * (`fillRule="evenodd"`, subpath opuesto): así se ve el fondo real detrás en vez
 * de un color fijo, y la marca sirve sobre cualquier superficie del tema.
 */
const VERIFIED_BADGE_PATH =
  'M 10.28 2.71 L 12 1.15 L 13.72 2.71 A 9.45 9.45 0 0 1 16.07 3.47 L 18.38 3.22 ' +
  'L 18.85 5.5 A 9.45 9.45 0 0 1 20.3 7.49 L 22.32 8.65 L 21.37 10.77 A 9.45 9.45 0 0 1 21.37 13.23 ' +
  'L 22.32 15.35 L 20.3 16.51 A 9.45 9.45 0 0 1 18.85 18.5 L 18.38 20.78 L 16.07 20.53 A 9.45 9.45 0 0 1 ' +
  '13.72 21.29 L 12 22.85 L 10.28 21.29 A 9.45 9.45 0 0 1 7.93 20.53 L 5.62 20.78 L 5.15 18.5 A 9.45 9.45 0 0 1 ' +
  '3.7 16.51 L 1.68 15.35 L 2.63 13.23 A 9.45 9.45 0 0 1 2.63 10.77 L 1.68 8.65 L 3.7 7.49 A 9.45 9.45 0 0 1 ' +
  '5.15 5.5 L 5.62 3.22 L 7.93 3.47 A 9.45 9.45 0 0 1 10.28 2.71 Z ' +
  'M 7.48 12.92 L 11.3 15.74 L 16.53 10.61 L 14.67 8.79 L 10.5 13.26 L 9.32 11.08 Z'

const VerifiedBadgeIcon: IconComponent = ({ size = 16, className, style }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    style={style}
    aria-hidden="true"
  >
    <path fillRule="evenodd" clipRule="evenodd" d={VERIFIED_BADGE_PATH} />
  </svg>
)

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
  { id: 'shield-check', component: ShieldCheckmarkIcon, synonyms: ['shield-checkmark'] },
  { id: 'verified-badge', component: VerifiedBadgeIcon, synonyms: ['verified-seal', 'badge-check'] },
  { id: 'key', component: KeyIcon },
  { id: 'keyboard', component: KeyboardIcon },
  { id: 'server', component: ServerIcon },
  { id: 'chat', component: ChatIcon },
  { id: 'emoji', component: EmojiIcon, synonyms: ['smile', 'smiley', 'emoticon'] },
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
  { id: 'eye-off', component: EyeOffIcon, synonyms: ['eye-closed', 'hidden'] },
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
