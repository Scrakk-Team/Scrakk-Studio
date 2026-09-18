/**
 * Registry de secciones de Ajustes.
 *
 * Cada apartado vive en su propia carpeta (o archivo plano, como
 * AppearanceSection) y acá solo se declara su metadata de nav + el
 * componente que lo pinta. Agregar una sección = crear su carpeta y
 * sumar una entrada a SETTINGS_SECTIONS; el modal no cambia.
 */

import type { ComponentType } from 'react'
import { AppearanceSection } from './AppearanceSection'
import { EditorSection } from './EditorSection/EditorSection'
import { ExtensionsSection } from './ExtensionsSection'
import { PerformanceSection } from './PerformanceSection/PerformanceSection'
import { ServersSection } from './ServersSection/ServersSection'
import { HighlightSection } from './HighlightSection/HighlightSection'
import { InfoSection } from './InfoSection/InfoSection'

export type SettingsSectionId =
  | 'appearance'
  | 'editor'
  | 'extensions'
  | 'performance'
  | 'servers'
  | 'highlight'
  | 'info'

export interface SettingsSectionDef {
  id: SettingsSectionId
  label: string
  /** Id del ProductIcon del nav. */
  icon: string
  /** Id del padre si es hija desplegable (ej. Resaltado ⊂ Servidores). */
  parent?: SettingsSectionId
  component: ComponentType
}

export const SETTINGS_SECTIONS: SettingsSectionDef[] = [
  { id: 'appearance', label: 'Apariencia', icon: 'grid', component: AppearanceSection },
  { id: 'editor', label: 'Editor', icon: 'code', component: EditorSection },
  { id: 'extensions', label: 'Extensiones', icon: 'extensions', component: ExtensionsSection },
  { id: 'performance', label: 'Rendimiento', icon: 'chart', component: PerformanceSection },
  { id: 'servers', label: 'Servidores', icon: 'server', component: ServersSection },
  { id: 'highlight', label: 'Resaltado', icon: 'code', parent: 'servers', component: HighlightSection },
  { id: 'info', label: 'Acerca de', icon: 'info', component: InfoSection }
]
